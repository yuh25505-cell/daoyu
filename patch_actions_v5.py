from pathlib import Path

root = Path('/mnt/data/chatfix3')
js = root / 'assets/js/app.js'
css = root / 'assets/css/app.css'
html = root / 'index.html'

s = js.read_text(encoding='utf-8')

old = "var pmMessageActionPopover = $('pmMessageActionPopover');"
new = "var pmMessageActionPopover = $('pmMessageActionPopover');\n  var pmQuoteBar = $('pmQuoteBar'), pmQuoteText = $('pmQuoteText'), pmQuoteCancel = $('pmQuoteCancel');\n  var pmForwardSheet = $('pmForwardSheet'), pmForwardList = $('pmForwardList'), pmForwardCancel = $('pmForwardCancel');"
if old not in s:
    raise SystemExit('missing var anchor')
s = s.replace(old, new, 1)

old = "var currentName = null, currentAvatar = null, panelMode = null, replyTimer = null;"
new = "var currentName = null, currentAvatar = null, panelMode = null, replyTimer = null;\n  var messageQuoteDraft = null;\n  var forwardMessageIndex = -1;"
if old not in s:
    raise SystemExit('missing state anchor')
s = s.replace(old, new, 1)

old = """  function clearMessageSelection(){\n    messageSelectionMode = false;\n    selectedMessageIndices = Object.create(null);\n    updateMessageSelectionChrome();\n  }\n"""
new = """  function clearMessageSelection(){\n    messageSelectionMode = false;\n    selectedMessageIndices = Object.create(null);\n    updateMessageSelectionChrome();\n  }\n  function getMessageQuotePayload(index){\n    var list = MESSAGES[currentName] || [], msg = list[Number(index)];\n    if (!msg) return null;\n    var text = messageCopyText(msg) || '';\n    text = String(text).replace(/\\s+/g, ' ').trim();\n    if (text.length > 100) text = text.slice(0, 100) + '…';\n    return {\n      id: msg.id || '',\n      from: msg.from === 'them' ? 'them' : 'me',\n      author: msg.from === 'them' ? (currentName || '对方') : '我',\n      text: text || '[消息]',\n      type: msg.type || 'text'\n    };\n  }\n  function updateMessageQuoteBar(){\n    if (!pmQuoteBar || !pmQuoteText) return;\n    var active = !!messageQuoteDraft;\n    pmQuoteBar.hidden = !active;\n    pmQuoteBar.classList.toggle('is-open', active);\n    if (active) {\n      var draft = messageQuoteDraft;\n      pmQuoteText.textContent = (draft.author ? draft.author + '：' : '') + (draft.text || '[消息]');\n      pmQuoteBar.setAttribute('aria-hidden', 'false');\n    } else {\n      pmQuoteText.textContent = '';\n      pmQuoteBar.setAttribute('aria-hidden', 'true');\n    }\n    autoResizeInput();\n  }\n  function clearMessageQuote(){\n    messageQuoteDraft = null;\n    updateMessageQuoteBar();\n  }\n  function quoteMessage(index){\n    var payload = getMessageQuotePayload(index);\n    if (!payload) return;\n    messageQuoteDraft = payload;\n    updateMessageQuoteBar();\n    closeVoiceMessageActionMenu();\n    if (pmInput) {\n      try { pmInput.focus({ preventScroll:true }); } catch(e) { try { pmInput.focus(); } catch(err) {} }\n      try { pmInput.setSelectionRange(pmInput.value.length, pmInput.value.length); } catch(e) {}\n    }\n  }\n  function toggleMessageFavorite(index){\n    var list = MESSAGES[currentName] || [], msg = list[Number(index)];\n    if (!msg) return;\n    msg.favorite = msg.favorite !== true;\n    saveMessages(currentName);\n    closeVoiceMessageActionMenu();\n    toast(msg.favorite ? '已收藏' : '已取消收藏');\n  }\n  function renderForwardList(){\n    if (!pmForwardList) return;\n    var names = [];\n    CHATS.forEach(function(chat){\n      var name = chat && String(chat.name || '').trim();\n      if (name && names.indexOf(name) === -1) names.push(name);\n    });\n    CONTACTS.forEach(function(contact){\n      var name = contact && String(contact.name || '').trim();\n      if (name && names.indexOf(name) === -1) names.push(name);\n    });\n    if (!names.length) {\n      pmForwardList.innerHTML = '<div class=\"pm-forward-empty\">暂无可转发的会话</div>';\n      return;\n    }\n    pmForwardList.innerHTML = names.map(function(name, i){\n      var avatar = getAvatar(name);\n      var inner = avatar ? '<img src=\"' + escapeHTML(avatar) + '\" alt=\"\">' : escapeHTML(name.charAt(0));\n      return '<button type=\"button\" class=\"pm-forward-item\" data-forward-name=\"' + escapeHTML(name) + '\"><span class=\"pm-forward-avatar\" style=\"--deg:' + (130 + (i * 37) % 120) + 'deg\">' + inner + '</span><span class=\"pm-forward-name\">' + escapeHTML(name) + '</span></button>';\n    }).join('');\n  }\n  function openForwardPicker(index){\n    if (!pmForwardSheet) return;\n    var list = MESSAGES[currentName] || [], msg = list[Number(index)];\n    if (!msg) return;\n    forwardMessageIndex = Number(index);\n    renderForwardList();\n    closeVoiceMessageActionMenu();\n    pmForwardSheet.classList.add('is-open');\n    pmForwardSheet.setAttribute('aria-hidden', 'false');\n  }\n  function closeForwardPicker(){\n    if (!pmForwardSheet) return;\n    pmForwardSheet.classList.remove('is-open');\n    pmForwardSheet.setAttribute('aria-hidden', 'true');\n    forwardMessageIndex = -1;\n  }\n  function forwardMessageTo(name){\n    var sourceList = MESSAGES[currentName] || [], source = sourceList[forwardMessageIndex];\n    var targetName = String(name || '').trim();\n    if (!source || !targetName) return;\n    if (!Array.isArray(MESSAGES[targetName])) MESSAGES[targetName] = [];\n    var forwarded = Object.assign({}, source, {\n      id: genId('msg_'),\n      from: 'me',\n      createdAt: Date.now(),\n      forwarded: true,\n      forwardedFrom: currentName || ''\n    });\n    delete forwarded.replyTo;\n    MESSAGES[targetName].push(forwarded);\n    saveMessages(targetName);\n    var chat = null;\n    for (var i = 0; i < CHATS.length; i++) {\n      if (CHATS[i].name === targetName) { chat = CHATS[i]; break; }\n    }\n    if (!chat) {\n      chat = { name: targetName, preview: '', time: '', unread: 0, avatar: getAvatar(targetName) };\n      CHATS.unshift(chat);\n    }\n    chat.time = '刚刚';\n    updateChatPreviewAfterMessageMutation(targetName);\n    saveChats(); renderChats();\n    closeForwardPicker();\n    toast('已转发给 ' + targetName);\n  }\n"""
if old not in s:
    raise SystemExit('missing selection function anchor')
s = s.replace(old, new, 1)

old = """    } else {\n      body = '<div class=\"pm-bubble chat-bubble chat-bubble--text\">' + escapeHTML(msg && msg.text != null ? msg.text : '') + '</div>';\n    }\n"""
new = """    } else {\n      var replyMarkup = '';\n      if (msg && msg.replyTo && msg.replyTo.text) {\n        replyMarkup = '<div class=\"pm-bubble-quote\"><div class=\"pm-bubble-quote-author\">' + escapeHTML(msg.replyTo.author || (msg.replyTo.from === 'them' ? currentName : '我') || '') + '</div><div class=\"pm-bubble-quote-text\">' + escapeHTML(String(msg.replyTo.text).slice(0, 120)) + '</div></div>';\n      }\n      body = '<div class=\"pm-bubble chat-bubble chat-bubble--text\">' + replyMarkup + escapeHTML(msg && msg.text != null ? msg.text : '') + '</div>';\n    }\n"""
if old not in s:
    raise SystemExit('missing text body anchor')
s = s.replace(old, new, 1)

old = """    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"copy\" data-message-action-index=\"' + index + '\" aria-label=\"复制\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><rect x=\"8\" y=\"8\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-6A2.5 2.5 0 0 0 5 6.5v6A2.5 2.5 0 0 0 7.5 15H8\"></path></svg></span><span class=\"pm-message-action-label\">复制</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"delete\" data-message-action-index=\"' + index + '\" aria-label=\"删除\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\" viewBox=\"0 0 24 24\"><path d=\"M5 7h14M9 7V4.8h6V7M8 10v7M12 10v7M16 10v7M6.5 7l.8 13h9.4l.8-13\"></path></svg></span><span class=\"pm-message-action-label\">删除</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"select\" data-message-action-index=\"' + index + '\" aria-label=\"多选\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><rect x=\"4.5\" y=\"4.5\" width=\"15\" height=\"15\" rx=\"3\"></rect><path d=\"M8 12h8\"></path></svg></span><span class=\"pm-message-action-label\">多选</span></button>';\n"""
new = """    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"copy\" data-message-action-index=\"' + index + '\" aria-label=\"复制\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><rect x=\"8\" y=\"8\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-6A2.5 2.5 0 0 0 5 6.5v6A2.5 2.5 0 0 0 7.5 15H8\"></path></svg></span><span class=\"pm-message-action-label\">复制</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"quote\" data-message-action-index=\"' + index + '\" aria-label=\"引用\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><path d=\"M9.5 7.5H7.8A3.3 3.3 0 0 0 4.5 10.8v2.1a3.3 3.3 0 0 0 3.3 3.3h1.7a3.3 3.3 0 0 0 3.3-3.3v-5A3.3 3.3 0 0 0 9.5 4.6\"></path><path d=\"M18.5 7.5h-1.7a3.3 3.3 0 0 0-3.3 3.3v2.1a3.3 3.3 0 0 0 3.3 3.3h1.7a3.3 3.3 0 0 0 3.3-3.3v-5a3.3 3.3 0 0 0-3.3-3.3\"></path></svg></span><span class=\"pm-message-action-label\">引用</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"favorite\" data-message-action-index=\"' + index + '\" aria-label=\"' + (msg.favorite ? '取消收藏' : '收藏') + '\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"' + (msg.favorite ? 'currentColor' : 'none') + '\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><path d=\"m12 4 2.45 4.96 5.47.8-3.96 3.86.93 5.45L12 16.5 7.11 19.07l.93-5.45-3.96-3.86 5.47-.8L12 4z\"></path></svg></span><span class=\"pm-message-action-label\">' + (msg.favorite ? '取消收藏' : '收藏') + '</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"forward\" data-message-action-index=\"' + index + '\" aria-label=\"转发\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><path d=\"M5 12h13\"></path><path d=\"m13 6 6 6-6 6\"></path></svg></span><span class=\"pm-message-action-label\">转发</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"delete\" data-message-action-index=\"' + index + '\" aria-label=\"删除\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\" viewBox=\"0 0 24 24\"><path d=\"M5 7h14M9 7V4.8h6V7M8 10v7M12 10v7M16 10v7M6.5 7l.8 13h9.4l.8-13\"></path></svg></span><span class=\"pm-message-action-label\">删除</span></button>';\n    actions += '<button class=\"pm-message-action-item\" type=\"button\" data-message-action=\"select\" data-message-action-index=\"' + index + '\" aria-label=\"多选\"><span class=\"pm-message-action-icon\" aria-hidden=\"true\"><svg fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.7\" viewBox=\"0 0 24 24\"><rect x=\"4.5\" y=\"4.5\" width=\"15\" height=\"15\" rx=\"3\"></rect><path d=\"M8 12h8\"></path></svg></span><span class=\"pm-message-action-label\">多选</span></button>';\n"""
if old not in s:
    raise SystemExit('missing action block')
s = s.replace(old, new, 1)

# Put reply metadata onto newly sent text messages.
old = """  function sendMessage(text){\n    text = String(text || '').trim();\n    if (!text || !currentName) return;\n    if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];\n    MESSAGES[currentName].push({ from:'me', text: text, createdAt:Date.now() });\n    saveMessages(currentName); renderMessages(true); scrollBottom(true);\n"""
new = """  function sendMessage(text){\n    text = String(text || '').trim();\n    if (!text || !currentName) return;\n    if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];\n    var outgoing = { from:'me', text: text, createdAt:Date.now() };\n    if (messageQuoteDraft) outgoing.replyTo = Object.assign({}, messageQuoteDraft);\n    MESSAGES[currentName].push(outgoing);\n    clearMessageQuote();\n    saveMessages(currentName); renderMessages(true); scrollBottom(true);\n"""
if old not in s:
    raise SystemExit('missing sendMessage block')
s = s.replace(old, new, 1)

# Clear quote when closing/opening PM.
old = """  function openPM(name){\n    if (!pmView || !name) return;\n    clearMessageSelection();\n"""
new = """  function openPM(name){\n    if (!pmView || !name) return;\n    clearMessageSelection();\n    clearMessageQuote();\n"""
s = s.replace(old, new, 1)
old = """  function closePM(){\n    clearMessageSelection();\n"""
new = """  function closePM(){\n    clearMessageSelection();\n    clearMessageQuote();\n    closeForwardPicker();\n"""
if old not in s:
    raise SystemExit('missing closePM block')
s = s.replace(old, new, 1)

# Handle new action cases in both handlers.
old = """          if (action === 'transcribe') toggleVoiceTranscript(index);\n          else if (action === 'copy') copyMessageText(index);\n          else if (action === 'delete') deleteMessageAt(index);\n          else if (action === 'select') enterMessageSelection(index);\n"""
new = """          if (action === 'transcribe') toggleVoiceTranscript(index);\n          else if (action === 'copy') copyMessageText(index);\n          else if (action === 'quote') quoteMessage(index);\n          else if (action === 'favorite') toggleMessageFavorite(index);\n          else if (action === 'forward') openForwardPicker(index);\n          else if (action === 'delete') deleteMessageAt(index);\n          else if (action === 'select') enterMessageSelection(index);\n"""
if s.count(old) != 2:
    raise SystemExit(f'expected 2 action handler blocks, found {s.count(old)}')
s = s.replace(old, new, 2)

# Bind quote/forward controls.
old = """    if (pmInput) {\n      pmInput.addEventListener('keydown', function(e){\n"""
new = """    if (pmQuoteCancel) pmQuoteCancel.addEventListener('click', function(){ clearMessageQuote(); });\n    if (pmForwardCancel) pmForwardCancel.addEventListener('click', function(){ closeForwardPicker(); });\n    if (pmForwardSheet) {\n      pmForwardSheet.addEventListener('click', function(e){\n        if (e.target === pmForwardSheet) { closeForwardPicker(); return; }\n        var item = e.target.closest('[data-forward-name]');\n        if (item) { e.preventDefault(); e.stopPropagation(); forwardMessageTo(item.dataset.forwardName || ''); }\n      });\n    }\n    if (pmInput) {\n      pmInput.addEventListener('keydown', function(e){\n"""
if old not in s:
    raise SystemExit('missing input bind anchor')
s = s.replace(old, new, 1)

js.write_text(s, encoding='utf-8')

# HTML additions
h = html.read_text(encoding='utf-8')
old = '<div aria-hidden="true" class="pm-message-action-popover" id="pmMessageActionPopover"></div>\n<div class="pm-panel" id="pmPanel">'
new = '''<div aria-hidden="true" class="pm-message-action-popover" id="pmMessageActionPopover"></div>\n<div aria-hidden="true" class="pm-forward-sheet" id="pmForwardSheet">\n<div class="pm-forward-dialog" role="dialog" aria-modal="true" aria-label="转发消息">\n<div class="pm-forward-head"><div class="pm-forward-title">转发给</div><button type="button" class="pm-forward-close" id="pmForwardCancel" aria-label="取消转发">取消</button></div>\n<div class="pm-forward-list" id="pmForwardList"></div>\n</div>\n</div>\n<div class="pm-panel" id="pmPanel">'''
if old not in h:
    raise SystemExit('missing html popover anchor')
h = h.replace(old, new, 1)
old = '<div class="pm-bar" id="pmBar">'
new = '''<div aria-hidden="true" class="pm-quote-bar" id="pmQuoteBar" hidden>\n<div class="pm-quote-main"><div class="pm-quote-label">引用消息</div><div class="pm-quote-text" id="pmQuoteText"></div></div>\n<button type="button" class="pm-quote-cancel" id="pmQuoteCancel" aria-label="取消引用">×</button>\n</div>\n<div class="pm-bar" id="pmBar">'''
if old not in h:
    raise SystemExit('missing pmbar anchor')
h = h.replace(old, new, 1)
html.write_text(h, encoding='utf-8')

# CSS additions / modifications
c = css.read_text(encoding='utf-8')
old = '''.pm-message-action-popover{\n  position:absolute; z-index:90; display:none;\n  min-width:188px; max-width:calc(100% - 24px);\n  padding:8px; box-sizing:border-box;'''
new = '''.pm-message-action-popover{\n  position:absolute; z-index:90; display:none;\n  width:min(300px, calc(100% - 20px)); min-width:188px; max-width:calc(100% - 20px);\n  padding:8px; box-sizing:border-box;'''
if old not in c:
    raise SystemExit('missing popover css anchor')
c = c.replace(old, new, 1)
old = '.pm-message-action-popover.is-open{ display:grid; grid-auto-flow:column; grid-auto-columns:minmax(58px, 1fr); align-items:stretch; gap:2px; }'
new = '.pm-message-action-popover.is-open{ display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); align-items:stretch; gap:2px; }'
if old not in c:
    raise SystemExit('missing popover open css')
c = c.replace(old, new, 1)
old = '''.pm-message-action-item{\n  min-width:58px; padding:7px 8px 6px; border:0; border-radius:10px;'''
new = '''.pm-message-action-item{\n  min-width:0; padding:7px 6px 6px; border:0; border-radius:10px;'''
c = c.replace(old, new, 1)

insert_after = '.pm-message-action-popover .pm-message-action-item[data-message-action="transcribe"] .pm-message-action-icon svg{ width:24px; height:24px; }\n'
addon = '''\n.pm-quote-bar{\n  display:none; flex:none; align-items:center; gap:8px; margin:0 12px; padding:8px 10px;\n  border-left:3px solid var(--fg); border-radius:8px; background:rgba(127,127,127,.10);\n  box-sizing:border-box; color:var(--fg);\n}\n.pm-quote-bar.is-open{ display:flex; }\n.pm-quote-main{ min-width:0; flex:1; }\n.pm-quote-label{ font-size:10px; line-height:1.15; opacity:.62; margin-bottom:2px; }\n.pm-quote-text{ font-size:12px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n.pm-quote-cancel{ flex:none; width:28px; height:28px; border:0; padding:0; display:grid; place-items:center; border-radius:50%; background:transparent; color:currentColor; font-size:21px; line-height:1; }\n.pm-quote-cancel:active{ background:rgba(127,127,127,.14); }\n.pm-bubble-quote{ margin:-1px 0 6px; padding:5px 7px; border-left:2px solid currentColor; border-radius:2px; background:rgba(127,127,127,.12); opacity:.84; }\n.pm-bubble-quote-author{ font-size:10px; line-height:1.2; margin-bottom:2px; opacity:.78; }\n.pm-bubble-quote-text{ font-size:11px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n.pm-forward-sheet{\n  position:fixed; inset:0; z-index:240; display:none; align-items:flex-end; justify-content:center;\n  padding:0 12px calc(12px + env(safe-area-inset-bottom,0px)); box-sizing:border-box;\n  background:rgba(0,0,0,.28); backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);\n}\n.pm-forward-sheet.is-open{ display:flex; }\n.pm-forward-dialog{\n  width:min(100%, 460px); max-height:min(68vh,520px); display:flex; flex-direction:column; overflow:hidden;\n  border-radius:16px; background:var(--bg); color:var(--fg); box-shadow:0 18px 50px rgba(0,0,0,.22);\n}\n.pm-forward-head{ flex:none; display:flex; align-items:center; justify-content:space-between; padding:14px 16px 12px; border-bottom:1px solid rgba(127,127,127,.12); }\n.pm-forward-title{ font-size:16px; font-weight:650; }\n.pm-forward-close{ border:0; background:transparent; color:var(--fg); font:inherit; opacity:.7; padding:5px 2px; }\n.pm-forward-list{ overflow:auto; padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px)); }\n.pm-forward-item{ width:100%; display:flex; align-items:center; gap:12px; padding:10px 8px; border:0; border-radius:10px; background:transparent; color:var(--fg); text-align:left; font:inherit; }\n.pm-forward-item:active{ background:rgba(127,127,127,.12); }\n.pm-forward-avatar{ width:38px; height:38px; flex:none; display:grid; place-items:center; overflow:hidden; border-radius:12px; background:linear-gradient(135deg, hsl(var(--deg,200) 60% 72%), hsl(calc(var(--deg,200) + 55) 55% 60%)); color:#111; font-weight:650; }\n.pm-forward-avatar img{ width:100%; height:100%; display:block; object-fit:cover; }\n.pm-forward-name{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.pm-forward-empty{ padding:34px 14px; text-align:center; opacity:.58; font-size:13px; }\n'''
if insert_after not in c:
    raise SystemExit('missing css insert anchor')
c = c.replace(insert_after, insert_after + addon, 1)
css.write_text(c, encoding='utf-8')

print('patched v5')
