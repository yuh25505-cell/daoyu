/* 岛屿 · 音乐 App（主屏幕播放器）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z" fill="currentColor"/></svg>';

var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="5" width="3.4" height="14" rx="1.4" fill="currentColor"/><rect x="13.1" y="5" width="3.4" height="14" rx="1.4" fill="currentColor"/></svg>';

var TRACKS = [
  { title:'Midnight Drive', artist:'Mono Waves' },
  { title:'Paper Planes', artist:'Norrland' },
  { title:'Quiet Machine', artist:'AI Ensemble' },
  { title:'Cold Sunrise', artist:'Kite' }
];

var playing = false, progress = 32, trackIdx = 0, musicTimer = null;

var elToggle = $('musicToggle'), elBar = $('musicBar');

var elTitle = $('musicTitle'), elArtist = $('musicArtist');

function renderPlayIcon(){ if (elToggle) elToggle.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; }

function renderProgress(){ if (elBar) elBar.style.width = progress + '%'; }

function renderTrack(){
  var t = TRACKS[trackIdx];
  if (elTitle) elTitle.textContent = t.title;
  if (elArtist) elArtist.textContent = t.artist;
}

function nextTrack(){ trackIdx = (trackIdx + 1) % TRACKS.length; progress = 0; renderTrack(); renderProgress(); }

function prevTrack(){ trackIdx = (trackIdx - 1 + TRACKS.length) % TRACKS.length; progress = 0; renderTrack(); renderProgress(); }

function startMusicTimer(){
  if (musicTimer) return;
  musicTimer = setInterval(function(){
    progress += 0.6;
    if (progress >= 100) nextTrack();
    renderProgress();
  }, 500);
}

function stopMusicTimer(){ clearInterval(musicTimer); musicTimer = null; }

function bindMusicEvents(){

  if (elToggle) elToggle.addEventListener('click', function(){
    playing = !playing; renderPlayIcon();
    playing ? startMusicTimer() : stopMusicTimer();
  });
  var elNext = $('musicNext'); if (elNext) elNext.addEventListener('click', nextTrack);
  var elPrev = $('musicPrev'); if (elPrev) elPrev.addEventListener('click', prevTrack);
}

/* 桌面 Dock 里的「音乐」图标：尚未开发，保持原提示。 */
registerApp('音乐', function(){ toast('音乐 · 开发中'); });
