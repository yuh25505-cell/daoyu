/* 岛屿 · 启动入口：事件绑定总调度、init、对外接口、Service Worker 注册
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 全屏启动场：流体线场、漂移排版、触摸扰动与柔光微尘。 */
(function bindBootMotion(){
  var boot = document.getElementById('boot');
  if (!boot) return;
  var canvas = document.getElementById('bootCanvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: true, desynchronized: true }) : null;
  var wordEl = document.getElementById('bootKineticWord');
  var progressEl = document.getElementById('bootPercent');
  var loadingText = document.getElementById('bootLoadingText');
  var liveIndex = document.getElementById('bootLiveIndex');
  var prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var width = 0, height = 0, dpr = 1, raf = 0, destroyed = false;
  var startAt = performance.now(), pointer = { x: -1000, y: -1000, active: false, down: false, energy: 0 };
  var particles = [], fragments = Array.prototype.slice.call(boot.querySelectorAll('[data-float]'));
  var words = ['THINK', 'CREATE'];
  var loadingPhrases = ['TUNING INTO YOUR WORLD', 'GATHERING YOUR LITTLE THINGS', 'MAKING ROOM FOR WHAT’S NEXT', 'READY WHEN YOU ARE'];
  var lastWord = -1, lastPhrase = -1, currentWordTimer = 0, lastProgress = -1;
  var fg = '#101010';

  function refreshColor(){
    var style = getComputedStyle(document.documentElement);
    fg = (style.getPropertyValue('--fg') || '#101010').trim();
  }
  function random(min, max){ return min + Math.random() * (max - min); }
  function resize(){
    if (!canvas || !ctx) return;
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    dpr = Math.min(window.devicePixelRatio || 1, width < 600 ? 1.45 : 1.65);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* 减少数量、移除拖尾：粒子变成轻柔的漂浮微尘，不再像细小虫体来回爬动。 */
    var count = Math.round(Math.max(42, Math.min(96, width * height / 12500)));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(makeParticle(random(0,width),random(0,height)));
    paint(performance.now(), false);
  }
  function makeParticle(x,y){
    /* 每个微尘围绕固定锚点走缓慢的平滑曲线，不做随机游走或尖锐折返。 */
    return {
      ox:x, oy:y, x:x, y:y,
      phase:random(0,Math.PI*2), phase2:random(0,Math.PI*2),
      ampX:random(5,25), ampY:random(4,17),
      speed:random(.62,1.08),
      size:random(.65,1.55), alpha:random(.13,.34)
    };
  }
  function wordSet(word){
    if (!wordEl) return;
    wordEl.textContent = '';
    var chars = Array.from(word);
    for (var i=0;i<chars.length;i++){
      var span = document.createElement('span');
      span.textContent = chars[i];
      span.style.setProperty('--char', i);
      wordEl.appendChild(span);
    }
  }
  function updateTypography(now){
    var elapsed = now - startAt;
    if (!prefersReduced && elapsed < 2450){
      /* 中央主词只切换一次，让每个词有足够停留时间；用横向揭幕替代连续上弹。 */
      var wi = elapsed < 1190 ? 0 : 1;
      if (wi !== lastWord){
        lastWord = wi;
        if (wi === 0) {
          wordSet(words[wi]);
        } else if (wordEl) {
          wordEl.classList.add('is-word-leaving');
          currentWordTimer = window.setTimeout(function(){
            currentWordTimer = 0;
            if (destroyed || !wordEl || boot.style.display === 'none') return;
            wordEl.classList.remove('is-word-leaving');
            wordSet(words[wi]);
          }, 340);
        }
      }
      var pi = Math.min(loadingPhrases.length-1, Math.floor(elapsed / 650));
      if (pi !== lastPhrase && loadingText){ lastPhrase = pi; loadingText.textContent = loadingPhrases[pi]; }
      if (liveIndex) liveIndex.textContent = String(Math.min(99, Math.floor(elapsed / 34))).padStart(3,'0');
    }
    var ratio = Math.min(100, Math.max(0, Math.round((1 - Math.pow(1 - Math.min(1, elapsed / 2520), 2.1)) * 100)));
    if (ratio !== lastProgress){ lastProgress = ratio; if(progressEl) progressEl.textContent = String(ratio).padStart(2,'0') + '%'; }
    if (ratio >= 100 && loadingText && !prefersReduced) loadingText.textContent = 'ALL YOUR THINGS, IN PLACE';
  }
  function drawFlowLines(t){
    var lineGap = width < 600 ? 27 : 34;
    var rows = Math.ceil(height / lineGap) + 4;
    var xStep = width < 600 ? 19 : 24;
    ctx.lineCap = 'round';
    for (var r=-2; r<rows; r++){
      ctx.beginPath();
      var baseY = r * lineGap - 8;
      for (var x=-xStep; x<=width+xStep; x+=xStep){
        var phase = r*.39;
        var y = baseY
          + Math.sin(x*.0064 + t*.00042 + phase)*10
          + Math.sin(x*.0021 - t*.00026 + phase*1.7)*17
          + Math.cos(x*.013 + t*.00019 + r*.17)*2.5;
        var dx = x - pointer.x, dy = y - pointer.y;
        var dist2 = dx*dx + dy*dy;
        var reach = width < 600 ? 155 : 205;
        if (pointer.active && dist2 < reach*reach){
          var force = (1 - Math.sqrt(dist2)/reach);
          var swirl = pointer.down ? 1.05 : .52;
          y += (dy/(Math.sqrt(dist2)+2))*force*30 + Math.sin(t*.005+Math.sqrt(dist2)*.025)*force*11;
          x += (-dy/(Math.sqrt(dist2)+2))*force*12*swirl;
        }
        if (x === -xStep) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.globalAlpha = (r % 4 === 0) ? .105 : .038;
      ctx.strokeStyle = fg;
      ctx.lineWidth = (r % 4 === 0) ? .72 : .48;
      ctx.stroke();
    }
    // A sparse crossing set gives the line field a woven, dimensional rhythm without ring motifs.
    var colGap = width < 600 ? 51 : 72;
    var cols = Math.ceil(width / colGap) + 3;
    for (var c=-1; c<cols; c++){
      ctx.beginPath();
      var baseX = c*colGap;
      for (var y2=-12; y2<=height+12; y2+=width < 600 ? 23 : 29){
        var xx = baseX + Math.sin(y2*.005 + t*.00031 + c*.45)*12 + Math.cos(y2*.0025 - t*.0002)*8;
        var yy = y2;
        var dx2 = xx-pointer.x, dy2 = yy-pointer.y, d2=dx2*dx2+dy2*dy2;
        var reach2 = width < 600 ? 135 : 180;
        if(pointer.active && d2 < reach2*reach2){
          var influence=1-Math.sqrt(d2)/reach2;
          xx += (dx2/(Math.sqrt(d2)+1))*influence*18;
          yy += Math.sin(t*.004+Math.sqrt(d2)*.022)*influence*9;
        }
        if(y2===-12) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
      }
      ctx.globalAlpha = (c % 5 === 0) ? .07 : .025;
      ctx.lineWidth = (c % 5 === 0) ? .65 : .4;
      ctx.strokeStyle = fg;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawParticles(t, advance){
    /* 柔光微尘：只绘制低对比度光点，不画运动尾线，也不在点击时喷射短线。 */
    var time = t * .00022;
    for(var i=0;i<particles.length;i++){
      var p=particles[i];
      var phase = time * p.speed + p.phase;
      var phase2 = time * .73 * p.speed + p.phase2;
      var x = p.ox + Math.sin(phase) * p.ampX + Math.sin(phase2*.61) * p.ampX*.22;
      var y = p.oy + Math.cos(phase2) * p.ampY + Math.cos(phase*.57) * p.ampY*.2;
      var dx=x-pointer.x, dy=y-pointer.y, dist=Math.sqrt(dx*dx+dy*dy);
      var influence=0;
      var radius=width<600?138:178;
      if(pointer.active && dist<radius){
        var raw=1-dist/radius;
        influence=raw*raw*(3-2*raw);
        /* 指针附近轻轻让开，并随视线离开平顺复位。 */
        var push=influence*(pointer.down?13:8);
        x += dx/(dist+1)*push;
        y += dy/(dist+1)*push;
      }
      var shimmer=.82 + .18*Math.sin(t*.00048 + p.phase*1.7);
      var alpha=p.alpha*shimmer;
      var r=p.size*(1+influence*.18);

      /* 极淡的外缘与清晰的小核心，整体像浮尘/柔光，而非线状生物轨迹。 */
      ctx.beginPath();
      ctx.arc(x,y,r*3.3,0,Math.PI*2);
      ctx.globalAlpha=alpha*.085;
      ctx.fillStyle=fg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.globalAlpha=alpha*.62;
      ctx.fillStyle=fg;
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  function moveFragments(t){
    for(var i=0;i<fragments.length;i++){
      var el=fragments[i], seed=Number(el.getAttribute('data-float'))||0;
      var x=Math.sin(t*.00056+seed*1.7)*(width<600?5:10);
      var y=Math.cos(t*.00044+seed*1.12)*(width<600?4:8);
      var a=pointer.x-(el.offsetLeft+el.offsetWidth*.5), b=pointer.y-(el.offsetTop+el.offsetHeight*.5);
      var dist=Math.sqrt(a*a+b*b);
      if(pointer.active && dist<230){var repel=(1-dist/230)*(pointer.down?17:10);x-=a/(dist+1)*repel;y-=b/(dist+1)*repel;}
      el.style.setProperty('--fx',x.toFixed(1)+'px');
      el.style.setProperty('--fy',y.toFixed(1)+'px');
    }
    var cx=pointer.active && width ? (pointer.x/width-.5) : 0;
    var cy=pointer.active && height ? (pointer.y/height-.5) : 0;
    boot.style.setProperty('--boot-core-x',(cx*-11).toFixed(1)+'px');
    boot.style.setProperty('--boot-core-y',(cy*-8).toFixed(1)+'px');
  }
  function paint(now, advance){
    if(!ctx || !width || !height) return;
    ctx.clearRect(0,0,width,height);
    drawFlowLines(now);
    drawParticles(now, advance);
    if(advance) moveFragments(now);
  }
  function frame(now){
    if(destroyed || document.hidden || boot.style.display==='none') return;
    updateTypography(now);
    paint(now,true);
    raf=window.requestAnimationFrame(frame);
  }
  function setPointer(event){
    var rect=boot.getBoundingClientRect();
    pointer.x=event.clientX-rect.left; pointer.y=event.clientY-rect.top;
    pointer.active=true; pointer.energy=1;
    if(!prefersReduced && !raf) raf=window.requestAnimationFrame(frame);
  }
  boot.addEventListener('pointermove',function(event){setPointer(event);},{passive:true});
  boot.addEventListener('pointerdown',function(event){
    setPointer(event); pointer.down=true;
    /* 点按只扰动全屏流线与近处微尘，不再发散短线粒子。 */
    if(prefersReduced) paint(performance.now(),false);
  },{passive:true});
  boot.addEventListener('pointerup',function(){pointer.down=false;},{passive:true});
  boot.addEventListener('pointercancel',function(){pointer.down=false;},{passive:true});
  boot.addEventListener('pointerleave',function(){pointer.active=false;pointer.down=false;},{passive:true});
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){if(raf) window.cancelAnimationFrame(raf);raf=0;}
    else if(!destroyed && !prefersReduced){raf=window.requestAnimationFrame(frame);}
  });
  boot.addEventListener('animationend',function(event){
    if(event.animationName==='bootLeave'){
      destroyed=true;
      if(raf) window.cancelAnimationFrame(raf);
      raf=0;
      if(canvas){canvas.width=1;canvas.height=1;}
    }
  });
  refreshColor();
  if(wordEl) wordSet(prefersReduced?'CREATE':'THINK');
  resize();
  if(!prefersReduced) raf=window.requestAnimationFrame(frame);
  else {
    updateTypography(performance.now());
    if(progressEl) progressEl.textContent='100%';
    if(loadingText) loadingText.textContent='ALL YOUR THINGS, IN PLACE';
    paint(performance.now(),false);
  }
  /* CSS owns the exit choreography; this timeout only prevents an unusual stuck overlay. */
  setTimeout(function(){var node=document.getElementById('boot');if(node&&node.style.display!=='none')node.style.display='none';destroyed=true;if(raf)window.cancelAnimationFrame(raf);},3500);
})();

function bindSafetyEvents(){

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') flushSafetyState();
  });
  window.addEventListener('pagehide', function(){ flushSafetyState(); });
  window.addEventListener('unhandledrejection', function(e){
    var reason = e && e.reason;
    if (reason && reason.code === 'ISLAND_STORAGE_ERROR') notifyStorageError(reason);
  });
}


var _storageErrorToastAt = 0;

function notifyStorageError(err){
  var now = Date.now();
  if (now - _storageErrorToastAt < 5000) return;
  _storageErrorToastAt = now;
  console.error('[岛屿] 本机数据保存失败：', err);
  try { toast('本机数据保存失败，请检查存储空间后再关闭应用'); } catch(e) {}
}


function flushSafetyState(){
  if (!islandStateHydrated) return Promise.resolve(false);
  var jobs = [saveSettings(), saveChats(), saveContacts(), saveMoments(), savePhoneCalls(), savePersonas(), saveUserPersonas(), saveWorldbooks(), saveStickers()];
  if (currentName && Array.isArray(MESSAGES[currentName])) jobs.push(saveMessages(currentName));
  return Promise.all(jobs).then(function(){ return IslandDB.flush(); }).catch(function(err){ notifyStorageError(err); return false; });
}


/* 存档读完后的数据保护：① 申请持久化存储；② 若本次启动是从安全快照自动恢复的，提示一下；
 * ③ 每 24 小时在空闲时拍一次整库安全快照（更新前还会另拍一张）。 */
function protectStorageAfterLoad(){
  try { IslandDB.requestPersistent(); } catch(e) {}
  try {
    var n = IslandDB.recoveredCount();
    if (n > 0) setTimeout(function(){ toast('检测到本地数据异常为空，已从安全快照恢复 ' + n + ' 项'); }, 4200);
  } catch(e) {}
  setTimeout(function(){
    try {
      var last = Number(localStorage.getItem('island.snapshot.dailyAt') || 0);
      if (Date.now() - last < 24 * 3600 * 1000) return;
      IslandDB.snapshot('daily').then(function(ok){ if (ok) { try { localStorage.setItem('island.snapshot.dailyAt', String(Date.now())); } catch(e) {} } });
    } catch(e) {}
  }, 15000);
}

function init(){
  renderPlayIcon();
  applyChatAppearance();
  applyThemePreference();
  applyHomeAppearance();
  applyFontPreference();
  bindEvents();
  /* 更新日志同步不急：等启动动画结束再拉取并重绘，免得和动画抢主线程 */
  setTimeout(function(){ refreshChangelog(false); }, 3400);
  /* 启动层动画期间尽量别让主线程连续跑太久：每一段重活之间让出一帧，动画不再被"一口气"卡住。 */
  loadState().then(function(){
    protectStorageAfterLoad();
    HOME_ICONS_READY = true;
    applyChatAppearance();
    applyThemePreference();
    applyHomeAppearance();
    applyFontPreference();
    return yieldToPaint();
  }).then(function(){
    /* 主屏幕要用的内容已经画好；其余 App 的列表、API 状态等要等启动层淡出结束后再处理（它们此刻看不见） */
    return new Promise(function(resolve){ runOutsideBootFade(resolve); });
  }).then(function(){
    renderAll();
    return yieldToPaint();
  }).then(function(){
    refreshApiState();
    refreshSecondaryApiState();
    refreshVectorMemoryApiState();
    refreshSttState();
    renderNotificationSettings();
    return yieldToPaint();
  }).then(function(){
    startProactiveScheduler();
    handleNotificationDeepLink();
  }).catch(function(err){
    console.error('[岛屿] 数据加载失败：', err);
    State.settings = clone(DEFAULT_SETTINGS);
    HOME_ICONS_READY = true;
    normalizeApiPresetState();
    normalizeSecondaryApiPresetState();
    normalizeSttState();
    normalizeHomeAppearance();
    applyChatAppearance();
    applyThemePreference();
    applyHomeAppearance();
    applyFontPreference();
    renderAll();
    refreshApiState();
    refreshSecondaryApiState();
    refreshVectorMemoryApiState();
    refreshSttState();
  });
}


init();


window.IslandBackground = {
  tick: function(force){ return runProactiveMessage(!!force); },
  start: function(){ startProactiveScheduler(); return true; },
  status: function(){ return { hidden:document.hidden, notificationPermission:notificationPermission(), config:clone(getNotificationConfig()), apiReady:isApiReady(), chats:CHATS.length }; }
};


window.Island = {
  reset: function(){
    islandConfirm('确定要清除 岛屿 的所有本地数据吗？此操作不可撤销。', {title:'清除所有数据', confirmText:'清除', danger:true}).then(function(ok){
      if (!ok) return;
      IslandDB.clear().then(function(){ location.reload(); });
    });
  },
  export: function(){
    return buildBackupPayload().data;
  },
  backup: function(){
    return buildBackupPayload();
  },
  chat: function(name, text){
    if (!isApiReady()) return Promise.reject(new Error('API 未配置'));
    return prepareMemoryForContext(name).then(function(){
      var msgs = buildMessages(name);
      msgs.push({ role: 'user', content: text });
      return callApiOnce(msgs);
    });
  },
  endpoint: function(url){ return normalizeBaseUrl(url || (getApiConfig().baseUrl)); },
  modelsEndpoint: function(url){ return normalizeModelsUrl(url || (getApiConfig().baseUrl)); },
  sttEndpoint: function(url){ return normalizeTranscriptionsUrl(url || (getSttConfig().baseUrl)); },
  notifications: { test: function(){ return requestNotificationPermission().then(function(ok){ return ok ? showCharacterNotification('岛屿','这是一条通知测试消息。') : false; }); }, runNow: function(){ return runProactiveMessage(true); }, config: function(){ return clone(getNotificationConfig()); } }
};

/* 事件绑定总调度：保持与拆分前 bindEvents 完全相同的绑定顺序。 */
function bindEvents(){
  bindHomeThemeEvents();
  bindSettingsAppearanceEvents();
  bindHomeVisibilityEvents();
  bindMusicEvents();
  bindHomeGridEvents();
  bindCalendarWidgetEvents();
  bindPolaroidEvents();
  bindHomePage2Events();
  bindHomeAppClickEvents();
  bindPhoneEvents();
  bindWorldbookEvents();
  bindChatEvents();
  bindSettingsApiEvents();
  bindChatPersonaEvents();
  bindSafetyEvents();
  IslandUpdate.bind();
}

// PWA service worker
if ('serviceWorker' in navigator) {
window.addEventListener('load', function () {
  /* 注册并预缓存 60 多个文件很吃网络和 CPU：等启动动画播完再做 */
  setTimeout(function () {
    navigator.serviceWorker.register('./sw.js').catch(function (err) {
      console.warn('[Island PWA] Service worker registration failed:', err);
    });
  }, 3800);
});
}
