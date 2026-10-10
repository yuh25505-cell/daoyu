/* 岛屿 · 聊天 · 角色 / 用户人设编辑面板
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var sheet = $('sheet'), sheetMask = $('sheetMask');

var nameInput = $('newName'), descInput = $('newDesc'), createBtn = $('createPersona');

var avatarUploadBtn = $('avatarUploadBtn'), avatarPreview = $('avatarPreview');

var avatarClearBtn = $('avatarClearBtn'), avatarInput = $('avatarInput');

var importFileBtn = $('importFileBtn'), personaFileInput = $('personaFileInput');

var personaGenderOptions = $('personaGenderOptions');


var MAX_AVATAR = 4 * 1024 * 1024, MAX_PERSONA = 512 * 1024, AVATAR_MAX_EDGE = 256;

var avatarData = null;

var personaGender = 'unspecified';

var personaSheetMode = 'create';

var editingPersonaName = null;


function renderAvatarPreview(){
  if (!avatarUploadBtn) return;
  if (avatarData) {
    avatarPreview.src = avatarData;
    avatarPreview.hidden = false;
    avatarUploadBtn.classList.add('has-img');
    avatarClearBtn.hidden = false;
  } else {
    avatarPreview.removeAttribute('src');
    avatarPreview.hidden = true;
    avatarUploadBtn.classList.remove('has-img');
    avatarClearBtn.hidden = true;
  }
}

function compressImage(file){
  return new Promise(function(resolve){
    var reader = new FileReader();
    reader.onload = function(e){
      var raw = e.target.result;
      var img = new Image();
      img.onload = function(){
        try {
          var w = img.width, h = img.height;
          var scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(w, h));
          var nw = Math.max(1, Math.round(w * scale));
          var nh = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = nw; canvas.height = nh;
          canvas.getContext('2d').drawImage(img, 0, 0, nw, nh);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch(err){ resolve(raw); }
      };
      img.onerror = function(){ resolve(raw); };
      img.src = raw;
    };
    reader.onerror = function(){ resolve(null); };
    reader.readAsDataURL(file);
  });
}

function renderPersonaGenderOptions(){
  if (!personaGenderOptions) return;
  $$('.gender-option', personaGenderOptions).forEach(function(btn){
    var selected = (btn.dataset.personaGender || 'unspecified') === personaGender;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function setPersonaGender(value){
  var allowed = ['unspecified','male','female','nonbinary'];
  personaGender = allowed.indexOf(value) >= 0 ? value : 'unspecified';
  renderPersonaGenderOptions();
}

function openSheet(){
  if (!sheet) return;
  personaSheetMode = 'create';
  editingPersonaName = null;
  sheet.querySelector('h2').textContent = '添加人设';
  createBtn.textContent = '创建人设';
  sheet.classList.add('is-open');
  sheetMask.classList.add('is-open');
  avatarData = null;
  personaGender = 'unspecified';
  renderAvatarPreview();
  renderPersonaGenderOptions();
  nameInput.disabled = false;
  nameInput.value = ''; descInput.value = '';
  createBtn.disabled = true;
  releaseInputFocus();
}

function openPersonaSheetForEdit(name){
  var found = findPersona(name);
  if (!found) { toast('当前角色人设不存在'); return; }
  personaSheetMode = 'edit';
  editingPersonaName = found.name;
  sheet.querySelector('h2').textContent = '角色卡';
  createBtn.textContent = '保存角色卡';
  sheet.classList.add('is-open');
  sheetMask.classList.add('is-open');
  avatarData = found.avatar || null;
  personaGender = found.gender || 'unspecified';
  renderAvatarPreview();
  renderPersonaGenderOptions();
  nameInput.disabled = true;
  nameInput.value = found.name || '';
  descInput.value = found.desc || '';
  createBtn.disabled = false;
  releaseInputFocus();
}

function closeSheet(){
  if (!sheet) return;
  sheet.classList.remove('is-open');
  sheetMask.classList.remove('is-open');
  personaSheetMode = 'create';
  editingPersonaName = null;
  nameInput.disabled = false;
}

function createPersona(){
  if (personaSheetMode === 'edit') {
    savePersonaEdit();
    return;
  }
  var name = nameInput.value.trim();
  if (!name) return;
  CHATS.unshift({ name: name, preview: '你们还没有聊过天。', time: '刚刚', unread: 0, avatar: avatarData });
  saveChats();
  var letter = getContactInitial(name);
  CONTACTS.push({ name: name, letter: letter, avatar: avatarData });
  CONTACTS.sort(function(a, b){ return compareContactNames(a && a.name, b && b.name); });
  saveContacts();
  MESSAGES[name] = [];
  saveMessages(name);
  State.personas.push({ name: name, desc: descInput.value.trim(), avatar: avatarData, gender: personaGender, language:'zh-CN', splitPromptEnabled:true, disableSplitPromptForNonChinese:false, autoExpandTranslation:false, createdAt: Date.now() });
  savePersonas();
  renderChats(); renderContacts();
  closeSheet();
  toast('已创建人设 · ' + name);
}

function savePersonaEdit(){
  if (!editingPersonaName) return;
  var found = findPersona(editingPersonaName);
  if (!found) { closeSheet(); return; }
  found.desc = descInput.value.trim();
  found.avatar = avatarData;
  found.gender = personaGender;
  found.updatedAt = Date.now();
  savePersonas();
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === editingPersonaName) CHATS[i].avatar = avatarData;
  }
  for (var j = 0; j < CONTACTS.length; j++) {
    if (CONTACTS[j].name === editingPersonaName) CONTACTS[j].avatar = avatarData;
  }
  saveChats();
  saveContacts();
  if (currentName === editingPersonaName) {
    currentAvatar = avatarData;
    if (pmTitle) pmTitle.textContent = editingPersonaName;
    renderMessages();
  }
  renderChats(); renderContacts();
  closeSheet();
  toast('已保存角色卡');
}


var userSheet = $('userSheet'), userSheetMask = $('userSheetMask');

var userSheetTitle = $('userSheetTitle'), userSheetActions = $('userSheetActions');

var userSocialIdInput = $('userSocialId'), userNameInput = $('userName'), userSignatureInput = $('userSignature'), userDescInput = $('userDesc');

var userCreateBtn = $('createUserPersona');

var userAvatarUploadBtn = $('userAvatarUploadBtn'), userAvatarPreview = $('userAvatarPreview');

var userAvatarClearBtn = $('userAvatarClearBtn'), userAvatarInput = $('userAvatarInput');

var userImportFileBtn = $('userImportFileBtn'), userPersonaFileInput = $('userPersonaFileInput');

var deleteUserPersonaBtn = $('deleteUserPersona');

var setUserPersonaActiveBtn = $('setUserPersonaActive');


var userAvatarData = null;

var userSheetMode = 'create';

var editingUserPersonaId = null;


function renderUserAvatarPreview(){
  if (!userAvatarUploadBtn) return;
  if (userAvatarData) {
    userAvatarPreview.src = userAvatarData;
    userAvatarPreview.hidden = false;
    userAvatarUploadBtn.classList.add('has-img');
    userAvatarClearBtn.hidden = false;
  } else {
    userAvatarPreview.removeAttribute('src');
    userAvatarPreview.hidden = true;
    userAvatarUploadBtn.classList.remove('has-img');
    userAvatarClearBtn.hidden = true;
  }
}

function openUserSheetForCreate(){
  userSheetMode = 'create';
  editingUserPersonaId = null;
  userSheetTitle.textContent = '添加我的角色';
  userCreateBtn.textContent = '创建我的角色';
  userSheetActions.classList.remove('is-shown');
  userAvatarData = null;
  renderUserAvatarPreview();
  userSocialIdInput.value = '';
  userNameInput.value = '';
  userSignatureInput.value = '';
  userDescInput.value = '';
  userCreateBtn.disabled = true;
  userSheet.classList.add('is-open');
  userSheetMask.classList.add('is-open');
  releaseInputFocus();
}

function openUserSheetForEdit(id){
  var found = null;
  for (var i = 0; i < State.userPersonas.length; i++) {
    if (State.userPersonas[i].id === id) { found = State.userPersonas[i]; break; }
  }
  if (!found) return;
  userSheetMode = 'edit';
  editingUserPersonaId = id;
  userSheetTitle.textContent = '编辑角色';
  userCreateBtn.textContent = '保存修改';
  userSheetActions.classList.add('is-shown');
  var isActive = State.settings.activeUserPersonaId === id;
  setUserPersonaActiveBtn.textContent = isActive ? '当前使用中' : '设为当前使用';
  setUserPersonaActiveBtn.disabled = isActive;
  setUserPersonaActiveBtn.style.opacity = isActive ? '.5' : '';
  userAvatarData = found.avatar || null;
  renderUserAvatarPreview();
  userSocialIdInput.value = found.socialId || found.name || '';
  userNameInput.value = found.name || '';
  userSignatureInput.value = found.signature || '';
  userDescInput.value = found.desc || '';
  userCreateBtn.disabled = !found.name;
  userSheet.classList.add('is-open');
  userSheetMask.classList.add('is-open');
}

function closeUserSheet(){
  if (!userSheet) return;
  userSheet.classList.remove('is-open');
  userSheetMask.classList.remove('is-open');
  userSheetMode = 'create';
  editingUserPersonaId = null;
  userSheetActions.classList.remove('is-shown');
}

function submitUserPersona(){
  if (userSheetMode === 'edit') saveUserPersonaEdit();
  else createUserPersonaFromSheet();
}

function createUserPersonaFromSheet(){
  var name = userNameInput.value.trim();
  var socialId = userSocialIdInput.value.trim() || name;
  if (!name) return;
  var id = genId('up_');
  State.userPersonas.push({
    id: id, socialId: socialId, name: name,
    signature: userSignatureInput.value.trim(),
    desc: userDescInput.value.trim(),
    avatar: userAvatarData,
    createdAt: Date.now()
  });
  if (!State.settings.activeUserPersonaId) {
    State.settings.activeUserPersonaId = id;
    saveSettings();
  }
  saveUserPersonas();
  renderUserPersonas(); renderMeCard();
  if (currentName) renderMessages();
  closeUserSheet();
  toast('已创建角色 · ' + name);
}

function saveUserPersonaEdit(){
  var name = userNameInput.value.trim();
  var socialId = userSocialIdInput.value.trim() || name;
  if (!name) return;
  var found = null;
  for (var i = 0; i < State.userPersonas.length; i++) {
    if (State.userPersonas[i].id === editingUserPersonaId) { found = State.userPersonas[i]; break; }
  }
  if (!found) { closeUserSheet(); return; }
  found.name = name;
  found.socialId = socialId;
  found.signature = userSignatureInput.value.trim();
  found.desc = userDescInput.value.trim();
  found.avatar = userAvatarData;
  found.updatedAt = Date.now();
  saveUserPersonas();
  renderUserPersonas(); renderMeCard();
  if (currentName) renderMessages();
  closeUserSheet();
  toast('已保存修改');
}

function deleteUserPersona(){
  if (!editingUserPersonaId) return;
  if (State.userPersonas.length <= 1) { toast('至少保留一个角色'); return; }
  islandConfirm('确定删除这个角色吗？删除后不可恢复。', {title:'删除角色', confirmText:'删除', danger:true}).then(function(ok){
    if (!ok) return;
    var wasActive = State.settings.activeUserPersonaId === editingUserPersonaId;
    for (var i = 0; i < State.userPersonas.length; i++) {
      if (State.userPersonas[i].id === editingUserPersonaId) {
        State.userPersonas.splice(i, 1); break;
      }
    }
    if (wasActive) {
      State.settings.activeUserPersonaId = State.userPersonas[0].id;
      saveSettings();
    }
    saveUserPersonas();
    renderUserPersonas(); renderMeCard();
    if (currentName) renderMessages();
    closeUserSheet();
    toast('已删除');
  });
}

function setUserPersonaActive(){
  if (!editingUserPersonaId) return;
  State.settings.activeUserPersonaId = editingUserPersonaId;
  saveSettings();
  renderUserPersonas(); renderMeCard();
  if (currentName) renderMessages();
  setUserPersonaActiveBtn.textContent = '当前使用中';
  setUserPersonaActiveBtn.disabled = true;
  setUserPersonaActiveBtn.style.opacity = '.5';
  toast('已设为当前使用');
}

function bindChatPersonaEvents(){

  $$('.js-add').forEach(function(btn){ btn.addEventListener('click', openSheet); });
  if (sheetMask) sheetMask.addEventListener('click', closeSheet);
  if (avatarUploadBtn) {
    avatarUploadBtn.addEventListener('click', function(){ avatarInput.click(); });
  }
  if (avatarInput) {
    avatarInput.addEventListener('change', function(){
      var file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('请选择图片文件'); avatarInput.value = ''; return; }
      if (file.size > MAX_AVATAR) { toast('图片过大，请小于 4MB'); avatarInput.value = ''; return; }
      compressImage(file).then(function(dataUrl){
        if (!dataUrl) { toast('图片读取失败'); return; }
        avatarData = dataUrl;
        renderAvatarPreview();
      });
      avatarInput.value = '';
    });
  }
  if (avatarClearBtn) {
    avatarClearBtn.addEventListener('click', function(){ avatarData = null; renderAvatarPreview(); });
  }
  if (importFileBtn) {
    importFileBtn.addEventListener('click', function(){ personaFileInput.click(); });
  }
  if (personaFileInput) {
    personaFileInput.addEventListener('change', function(){
      var file = personaFileInput.files && personaFileInput.files[0];
      if (!file) return;
      if (file.size > MAX_PERSONA) { toast('文件过大，请小于 512KB'); personaFileInput.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function(e){
        var text = String(e.target.result || '').trim();
        if (!text) { toast('文件内容为空'); return; }
        descInput.value = text;
        if (!nameInput.value.trim()) {
          var firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
          if (firstLine && firstLine.length <= 12) {
            nameInput.value = firstLine;
            createBtn.disabled = false;
          }
        }
        toast('已导入 ' + file.name);
      };
      reader.onerror = function(){ toast('文件读取失败'); };
      reader.readAsText(file);
      personaFileInput.value = '';
    });
  }
  if (nameInput) {
    nameInput.addEventListener('input', function(){
      createBtn.disabled = nameInput.value.trim().length === 0;
    });
  }
  if (personaGenderOptions) {
    personaGenderOptions.addEventListener('click', function(e){
      var btn = e.target.closest('[data-persona-gender]');
      if (!btn) return;
      setPersonaGender(btn.dataset.personaGender || 'unspecified');
    });
  }
  if (createBtn) createBtn.addEventListener('click', createPersona);
}
