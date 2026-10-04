/* 岛屿 · 本地存储层（IndexedDB 优先）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 本地存储层：IndexedDB 优先、写入串行、读失败拒绝回退为空，避免异常时把旧数据覆盖成默认空数据。 */
var IslandDB = (function(){
  var DB_NAME = 'Island', DB_VER = 2, STORE = 'kv', BACKUP_STORE = 'kv_backup';
  var _ready = null, _writeTail = Promise.resolve(), _persistent = false;

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
        resolve(db);
      };
      req.onerror = function(){ fail('本机存储读取失败', req.error); };
      req.onblocked = function(){ fail('本机存储被其他页面占用，请关闭重复打开的岛屿窗口后重试'); };
    });
    return _ready;
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

  function set(key, value){
    var snapshot = cloneValue(value);
    return enqueue(function(){
      return open().then(function(db){
        return new Promise(function(resolve, reject){
          try {
            var tx = db.transaction([STORE, BACKUP_STORE], 'readwrite');
            var store = tx.objectStore(STORE);
            var backup = tx.objectStore(BACKUP_STORE);
            var oldReq = store.get(key);
            oldReq.onsuccess = function(){
              var old = oldReq.result;
              if (old) backup.put({ key:key, value:cloneValue(old.value), savedAt:Date.now() });
              store.put({ key:key, value:snapshot, savedAt:Date.now() });
            };
            oldReq.onerror = function(){ try { tx.abort(); } catch(e) {} };
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = function(){ reject(storageError('写入本机存储失败：' + key, tx.error)); };
            tx.onabort = function(){ reject(storageError('写入本机存储已中止：' + key, tx.error)); };
          } catch(e){ reject(storageError('写入本机存储失败：' + key, e)); }
        });
      });
    });
  }

  function clear(){
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

  function flush(){ return _writeTail.catch(function(){ return undefined; }); }
  function isPersistent(){ return _persistent; }

  return { open:open, get:get, set:set, remove:remove, clear:clear, replaceAll:replaceAll, list:list, flush:flush, isPersistent:isPersistent };
})();
