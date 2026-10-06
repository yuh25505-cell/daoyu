/* 岛屿 · 拍立得：桌面「拍立得」小组件（2×2，照片可导入本地图片）
 * 样式见 css-apps-polaroid.css；所有 js 文件以经典脚本方式共享全局作用域。 */
'use strict';

var POLAROID_PHOTO_SIZE = 640;   /* 导入的照片裁成正方形后的边长（px），控制存储体积 */


/* 照片 + 设置页「拍立得」卡片里的状态。 */
function renderPolaroidPhoto(){
  var a = normalizeHomeAppearance();
  var data = a.polaroidPhoto || '';
  var img = $('polaroidImg'), empty = $('polaroidEmpty');
  if (img) {
    if (data) { if (img.getAttribute('src') !== data) img.src = data; }
    else img.removeAttribute('src');
    img.hidden = !data;
  }
  if (empty) empty.hidden = !!data;
  var cap = $('polaroidCaption');
  if (cap && document.activeElement !== cap && cap.value !== a.polaroidCaption) cap.value = a.polaroidCaption;
  var state = $('polaroidPhotoState'); if (state) state.textContent = data ? '已使用本地图片' : '未选择照片';
  var pick = $('polaroidPhotoPick'); if (pick) pick.textContent = data ? '更换照片' : '选择照片';
  var clear = $('polaroidPhotoClear'); if (clear) clear.hidden = !data;
}


function handlePolaroidPhotoFile(file){
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  if (file.size > IMAGE_IMPORT_MAX_BYTES) { toast('图片不能超过 20MB'); return; }
  squarePhotoFromFile(file, POLAROID_PHOTO_SIZE).then(function(data){
    var a = normalizeHomeAppearance();
    a.polaroidPhoto = data;
    applyHomeAppearance();
    saveSettings();
    toast('已更换拍立得照片');
  }).catch(function(){ toast('读取图片失败'); });
}


function clearPolaroidPhoto(){
  var a = normalizeHomeAppearance();
  if (!a.polaroidPhoto) return;
  a.polaroidPhoto = '';
  applyHomeAppearance();
  saveSettings();
  toast('已移除拍立得照片');
}


function bindPolaroidEvents(){
  var input = $('polaroidInput');
  var openPicker = function(){ if (input) input.click(); };
  var btn = $('polaroidBtn'); if (btn) btn.addEventListener('click', openPicker);
  var pick = $('polaroidPhotoPick'); if (pick) pick.addEventListener('click', openPicker);
  var clear = $('polaroidPhotoClear'); if (clear) clear.addEventListener('click', clearPolaroidPhoto);
  if (input) input.addEventListener('change', function(){
    handlePolaroidPhotoFile(input.files && input.files[0]);
    input.value = '';
  });
  var cap = $('polaroidCaption');
  if (cap) {
    /* 直接在相纸上编辑文案：输入时即时写入设置（延迟保存），回车 / 失焦后确认；清空则显示为空白。 */
    cap.addEventListener('input', function(){
      var a = normalizeHomeAppearance();
      a.polaroidCaption = cap.value.slice(0, 24);
      scheduleSettingsSave(300);
    });
    cap.addEventListener('change', function(){ saveSettings(); });
    cap.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); cap.blur(); } });
    cap.addEventListener('blur', function(){ saveSettings(); });
  }
  renderPolaroidPhoto();
}
