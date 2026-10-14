/* 岛屿 · 本地存储层（IndexedDB 优先）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 本地存储层：IndexedDB 优先、写入串行、读失败拒绝回退为空，避免异常时把旧数据覆盖成默认空数据。 */
var IslandDB = (function(){
  var DB_NAME = 'Island', DB_VER = 2, STORE = 'kv', BACKUP_STORE = 'kv_backup';
  var _ready = null, _writeTail = Promise.resolve(), _persistent = false;
  /* 整库安全快照：和 kv_backup 放在同一个对象库里（键名带前缀，不会和任何数据键冲突），不需要升级数据库版本。
   * 主库一旦被发现是空的、而快照还在（意外丢失，而不是用户主动清空——主动清空会连快照一起清掉），打开时自动恢复。 */
  var SNAP_PREFIX = '__snapshot__:', SNAP_SLOTS = ['pre-update', 'daily'];
  var _recovered = 0;

  function storageError(message, cause){
    var err = new Error(message);
    err.code = 'ISLAND_STORAGE_ERROR';
    if (cause) err.cause = cause;
    return err;
  }

  function cloneValue(value){
    if (value === undefined) return undefined;
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch(e) {}
    try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
  }

  function enqueue(task){
    var run = _writeTail.catch(function(){ return undefined; }).then(task);
    _writeTail = run.catch(function(){ return undefined; });
    return run;
  }

  function open(){
    if (_ready) return _ready;
    _ready = new Promise(function(resolve, reject){
      if (typeof indexedDB === 'undefined') {
        reject(storageError('当前环境不支持 IndexedDB'));
        return;
      }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch(e){ reject(storageError('无法打开本机存储', e)); return; }
      var settled = false;
      var timer = setTimeout(function(){
        if (settled) return;
        settled = true;
        reject(storageError('本机存储打开超时，请避免继续覆盖现有数据'));
      }, 4000);
      function fail(message, cause){
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(storageError(message, cause));
      }
      req.onupgradeneeded = function(e){
        try {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
          if (!db.objectStoreNames.contains(BACKUP_STORE)) db.createObjectStore(BACKUP_STORE, { keyPath: 'key' });
        } catch(err){ fail('本机存储升级失败', err); }
      };
      req.onsuccess = function(e){
        if (settled) { try { e.target.result.close(); } catch(err) {} return; }
        settled = true;
        clearTimeout(timer);
        var db = e.target.result;
        db.onversionchange = function(){ try { db.close(); } catch(err) {} };
        _persistent = true;
        recoverIfEmpty(db).then(function(){ resolve(db); });
      };
      req.onerror = function(){ fail('本机存储读取失败', req.error); };
      req.onblocked = function(){ fail('本机存储被其他页面占用，请关闭重复打开的岛屿窗口后重试'); };
    });
    return _ready;
  }

  /* 主库为空但留有安全快照 → 把最新的快照写回主库。任何一步出错都只记录，不影响正常启动。 */
  function recoverIfEmpty(db){
    return new Promise(function(done){
      try {
        var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
        var store = tx.objectStore(STORE), backup = tx.objectStore(BACKUP_STORE);
        var countReq = store.count();
        countReq.onsuccess = function(){
          if (countReq.result > 0) return;
          var best = null, pending = SNAP_SLOTS.length;
          SNAP_SLOTS.forEach(function(slot){
            var r = backup.get(SNAP_PREFIX + slot);
            r.onsuccess = function(){
              var snap = r.result && r.result.value;
              if (snap && Array.isArray(snap.rows) && snap.rows.length && (!best || snap.savedAt > best.savedAt)) best = snap;
              if (--pending === 0 && best) {
                best.rows.forEach(function(row){ if (row && row.key) store.put({ key:row.key, value:row.value, savedAt:Date.now() }); });
                _recovered = best.rows.length;
                console.warn('[岛屿] 主数据为空，已从安全快照恢复 ' + best.rows.length + ' 项（快照时间 ' + new Date(best.savedAt).toLocaleString() + '）');
              }
            };
          });
        };
        tx.oncomplete = function(){ done(); };
        tx.onerror = tx.onabort = function(){ console.warn('[岛屿] 安全快照恢复检查失败', tx.error); done(); };
      } catch(e){ done(); }
    });
  }

  /* 给全部主数据拍一张快照（同一个槽位只留最新一张）。体积大时可能因配额失败：失败返回 false，不抛错。 */
  function snapshot(slot){
    slot = SNAP_SLOTS.indexOf(slot) >= 0 ? slot : 'daily';
    return enqueue(function(){
      return open().then(function(db){
        return new Promise(function(resolve){
          try {
            var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
            var req = tx.objectStore(STORE).getAll();
            req.onsuccess = function(){
              var rows = (Array.isArray(req.result) ? req.result : []).filter(function(r){ return r && r.key; })
                .map(function(r){ return { key:r.key, value:r.value }; });
              if (!rows.length) return;   /* 空库不拍快照，免得把有用的旧快照盖掉 */
              tx.objectStore(BACKUP_STORE).put({ key:SNAP_PREFIX + slot, value:{ slot:slot, savedAt:Date.now(), count:rows.length, rows:rows }, savedAt:Date.now() });
            };
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = tx.onabort = function(){ console.warn('[岛屿] 快照写入失败：', tx.error); resolve(false); };
          } catch(e){ resolve(false); }
        });
      });
    }).catch(function(){ return false; });
  }

  function snapshotInfo(){
    return open().then(function(db){
      return new Promise(function(resolve){
        try {
          var tx = db.transaction(BACKUP_STORE, 'readonly'), store = tx.objectStore(BACKUP_STORE), out = {}, pending = SNAP_SLOTS.length;
          SNAP_SLOTS.forEach(function(slot){
            var r = store.get(SNAP_PREFIX + slot);
            r.onsuccess = function(){ var v = r.result && r.result.value; if (v) out[slot] = { savedAt:v.savedAt, count:v.count }; if (--pending === 0) resolve(out); };
            r.onerror = function(){ if (--pending === 0) resolve(out); };
          });
        } catch(e){ resolve({}); }
      });
    }).catch(function(){ return {}; });
  }

  /* 请求"持久化存储"：浏览器在磁盘紧张时不会自动清掉岛屿的数据。返回 Promise<boolean|null>（null = 浏览器不支持）。 */
  function requestPersistent(){
    try {
      if (!(navigator.storage && navigator.storage.persist)) return Promise.resolve(null);
      return navigator.storage.persisted().then(function(already){
        return already ? true : navigator.storage.persist();
      }).catch(function(){ return null; });
    } catch(e){ return Promise.resolve(null); }
  }

  function get(key){
    return open().then(function(db){
      return new Promise(function(resolve, reject){
        try {
          var tx = db.transaction([STORE, BACKUP_STORE], 'readonly');
          var store = tx.objectStore(STORE);
          var backup = tx.objectStore(BACKUP_STORE);
          var req = store.get(key);
          req.onsuccess = function(){
            if (req.result) { resolve(req.result.value); return; }
            var backupReq = backup.get(key);
            backupReq.onsuccess = function(){
              if (backupReq.result) {
                console.warn('[岛屿] 主数据缺失，已读取最近一次安全副本：', key);
                resolve(backupReq.result.value);
              } else resolve(undefined);
            };
            backupReq.onerror = function(){ reject(storageError('读取本机存储失败：' + key, backupReq.error)); };
          };
          req.onerror = function(){ reject(storageError('读取本机存储失败：' + key, req.error)); };
        } catch(e){ reject(storageError('读取本机存储失败：' + key, e)); }
      });
    });
  }

  var _wiping = false;

  /* 同一个 key 在上一次写入还没开始执行前又被保存：只保留最新值，合并成一次事务。
   * 聊天流式回复、连续发送等场景会在几毫秒内保存同一份数据很多次，原来每次都排一个完整事务。
   * remove / clear / replaceAll 会清空合并表，保证它们与写入之间的先后顺序不变。 */
  var _pendingSets = Object.create(null);

  function set(key, value){
    if (_wiping) return Promise.resolve(false);
    var snapshot = cloneValue(value);
    var pending = _pendingSets[key];
    if (pending) { pending.snapshot = snapshot; return pending.promise; }
    pending = _pendingSets[key] = { snapshot: snapshot, promise: null };
    pending.promise = enqueue(function(){
      if (_pendingSets[key] === pending) delete _pendingSets[key];   /* 开始执行后，新的保存重新排队 */
      var latest = pending.snapshot;
      return open().then(function(db){
        return new Promise(function(resolve, reject){
          try {
            var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
            var store = tx.objectStore(STORE);
            var backup = tx.objectStore(BACKUP_STORE);
            var oldReq = store.get(key);
            oldReq.onsuccess = function(){
              var old = oldReq.result;
              /* old.value 是刚从 IndexedDB 反序列化出来的独立副本，直接写入备份即可，不需要再深拷贝一次 */
              if (old) backup.put({ key:key, value:old.value, savedAt:Date.now() });
              store.put({ key:key, value:latest, savedAt:Date.now() });
            };
            oldReq.onerror = function(){ try { tx.abort(); } catch(e) {} };
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = function(){ reject(storageError('写入本机存储失败：' + key, tx.error)); };
            tx.onabort = function(){ reject(storageError('写入本机存储已中止：' + key, tx.error)); };
          } catch(e){ reject(storageError('写入本机存储失败：' + key, e)); }
        });
      });
    });
    return pending.promise;
  }

  function clear(){
    _pendingSets = Object.create(null);
    return enqueue(function(){
      return open().then(function(db){
        return new Promise(function(resolve, reject){
          try {
            var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
            tx.objectStore(STORE).clear();
            tx.objectStore(BACKUP_STORE).clear();
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = function(){ reject(storageError('清空本机存储失败', tx.error)); };
            tx.onabort = function(){ reject(storageError('清空本机存储已中止', tx.error)); };
          } catch(e){ reject(storageError('清空本机存储失败', e)); }
        });
      });
    });
  }

  function remove(key){
    _pendingSets = Object.create(null);
    if (_wiping) return Promise.resolve(false);
    return enqueue(function(){
      return open().then(function(db){
        return new Promise(function(resolve, reject){
          try {
            var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
            tx.objectStore(STORE).delete(key);
            tx.objectStore(BACKUP_STORE).delete(key);
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = function(){ reject(storageError('删除本机存储失败：' + key, tx.error)); };
            tx.onabort = function(){ reject(storageError('删除本机存储已中止：' + key, tx.error)); };
          } catch(e){ reject(storageError('删除本机存储失败：' + key, e)); }
        });
      });
    });
  }

  function replaceAll(rows){
    _pendingSets = Object.create(null);
    rows = Array.isArray(rows) ? rows : [];
    var safeRows = rows.map(function(row){ return { key:String(row.key), value:cloneValue(row.value) }; });
    return enqueue(function(){
      return open().then(function(db){
        return new Promise(function(resolve, reject){
          try {
            var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
            var store = tx.objectStore(STORE);
            var backup = tx.objectStore(BACKUP_STORE);
            /* 完整导入是用户主动操作，因此这里清理现有主数据与旧备份，避免恢复到旧数据。 */
            store.clear();
            backup.clear();
            safeRows.forEach(function(row){
              if (row.key) store.put({ key:row.key, value:row.value, savedAt:Date.now() });
            });
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = function(){ reject(storageError('批量写入本机存储失败', tx.error)); };
            tx.onabort = function(){ reject(storageError('批量写入本机存储已中止', tx.error)); };
          } catch(e){ reject(storageError('批量写入本机存储失败', e)); }
        });
      });
    });
  }

  function list(){
    return open().then(function(db){
      return new Promise(function(resolve, reject){
        try {
          var tx = db.transaction(STORE, 'readonly');
          var req = tx.objectStore(STORE).getAll();
          req.onsuccess = function(){ resolve(Array.isArray(req.result) ? req.result : []); };
          req.onerror = function(){ reject(storageError('读取本机存储列表失败', req.error)); };
        } catch(e){ reject(storageError('读取本机存储列表失败', e)); }
      });
    });
  }

  /* 清空全部数据：先冻结后续写入，再清库；调用方随后应 reload */
  function wipeAll(){
    _wiping = true;
    return clear().catch(function(err){ _wiping = false; throw err; });
  }

  function flush(){ return _writeTail.catch(function(){ return undefined; }); }
  function isPersistent(){ return _persistent; }

  function recoveredCount(){ return _recovered; }

  return { snapshot:snapshot, snapshotInfo:snapshotInfo, requestPersistent:requestPersistent, recoveredCount:recoveredCount, open:open, get:get, set:set, remove:remove, clear:clear, wipeAll:wipeAll, replaceAll:replaceAll, list:list, flush:flush, isPersistent:isPersistent };
})();
