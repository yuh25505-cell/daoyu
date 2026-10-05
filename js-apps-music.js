/* 岛屿 · 音乐 App（主屏幕 2×2 黑胶唱片播放器小组件）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z" fill="currentColor"/></svg>';

var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="5" width="3.4" height="14" rx="1.4" fill="currentColor"/><rect x="13.1" y="5" width="3.4" height="14" rx="1.4" fill="currentColor"/></svg>';

var playing = false;

var elToggle = $('musicToggle'), elWidget = $('musicWidget');

function renderPlayIcon(){ if (elToggle) elToggle.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; }

/* 播放 = 唱片转动 + 唱臂落下；暂停 = 唱片停转（保持当前角度）+ 唱臂抬起。 */
function renderPlaying(){
  if (elWidget) elWidget.setAttribute('data-playing', playing ? 'on' : 'off');
  renderPlayIcon();
}

/* 目前没有真实音源：上一首 / 下一首只让唱片重新「放」一遍，保持转动状态不变。 */
function restartVinyl(){
  var disc = $('vinylDisc'); if (!disc) return;
  disc.style.animation = 'none'; void disc.offsetWidth; disc.style.animation = '';
}

var MUSIC_COVER_SIZE = 512;   /* 导入的封面裁成正方形后的边长（px），控制存储体积 */

/* 封面图 + 设置页「音乐」卡片里的状态。 */
function renderMusicCover(){
  var a = normalizeHomeAppearance();
  var data = a.musicCover || '';
  var img = $('musicCoverImg'), empty = $('musicCoverEmpty');
  if (img) {
    if (data) { if (img.getAttribute('src') !== data) img.src = data; }
    else img.removeAttribute('src');
    img.hidden = !data;
  }
  if (empty) empty.hidden = !!data;
  var state = $('musicCoverState'); if (state) state.textContent = data ? '已使用本地图片' : '未选择封面';
  var pick = $('musicCoverPick'); if (pick) pick.textContent = data ? '更换封面' : '选择封面';
  var clear = $('musicCoverClear'); if (clear) clear.hidden = !data;
}


function handleMusicCoverFile(file){
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > IMAGE_IMPORT_MAX_BYTES) { toast('图片不能超过 20MB'); return; }
  squarePhotoFromFile(file, MUSIC_COVER_SIZE).then(function(data){
    var a = normalizeHomeAppearance();
    a.musicCover = data;
    applyHomeAppearance();
    saveSettings();
    toast('已更换音乐封面');
  }).catch(function(){ toast('读取图片失败'); });
}


function clearMusicCover(){
  var a = normalizeHomeAppearance();
  if (!a.musicCover) return;
  a.musicCover = '';
  applyHomeAppearance();
  saveSettings();
  toast('已移除音乐封面');
}


function bindMusicEvents(){
  var coverInput = $('musicCoverInput');
  var openCoverPicker = function(){ if (coverInput) coverInput.click(); };
  var coverBtn = $('musicCoverBtn'); if (coverBtn) coverBtn.addEventListener('click', openCoverPicker);
  var coverPick = $('musicCoverPick'); if (coverPick) coverPick.addEventListener('click', openCoverPicker);
  var coverClear = $('musicCoverClear'); if (coverClear) coverClear.addEventListener('click', clearMusicCover);
  if (coverInput) coverInput.addEventListener('change', function(){
    handleMusicCoverFile(coverInput.files && coverInput.files[0]);
    coverInput.value = '';
  });

  if (elToggle) elToggle.addEventListener('click', function(){ playing = !playing; renderPlaying(); });
  var elNext = $('musicNext'); if (elNext) elNext.addEventListener('click', restartVinyl);
  var elPrev = $('musicPrev'); if (elPrev) elPrev.addEventListener('click', restartVinyl);
  var elLike = $('musicLike'); if (elLike) elLike.addEventListener('click', function(){
    var on = !elLike.classList.contains('is-on');
    elLike.classList.toggle('is-on', on); elLike.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  var elList = $('musicList'); if (elList) elList.addEventListener('click', function(){ toast('播放列表 · 开发中'); });
  renderPlaying();
}

/* 桌面 Dock 里的「音乐」图标：尚未开发，保持原提示。 */
registerApp('音乐', function(){ toast('音乐 · 开发中'); });
