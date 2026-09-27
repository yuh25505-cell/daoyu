from pathlib import Path

root = Path('/mnt/data/chatfix_v8/v7edit')
idx = root/'index.html'
css = root/'assets/css/app.css'
js = root/'assets/js/app.js'

h = idx.read_text()
needle = '''<div aria-hidden="true" class="pm-forward-sheet" id="pmForwardSheet">\n<div class="pm-forward-dialog" role="dialog" aria-modal="true" aria-label="转发消息">\n<div class="pm-forward-head"><div class="pm-forward-title">转发给</div><button type="button" class="pm-forward-close" id="pmForwardCancel" aria-label="取消转发">取消</button></div>\n<div class="pm-forward-list" id="pmForwardList"></div>\n</div>\n</div>\n<div class="pm-panel" id="pmPanel">'''
insert = '''<div aria-hidden="true" class="pm-forward-sheet" id="pmForwardSheet">\n<div class="pm-forward-dialog" role="dialog" aria-modal="true" aria-label="转发消息">\n<div class="pm-forward-head"><div class="pm-forward-title">转发给</div><button type="button" class="pm-forward-close" id="pmForwardCancel" aria-label="取消转发">取消</button></div>\n<div class="pm-forward-list" id="pmForwardList"></div>\n</div>\n</div>\n<div aria-hidden="true" class="pm-forward-record-view" id="pmForwardRecordView">\n<div class="pm-forward-record-shell">\n<header class="pm-forward-record-head">\n<button aria-label="返回聊天" class="ph-btn" id="pmForwardRecordBack" type="button">\n<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24"><path d="M15 5.5 8.5 12 15 18.5"></path></svg>\n</button>\n<div class="pm-forward-record-head-center"><div class="pm-forward-record-title" id="pmForwardRecordTitle">聊天记录</div></div>\n<div class="pm-forward-record-head-spacer"></div>\n</header>\n<div class="pm-forward-record-list" id="pmForwardRecordList"></div>\n</div>\n</div>\n<div class="pm-panel" id="pmPanel">'''
if needle not in h:
    raise SystemExit('index insertion point not found')
h = h.replace(needle, insert, 1)
idx.write_text(h)

c = css.read_text()
old = '''.pm-chat-record-label{ padding-top:6px; border-top:1px solid #ececec; color:#777; font-size:calc(9.5px * var(--island-font-size-scale)); line-height:1.2; }'''
new = '''.pm-chat-record-label{ padding-top:2px; color:#777; font-size:calc(9.5px * var(--island-font-size-scale)); line-height:1.2; }\n/* 转发聊天记录卡片本身可点击，继续使用与普通消息一致的气泡尾巴。 */\n.chat-message--received .chat-bubble--chat-record::before{ left:-4px; right:auto; }\n.chat-message--sent .chat-bubble--chat-record::before{ right:-4px; left:auto; }\n.chat-bubble--chat-record{ cursor:pointer; -webkit-tap-highlight-color:transparent; }\n\n.pm-forward-record-view{ position:absolute; inset:0; z-index:70; display:none; background:var(--bg); color:var(--fg); }\n.pm-forward-record-view.is-open{ display:block; }\n.pm-forward-record-shell{ position:relative; display:flex; flex-direction:column; width:100%; max-width:520px; height:100%; margin:0 auto; background:var(--bg); }\n.pm-forward-record-head{ flex:none; height:52px; display:grid; grid-template-columns:52px 1fr 52px; align-items:center; border-bottom:1px solid var(--track); background:var(--bg); }\n.pm-forward-record-head .ph-btn{ width:52px; height:52px; }\n.pm-forward-record-head-center{ min-width:0; display:flex; align-items:center; justify-content:center; }\n.pm-forward-record-title{ max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:16px; font-weight:650; }\n.pm-forward-record-head-spacer{ width:52px; height:52px; }\n.pm-forward-record-list{ flex:1; min-height:0; overflow:auto; padding:16px 14px calc(20px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:10px; overscroll-behavior:contain; }\n.pm-forward-record-item{ max-width:84%; padding:8px 10px; border-radius:8px; box-sizing:border-box; background:var(--chat-bubble-received-bg); color:var(--chat-bubble-fg); box-shadow:0 1px 1px rgba(0,0,0,.03); }\n.pm-forward-record-item.is-me{ align-self:flex-end; background:var(--chat-bubble-sent-bg); }\n.pm-forward-record-item.is-them{ align-self:flex-start; background:var(--chat-bubble-received-bg); }\n.pm-forward-record-author{ margin-bottom:3px; font-size:10px; line-height:1.2; opacity:.58; }\n.pm-forward-record-text{ font-size:14px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }\n.pm-forward-record-empty{ padding:38px 12px; text-align:center; opacity:.55; font-size:13px; }'''
if old not in c:
    raise SystemExit('css target not found')
c = c.replace(old, new, 1)
css.write_text(c)

j = js.read_text()
old_var = "  var pmForwardSheet = $('pmForwardSheet'), pmForwardList = $('pmForwardList'), pmForwardCancel = $('pmForwardCancel'), pmForwardSelected = $('pmForwardSelected');"
new_var = old_var + "\n  var pmForwardRecordView = $('pmForwardRecordView'), pmForwardRecordBack = $('pmForwardRecordBack'), pmForwardRecordTitle = $('pmForwardRecordTitle'), pmForwardRecordList = $('pmForwardRecordList');"
if old_var not in j:
    raise SystemExit('js var target not found')
j = j.replace(old_var, new_var, 1)

old_funcs = '''  function closeForwardPicker(){\n    if (!pmForwardSheet) return;\n    pmForwardSheet.classList.remove('is-open');\n    pmForwardSheet.setAttribute('aria-hidden', 'true');\n    forwardMessageIndex = -1;\n    forwardSelectedMessageIndices = null;\n  }\n'''
new_funcs = '''  function closeForwardPicker(){\n    if (!pmForwardSheet) return;\n    pmForwardSheet.classList.remove('is-open');\n    pmForwardSheet.setAttribute('aria-hidden', 'true');\n    forwardMessageIndex = -1;\n    forwardSelectedMessageIndices = null;\n  }\n  function openForwardRecordView(index){\n    if (!pmForwardRecordView) return;\n    var list = MESSAGES[currentName] || [], msg = list[Number(index)];\n    if (!msg || msg.type !== 'chat_record') return;\n    var items = Array.isArray(msg.recordMessages) ? msg.recordMessages : [];\n    if (!items.length) { toast('这条聊天记录为空'); return; }\n    if (pmForwardRecordTitle) pmForwardRecordTitle.textContent = String(msg.recordTitle || '聊天记录').trim() || '聊天记录';\n    if (pmForwardRecordList) {\n      pmForwardRecordList.innerHTML = items.map(function(item){\n        var from = item && item.from === 'them' ? 'them' : 'me';\n        var author = String(item && item.author || '').trim();\n        var text = String(item && item.text || '').trim() || '[消息]';\n        return '<article class="pm-forward-record-item is-' + from + '">' +\n          (author ? '<div class="pm-forward-record-author">' + escapeHTML(author) + '</div>' : '') +\n          '<div class="pm-forward-record-text">' + escapeHTML(text) + '</div>' +\n        '</article>';\n      }).join('');\n    }\n    closeVoiceMessageActionMenu();\n    closeForwardPicker();\n    pmForwardRecordView.classList.add('is-open');\n    pmForwardRecordView.setAttribute('aria-hidden', 'false');\n  }\n  function closeForwardRecordView(){\n    if (!pmForwardRecordView) return;\n    pmForwardRecordView.classList.remove('is-open');\n    pmForwardRecordView.setAttribute('aria-hidden', 'true');\n    if (pmForwardRecordList) pmForwardRecordList.innerHTML = '';\n  }\n'''
if old_funcs not in j:
    raise SystemExit('js function target not found')
j = j.replace(old_funcs, new_funcs, 1)

# Add close on open/close PM.
j = j.replace("    clearMessageQuote();\n    closeUP();", "    clearMessageQuote();\n    closeForwardRecordView();\n    closeUP();", 1)
j = j.replace("  function closePM(){\n    clearMessageSelection();\n    clearMessageQuote();\n    closeForwardPicker();", "  function closePM(){\n    clearMessageSelection();\n    clearMessageQuote();\n    closeForwardPicker();\n    closeForwardRecordView();", 1)

# Add back listener.
old_listener = "    if (pmForwardCancel) pmForwardCancel.addEventListener('click', function(){ closeForwardPicker(); });\n    if (pmForwardSelected) pmForwardSelected.addEventListener('click', function(){ if (messageSelectionMode) openForwardPickerForSelection(); });"
new_listener = "    if (pmForwardCancel) pmForwardCancel.addEventListener('click', function(){ closeForwardPicker(); });\n    if (pmForwardRecordBack) pmForwardRecordBack.addEventListener('click', function(){ closeForwardRecordView(); });\n    if (pmForwardSelected) pmForwardSelected.addEventListener('click', function(){ if (messageSelectionMode) openForwardPickerForSelection(); });"
if old_listener not in j:
    raise SystemExit('listener target not found')
j = j.replace(old_listener, new_listener, 1)

# Add click handler for chat record cards in normal mode.
old_click = '''        if (row && pmScroll.contains(row) && messageSelectionMode) {\n          if (e.target.closest('button, a, input, select, textarea')) return;\n          e.preventDefault();\n          toggleMessageSelected(Number(row.dataset.messageIndex));\n          return;\n        }\n\n        var popoverAction = e.target.closest('[data-message-action]');'''
new_click = '''        if (row && pmScroll.contains(row) && messageSelectionMode) {\n          if (e.target.closest('button, a, input, select, textarea')) return;\n          e.preventDefault();\n          toggleMessageSelected(Number(row.dataset.messageIndex));\n          return;\n        }\n\n        var chatRecordCard = e.target.closest('.chat-bubble--chat-record');\n        if (chatRecordCard && pmScroll.contains(chatRecordCard) && !messageSelectionMode) {\n          var recordRow = chatRecordCard.closest('.chat-message[data-message-index]');\n          if (recordRow) {\n            e.preventDefault();\n            openForwardRecordView(Number(recordRow.dataset.messageIndex));\n            return;\n          }\n        }\n\n        var popoverAction = e.target.closest('[data-message-action]');'''
if old_click not in j:
    raise SystemExit('click target not found')
j = j.replace(old_click, new_click, 1)

# Add keyboard activation for the record card on the scroll container.
old_after_click = "      });\n      if (pmMessageActionPopover) {\n        pmMessageActionPopover.addEventListener('click', function(e){"
new_after_click = "      });\n      pmScroll.addEventListener('keydown', function(e){\n        if (e.key !== 'Enter' && e.key !== ' ') return;\n        var card = e.target.closest('.chat-bubble--chat-record');\n        if (!card || messageSelectionMode || !pmScroll.contains(card)) return;\n        var row = card.closest('.chat-message[data-message-index]');\n        if (!row) return;\n        e.preventDefault();\n        openForwardRecordView(Number(row.dataset.messageIndex));\n      });\n      if (pmMessageActionPopover) {\n        pmMessageActionPopover.addEventListener('click', function(e){"
if old_after_click not in j:
    raise SystemExit('keydown insertion target not found')
j = j.replace(old_after_click, new_after_click, 1)

# Make card explicitly focusable and identify its source index.
old_card = "      body = '<div class=\"pm-chat-record-bubble chat-bubble chat-bubble--chat-record\">' +"
new_card = "      body = '<div class=\"pm-chat-record-bubble chat-bubble chat-bubble--chat-record\" role=\"button\" tabindex=\"0\" data-chat-record-index=\"' + index + '\" aria-label=\"查看转发的聊天记录\">' +"
if old_card not in j:
    raise SystemExit('card target not found')
j = j.replace(old_card, new_card, 1)

js.write_text(j)
print('patched')
