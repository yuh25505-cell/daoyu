// Capacitor's native bridge injects window.Capacitor into the WebView, but the
// registerPlugin() helper only exists when @capacitor/core is bundled into the web app.
// This app is plain static JS (no bundler), so provide a minimal registerPlugin() on top
// of the bridge's own Plugins map / nativePromise so app.js can call the native plugin.
(function () {
  var C = window.Capacitor;
  if (!C || typeof C.registerPlugin === 'function') return;
  C.registerPlugin = function (name) {
    if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
    if (typeof C.nativePromise !== 'function') return {};
    return new Proxy({}, {
      get: function (_target, method) {
        if (typeof method !== 'string' || method === 'then') return undefined;
        return function (options) {
          return C.nativePromise(name, method, options || {});
        };
      }
    });
  };
})();

// Android WebView ignores <a download href="blob:..."> clicks, so backup exports would
// silently do nothing. Inside the APK, route those downloads to the native plugin, which
// saves the file into the phone's Download/岛屿 folder (visible in the file manager).
(function () {
  var C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;
  if (typeof C.registerPlugin !== 'function') return;
  var Native = C.registerPlugin('IslandNative');
  var CHUNK_BYTES = 3 * 256 * 1024; // multiple of 3 so every base64 chunk decodes on its own
  var toastEl = null;
  var toastTimer = null;

  function notify(msg) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);' +
          'max-width:86%;padding:12px 20px;border-radius:999px;background:#111;color:#fff;' +
          'font-size:14px;line-height:1.4;text-align:center;z-index:2147483647;pointer-events:none;' +
          'word-break:break-all;transition:opacity .2s;opacity:0;';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 3800);
    } catch (e) {}
  }

  function readBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || '');
        resolve(s.substring(s.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(reader.error || new Error('读取文件失败')); };
      reader.readAsDataURL(blob);
    });
  }

  function saveUrlToPhone(href, filename) {
    return fetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
      return Native.beginSaveFile({
        filename: filename,
        mimeType: blob.type || 'application/octet-stream'
      }).then(function (begin) {
        var id = begin.id;
        var offset = 0;
        function next() {
          if (offset >= blob.size) return Native.finishSaveFile({ id: id });
          var part = blob.slice(offset, offset + CHUNK_BYTES);
          offset += CHUNK_BYTES;
          return readBase64(part)
            .then(function (b64) { return Native.writeSaveFileChunk({ id: id, data: b64 }); })
            .then(next);
        }
        return next().catch(function (err) {
          return Native.abortSaveFile({ id: id }).catch(function () {}).then(function () { throw err; });
        });
      });
    });
  }

  var originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var a = this;
    try {
      var href = a.href || '';
      if (a.hasAttribute('download') && /^(blob:|data:)/.test(href)) {
        var name = a.getAttribute('download') || 'island-file';
        saveUrlToPhone(href, name).then(function (res) {
          notify('已保存到 ' + ((res && res.path) || '下载/岛屿/' + name));
        }).catch(function (err) {
          notify('保存失败：' + ((err && err.message) || err));
        });
        return;
      }
    } catch (e) {}
    return originalClick.apply(this, arguments);
  };
})();
