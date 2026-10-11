/* 岛屿 · 左边缘右滑返回 + 系统返回键 / 返回手势
 *
 * 做了两件事：
 * 1. 手指从屏幕左边缘向右滑，当前页面跟手滑出，松手后执行该页面“返回”按钮原本的逻辑。
 * 2. 浏览器 / 安卓系统的返回键、返回手势，也依次关闭最上层页面，而不是直接退出岛屿。
 *
 * 不改动任何已有页面的代码：每一层页面的“返回”仍然调用它自己原有的关闭函数。
 * 经典脚本，需放在 js-main.js 之后加载。 */
'use strict';

(function(){
  var EDGE_PX = 28;          /* 从左边缘多少像素内开始算“边缘滑动” */
  var START_MOVE = 10;       /* 横向移动超过多少像素才认定为拖动 */
  var COMMIT_RATIO = 0.35;   /* 拖过屏幕宽度的多少比例就返回 */
  var COMMIT_VELOCITY = 0.6; /* 或者速度（px/ms）够快也返回 */

  function $q(sel){ return document.querySelector(sel); }
  function isOpen(sel){ var el = $q(sel); return !!(el && el.classList.contains('is-open')); }
  function call(name){ if (typeof window[name] === 'function') { window[name](); return true; } return false; }
  function click(sel){ var el = $q(sel); if (el) { el.click(); return true; } return false; }

  /* ---------- 弹窗 / 面板：手势不穿透，系统返回键先关它们 ---------- */
  var MODALS = [
    { sel:'#pmMediaViewModal',      close:function(){ return click('#pmMediaViewModal [data-media-view-close]'); } },
    { sel:'#pmFileViewModal',       close:function(){ return click('#pmFileViewModal [data-file-view-close]'); } },
    { sel:'#pmImageTextModal',      close:function(){ return click('#pmImageTextModal [data-image-text-close]'); } },
    { sel:'#pmLocationCustomModal', close:function(){ return click('#pmLocationCustomModal [data-location-custom-close]'); } },
    { sel:'#pmLocationModal',       close:function(){ return click('#pmLocationModal [data-location-close]'); } },
    { sel:'#pmTransferModal',       close:function(){ return click('#pmTransferModal [data-transfer-close]'); } },
    { sel:'#voiceTextModal',        close:function(){ return click('#voiceTextModal [data-voice-text-close]'); } },
    { sel:'#charLanguageModal',     close:function(){ return click('#charLanguageModal [data-char-language-close]'); } },
    { sel:'#pmMemoryClearModal',    close:function(){ return click('#pmMemoryClearModal [class*="backdrop"]'); } },
    { sel:'#pmForwardSheet',        close:function(){ return call('closeForwardPicker'); } },
    { sel:'#modelSheet',            close:function(){ return call('closeModelSheet'); } },
    { sel:'#worldbookEntryEditorSheet', close:function(){ return call('closeWorldbookEntryEditor'); } },
    { sel:'#worldbookEditorSheet',  close:function(){ return call('closeWorldbookEditor'); } },
    { sel:'#userSheet',             close:function(){ return call('closeUserSheet'); } },
    { sel:'.sheet.is-open',         close:function(){ return call('closeSheet'); }, raw:true },
    { sel:'.island-dialog.is-open', close:function(){ return true; }, raw:true }   /* 确认框：只拦截，不替用户选择 */
  ];

  function getModal(){
    for (var i = 0; i < MODALS.length; i++) {
      var m = MODALS[i];
      var el = $q(m.sel);
      if (!el) continue;
      if (m.raw || el.classList.contains('is-open')) return m;
    }
    return null;
  }

  /* ---------- 页面层：从最上层往下找 ---------- */
  var MEMORY_VIEWS = [
    ['#pmMemoryView', '#pmMemoryBack'],
    ['#pmFuzzyMemoryView', '#pmFuzzyMemoryBack'],
    ['#pmFishMemoryView', '#pmFishMemoryBack'],
    ['#pmVectorMemoryView', '#pmVectorMemoryBack'],
    ['#pmImportantMemoryView', '#pmImportantMemoryBack']
  ];

  function memoryLayer(pair){
    return { el:$q(pair[0]), back:function(){ click(pair[1]); } };
  }

  /* 返回 { el: 要被拖动的元素, back: 执行返回, block: true 表示这一层不允许手势返回 } */
  function getTopLayer(){
    var i;

    /* 语音通话：返回按钮 = 挂断，手势 / 返回键都不应误触 */
    if (isOpen('#pmVoiceCallView')) return { el:$q('#pmVoiceCallView'), block:true };

    if (isOpen('#chatApp')) {
      if (isOpen('#pmForwardRecordView')) return { el:$q('#pmForwardRecordView'), back:function(){ call('closeForwardRecordView'); } };
      if (isOpen('#pmLocationMapView'))   return { el:$q('#pmLocationMapView'),   back:function(){ call('closeLocationMapView'); } };
      for (i = 0; i < MEMORY_VIEWS.length; i++) {
        if (isOpen(MEMORY_VIEWS[i][0])) return memoryLayer(MEMORY_VIEWS[i]);
      }
      if (isOpen('#pmMemoryHomeView')) return { el:$q('#pmMemoryHomeView'), back:function(){ click('#pmMemoryHomeBack'); } };
      if (isOpen('#chatAppearanceView')) return { el:$q('#chatAppearanceView'), back:function(){ click('.js-chat-appearance-back'); } };
      if (isOpen('#upView')) return { el:$q('#upView'), back:function(){ click('#upBack'); } };
      if (isOpen('#pmView')) return { el:$q('#pmView'), back:function(){ click('#pmBack'); } };  /* 多选模式下 pmBack 先退出多选 */
      return { el:$q('#chatApp'), back:function(){ call('closeChatApp'); } };
    }

    if (isOpen('#phoneApp')) {
      var panel = $q('#phoneApp [data-phone-panel].is-active');
      var name = panel ? panel.getAttribute('data-phone-panel') : 'recent';
      if (name === 'call-detail')    return { el:panel, back:function(){ call('closePhoneDetail'); } };
      if (name === 'contact-detail') return { el:panel, back:function(){ call('closePhoneContactDetail'); } };
      return { el:$q('#phoneApp'), back:function(){ call('closePhoneApp'); } };
    }

    if (isOpen('#worldbookApp')) {
      var detail = $q('#worldbookDetailView');
      if (detail && !detail.hidden) return { el:detail, back:function(){ click('.js-worldbook-back'); } };
      return { el:$q('#worldbookApp'), back:function(){ call('closeWorldbookApp'); } };
    }

    if (isOpen('#settingsApp')) {
      var sp = $q('#settingsApp .settings-panel.is-active');
      if (sp && sp.getAttribute('data-panel') !== 'main') {
        return { el:sp, back:function(){ call('closeModelSheet'); if (typeof window.switchSettingsPanel === 'function') window.switchSettingsPanel('main'); } };
      }
      return { el:$q('#settingsApp'), back:function(){ call('closeSettingsApp'); } };
    }

    return null;
  }

  /* 加号 / 表情包面板：只在系统返回键时先收起 */
  function panelOpen(){ return isOpen('#pmPanel') || !!$q('.pm-panel.is-open'); }

  /* ====================================================================
   * 一、边缘滑动手势
   * ==================================================================== */
  var drag = null;  /* { x0, y0, t0, layer, el, active, w } */

  function resetEl(el, restoreTransition){
    if (!el) return;
    el.style.translate = '';
    el.style.boxShadow = '';
    el.style.willChange = '';
    if (restoreTransition) requestAnimationFrame(function(){ el.style.transition = ''; });
    else el.style.transition = '';
  }

  document.addEventListener('touchstart', function(e){
    drag = null;
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    if (t.clientX > EDGE_PX) return;
    if (getModal()) return;
    var layer = getTopLayer();
    if (!layer || layer.block || !layer.el) return;
    drag = { x0:t.clientX, y0:t.clientY, t0:Date.now(), layer:layer, el:layer.el, active:false, w:Math.max(window.innerWidth, 1), dx:0 };
  }, { passive:true });

  document.addEventListener('touchmove', function(e){
    if (!drag || e.touches.length !== 1) { if (drag && e.touches.length > 1) cancelDrag(); return; }
    var t = e.touches[0];
    var dx = t.clientX - drag.x0, dy = t.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > START_MOVE && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   /* 竖向滚动，放行 */
      if (dx > START_MOVE && dx > Math.abs(dy) * 1.2) {
        drag.active = true;
        drag.el.style.transition = 'none';
        drag.el.style.willChange = 'translate';
        drag.el.style.boxShadow = '-10px 0 28px rgba(0,0,0,.18)';
        try { if (typeof releaseInputFocus === 'function') releaseInputFocus(); } catch(_) {}
      } else return;
    }
    if (e.cancelable) e.preventDefault();
    drag.dx = Math.max(0, dx);
    drag.el.style.translate = drag.dx + 'px 0';
  }, { passive:false });

  function cancelDrag(){
    if (!drag) return;
    if (drag.active) {
      var el = drag.el;
      el.style.transition = 'translate .2s ease-out';
      el.style.translate = '0px 0';
      setTimeout(function(){ resetEl(el); }, 230);
    }
    drag = null;
  }

  document.addEventListener('touchend', function(){
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.active) return;
    var dt = Math.max(Date.now() - d.t0, 1);
    var commit = d.dx > d.w * COMMIT_RATIO || (d.dx / dt > COMMIT_VELOCITY && d.dx > 40);
    var el = d.el;
    if (!commit) {
      el.style.transition = 'translate .2s ease-out';
      el.style.translate = '0px 0';
      setTimeout(function(){ resetEl(el); }, 230);
      return;
    }
    el.style.transition = 'translate .18s ease-out';
    el.style.translate = d.w + 'px 0';
    setTimeout(function(){
      el.style.transition = 'none';   /* 让关闭瞬间生效，避免淡出动画在原位闪一下 */
      try { d.layer.back(); } catch(err) { console.error('[岛屿] 滑动返回失败：', err); }
      resetEl(el, true);
      syncHistory();
    }, 190);
  }, { passive:true });

  document.addEventListener('touchcancel', cancelDrag, { passive:true });

  /* ====================================================================
   * 二、系统返回键 / 返回手势（浏览器历史记录哨兵）
   * 有页面打开时压入一条历史记录；系统返回触发 popstate 时关闭最上层页面，
   * 页面全部关闭后把多余的记录退掉，回到桌面时再按返回才会真正退出。
   * ==================================================================== */
  var guard = false, ignorePop = false, syncQueued = false;
  var nativeMode = false;   /* APK 内：由原生 MainActivity 接管返回键，不再用历史记录哨兵 */

  function anythingOpen(){ return !!(getTopLayer() || getModal() || panelOpen()); }

  function syncHistory(){
    if (nativeMode) return;
    var open = anythingOpen();
    try {
      if (open && !guard) { history.pushState({ island:1 }, ''); guard = true; }
      else if (!open && guard) { guard = false; ignorePop = true; history.back(); }
    } catch(_) {}
  }

  function queueSync(){
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(function(){ syncQueued = false; syncHistory(); });
  }

  function systemBack(){
    var modal = getModal();
    if (modal) { modal.close(); return; }
    if (panelOpen() && typeof window.closePanel === 'function') { window.closePanel(); return; }
    var layer = getTopLayer();
    if (layer && !layer.block && layer.back) layer.back();
  }

  window.addEventListener('popstate', function(){
    if (ignorePop) { ignorePop = false; return; }
    if (!guard) return;           /* 不是我们压入的记录，不管 */
    guard = false;                /* 哨兵已被系统返回消耗掉 */
    try { systemBack(); } catch(err) { console.error('[岛屿] 系统返回处理失败：', err); }
    syncHistory();                /* 还有页面开着就重新压入哨兵 */
  });

  /* APK（Capacitor）：返回键由原生 MainActivity 拦截，再调用下面的 IslandSwipeBack.handleBack()。
   * 返回 true = 前端已处理（关了弹窗 / 退了一层 / 语音通话中被拦下）；
   * 返回 false = 已在桌面，原生侧自己把应用退到后台。
   * 安卓 WebView 不认“没有用户操作时压入的历史记录”，所以 APK 里不再使用历史记录哨兵。 */
  function detectNative(){
    var C = window.Capacitor;
    try { nativeMode = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()); } catch(_) { nativeMode = false; }
  }

  function handleBack(){
    try {
      if (!anythingOpen()) return false;
      systemBack();
      return true;
    } catch(err) { console.error('[岛屿] 返回键处理失败：', err); return false; }
  }

  function start(){
    detectNative();
    if (!window.MutationObserver) return;
    new MutationObserver(queueSync).observe(document.body, { attributes:true, subtree:true, attributeFilter:['class', 'hidden'] });
    queueSync();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  /* 供其他脚本或调试使用 */
  window.IslandSwipeBack = { back:systemBack, handleBack:handleBack };
})();
