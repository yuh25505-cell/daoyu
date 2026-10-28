/* 岛屿 · APK 应用内更新（仅安卓安装包里生效）
 *
 * 流程：读 GitHub 上最新发布的安装包 → 和本机安装的打包序号对比 → 有新的就在岛屿里下载（带进度弹窗）
 *      → 下载完调起系统安装页面 → 用户点「安装」覆盖更新，聊天、人设、设置等本地数据保留。
 * 本机打包序号 = 安装包 versionCode − 100000（见 patch_android.mjs）；线上序号取自发布标签 apk-build-N。
 * 网页版不会走这里。 */
'use strict';

var IslandApkUpdate = (function(){
  var BASE_CODE = 100000;
  var LAST_KEY = 'island.apk.lastCheck';
  var _busy = false, _plugin = null;
  var _dlg = null, _timer = 0, _cancelling = false;

  function ui(){ return (window.IslandUpdate && IslandUpdate.ui) || {}; }
  function repo(){ return typeof window.ISLAND_APK_REPO === 'string' ? window.ISLAND_APK_REPO : ''; }
  function msgOf(err){ return err && err.message ? err.message : String(err || '未知原因'); }

  function plugin(){
    if (_plugin) return _plugin;
    try {
      var C = window.Capacitor;
      if (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && typeof C.registerPlugin === 'function') {
        _plugin = C.registerPlugin('IslandNative');
      }
    } catch(e) {}
    return _plugin;
  }

  function fmtMB(n){ return (Number(n || 0) / 1048576).toFixed(1) + ' MB'; }
  function label(info){ return info.version ? 'v' + info.version : '第 ' + info.run + ' 次打包'; }

  /* ---------- 检查 ---------- */
  function parseRelease(rel){
    var m = /apk-build-(\d+)/.exec(String(rel && rel.tag_name || ''));
    var run = m ? parseInt(m[1], 10) : 0;
    var asset = ((rel && rel.assets) || []).filter(function(a){ return /\.apk$/i.test(a.name || ''); })[0];
    if (!run || !asset) throw new Error('GitHub 上最新的发布里没有找到安装包');
    var v = /v(\d+\.\d+\.\d+)/.exec(String(rel.name || ''));
    return { run: run, version: v ? v[1] : '', url: asset.browser_download_url, size: asset.size || 0, notes: String(rel.body || '').trim() };
  }

  /* 首选：读发布里附带的 apk-update.json（走手机原生网络，没有 GitHub 接口的次数限制） */
  function fetchFromFile(r){
    var base = 'https://github.com/' + r + '/releases/';
    return plugin().fetchText({ url: base + 'latest/download/apk-update.json' }).then(function(res){
      var info = JSON.parse(String(res && res.text || ''));
      var run = parseInt(info.run, 10) || 0;
      if (!run || !info.file) throw new Error('更新信息不完整');
      return {
        run: run, version: String(info.version || ''), size: 0, notes: String(info.notes || '').trim(),
        url: base + 'download/apk-build-' + run + '/' + encodeURIComponent(info.file)
      };
    });
  }

  /* 备用：读 GitHub 接口（有访问次数限制，限制时会返回 403） */
  function fetchFromApi(r){
    var u = ui();
    return u.withTimeout(
      fetch('https://api.github.com/repos/' + r + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }).then(function(resp){
        if (resp.status === 404) throw new Error('GitHub 上还没有找到发布的安装包');
        if (resp.status === 403 || resp.status === 429) throw new Error('GitHub 暂时限制了访问次数（' + resp.status + '），过一会儿再试');
        if (!resp.ok) throw new Error('GitHub 返回了错误（' + resp.status + '）');
        return resp.json();
      }),
      15000, '连接 GitHub 超时'
    ).then(parseRelease);
  }

  function fetchLatest(){
    var r = repo();
    if (!r) return Promise.reject(new Error('这个安装包里没有记录 GitHub 仓库，请重新打包一次'));
    return fetchFromFile(r).catch(function(){ return fetchFromApi(r); });
  }

  function installedRun(){
    var p = plugin();
    if (!p) return Promise.reject(new Error('当前不是安卓安装包'));
    return p.getAppInfo().then(function(info){
      var code = Number(info && info.versionCode) || 0;
      return code >= BASE_CODE ? code - BASE_CODE : 0;
    });
  }

  /* 返回 { state:'latest'|'available', local, remote } */
  function check(){
    return Promise.all([installedRun(), fetchLatest()]).then(function(r){
      var local = r[0], remote = r[1];
      var u = ui();
      if (u.lsSet) u.lsSet(LAST_KEY, { at: Date.now(), run: local });
      return { state: remote.run > local ? 'available' : 'latest', local: local, remote: remote };
    });
  }

  /* ---------- 弹窗里的文字 ---------- */
  function foundMessage(remote){
    var notes = remote.notes;
    if (notes.length > 600) notes = notes.slice(0, 600) + '…';
    var text = '新版本 ' + label(remote) + ' 已经发布了。';
    if (remote.size) text += '安装包约 ' + fmtMB(remote.size) + '。';
    if (notes) text += '\n\n这次更新：\n' + notes;
    text += '\n\n点「下载并安装」，下载完会自动打开安装页面，你的聊天、人设和设置都会保留。';
    return text;
  }

  /* ---------- 允许安装应用 ---------- */
  function waitForReturn(){
    return new Promise(function(resolve){
      var left = false, done = false;
      function finish(){
        if (done) return; done = true;
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        setTimeout(resolve, 400);
      }
      function onVis(){ if (document.hidden) left = true; else if (left) finish(); }
      function onBlur(){ left = true; }
      function onFocus(){ if (left) finish(); }
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    });
  }

  function ensureInstallPermission(){
    var p = plugin();
    return p.getAppInfo().then(function(info){
      if (info && info.canInstall) return true;
      return islandConfirm('安卓要先允许「岛屿」安装应用，才能自动安装新版本。\n\n点「去允许」，在打开的页面里把开关打开，再回到岛屿就行。', {
        title: '需要你允许一下', confirmText: '去允许', cancelText: '先不装'
      }).then(function(ok){
        if (!ok) return false;
        var back = waitForReturn();
        return p.openInstallPermissionSettings().then(function(){ return back; }).then(function(){
          return p.getAppInfo();
        }).then(function(again){
          if (again && again.canInstall) return true;
          return islandAlert('还没有打开允许开关，所以暂时装不了。\n想装的时候，再点一次「检查更新」就行。', { title: '还没有允许' }).then(function(){ return false; });
        });
      });
    });
  }

  /* ---------- 下载进度弹窗（岛屿专属样式） ---------- */
  function ensureDlg(){
    if (_dlg) return _dlg;
    var el = document.createElement('div');
    el.className = 'island-dialog island-apk-dialog';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="island-dialog-backdrop"></div>' +
      '<section class="island-dialog-panel island-apk-panel" role="dialog" aria-modal="true">' +
        '<h3 class="island-dialog-title">正在下载新版本</h3>' +
        '<div class="island-apk-bar"><i></i></div>' +
        '<p class="island-dialog-message island-apk-text"></p>' +
        '<div class="island-dialog-actions"><button type="button" class="island-dialog-btn is-cancel">取消下载</button></div>' +
      '</section>';
    document.body.appendChild(el);
    el.querySelector('.is-cancel').addEventListener('click', function(){
      if (_cancelling) return;
      _cancelling = true;
      var p = plugin();
      if (p) p.cancelApkDownload().catch(function(){});
    });
    _dlg = el;
    return el;
  }

  function showDlg(){
    var el = ensureDlg();
    _cancelling = false;
    el.querySelector('.island-dialog-title').textContent = '正在下载新版本';
    el.querySelector('.island-apk-bar i').style.width = '0%';
    el.querySelector('.island-apk-text').textContent = '准备中…';
    el.querySelector('.is-cancel').hidden = false;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    void el.offsetWidth;
    el.classList.add('is-show');
  }

  function updateDlg(done, total){
    if (!_dlg) return;
    var pct = total > 0 ? Math.min(100, Math.floor(done * 100 / total)) : 0;
    _dlg.querySelector('.island-apk-bar i').style.width = pct + '%';
    _dlg.querySelector('.island-apk-text').textContent = total > 0
      ? pct + '%　' + fmtMB(done) + ' / ' + fmtMB(total)
      : '已下载 ' + fmtMB(done);
  }

  function hideDlg(){
    clearTimeout(_timer);
    var el = _dlg;
    if (!el) return;
    el.classList.remove('is-show');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(function(){ if (!el.classList.contains('is-show')) el.classList.remove('is-open'); }, 200);
  }

  /* 下载：成功 resolve(true)；取消或失败 resolve(false)（失败会先弹出原因） */
  function download(remote){
    var p = plugin();
    return p.startApkDownload({ url: remote.url }).then(function(){
      showDlg();
      return new Promise(function(resolve){
        var misses = 0;
        function fail(text){
          hideDlg();
          islandAlert(text, { title: '下载没成功' }).then(function(){ resolve(false); });
        }
        function tick(){
          p.getApkProgress().then(function(s){
            misses = 0;
            updateDlg(Number(s.done) || 0, Number(s.total) || 0);
            if (s.state === 'done') {
              _dlg.querySelector('.island-dialog-title').textContent = '下载好了';
              _dlg.querySelector('.island-apk-text').textContent = '马上打开安装页面…';
              _dlg.querySelector('.is-cancel').hidden = true;
              resolve(true);
            } else if (s.state === 'error') {
              fail((/404/.test(s.error || '') ? '没有找到安装包文件，可能还在上传中' : (s.error || '网络不太稳')) + '\n\n你可以稍后再点一次「检查更新」重新下载。');
            } else if (s.state === 'cancelled') {
              hideDlg(); resolve(false);
            } else {
              _timer = setTimeout(tick, 400);
            }
          }).catch(function(){
            if (++misses > 5) { fail('和下载程序的联系断了，请稍后再试。'); return; }
            _timer = setTimeout(tick, 800);
          });
        }
        tick();
      });
    });
  }

  /* ---------- 调起系统安装 ---------- */
  function install(){
    var p = plugin();
    return p.installApk().then(function(){
      setTimeout(hideDlg, 600);
      var u = ui();
      if (u.setCard) u.setCard('已打开安装页面，点「安装」就能更新。', 'ok');
    }).catch(function(err){
      var text = msgOf(err);
      if (text === 'NEED_PERMISSION') {
        hideDlg();
        return ensureInstallPermission().then(function(ok){ if (ok) return install(); });
      }
      hideDlg();
      return islandAlert(text, { title: '打不开安装页面' });
    });
  }

  function startFlow(remote){
    return ensureInstallPermission().then(function(ok){
      if (!ok) return;
      return download(remote).then(function(done){ if (done) return install(); });
    });
  }

  /* ---------- 对外 ---------- */
  function announce(res){
    var u = ui();
    if (u.setRowStatus) u.setRowStatus('有新版本', true);
    if (u.setCard) u.setCard('发现新版本 ' + label(res.remote) + '，点「检查更新」就能下载安装。', 'hot');
  }

  /* 用户点「检查更新」 */
  function run(){
    if (_busy) return Promise.resolve();
    _busy = true;
    var u = ui();
    if (u.setBusyUi) u.setBusyUi(true, '正在检查更新…');
    if (u.setRowStatus) u.setRowStatus('检查中…', false);
    return check().then(function(res){
      if (u.setBusyUi) u.setBusyUi(false);
      if (res.state === 'latest') {
        if (u.setRowStatus) u.setRowStatus('已是最新', false);
        if (u.setCard) u.setCard('已是最新版本 ' + (u.fmtBuild ? u.fmtBuild() : '') + '。', 'ok');
        return;
      }
      announce(res);
      return islandConfirm(foundMessage(res.remote), { title: '发现新版本', confirmText: '下载并安装', cancelText: '稍后' }).then(function(ok){
        if (ok) return startFlow(res.remote);
      });
    }).catch(function(err){
      if (u.setBusyUi) u.setBusyUi(false);
      if (u.setRowStatus && u.fmtBuild) u.setRowStatus(u.fmtBuild(), false);
      if (u.setCard) u.setCard('检查失败：' + msgOf(err) + '。请检查网络后重试。', 'error');
      return islandAlert('没能检查到新版本：' + msgOf(err) + '\n\n请检查网络后再试一次。', { title: '检查失败' });
    }).then(function(){ _busy = false; });
  }

  /* 启动几秒后静默看一眼，有新版本只在设置里亮「有新版本」，不打断使用 */
  function silentCheck(){
    if (_busy || !plugin()) return;
    var u = ui();
    var last = u.lsGet ? u.lsGet(LAST_KEY) : null;
    if (last && Date.now() - last.at < 30 * 60 * 1000) return;
    check().then(function(res){ if (res.state === 'available') announce(res); }).catch(function(){});
  }

  /* 清掉上次下载留下的安装包 */
  function cleanup(){
    var p = plugin();
    if (p) p.cleanApkCache().catch(function(){});
  }

  return { run: run, silentCheck: silentCheck, cleanup: cleanup };
})();
