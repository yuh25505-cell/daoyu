/* 岛屿 · 本地存储层（IndexedDB 优先）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 本地存储层：IndexedDB 优先、写入串行、读失败拒绝回退为空，避免异常时把旧数据覆盖成默认空数据。 */
var IslandDB = (function(){
  var DB_NAME = 'Island', DB_VER = 6, STORE = 'kv', BACKUP_STORE = 'kv_backup', CHAT_STORE = 'chat_messages', MEDIA_STORE = 'chat_media', CHAT_BACKUP_STORE = 'chat_messages_backup', MEDIA_BACKUP_STORE = 'chat_media_backup';
  var _ready = null, _writeTail = Promise.resolve(), _chatWriteTail = Promise.resolve(), _persistent = false;
  /* 整库安全快照：和 kv_backup 放在同一个对象库里（键名带前缀，不会和任何数据键冲突），不需要升级数据库版本。
   * 主库一旦被发现是空的、而快照还在（意外丢失，而不是用户主动清空——主动清空会连快照一起清掉），打开时自动恢复。 */
  var SNAP_PREFIX = '__snapshot__:', CHAT_SNAP_PREFIX = '__chat_snapshot__:', SNAP_SLOTS = ['pre-update', 'daily'], CHAT_SNAPSHOT_SLOTS = ['daily', 'daily-a', 'daily-b'];
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
          if (!db.objectStoreNames.contains(CHAT_STORE)) {
            var chats = db.createObjectStore(CHAT_STORE, { keyPath: ['chat', 'seq'] });
            chats.createIndex('byChatTime', ['chat', 'createdAt', 'seq'], { unique:false });
          }
          if (!db.objectStoreNames.contains(MEDIA_STORE)) {
            var media = db.createObjectStore(MEDIA_STORE, { keyPath: ['chat', 'seq', 'key'] });
            media.createIndex('byMessage', ['chat', 'seq'], { unique:false });
          }
          var chatUpgradeStore = e.target.transaction.objectStore(CHAT_STORE);
          if (!chatUpgradeStore.indexNames.contains('byChat')) chatUpgradeStore.createIndex('byChat', 'chat', { unique:false });
          /* v6：删掉从来没被搜索用到、却拖慢每次写入的文字索引（byChatText）。消息本身和 searchText 字段都保留。 */
          if (chatUpgradeStore.indexNames.contains('byChatText')) chatUpgradeStore.deleteIndex('byChatText');
          if (!db.objectStoreNames.contains(CHAT_BACKUP_STORE)) db.createObjectStore(CHAT_BACKUP_STORE, { keyPath:['slot','chat','seq'] });
          if (!db.objectStoreNames.contains(MEDIA_BACKUP_STORE)) db.createObjectStore(MEDIA_BACKUP_STORE, { keyPath:['slot','chat','seq','key'] });
          /* v5 不自动迁移旧版整包聊天数组；清理旧键，并从通用 KV 快照中剔除旧消息数组，避免以后恢复时重新引入旧格式。 */
          if (e.oldVersion < 5) {
            var upgradeTx = e.target.transaction;
            var kv = upgradeTx.objectStore(STORE);
            var legacy = kv.openCursor();
            legacy.onsuccess = function(){
              var cursor = legacy.result;
              if (!cursor) return;
              if (typeof cursor.key === 'string' && cursor.key.indexOf('island.msg.') === 0) cursor.delete();
              cursor.continue();
            };
            var backup = upgradeTx.objectStore(BACKUP_STORE);
            var br = backup.openCursor();
            br.onsuccess = function(){
              var cursor = br.result;
              if (!cursor) return;
              var key = String(cursor.key || ''), entry = cursor.value;
              if (key.indexOf('island.msg.') === 0) cursor.delete();
              else if (key.indexOf(SNAP_PREFIX) === 0 && entry && entry.value && Array.isArray(entry.value.rows)) {
                var snap = entry.value, oldLength = snap.rows.length;
                snap.rows = snap.rows.filter(function(row){ return !row || typeof row.key !== 'string' || row.key.indexOf('island.msg.') !== 0; });
                if (snap.rows.length !== oldLength) {
                  if (snap.rows.length) { entry.value = snap; cursor.update(entry); }
                  else cursor.delete();
                }
              }
              cursor.continue();
            };
          }
        } catch(err){ fail('本机存储升级失败', err); }
      };
      req.onsuccess = function(e){
        if (settled) { try { e.target.result.close(); } catch(err) {} return; }
        settled = true;
        clearTimeout(timer);
        var db = e.target.result;
        db.onversionchange = function(){ try { db.close(); } catch(err) {} };
        _persistent = true;
        recoverIfEmpty(db).then(function(){ return recoverChatIfEmpty(db); }).then(function(){ resolve(db); }, function(){ resolve(db); });
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

  function clearChatBackupSlot(db, storeName, slot, isMedia){
    return new Promise(function(resolve, reject){
      try {
        var tx=db.transaction(storeName,'readwrite'), store=tx.objectStore(storeName);
        /* 复合键以前缀 [slot] 至 [slot, []] 限定；比用 U+FFFF 当上界更能覆盖 emoji 等补充平面会话名。 */
        var upper=[slot,[]];
        var lower=[slot];
        var req=store.openCursor(IDBKeyRange.bound(lower,upper));
        req.onsuccess=function(){var c=req.result;if(c){c.delete();c.continue();}};
        tx.oncomplete=function(){resolve(true);};tx.onerror=tx.onabort=function(){reject(storageError('清理聊天安全快照失败',tx.error));};
      } catch(e){reject(storageError('清理聊天安全快照失败',e));}
    });
  }

  /* 分批复制原始行，不反序列化/重建消息对象，避免大聊天记录一次性进入 JS 内存。 */
  function copyStoreInBatches(db, sourceName, destName, slot, restore, batchSize){
    var lastKey=null,total=0,size=Math.max(50,Number(batchSize)||250);
    function next(){
      return new Promise(function(resolve,reject){
        var batchCount=0;
        try{
          var tx=db.transaction([sourceName,destName],'readwrite'), source=tx.objectStore(sourceName),dest=tx.objectStore(destName);
          var range;
          if(restore){range=lastKey?IDBKeyRange.bound(lastKey,[slot,[]],true,false):IDBKeyRange.bound([slot],[slot,[]]);}
          else range=lastKey?IDBKeyRange.lowerBound(lastKey,true):null;
          var req=source.openCursor(range||null,'next');
          req.onsuccess=function(){
            var c=req.result;if(!c||batchCount>=size)return;
            lastKey=c.primaryKey;batchCount++;
            var row=c.value,out={};
            Object.keys(row||{}).forEach(function(k){if(!(restore&&k==='slot'))out[k]=row[k];});
            if(!restore)out.slot=slot;
            dest.put(out);c.continue();
          };
          req.onerror=function(){try{tx.abort();}catch(e){}};
          tx.oncomplete=function(){total+=batchCount;if(batchCount>=size)next().then(resolve,reject);else resolve(total);};
          tx.onerror=tx.onabort=function(){reject(storageError('复制聊天安全快照失败',tx.error));};
        }catch(e){reject(storageError('复制聊天安全快照失败',e));}
      });
    }
    return next();
  }

  function chatSnapshotInternal(slot){
    if (slot !== 'daily') return Promise.resolve(true); /* 聊天数据只维护一个逻辑快照，底层用双槽轮换。 */
    return open().then(function(db){
      function getCurrent(){return new Promise(function(resolve,reject){try{var tx=db.transaction(BACKUP_STORE,'readonly'),req=tx.objectStore(BACKUP_STORE).get(CHAT_SNAP_PREFIX+slot);req.onsuccess=function(){resolve(req.result&&req.result.value||null);};req.onerror=function(){reject(storageError('读取聊天安全快照状态失败',req.error));};}catch(e){reject(storageError('读取聊天安全快照状态失败',e));}});}
      return getCurrent().then(function(current){
        var previousSlot=current&&current.complete?String(current.slot||''):'';
        var targetSlot=previousSlot==='daily-a'?'daily-b':'daily-a';
        return clearChatBackupSlot(db,CHAT_BACKUP_STORE,targetSlot,false)
          .then(function(){return clearChatBackupSlot(db,MEDIA_BACKUP_STORE,targetSlot,true);})
          .then(function(){return copyStoreInBatches(db,CHAT_STORE,CHAT_BACKUP_STORE,targetSlot,false,250);})
          .then(function(count){return copyStoreInBatches(db,MEDIA_STORE,MEDIA_BACKUP_STORE,targetSlot,false,250).then(function(mediaCount){return {count:count,mediaCount:mediaCount};});})
          .then(function(info){
            /* 新快照完整写入后才切换指针；中断/配额异常不会破坏上一份有效快照。 */
            return new Promise(function(resolve,reject){try{var tx=db.transaction(BACKUP_STORE,'readwrite');tx.objectStore(BACKUP_STORE).put({key:CHAT_SNAP_PREFIX+slot,value:{slot:targetSlot,savedAt:Date.now(),complete:true,count:info.count,mediaCount:info.mediaCount}});tx.oncomplete=function(){resolve(info);};tx.onerror=tx.onabort=function(){reject(storageError('切换聊天安全快照失败',tx.error));};}catch(e){reject(storageError('切换聊天安全快照失败',e));}});
          })
          .then(function(info){
            if(previousSlot && previousSlot!==targetSlot) return clearChatBackupSlot(db,CHAT_BACKUP_STORE,previousSlot,false).then(function(){return clearChatBackupSlot(db,MEDIA_BACKUP_STORE,previousSlot,true);}).then(function(){return info;});
            return info;
          }).then(function(info){
            /* 如果从旧版单槽升级过来，成功轮换后清掉旧槽残留。 */
            if(targetSlot!=='daily') return clearChatBackupSlot(db,CHAT_BACKUP_STORE,'daily',false).then(function(){return clearChatBackupSlot(db,MEDIA_BACKUP_STORE,'daily',true);}).then(function(){return true;});
            return true;
          });
      });
    });
  }

  function recoverChatIfEmpty(db){
    return new Promise(function(resolve){
      try{
        var tx=db.transaction([CHAT_STORE,BACKUP_STORE],'readonly'),countReq=tx.objectStore(CHAT_STORE).count(),metaReq=tx.objectStore(BACKUP_STORE).get(CHAT_SNAP_PREFIX+'daily');
        var mainCount=0,best=null;
        countReq.onsuccess=function(){mainCount=Number(countReq.result)||0;};
        metaReq.onsuccess=function(){var meta=metaReq.result&&metaReq.result.value;if(meta&&meta.complete&&CHAT_SNAPSHOT_SLOTS.indexOf(String(meta.slot||''))>=0)best=meta;};
        tx.oncomplete=function(){
          if(mainCount>0||!best){resolve();return;}
          /* count 元数据可能在用户逐条删除后过时；恢复前必须确认活动快照中仍有消息行。 */
          try {
            var checkTx=db.transaction(CHAT_BACKUP_STORE,'readonly'),checkReq=checkTx.objectStore(CHAT_BACKUP_STORE).count(IDBKeyRange.bound([best.slot],[best.slot,[]]));
            checkReq.onsuccess=function(){
              if(!(Number(checkReq.result)>0)){resolve();return;}
              Promise.resolve().then(function(){return copyStoreInBatches(db,CHAT_BACKUP_STORE,CHAT_STORE,best.slot,true,250);})
                .then(function(){return copyStoreInBatches(db,MEDIA_BACKUP_STORE,MEDIA_STORE,best.slot,true,250);})
                .then(function(count){console.warn('[岛屿] 聊天主表为空，已从本地安全快照恢复 '+count+' 条消息');resolve();},function(err){console.warn('[岛屿] 恢复聊天安全快照失败',err);resolve();});
            };
            checkTx.onerror=checkTx.onabort=function(){resolve();};
          } catch(e){resolve();}
        };
        tx.onerror=tx.onabort=function(){resolve();};
      }catch(e){console.warn('[岛屿] 检查聊天安全快照失败',e);resolve();}
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
              if (!rows.length) return;
              tx.objectStore(BACKUP_STORE).put({ key:SNAP_PREFIX + slot, value:{ slot:slot, savedAt:Date.now(), count:rows.length, rows:rows }, savedAt:Date.now() });
            };
            tx.oncomplete = function(){ resolve(true); };
            tx.onerror = tx.onabort = function(){ console.warn('[岛屿] KV 安全快照写入失败：', tx.error); resolve(false); };
          } catch(e){ resolve(false); }
        });
      });
    }).then(function(ok){
      return chatFlush().then(function(){ return chatSnapshot(slot); }).then(function(){ return ok; });
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
            var tx = db.transaction([STORE, BACKUP_STORE, CHAT_STORE, MEDIA_STORE, CHAT_BACKUP_STORE, MEDIA_BACKUP_STORE], 'readwrite');
            tx.objectStore(STORE).clear();
            tx.objectStore(BACKUP_STORE).clear();
            tx.objectStore(CHAT_STORE).clear();
            tx.objectStore(MEDIA_STORE).clear();
            tx.objectStore(CHAT_BACKUP_STORE).clear();
            tx.objectStore(MEDIA_BACKUP_STORE).clear();
            tx.oncomplete = function(){
              var native = nativeChatPlugin();
              if (native) native.chatClearAll({}).then(function(){ resolve(true); }, function(err){ reject(storageError('清空原生聊天数据库失败', err)); });
              else resolve(true);
            };
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
            var tx = db.transaction([STORE, BACKUP_STORE, CHAT_STORE, MEDIA_STORE, CHAT_BACKUP_STORE, MEDIA_BACKUP_STORE], 'readwrite');
            var store = tx.objectStore(STORE);
            var backup = tx.objectStore(BACKUP_STORE);
            /* 完整导入会替换 KV 与消息分表；消息表由分批导入器随后写入。 */
            store.clear();
            backup.clear();
            tx.objectStore(CHAT_STORE).clear();
            tx.objectStore(MEDIA_STORE).clear();
            tx.objectStore(CHAT_BACKUP_STORE).clear();
            tx.objectStore(MEDIA_BACKUP_STORE).clear();
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

  function nativeChatPlugin(){
    try {
      var C = typeof window !== 'undefined' ? window.Capacitor : null;
      if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
      if (typeof C.getPlatform === 'function' && C.getPlatform() !== 'android') return null;
      if (typeof C.registerPlugin !== 'function') return null;
      var plugin = C.registerPlugin('IslandNative');
      return plugin && typeof plugin.chatReadPage === 'function' ? plugin : null;
    } catch(e){ return null; }
  }

  function dataUrlToBlob(dataUrl, type){
    try {
      var parts = String(dataUrl || '').split(',');
      var meta = parts[0] || '';
      var mime = type || (meta.match(/^data:([^;,]+)/i) || [,'application/octet-stream'])[1];
      var bin = atob(parts[1] || '');
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type:mime });
    } catch(e){ return null; }
  }

  function blobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      try {
        var reader = new FileReader();
        reader.onload = function(){ resolve(String(reader.result || '')); };
        reader.onerror = function(){ reject(reader.error || new Error('媒体数据读取失败')); };
        reader.readAsDataURL(blob);
      } catch(e){ reject(e); }
    });
  }

  function looksLikeLargeMedia(value){
    return typeof value === 'string' && value.length >= 8192 && /^data:(?:image|audio|video|application|font)\//i.test(value);
  }

  function packMediaValue(value, path, mediaRows, counter){
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return blobToDataUrl(value).then(function(dataUrl){
        if (dataUrl.length < 8192) return { __islandInlineBlob:true, type:value.type || '', dataUrl:dataUrl };
        var key = 'm' + (counter.value++).toString(36);
        mediaRows.push({ key:key, value:dataUrl });
        return { __islandMediaRef:key, blob:true, type:value.type || '' };
      });
    }
    if (looksLikeLargeMedia(value)) {
      var key = 'm' + (counter.value++).toString(36);
      mediaRows.push({ key:key, value:value });
      return Promise.resolve({ __islandMediaRef:key, blob:false });
    }
    if (Array.isArray(value)) return Promise.all(value.map(function(v, i){ return packMediaValue(v, path + '[' + i + ']', mediaRows, counter); }));
    if (value && typeof value === 'object') {
      var keys = Object.keys(value).filter(function(k){ return k !== '__islandSeq'; });
      return Promise.all(keys.map(function(k){ return packMediaValue(value[k], path + '.' + k, mediaRows, counter); })).then(function(vals){
        var out = {};
        keys.forEach(function(k, i){ out[k] = vals[i]; });
        return out;
      });
    }
    return Promise.resolve(value);
  }

  function unpackMediaValue(value, mediaMap){
    if (Array.isArray(value)) return value.map(function(v){ return unpackMediaValue(v, mediaMap); });
    if (value && typeof value === 'object') {
      if (value.__islandMediaRef) {
        var media = mediaMap[String(value.__islandMediaRef)];
        if (media == null) return null;
        return value.blob ? dataUrlToBlob(media, value.type) : media;
      }
      if (value.__islandInlineBlob === true && typeof value.dataUrl === 'string') return dataUrlToBlob(value.dataUrl, value.type);
      var out = {};
      Object.keys(value).forEach(function(k){ out[k] = unpackMediaValue(value[k], mediaMap); });
      return out;
    }
    return value;
  }

  function storedRowToMessage(row){
    var packed;
    try { packed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload; }
    catch(e){ packed = {}; }
    var map = Object.create(null);
    (Array.isArray(row.media) ? row.media : []).forEach(function(m){ if (m && m.key) map[String(m.key)] = m.value; });
    var message = unpackMediaValue(packed, map);
    if (!message || typeof message !== 'object' || Array.isArray(message)) message = { text:String(message || '') };
    message.__islandSeq = Number(row.seq) || 0;
    return message;
  }

  function extractMessageSearchText(message){
    var fields = ['text','transcript','aiTranscript','voiceText','synthText','fileName','name','description','note','locationName','recordTitle','address','content'];
    return fields.map(function(key){ return message && message[key] != null ? String(message[key]) : ''; }).join(' ').replace(/\s+/g, ' ').slice(0, 8000).toLowerCase();
  }

  function withMediaForCursor(mediaStore, chat, seq, done){
    var req = mediaStore.index('byMessage').getAll([chat, seq]);
    req.onsuccess = function(){ done(Array.isArray(req.result) ? req.result.map(function(m){ return { key:m.key, value:m.value }; }) : []); };
    req.onerror = function(){ done([]); };
  }

  /* 按聊天 + 自增序号游标分页；聊天内容和媒体从不同对象库读取。 */
  function chatReadPage(name, options){
    name = String(name || ''); options = options || {};
    var native = nativeChatPlugin();
    var opts = { chat:name, limit:Math.max(1, Math.min(1000, Number(options.limit) || 300)), beforeSeq:Number(options.beforeSeq) || 0, afterSeq:Number(options.afterSeq) || 0, first:!!options.first, withMedia:options.withMedia !== false, withCount:!!options.withCount };
    if (native) {
      return native.chatReadPage(opts).then(function(result){
        var rows = Array.isArray(result && result.rows) ? result.rows : [];
        return { rows:rows.map(storedRowToMessage), hasMore:!!(result && result.hasMore), count:result && result.count != null ? (Number(result.count)||0) : null,
          oldestSeq:rows.length ? Number(rows[0].seq) || 0 : 0, newestSeq:rows.length ? Number(rows[rows.length - 1].seq) || 0 : 0 };
      });
    }
    return open().then(function(db){
      return new Promise(function(resolve, reject){
        var direction = (opts.afterSeq > 0 || opts.first) ? 'next' : 'prev';
        var range;
        try {
          if (opts.first) range = IDBKeyRange.bound([name, 1], [name, Number.MAX_SAFE_INTEGER]);
          else if (opts.afterSeq > 0) range = IDBKeyRange.bound([name, opts.afterSeq + 1], [name, Number.MAX_SAFE_INTEGER]);
          else if (opts.beforeSeq > 0) range = IDBKeyRange.bound([name, 0], [name, opts.beforeSeq - 1]);
          else range = IDBKeyRange.bound([name, 0], [name, Number.MAX_SAFE_INTEGER]);
          var tx = db.transaction(opts.withMedia ? [CHAT_STORE, MEDIA_STORE] : [CHAT_STORE], 'readonly');
          var store = tx.objectStore(CHAT_STORE), mediaStore = opts.withMedia ? tx.objectStore(MEDIA_STORE) : null;
          var req = store.openCursor(range, direction), rows = [], hasMore = false, ended = false;
          var countReq = opts.withCount ? store.count(IDBKeyRange.bound([name, 0], [name, Number.MAX_SAFE_INTEGER])) : null, totalCount = null;
          if (countReq) countReq.onsuccess = function(){ totalCount = Number(countReq.result) || 0; };
          req.onsuccess = function(){
            var cursor = req.result;
            if (!cursor) { ended = true; return; }
            if (rows.length >= opts.limit) { hasMore = true; ended = true; return; }
            var value = cursor.value;
            function append(media){
              rows.push({ seq:Number(value.seq), payload:value.payload, createdAt:value.createdAt, media:media || [] });
              cursor.continue();
            }
            if (mediaStore) withMediaForCursor(mediaStore, name, Number(value.seq), append);
            else append([]);
          };
          req.onerror = function(){ reject(storageError('分页读取聊天记录失败', req.error)); };
          tx.oncomplete = function(){
            if (direction === 'prev') rows.reverse();
            resolve({ rows:rows.map(storedRowToMessage), hasMore:hasMore, count:totalCount,
              oldestSeq:rows.length ? Number(rows[0].seq) || 0 : 0, newestSeq:rows.length ? Number(rows[rows.length - 1].seq) || 0 : 0 });
          };
          tx.onerror = tx.onabort = function(){ reject(storageError('分页读取聊天记录失败', tx.error)); };
        } catch(e){ reject(storageError('分页读取聊天记录失败', e)); }
      });
    });
  }

  /* 只写入发生变化的消息行；已加载记录的删除不会影响尚未翻到的历史记录。 */
  function chatWriteBatchInternal(name, inputRows, deleteSeqs){
    name = String(name || ''); inputRows = Array.isArray(inputRows) ? inputRows : []; deleteSeqs = Array.isArray(deleteSeqs) ? deleteSeqs : [];
    var native = nativeChatPlugin();
    var preparedJobs = inputRows.map(function(row){
      var msg = row && row.message && typeof row.message === 'object' ? row.message : {};
      var seq = Number(row && row.seq) || Number(msg.__islandSeq) || 0;
      var media = [];
      return packMediaValue(msg, '', media, { value:0 }).then(function(packed){
        return { seq:seq, createdAt:Number(msg.createdAt || msg.timestamp || Date.now()) || Date.now(),
          searchText:extractMessageSearchText(msg), payload:JSON.stringify(packed), media:media, index:Number(row && row.index) || 0 };
      });
    });
    return Promise.all(preparedJobs).then(function(rows){
      var payload = { chat:name, rows:rows, deleteSeqs:deleteSeqs.map(Number).filter(function(n){ return n > 0; }) };
      if (native) return native.chatWriteBatch(payload).then(function(result){
        var saved = Array.isArray(result && result.rows) ? result.rows : [];
        return { rows:saved, maxSeq:Number(result && result.maxSeq) || 0 };
      });
      return open().then(function(db){
        return new Promise(function(resolve, reject){
          try {
            var tx = db.transaction([CHAT_STORE, MEDIA_STORE, CHAT_BACKUP_STORE, MEDIA_BACKUP_STORE], 'readwrite');
            var store = tx.objectStore(CHAT_STORE), mediaStore = tx.objectStore(MEDIA_STORE), chatBackupStore = tx.objectStore(CHAT_BACKUP_STORE), mediaBackupStore = tx.objectStore(MEDIA_BACKUP_STORE);
            var resultRows = [], maxSeq = 0, maxReq = store.openCursor(IDBKeyRange.bound([name, 0], [name, Number.MAX_SAFE_INTEGER]), 'prev');
            maxReq.onsuccess = function(){
              var cursor = maxReq.result;
              maxSeq = cursor ? Number(cursor.value.seq) || 0 : 0;
              payload.deleteSeqs.forEach(function(seq){
                store.delete([name, seq]);
                var delReq = mediaStore.index('byMessage').openCursor(IDBKeyRange.only([name, seq]));
                delReq.onsuccess = function(){ var c = delReq.result; if (c) { c.delete(); c.continue(); } };
                /* 按消息删除对应快照行，避免所有消息被逐条删完后又从旧快照恢复回来。 */
                CHAT_SNAPSHOT_SLOTS.forEach(function(slot){
                  chatBackupStore.delete([slot, name, seq]);
                  var mediaRange=IDBKeyRange.bound([slot,name,seq],[slot,name,seq,[]]);
                  var backupMediaReq=mediaBackupStore.openCursor(mediaRange);
                  backupMediaReq.onsuccess=function(){var c=backupMediaReq.result;if(c){c.delete();c.continue();}};
                });
              });
              rows.forEach(function(row){
                if (!(row.seq > 0)) row.seq = Math.max(maxSeq + 1, Date.now() * 1000);
                maxSeq = Math.max(maxSeq, row.seq);
                store.put({ chat:name, seq:row.seq, createdAt:row.createdAt, searchText:row.searchText, payload:row.payload });
                var oldMediaReq = mediaStore.index('byMessage').openCursor(IDBKeyRange.only([name, row.seq]));
                oldMediaReq.onsuccess = function(){ var c = oldMediaReq.result; if (c) { c.delete(); c.continue(); } };
                row.media.forEach(function(m){ mediaStore.put({ chat:name, seq:row.seq, key:m.key, value:m.value }); });
                resultRows.push({ seq:row.seq, index:row.index });
              });
            };
            maxReq.onerror = function(){ try { tx.abort(); } catch(e) {} };
            tx.oncomplete = function(){ resolve({ rows:resultRows, maxSeq:maxSeq }); };
            tx.onerror = tx.onabort = function(){ reject(storageError('写入聊天消息分表失败', tx.error)); };
          } catch(e){ reject(storageError('写入聊天消息分表失败', e)); }
        });
      });
    });
  }

  function chatWriteBatch(name, inputRows, deleteSeqs){
    /* 序号要在队列交接前写回原消息对象，否则连续触发 saveMessages 时第二个批次可能误分配新序号。 */
    var run = _chatWriteTail.catch(function(){ return undefined; }).then(function(){ return chatWriteBatchInternal(name, inputRows, deleteSeqs); }).then(function(result){
      var saved = Array.isArray(result && result.rows) ? result.rows : [];
      saved.forEach(function(item){
        var source = (Array.isArray(inputRows) ? inputRows : []).find(function(row){ return Number(row && row.index) === Number(item && item.index); });
        if (source && source.message && typeof source.message === 'object' && Number(item && item.seq) > 0) source.message.__islandSeq = Number(item.seq);
      });
      return result;
    });
    _chatWriteTail = run.catch(function(){ return undefined; });
    return run;
  }

  function chatFlush(){ return Promise.all([flush(), _chatWriteTail.catch(function(){ return undefined; })]).then(function(){ return true; }); }

  function chatSnapshot(slot){
    slot=SNAP_SLOTS.indexOf(slot)>=0?slot:'daily';
    if(slot!=='daily')return Promise.resolve(true);
    var native=nativeChatPlugin();
    var run=_chatWriteTail.catch(function(){return undefined;}).then(function(){
      if(native&&typeof native.chatSnapshot==='function')return native.chatSnapshot({slot:slot}).then(function(){return true;});
      return chatSnapshotInternal(slot);
    });
    _chatWriteTail=run.catch(function(){return undefined;});
    return run;
  }

  function chatDeleteAllInternal(name){
    name = String(name || '');
    var native = nativeChatPlugin();
    if (native) return native.chatDeleteAll({ chat:name }).then(function(){ return true; });
    return open().then(function(db){
      return new Promise(function(resolve, reject){
        try {
          var tx = db.transaction([CHAT_STORE, MEDIA_STORE, CHAT_BACKUP_STORE, MEDIA_BACKUP_STORE], 'readwrite');
          var range = IDBKeyRange.bound([name, 0], [name, Number.MAX_SAFE_INTEGER]);
          var a = tx.objectStore(CHAT_STORE).openCursor(range), b = tx.objectStore(MEDIA_STORE).openCursor(range);
          a.onsuccess = function(){ var c=a.result; if(c){c.delete();c.continue();} };
          b.onsuccess = function(){ var c=b.result; if(c){c.delete();c.continue();} };
          CHAT_SNAPSHOT_SLOTS.forEach(function(slot){
            var msgRange=IDBKeyRange.bound([slot,name,0],[slot,name,Number.MAX_SAFE_INTEGER]);
            var mediaRange=IDBKeyRange.bound([slot,name,0,''],[slot,name,Number.MAX_SAFE_INTEGER,'\uffff']);
            var ca=tx.objectStore(CHAT_BACKUP_STORE).openCursor(msgRange),cb=tx.objectStore(MEDIA_BACKUP_STORE).openCursor(mediaRange);
            ca.onsuccess=function(){var c=ca.result;if(c){c.delete();c.continue();}};cb.onsuccess=function(){var c=cb.result;if(c){c.delete();c.continue();}};
          });
          tx.oncomplete = function(){ resolve(true); };
          tx.onerror = tx.onabort = function(){ reject(storageError('删除聊天记录失败', tx.error)); };
        } catch(e){ reject(storageError('删除聊天记录失败', e)); }
      });
    });
  }

  function chatDeleteAll(name){
    name = String(name || '');
    var run = _chatWriteTail.catch(function(){ return undefined; }).then(function(){ return chatDeleteAllInternal(name); });
    _chatWriteTail = run.catch(function(){ return undefined; });
    return run;
  }

  function chatClearAllInternal(){
    var native = nativeChatPlugin();
    if (native) return native.chatClearAll({}).then(function(){ return true; });
    return open().then(function(db){ return new Promise(function(resolve, reject){
      try { var tx=db.transaction([CHAT_STORE,MEDIA_STORE,CHAT_BACKUP_STORE,MEDIA_BACKUP_STORE,BACKUP_STORE],'readwrite');
        tx.objectStore(CHAT_STORE).clear(); tx.objectStore(MEDIA_STORE).clear();
        tx.objectStore(CHAT_BACKUP_STORE).clear(); tx.objectStore(MEDIA_BACKUP_STORE).clear();
        tx.objectStore(BACKUP_STORE).delete(CHAT_SNAP_PREFIX+'daily');
        tx.oncomplete=function(){resolve(true);}; tx.onerror=tx.onabort=function(){reject(storageError('清空聊天数据库失败',tx.error));};
      } catch(e){reject(storageError('清空聊天数据库失败',e));}
    }); });
  }

  function chatClearAll(){
    var run = _chatWriteTail.catch(function(){ return undefined; }).then(function(){ return chatClearAllInternal(); });
    _chatWriteTail = run.catch(function(){ return undefined; });
    return run;
  }

  function chatListNames(){
    var native = nativeChatPlugin();
    if (native && typeof native.chatListNames === 'function') return native.chatListNames({}).then(function(r){ return Array.isArray(r && r.names) ? r.names : []; });
    return open().then(function(db){ return new Promise(function(resolve, reject){
      try { var tx=db.transaction(CHAT_STORE,'readonly'), index=tx.objectStore(CHAT_STORE).index('byChat'), req=index.openKeyCursor(null,'nextunique'), names=[];
        req.onsuccess=function(){var c=req.result;if(!c)return;names.push(String(c.key));c.continue();};
        req.onerror=function(){reject(storageError('读取聊天会话索引失败',req.error));};
        tx.oncomplete=function(){resolve(names);};tx.onerror=tx.onabort=function(){reject(storageError('读取聊天会话索引失败',tx.error));};
      } catch(e){reject(storageError('读取聊天会话索引失败',e));}
    }); });
  }

  function chatCount(name){
    name=String(name||''); var native=nativeChatPlugin();
    if(native) return native.chatCount({chat:name}).then(function(r){return Number(r && r.count)||0;});
    return open().then(function(db){return new Promise(function(resolve,reject){
      try{var tx=db.transaction(CHAT_STORE,'readonly'),req=tx.objectStore(CHAT_STORE).count(IDBKeyRange.bound([name,0],[name,Number.MAX_SAFE_INTEGER]));
        req.onsuccess=function(){resolve(Number(req.result)||0);};req.onerror=function(){reject(storageError('统计聊天记录失败',req.error));};
      }catch(e){reject(storageError('统计聊天记录失败',e));}
    });});
  }

  /* 按消息编号（seq）查边界：afterSeq 之后的第 n 条（从旧往新数），fromEnd 时从最新往旧数。没有这么多条就返回 0。
   * 总结、上下文都靠它记账，不再依赖“内存里那一小段聊天的下标”。 */
  function chatSeqNth(name, options){
    name=String(name||''); options=options||{};
    var after=Math.max(0,Number(options.afterSeq)||0), n=Math.max(1,Math.floor(Number(options.n)||1)), fromEnd=!!options.fromEnd;
    var native=nativeChatPlugin();
    if(native && typeof native.chatSeqNth==='function') return native.chatSeqNth({chat:name,afterSeq:after,n:n,fromEnd:fromEnd}).then(function(r){return Number(r && r.seq)||0;});
    if(native){
      /* 旧安装包没有这个原生方法时，退回到分页读取（不带媒体） */
      var seen=0, cursorSeq=fromEnd?0:after;
      function walk(){
        var o={limit:Math.min(1000,Math.max(1,n-seen)),withMedia:false};
        if(fromEnd){ if(cursorSeq>0) o.beforeSeq=cursorSeq; } else { o.afterSeq=cursorSeq; }
        return chatReadPage(name,o).then(function(page){
          var rows=page.rows.filter(function(m){return (Number(m.__islandSeq)||0)>after;});
          if(!rows.length) return 0;
          var ordered=fromEnd?rows.slice().reverse():rows;
          for(var i=0;i<ordered.length;i++){ seen++; if(seen===n) return Number(ordered[i].__islandSeq)||0; }
          cursorSeq=Number((fromEnd?rows[0]:rows[rows.length-1]).__islandSeq)||0;
          if(page.rows.length<o.limit) return 0;
          return walk();
        });
      }
      return walk();
    }
    return open().then(function(db){return new Promise(function(resolve,reject){
      try{
        var tx=db.transaction(CHAT_STORE,'readonly'), store=tx.objectStore(CHAT_STORE), result=0, skipped=false;
        var req=store.openKeyCursor(IDBKeyRange.bound([name,after+1],[name,Number.MAX_SAFE_INTEGER]),fromEnd?'prev':'next');
        req.onsuccess=function(){
          var c=req.result; if(!c) return;
          if(n>1 && !skipped){ skipped=true; c.advance(n-1); return; }
          var key=c.primaryKey||c.key; result=Number(key && key[1])||0;
        };
        req.onerror=function(){reject(storageError('查询聊天编号失败',req.error));};
        tx.oncomplete=function(){resolve(result);};tx.onerror=tx.onabort=function(){reject(storageError('查询聊天编号失败',tx.error));};
      }catch(e){reject(storageError('查询聊天编号失败',e));}
    });});
  }

  /* 数一数 afterSeq 之后、uptoSeq 以内（含）有多少条消息；uptoSeq 为 0 表示不设上限。 */
  function chatCountRange(name, afterSeq, uptoSeq){
    name=String(name||''); afterSeq=Math.max(0,Number(afterSeq)||0); uptoSeq=Math.max(0,Number(uptoSeq)||0);
    var native=nativeChatPlugin();
    if(native && typeof native.chatCountRange==='function') return native.chatCountRange({chat:name,afterSeq:afterSeq,uptoSeq:uptoSeq}).then(function(r){return Number(r && r.count)||0;});
    if(native){
      var total=0, cursor=afterSeq;
      function walk(){
        return chatReadPage(name,{afterSeq:cursor,limit:1000,withMedia:false}).then(function(page){
          for(var i=0;i<page.rows.length;i++){ var s=Number(page.rows[i].__islandSeq)||0; if(uptoSeq>0 && s>uptoSeq) return total; total++; cursor=s; }
          if(page.rows.length<1000) return total;
          return walk();
        });
      }
      return walk();
    }
    if(uptoSeq>0 && uptoSeq<afterSeq+1) return Promise.resolve(0);
    return open().then(function(db){return new Promise(function(resolve,reject){
      try{
        var tx=db.transaction(CHAT_STORE,'readonly');
        var req=tx.objectStore(CHAT_STORE).count(IDBKeyRange.bound([name,afterSeq+1],[name,uptoSeq>0?uptoSeq:Number.MAX_SAFE_INTEGER]));
        req.onsuccess=function(){resolve(Number(req.result)||0);};req.onerror=function(){reject(storageError('统计聊天记录失败',req.error));};
      }catch(e){reject(storageError('统计聊天记录失败',e));}
    });});
  }

  function chatReadAll(name, batchSize){
    var all=[], cursor=0, size=Math.max(1,Math.min(1000,Number(batchSize)||300));
    function next(){return chatReadPage(name,{afterSeq:cursor,first:cursor===0,limit:size,withMedia:true}).then(function(page){
      if(!page.rows.length) return all;
      page.rows.forEach(function(msg){all.push(msg);cursor=Number(msg.__islandSeq)||cursor;});
      if(page.rows.length<size) return all;
      return next();
    });}
    return next();
  }

  function chatReplaceAll(messages){
    messages=messages && typeof messages==='object' ? messages : {};
    return chatClearAll().then(function(){
      var names=Object.keys(messages), chain=Promise.resolve();
      names.forEach(function(name){
        var list=Array.isArray(messages[name]) ? messages[name] : [];
        chain=chain.then(function(){
          var offset=0;
          function next(){
            var slice=list.slice(offset,offset+200); if(!slice.length) return Promise.resolve();
            var rows=slice.map(function(message,i){ return { seq:0, index:i, message:message }; });
            offset+=slice.length;
            return chatWriteBatch(name,rows,[]).then(next);
          }
          return next();
        });
      });
      return chain.then(function(){return true;});
    });
  }

  function chatSearchLegacy(name, query, options){
    name=String(name||''); query=String(query||'').trim().toLowerCase(); options=options||{};
    var limit=Math.max(1,Math.min(500,Number(options.limit)||100));
    var scanSize=Math.max(50,Math.min(500,Number(options.scanSize)||250));
    var before=Number(options.beforeSeq)||0, matches=[], scanned=0, maxScan=Math.max(scanSize,Number(options.maxScan)||200000);
    var filter=typeof options.filter==='function'?options.filter:null;
    function scan(){
      if(matches.length>=limit||scanned>=maxScan) return Promise.resolve({rows:matches,hasMore:scanned<maxScan});
      return chatReadPage(name,{beforeSeq:before,limit:scanSize,withMedia:false}).then(function(page){
        if(!page.rows.length) return {rows:matches,hasMore:false};
        var sorted=page.rows.slice().sort(function(a,b){return (Number(b.__islandSeq)||0)-(Number(a.__islandSeq)||0);});
        sorted.forEach(function(msg){
          if(matches.length>=limit||scanned>=maxScan) return;
          scanned++; before=Number(msg.__islandSeq)||before;
          if((!query || extractMessageSearchText(msg).indexOf(query)>=0) && (!filter || filter(msg))) matches.push({seq:before,message:msg});
        });
        if(page.rows.length<scanSize) return {rows:matches,hasMore:false};
        return scan();
      });
    }
    return scan();
  }

  /* 搜索：先用消息里已存好的 searchText 判断是否命中，只有命中的才解析内容，其余消息一条都不解析。
   * 网页端：一次游标从新往旧扫；APK：交给 SQLite 直接筛，只把命中的行传回来。 */
  function chatSearch(name, query, options){
    name=String(name||''); query=String(query||'').trim().toLowerCase(); options=options||{};
    var limit=Math.max(1,Math.min(500,Number(options.limit)||100));
    var before=Number(options.beforeSeq)||0, maxScan=Math.max(250,Number(options.maxScan)||200000);
    var filter=typeof options.filter==='function'?options.filter:null;
    var native=nativeChatPlugin();
    if(native && typeof native.chatSearchRows==='function'){
      var matches=[], cursor=before, scanned=0;
      function nextBatch(){
        return native.chatSearchRows({chat:name,query:query,beforeSeq:cursor,limit:250}).then(function(result){
          var rows=Array.isArray(result && result.rows)?result.rows:[];
          for(var i=0;i<rows.length;i++){
            scanned++; cursor=Number(rows[i].seq)||cursor;
            var msg=storedRowToMessage({seq:rows[i].seq,payload:rows[i].payload,media:[]});
            if(filter && !filter(msg)) continue;
            if(matches.length>=limit) return {rows:matches,hasMore:true};
            matches.push({seq:Number(rows[i].seq)||0,message:msg});
          }
          if(rows.length<250 || scanned>=maxScan) return {rows:matches,hasMore:rows.length>=250};
          return nextBatch();
        });
      }
      return nextBatch();
    }
    if(native) return chatSearchLegacy(name,query,options);
    return open().then(function(db){return new Promise(function(resolve,reject){
      try{
        var upper=before>0?before-1:Number.MAX_SAFE_INTEGER;
        if(upper<1){resolve({rows:[],hasMore:false});return;}
        var tx=db.transaction(CHAT_STORE,'readonly');
        var req=tx.objectStore(CHAT_STORE).openCursor(IDBKeyRange.bound([name,0],[name,upper]),'prev');
        var matches=[], scanned=0, hasMore=false;
        req.onsuccess=function(){
          var c=req.result; if(!c) return;
          var v=c.value; scanned++;
          if(scanned>maxScan){hasMore=true;return;}
          if(!query || String(v.searchText||'').indexOf(query)>=0){
            var msg=storedRowToMessage({seq:v.seq,payload:v.payload,media:[]});
            if(!filter || filter(msg)){
              if(matches.length>=limit){hasMore=true;return;}
              matches.push({seq:Number(v.seq)||0,message:msg});
            }
          }
          c.continue();
        };
        req.onerror=function(){reject(storageError('搜索聊天记录失败',req.error));};
        tx.oncomplete=function(){resolve({rows:matches,hasMore:hasMore});};
        tx.onerror=tx.onabort=function(){reject(storageError('搜索聊天记录失败',tx.error));};
      }catch(e){reject(storageError('搜索聊天记录失败',e));}
    });});
  }

  function snapshotChatStats(){
    return chatListNames().then(function(names){
      return Promise.all(names.map(function(name){return chatCount(name).then(function(count){return {name:name,count:count};});}));
    });
  }

  function recoveredCount(){ return _recovered; }

  return { snapshot:snapshot, snapshotInfo:snapshotInfo, requestPersistent:requestPersistent, recoveredCount:recoveredCount,
    open:open, get:get, set:set, remove:remove, clear:clear, wipeAll:wipeAll, replaceAll:replaceAll, list:list, flush:flush, isPersistent:isPersistent,
    chatReadPage:chatReadPage, chatWriteBatch:chatWriteBatch, chatFlush:chatFlush, chatSnapshot:chatSnapshot, chatDeleteAll:chatDeleteAll, chatClearAll:chatClearAll,
    chatListNames:chatListNames, chatCount:chatCount, chatSeqNth:chatSeqNth, chatCountRange:chatCountRange, chatReadAll:chatReadAll, chatReplaceAll:chatReplaceAll,
    chatSearch:chatSearch, snapshotChatStats:snapshotChatStats };
})();
