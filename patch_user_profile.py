from pathlib import Path

root = Path('/mnt/data/work/edit_v11')
html = root / 'index.html'
js = root / 'assets/js/app.js'
css = root / 'assets/css/app.css'

s = html.read_text()
old = '''<div class="me-card">\n<div class="avatar avatar-lg" id="meAvatar" style="--deg:150deg">我</div>\n<div>\n<div class="me-name" id="meName">我</div>\n<div class="me-id" id="meId">点击「我的角色」查看和编辑</div>\n<div class="me-sign" id="meSign">在虚构里，认真地活着。</div>\n</div>\n</div>'''
new = '''<div class="me-card">\n<div class="avatar avatar-lg" id="meAvatar" style="--deg:150deg">我</div>\n<div>\n<div class="me-name" id="meName">我</div>\n<div class="me-sign" id="meSign"></div>\n</div>\n</div>'''
if old not in s:
    raise SystemExit('me-card block not found')
s = s.replace(old, new, 1)

old = '''<label class="field-label" for="userName">名字</label>\n<input autocomplete="off" class="field" id="userName" maxlength="12" placeholder="你在这个世界里的名字" type="text"/>\n<div class="field-row">'''
new = '''<label class="field-label" for="userSocialId">ID</label>\n<input autocomplete="off" class="field" id="userSocialId" maxlength="24" placeholder="你的社交软件网名" type="text"/>\n<label class="field-label" for="userName">姓名</label>\n<input autocomplete="off" class="field" id="userName" maxlength="12" placeholder="你的人设名字" type="text"/>\n<label class="field-label" for="userSignature">个性签名</label>\n<input autocomplete="off" class="field" id="userSignature" maxlength="60" placeholder="写一句你想展示的个性签名" type="text"/>\n<div class="field-row">'''
if old not in s:
    raise SystemExit('user form block not found')
s = s.replace(old, new, 1)
html.write_text(s)

s = js.read_text()
old = """  function getActiveUserPersona(){\n    var id = State.settings.activeUserPersonaId;\n    var list = State.userPersonas;\n    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];\n    if (list.length) return list[0];\n    return { id:'', name:'我', desc:'', avatar:null };\n  }"""
new = """  function getActiveUserPersona(){\n    var id = State.settings.activeUserPersonaId;\n    var list = State.userPersonas;\n    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];\n    if (list.length) return list[0];\n    return { id:'', socialId:'我', name:'我', signature:'', desc:'', avatar:null };\n  }"""
if old not in s:
    raise SystemExit('getActiveUserPersona block not found')
s = s.replace(old, new, 1)

old = """      if (Array.isArray(data['island.userPersonas']) && data['island.userPersonas'].length) {\n        State.userPersonas = data['island.userPersonas'];\n      } else {\n        State.userPersonas = [{ id:genId('up_'), name:'我', desc:'', avatar:null, createdAt:Date.now() }];\n        missing['island.userPersonas'] = true;\n      }\n      var found = State.userPersonas.some(function(persona){ return persona && persona.id === State.settings.activeUserPersonaId; });"""
new = """      if (Array.isArray(data['island.userPersonas']) && data['island.userPersonas'].length) {\n        State.userPersonas = data['island.userPersonas'];\n      } else {\n        State.userPersonas = [{ id:genId('up_'), socialId:'我', name:'我', signature:'', desc:'', avatar:null, createdAt:Date.now() }];\n        missing['island.userPersonas'] = true;\n      }\n      State.userPersonas = State.userPersonas.map(function(persona){\n        persona = (persona && typeof persona === 'object') ? persona : {};\n        if (!persona.id) persona.id = genId('up_');\n        if (persona.socialId == null || String(persona.socialId).trim() === '') persona.socialId = String(persona.name || '我').trim() || '我';\n        if (persona.signature == null) persona.signature = '';\n        return persona;\n      });\n      var found = State.userPersonas.some(function(persona){ return persona && persona.id === State.settings.activeUserPersonaId; });"""
if old not in s:
    raise SystemExit('load user personas block not found')
s = s.replace(old, new, 1)

old = """    if (elAv) {\n      elAv.innerHTML = u.avatar ? '<img src=\"' + u.avatar + '\" alt=\"\">' : escapeHTML(String(u.name || '我').charAt(0));\n    }\n    if (elName) elName.textContent = u.name || '我';\n    if (elId) elId.textContent = '点击「我的角色」查看和编辑';\n    if (elSign) elSign.textContent = '在虚构里，认真地活着。';\n    if (elState) elState.textContent = State.userPersonas.length + ' 个';"""
new = """    var socialId = String(u.socialId || u.name || '我').trim() || '我';\n    if (elAv) {\n      elAv.innerHTML = u.avatar ? '<img src=\"' + u.avatar + '\" alt=\"\">' : escapeHTML(socialId.charAt(0));\n    }\n    if (elName) elName.textContent = socialId;\n    if (elSign) elSign.textContent = String(u.signature || '').trim();\n    if (elState) elState.textContent = State.userPersonas.length + ' 个';"""
if old not in s:
    raise SystemExit('renderMeCard block not found')
s = s.replace(old, new, 1)

old = """  var userNameInput = $('userName'), userDescInput = $('userDesc');\n  var userCreateBtn = $('createUserPersona');"""
new = """  var userSocialIdInput = $('userSocialId'), userNameInput = $('userName'), userSignatureInput = $('userSignature'), userDescInput = $('userDesc');\n  var userCreateBtn = $('createUserPersona');"""
if old not in s:
    raise SystemExit('user input vars not found')
s = s.replace(old, new, 1)

old = """    userAvatarData = null;\n    renderUserAvatarPreview();\n    userNameInput.value = '';\n    userDescInput.value = '';\n    userCreateBtn.disabled = true;"""
new = """    userAvatarData = null;\n    renderUserAvatarPreview();\n    userSocialIdInput.value = '';\n    userNameInput.value = '';\n    userSignatureInput.value = '';\n    userDescInput.value = '';\n    userCreateBtn.disabled = true;"""
if old not in s:
    raise SystemExit('create sheet reset block not found')
s = s.replace(old, new, 1)

old = """    userAvatarData = found.avatar || null;\n    renderUserAvatarPreview();\n    userNameInput.value = found.name || '';\n    userDescInput.value = found.desc || '';\n    userCreateBtn.disabled = !found.name;"""
new = """    userAvatarData = found.avatar || null;\n    renderUserAvatarPreview();\n    userSocialIdInput.value = found.socialId || found.name || '';\n    userNameInput.value = found.name || '';\n    userSignatureInput.value = found.signature || '';\n    userDescInput.value = found.desc || '';\n    userCreateBtn.disabled = !found.name;"""
if old not in s:
    raise SystemExit('edit sheet fill block not found')
s = s.replace(old, new, 1)

old = """    var name = userNameInput.value.trim();\n    if (!name) return;\n    var id = genId('up_');\n    State.userPersonas.push({\n      id: id, name: name,\n      desc: userDescInput.value.trim(),\n      avatar: userAvatarData,\n      createdAt: Date.now()\n    });"""
new = """    var name = userNameInput.value.trim();\n    var socialId = userSocialIdInput.value.trim() || name;\n    if (!name) return;\n    var id = genId('up_');\n    State.userPersonas.push({\n      id: id, socialId: socialId, name: name,\n      signature: userSignatureInput.value.trim(),\n      desc: userDescInput.value.trim(),\n      avatar: userAvatarData,\n      createdAt: Date.now()\n    });"""
if old not in s:
    raise SystemExit('create user persona block not found')
s = s.replace(old, new, 1)

old = """    var name = userNameInput.value.trim();\n    if (!name) return;\n    var found = null;"""
new = """    var name = userNameInput.value.trim();\n    var socialId = userSocialIdInput.value.trim() || name;\n    if (!name) return;\n    var found = null;"""
# replace only the save edit instance after function marker
marker = "  function saveUserPersonaEdit(){\n"
pos = s.find(marker)
if pos == -1:
    raise SystemExit('saveUserPersonaEdit marker not found')
sub = s[pos:]
if old not in sub:
    raise SystemExit('save edit name block not found')
sub = sub.replace(old, new, 1)
s = s[:pos] + sub

old = """    found.name = name;\n    found.desc = userDescInput.value.trim();\n    found.avatar = userAvatarData;"""
new = """    found.name = name;\n    found.socialId = socialId;\n    found.signature = userSignatureInput.value.trim();\n    found.desc = userDescInput.value.trim();\n    found.avatar = userAvatarData;"""
if old not in s:
    raise SystemExit('save edit fields block not found')
s = s.replace(old, new, 1)

old = """    if (userNameInput) {\n      userNameInput.addEventListener('input', function(){\n        userCreateBtn.disabled = userNameInput.value.trim().length === 0;\n      });\n    }"""
new = """    if (userNameInput) {\n      userNameInput.addEventListener('input', function(){\n        userCreateBtn.disabled = userNameInput.value.trim().length === 0;\n      });\n    }\n    if (userSocialIdInput) userSocialIdInput.addEventListener('input', function(){\n      if (!userNameInput.value.trim()) userCreateBtn.disabled = true;\n    });"""
if old not in s:
    raise SystemExit('user name input listener not found')
s = s.replace(old, new, 1)

js.write_text(s)

s = css.read_text()
if '.me-sign:empty' not in s:
    s = s.replace('.me-sign{ margin-top:6px; font-size:calc(12.5px * var(--island-font-size-scale)); color: var(--fg-soft); }', '.me-sign{ margin-top:6px; font-size:calc(12.5px * var(--island-font-size-scale)); color: var(--fg-soft); }\n.me-sign:empty{ display:none; }')
css.write_text(s)

print('Patched user ID/name/signature UI and persistence.')
