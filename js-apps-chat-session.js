/* 岛屿 · 聊天 · 私聊会话（打开 / 发送 / 回复调度）
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

/* 输入框自动撑高 */
function autoResizeInput(){
  if (!pmInput) return;
  pmInput.style.height = 'auto';
  var maxH = 132;
  var h = Math.min(pmInput.scrollHeight, maxH);
  pmInput.style.height = h + 'px';
  if (pmInput.scrollHeight > maxH) {
    pmInput.style.overflowY = 'auto';
  } else {
    pmInput.style.overflowY = 'hidden';
  }
}


function openPM(name){
  if (!pmView || !name) return;
  clearMessageSelection();
  clearMessageQuote();
  closeForwardRecordView();
  closeUP();
  closeVoiceCallView({silent:true});
  currentName = name; currentAvatar = getAvatar(name);
  if (pmTitle) pmTitle.textContent = name;
  hideTypingStatus();
  if (replyInFlight[name]) showTypingStatus();
  if (!Array.isArray(MESSAGES[name])) { MESSAGES[name] = []; saveMessages(name); }
  clearVoiceTranscriptStates();
  renderMessages(); closePanel(); setVoiceMode(false);
  pmView.classList.add('is-open');
  document.documentElement.classList.add('pm-open');
  syncPMChrome();
  pmView.setAttribute('aria-hidden', 'false');
  var cleared = false;
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === name && CHATS[i].unread) { CHATS[i].unread = 0; cleared = true; break; }
  }
  if (cleared) { renderChats(); saveChats(); }
  autoResizeInput();
  updateAiButtonVisibility();
  scrollBottom(false);

  // 如果角色之前在别的时间主动发起了语音来电，则进入对应私聊时继续显示系统式来电通知。
  var pendingCall = null;
  var pendingList = Array.isArray(MESSAGES[name]) ? MESSAGES[name] : [];
  for (var pc = pendingList.length - 1; pc >= 0; pc--) {
    var pendingMsg = pendingList[pc];
    if (pendingMsg && pendingMsg.type === 'voice_call_event' && pendingMsg.event === 'incoming' && !pendingMsg.handled) {
      pendingCall = pendingMsg;
      break;
    }
  }
  if (pendingCall) {
    setTimeout(function(){
      if (currentName === name && !voiceCallState.active && !voiceCallState.incoming) showIncomingVoiceCall(pendingCall, name);
    }, 180);
  }
}

function closePM(){
  clearMessageSelection();
  clearMessageQuote();
  closeForwardPicker();
  closeForwardRecordView();
  if (!pmView) return;
  closeVoiceCallView({silent:true});
  if (voiceRecording || voiceStream) {
    voicePointerActive = false;
    finishVoiceRecording(true);
  }
  stopVoiceStream();
  pmView.classList.remove('is-open');
  document.documentElement.classList.remove('pm-open');
  document.documentElement.style.removeProperty('--pm-status-fg');
  pmView.setAttribute('aria-hidden', 'true');
  closePanel(); closeMemoryViews(); setVoiceMode(false);
  closeVoiceTextComposer();
  closeLocationModal(); closeLocationCustomModal(); closeLocationMapView();
  closeTransferModal();
  hideTypingStatus();
  currentName = null;
  /* 离开聊天页不再取消正在进行的回复：回复会在后台继续生成、写入并弹系统通知。 */
}

function sendMessage(text){
  text = String(text || '').trim();
  if (!text || !currentName) return;
  if (!Array.isArray(MESSAGES[currentName])) MESSAGES[currentName] = [];
  var outgoing = { from:'me', text: text, createdAt:Date.now() };
  if (messageQuoteDraft) outgoing.replyTo = Object.assign({}, messageQuoteDraft);
  MESSAGES[currentName].push(outgoing);
  clearMessageQuote();
  saveMessages(currentName);
  renderMessages(true); scrollBottom(true);
  for (var i = 0; i < CHATS.length; i++) {
    if (CHATS[i].name === currentName) { CHATS[i].preview = text; CHATS[i].time = '刚刚'; break; }
  }
  renderChats(); saveChats();
}

function splitReply(text){
  var raw = String(text || '');
  var parts = raw.split(/\r?\n/);
  var result = [];
  parts.forEach(function(p){
    var trimmed = p.replace(/^[ \t\u3000]+|[ \t\u3000]+$/g, '');
    if (!trimmed) return;
    trimmed = trimmed.replace(/^[-*·•]+\s*/, '').replace(/^["'""'']+/, '').replace(/["'""'']+$/, '');
    trimmed = trimmed.trim();
    if (!trimmed) return;
    result.push(trimmed);
  });
  return result;
}

function scheduleReply(delay){
  if (replyTimer) { toast('AI 正在回复中'); return; }
  if (!isApiReady()) { toast('请先在设置中配置 AI 接口'); return; }
  var nameAtSchedule = currentName;

  replyTimer = setTimeout(function(){
    replyTimer = null;
    if (!nameAtSchedule) return;
    var nameAtRequest = nameAtSchedule;
    replyInFlight[nameAtRequest] = true;

    /* 显示顶栏备注「对方正在输入...」 */
    if (currentName === nameAtRequest) showTypingStatus();

    var finished = false;
    var timeoutTimer = null;

    function startAiReply(){
      if (finished) return;
      prepareMemoryForContext(nameAtRequest).then(function(){
      if (finished) return;
      var messages = buildMessages(nameAtRequest, {
        excludeMessageId: getLatestUserMessageId(nameAtRequest)
      });
      timeoutTimer = setTimeout(function(){
        if (finished) return;
        finished = true;
        finishTyping(nameAtRequest);
        toast('AI 接口超时，请稍后重试');
      }, 60000);

      callApiOnce(messages).then(function(text){
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      finishTyping(nameAtRequest);
      var personaAtRequest = findPersona(nameAtRequest);
      var autoExpandTranslation = getCharAutoExpandTranslation(personaAtRequest);
      var transferResult;
      var segmentItems;
      if (autoExpandTranslation) {
        var parsedItems = parseCharacterAutoTranslationResponse(text);
        if (!parsedItems) {
          toast('AI 返回格式错误：同步翻译未生成，请重试');
          return;
        }
        transferResult = processAutoTranslationItems(nameAtRequest, parsedItems);
        segmentItems = transferResult.items;
      } else {
        transferResult = processAiChatDirectives(nameAtRequest, text);
        segmentItems = splitReply(transferResult.text).map(function(item){ return { text:item, translation:'' }; });
      }
      if (!segmentItems.length) {
        if (transferResult.changed) {
          saveMessages(nameAtRequest); if (currentName === nameAtRequest) { renderMessages(true); scrollBottom(true); } renderChats(); saveChats(); maybeSummarizeShortTermMemory(nameAtRequest);
          if (transferResult.incomingCall && transferResult.incomingCall.event) showIncomingVoiceCall(transferResult.incomingCall.event, transferResult.incomingCall.name);
          return;
        }
        toast('AI 返回为空'); return;
      }
      if (!Array.isArray(MESSAGES[nameAtRequest])) MESSAGES[nameAtRequest] = [];
      var index = 0;
      var lastSeg = segmentItems[segmentItems.length - 1].text;
      function appendNextSegment(){
        if (index >= segmentItems.length) {
          saveMessages(nameAtRequest);
          for (var i = 0; i < CHATS.length; i++) {
            if (CHATS[i].name === nameAtRequest) { CHATS[i].preview = lastSeg; CHATS[i].time = '刚刚'; break; }
          }
          renderChats(); saveChats();
          maybeSummarizeShortTermMemory(nameAtRequest);
          return;
        }
        var segment = segmentItems[index++];
        var aiMessage = { from:'them', text: segment.text, createdAt:Date.now() };
        if (autoExpandTranslation && segment.translation) {
          aiMessage.translation = segment.translation;
          aiMessage.translationVisible = true;
          aiMessage.translationGeneratedWithReply = true;
        }
        if (index === 1 && transferResult.replyTo) aiMessage.replyTo = Object.assign({}, transferResult.replyTo);
        MESSAGES[nameAtRequest].push(aiMessage);
        saveMessages(nameAtRequest);
        if (currentName === nameAtRequest) { renderMessages(true); scrollBottom(true); }
        announceIncomingMessage(nameAtRequest, aiMessage);
        if (index < segmentItems.length) {
          replyTimer = setTimeout(function(){ replyTimer = null; appendNextSegment(); }, 420 + Math.min(480, segment.text.length * 12));
        } else {
          for (var j = 0; j < CHATS.length; j++) {
            if (CHATS[j].name === nameAtRequest) { CHATS[j].preview = lastSeg; CHATS[j].time = '刚刚'; break; }
          }
          renderChats(); saveChats();
          maybeSummarizeShortTermMemory(nameAtRequest);
          if (transferResult.incomingCall && transferResult.incomingCall.event) showIncomingVoiceCall(transferResult.incomingCall.event, transferResult.incomingCall.name);
        }
      }
      appendNextSegment();
      }).catch(function(err){
        if (finished) return;
        finished = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        finishTyping(nameAtRequest);
        console.warn('[岛屿] AI 调用失败：', err);
        var msg = (err && err.message) ? err.message : '未知错误';
        toast((currentName === nameAtRequest ? '' : nameAtRequest + ' · ') + 'AI 调用失败：' + msg.slice(0, 50));
      });
      }).catch(function(err){
        if (finished) return;
        finished = true;
        finishTyping(nameAtRequest);
        console.warn('[岛屿] 记忆准备失败：', err);
        startAiReply();
      });
    }

    // 先把刚跨过“清晰记忆”边界的旧消息整理进历史记忆，
    // 这样长时间离开后回来聊天的第一轮也能读到已经衰减的记忆。
    maybeSummarizeShortTermMemory(nameAtRequest).then(startAiReply);
  }, typeof delay === 'number' ? delay : 200);
}

function bindChatEvents(){

  $$('.chat-tab').forEach(function(tab){
    tab.addEventListener('click', function(){ switchTab(tab.dataset.tab); });
  });

  $$('.js-back').forEach(function(btn){
    btn.addEventListener('click', closeChatApp);
  });

  $$('.js-search').forEach(function(btn){
    btn.addEventListener('click', function(){
      var panel = btn.closest('.tab-panel');
      if (!panel) return;
      panel.classList.add('is-searching');
      var input = panel.querySelector('.search-input');
      if (input) { input.value = ''; filterPanel(panel, ''); releaseInputFocus(); }
    });
  });

  $$('.search-cancel').forEach(function(btn){
    btn.addEventListener('click', function(){
      var panel = btn.closest('.tab-panel');
      if (!panel) return;
      panel.classList.remove('is-searching');
      var input = panel.querySelector('.search-input');
      if (input) input.value = '';
      filterPanel(panel, '');
    });
  });

  $$('.search-input').forEach(function(input){
    input.addEventListener('input', function(){
      var panel = input.closest('.tab-panel');
      if (panel) filterPanel(panel, input.value);
    });
  });

  if (chatApp) {
    chatApp.addEventListener('click', function(e){
      var item = e.target.closest('.list-item');
      if (item && item.dataset.name) { openPM(item.dataset.name); return; }

      var like = e.target.closest('.js-like');
      if (like) {
        var n = parseInt(like.dataset.likes, 10) || 0;
        var on = like.classList.toggle('on');
        like.textContent = '赞 ' + (on ? n + 1 : n);
        return;
      }

      var gotoUP = e.target.closest('#gotoUserPersonas');
      if (gotoUP) { openUP(); return; }

      var meItem = e.target.closest('.me-item');
      if (meItem && meItem.dataset.me) { if (meItem.dataset.me === '通知') { openSettingsApp(); switchSettingsPanel('notifications'); renderNotificationSettings(); return; } toast(meItem.dataset.me + ' · 开发中'); }
    });
  }

  if (upView) {
    upView.addEventListener('click', function(e){
      var item = e.target.closest('[data-userid]');
      if (!item) return;
      openUserSheetForEdit(item.dataset.userid);
    });
  }

  var upBack = $('upBack'); if (upBack) upBack.addEventListener('click', closeUP);
  var upAdd = $('upAdd'); if (upAdd) upAdd.addEventListener('click', openUserSheetForCreate);

  if (userSheetMask) userSheetMask.addEventListener('click', closeUserSheet);

  if (userAvatarUploadBtn) {
    userAvatarUploadBtn.addEventListener('click', function(){ userAvatarInput.click(); });
  }
  if (userAvatarInput) {
    userAvatarInput.addEventListener('change', function(){
      var file = userAvatarInput.files && userAvatarInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('请选择图片文件'); userAvatarInput.value = ''; return; }
      if (file.size > MAX_AVATAR) { toast('图片过大，请小于 4MB'); userAvatarInput.value = ''; return; }
      compressImage(file).then(function(dataUrl){
        if (!dataUrl) { toast('图片读取失败'); return; }
        userAvatarData = dataUrl;
        renderUserAvatarPreview();
      });
      userAvatarInput.value = '';
    });
  }
  if (userAvatarClearBtn) {
    userAvatarClearBtn.addEventListener('click', function(){
      userAvatarData = null;
      renderUserAvatarPreview();
    });
  }
  if (userImportFileBtn) {
    userImportFileBtn.addEventListener('click', function(){ userPersonaFileInput.click(); });
  }
  if (userPersonaFileInput) {
    userPersonaFileInput.addEventListener('change', function(){
      var file = userPersonaFileInput.files && userPersonaFileInput.files[0];
      if (!file) return;
      if (file.size > MAX_PERSONA) { toast('文件过大，请小于 512KB'); userPersonaFileInput.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function(e){
        var text = String(e.target.result || '').trim();
        if (!text) { toast('文件内容为空'); return; }
        userDescInput.value = text;
        if (!userNameInput.value.trim()) {
          var firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
          if (firstLine && firstLine.length <= 12) {
            userNameInput.value = firstLine;
            userCreateBtn.disabled = false;
          }
        }
        toast('已导入 ' + file.name);
      };
      reader.onerror = function(){ toast('文件读取失败'); };
      reader.readAsText(file);
      userPersonaFileInput.value = '';
    });
  }
  if (userNameInput) {
    userNameInput.addEventListener('input', function(){
      userCreateBtn.disabled = userNameInput.value.trim().length === 0;
    });
  }
  if (userSocialIdInput) userSocialIdInput.addEventListener('input', function(){
    if (!userNameInput.value.trim()) userCreateBtn.disabled = true;
  });
  if (userCreateBtn) userCreateBtn.addEventListener('click', submitUserPersona);
  if (deleteUserPersonaBtn) deleteUserPersonaBtn.addEventListener('click', deleteUserPersona);
  if (setUserPersonaActiveBtn) setUserPersonaActiveBtn.addEventListener('click', setUserPersonaActive);

  var pmBack = $('pmBack'); if (pmBack) pmBack.addEventListener('click', function(){
    if (messageSelectionMode) { clearMessageSelection(); renderMessages(false); }
    else closePM();
  });
  var pmMore = $('pmMore'); if (pmMore) pmMore.addEventListener('click', function(){
    if (messageSelectionMode) { deleteSelectedMessages(); }
    else toast('聊天设置 · 开发中');
  });

  if (pmQuoteCancel) pmQuoteCancel.addEventListener('click', function(){ clearMessageQuote(); });
  if (pmForwardCancel) pmForwardCancel.addEventListener('click', function(){ closeForwardPicker(); });
  if (pmForwardRecordBack) pmForwardRecordBack.addEventListener('click', function(){ closeForwardRecordView(); });
  if (pmForwardSelected) pmForwardSelected.addEventListener('click', function(){ if (messageSelectionMode) openForwardPickerForSelection(); });
  if (pmForwardSheet) pmForwardSheet.addEventListener('click', function(e){
    if (e.target === pmForwardSheet) { closeForwardPicker(); return; }
    var item = e.target.closest('[data-forward-name]');
    if (item) { e.preventDefault(); e.stopPropagation(); forwardMessageTo(item.dataset.forwardName || ''); }
  });

  if (pmInput) {
    pmInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(pmInput.value);
        pmInput.value = '';
        autoResizeInput();
        updateAiButtonVisibility();
      }
    });
    pmInput.addEventListener('input', function(){ autoResizeInput(); updateAiButtonVisibility(); });
    pmInput.addEventListener('focus', function(){ closePanel(); });
  }

  if (voiceTextInput) {
    voiceTextInput.addEventListener('input', updateVoiceTextHint);
    voiceTextInput.addEventListener('keydown', function(e){
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendTextVoiceMessage(voiceTextInput.value); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeVoiceTextComposer(); }
    });
  }
  if (voiceTextModal) voiceTextModal.addEventListener('click', function(e){ if (e.target.closest('[data-voice-text-close]')) closeVoiceTextComposer(); });
  if (voiceTextSend) voiceTextSend.addEventListener('click', function(){ sendTextVoiceMessage(voiceTextInput ? voiceTextInput.value : ''); });

  if (pmVoice) {
    pmVoice.addEventListener('click', function(){
      var on = !pmBar.classList.contains('is-voice');
      setVoiceMode(on);
      releaseInputFocus();
    });
  }
  if (pmHold) {
    pmHold.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    pmHold.addEventListener('pointerdown', function(e){
      if (voiceRecording || !currentName) return;
      e.preventDefault();
      clearVoicePressTimer();
      voicePointerActive = true; voicePointerId = e.pointerId; voiceCancelRequested = false; voiceLongPressTriggered = false; skipNextHoldClick = false;
      try { pmHold.setPointerCapture(e.pointerId); } catch(err) {}
      voicePressPending = true;
      voicePressTimer = setTimeout(function(){
        voicePressTimer = null;
        if (!voicePressPending || !voicePointerActive || voicePointerId !== e.pointerId || !currentName) return;
        voicePressPending = false; voiceLongPressTriggered = true;
        pmHold.classList.add('is-recording'); updateVoiceHoldText('正在连接'); startVoiceRecording();
      }, 360);
    });
    pmHold.addEventListener('pointermove', function(e){
      if (!voicePointerActive || voicePointerId !== e.pointerId || !voiceLongPressTriggered) return;
      handleVoicePointerMove(e);
    });
    pmHold.addEventListener('pointerup', function(e){
      if (e.pointerId !== voicePointerId) return;
      e.preventDefault();
      var wasLongPress = voiceLongPressTriggered || voiceRecording;
      clearVoicePressTimer(); voicePointerActive = false;
      if (wasLongPress) { skipNextHoldClick = true; finishVoiceRecording(voiceCancelRequested); }
      else { voiceLongPressTriggered = false; skipNextHoldClick = true; openVoiceHoldTextComposer(); }
    });
    pmHold.addEventListener('pointercancel', function(e){
      if (voicePointerId != null && e.pointerId !== voicePointerId) return;
      clearVoicePressTimer(); voicePointerActive = false;
      if (voiceRecording || voiceLongPressTriggered) finishVoiceRecording(true);
      voiceLongPressTriggered = false;
    });
    pmHold.addEventListener('lostpointercapture', function(){
      if (voicePointerActive && !voiceLongPressTriggered) clearVoicePressTimer();
      if (voiceRecording && voicePointerActive) { voicePointerActive = false; finishVoiceRecording(true); }
    });
    pmHold.addEventListener('click', function(e){
      if (skipNextHoldClick) { e.preventDefault(); skipNextHoldClick = false; return; }
      if (!voiceRecording && !voiceLongPressTriggered && currentName) openVoiceHoldTextComposer();
    });
  }
  if (pmEmojiBtn) pmEmojiBtn.addEventListener('click', function(){ openPanel('sticker'); if (pmEmojiBtn) pmEmojiBtn.classList.toggle('is-on', panelMode === 'sticker'); });
  if (pmPlusBtn) pmPlusBtn.addEventListener('click', function(){ openPanel('tools'); });

  if (pmVoiceCallBack) pmVoiceCallBack.addEventListener('click', function(){ if (voiceCallState.incoming) rejectIncomingVoiceCall(); else closeVoiceCallView(); });
  if (pmVoiceCallEnd) pmVoiceCallEnd.addEventListener('click', function(){ closeVoiceCallView(); });
  if (pmVoiceCallIncomingAccept) pmVoiceCallIncomingAccept.addEventListener('click', function(){ acceptIncomingVoiceCall(); });
  if (pmVoiceCallIncomingDecline) pmVoiceCallIncomingDecline.addEventListener('click', function(){ rejectIncomingVoiceCall(); });

  if (pmVoiceCallMicBtn) {
    pmVoiceCallMicBtn.addEventListener('click', function(){
      if (!voiceCallState.active || voiceCallState.processing) return;
      voiceCallState.textMode = false;
      voiceCallState.resumeMicAfterText = false;
      if (voiceCallState.micOn) {
        stopVoiceCallMic();
        setVoiceCallStatus('麦克风已关闭');
      } else {
        startVoiceCallMic();
      }
      updateVoiceCallControls();
    });
  }

  if (pmVoiceCallSend) pmVoiceCallSend.addEventListener('click', function(){ sendVoiceCallText(); });
  if (pmVoiceCallInput) {
    pmVoiceCallInput.addEventListener('input', function(){
      pmVoiceCallInput.style.height = 'auto';
      pmVoiceCallInput.style.height = Math.min(pmVoiceCallInput.scrollHeight, 96) + 'px';
    });
    pmVoiceCallInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendVoiceCallText();
      }
      if (e.key === 'Escape' && voiceCallState.textMode) {
        e.preventDefault();
        voiceCallState.textMode = false;
        voiceCallState.resumeMicAfterText = false;
        updateVoiceCallControls();
      }
    });
  }
  if (charLanguageOptions) charLanguageOptions.addEventListener('click', function(e){
    var option = e.target.closest('[data-char-language]');
    if (!option) return;
    saveCurrentCharacterLanguage(option.dataset.charLanguage || 'zh-CN');
  });
  if (charLanguageSplitToggle) {
    charLanguageSplitToggle.addEventListener('click', function(e){
      e.preventDefault();
      var persona = findPersona(currentName);
      if (!persona) return;
      var splitEnabled = charLanguageSplitToggle.getAttribute('aria-checked') === 'true';
      persona.splitPromptEnabled = !splitEnabled;
      // 继续写入旧字段，兼容仍读取旧数据的版本；真正的开关以 splitPromptEnabled 为准。
      persona.disableSplitPromptForNonChinese = !persona.splitPromptEnabled;
      savePersonas().then(function(){ renderCharLanguageModal(); });
    });
  }
  if (charLanguageAutoTranslateToggle) {
    charLanguageAutoTranslateToggle.addEventListener('click', function(e){
      e.preventDefault();
      var persona = findPersona(currentName);
      if (!persona) return;
      var enabled = charLanguageAutoTranslateToggle.getAttribute('aria-checked') === 'true';
      persona.autoExpandTranslation = !enabled;
      persona.autoExpandTranslationUserSet = true;
      savePersonas().then(function(){ renderCharLanguageModal(); });
    });
  }
  if (charLanguageDone) charLanguageDone.addEventListener('click', closeCharLanguageModal);
  $$('[data-char-language-close]').forEach(function(el){ el.addEventListener('click', closeCharLanguageModal); });
  $$('[data-location-close]').forEach(function(el){ el.addEventListener('click', closeLocationModal); });
  $$('[data-location-custom-close]').forEach(function(el){ el.addEventListener('click', closeLocationCustomModal); });
  $$('[data-location-action]').forEach(function(el){
    el.addEventListener('click', function(){
      var action = el.dataset.locationAction;
      if (action === 'current') shareCurrentLocation();
      else if (action === 'virtual') openLocationCustomModal();
    });
  });
  if (pmImageTextModal) pmImageTextModal.addEventListener('click', function(e){
    var close = e.target.closest('[data-image-text-close]');
    if (close) { closeImageTextModal(); return; }
  });
  if (pmMediaViewModal) pmMediaViewModal.addEventListener('click', function(e){
    var close = e.target.closest('[data-media-view-close]');
    if (close) { closeMediaViewModal(); return; }
  });
  if (pmFileViewModal) pmFileViewModal.addEventListener('click', function(e){
    var close = e.target.closest('[data-file-view-close]');
    if (close) { closeFileViewModal(); return; }
  });
  if (pmTransferModal) pmTransferModal.addEventListener('click', function(e){
    var close = e.target.closest('[data-transfer-close]');
    if (close) { closeTransferModal(); return; }
    var quick = e.target.closest('[data-transfer-quick]');
    if (quick && pmTransferAmount) { pmTransferAmount.value = quick.dataset.transferQuick || ''; pmTransferAmount.focus(); updateTransferHint('已填入快捷金额，可继续修改。', false); }
  });
  if (pmTransferAmount) pmTransferAmount.addEventListener('input', function(){
    if (pmTransferHint && pmTransferHint.classList.contains('is-error')) updateTransferHint('请输入 0.01～99,999,999.99 元。', false);
  });
  if (pmTransferAmount) pmTransferAmount.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); sendTransferMessage(); }
    if (e.key === 'Escape') { e.preventDefault(); closeTransferModal(); }
  });
  if (pmTransferNote) pmTransferNote.addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendTransferMessage(); }
    if (e.key === 'Escape') { e.preventDefault(); closeTransferModal(); }
  });
  if (pmTransferSend) pmTransferSend.addEventListener('click', sendTransferMessage);
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    if (pmImageTextModal && pmImageTextModal.classList.contains('is-open')) { closeImageTextModal(); return; }
    if (pmMediaViewModal && pmMediaViewModal.classList.contains('is-open')) { closeMediaViewModal(); return; }
    if (pmFileViewModal && pmFileViewModal.classList.contains('is-open')) closeFileViewModal();
  });
  if (pmLocationCustomSend) pmLocationCustomSend.addEventListener('click', sendCustomLocation);
  if (pmLocationMapBack) pmLocationMapBack.addEventListener('click', closeLocationMapView);
  if (pmLocationMapApps) pmLocationMapApps.addEventListener('click', function(){ openMapAppChooser(activeLocationMapMessage); });
  if (pmLocationMapAppsFallback) pmLocationMapAppsFallback.addEventListener('click', function(){ openMapAppChooser(activeLocationMapMessage); });
  if (pmLocationMapOpen) pmLocationMapOpen.addEventListener('click', function(){ openMapAppChooser(activeLocationMapMessage); });
  if (pmLocationMapFrame) pmLocationMapFrame.addEventListener('error', function(){ if (pmLocationMapFallback) pmLocationMapFallback.hidden = false; });
  if (pmMemoryHomeBack) pmMemoryHomeBack.addEventListener('click', function(){
    closeMemoryViews();
  });
  if (pmMemoryClearButton) pmMemoryClearButton.addEventListener('click', openMemoryClearModal);
  if (pmMemoryClearCancel) pmMemoryClearCancel.addEventListener('click', closeMemoryClearModal);
  if (pmMemoryClearConfirm) pmMemoryClearConfirm.addEventListener('click', applyMemoryClearSelection);
  if (pmMemoryClearAll) pmMemoryClearAll.addEventListener('change', function(){
    var on=!!pmMemoryClearAll.checked;
    if(pmMemoryClearSummary) pmMemoryClearSummary.checked=on;
    if(pmMemoryClearImportant) pmMemoryClearImportant.checked=on;
    if(pmMemoryClearVector) pmMemoryClearVector.checked=on;
  });
  [pmMemoryClearSummary,pmMemoryClearImportant,pmMemoryClearVector].forEach(function(el){ if(el) el.addEventListener('change', updateMemoryClearAllState); });
  if (pmMemoryClearModal) pmMemoryClearModal.addEventListener('click', function(e){ if(e.target===pmMemoryClearModal) closeMemoryClearModal(); });
  if (pmShortTermMemoryEntry) pmShortTermMemoryEntry.addEventListener('click', openShortTermMemoryPage);
  if (pmFuzzyMemoryEntry) pmFuzzyMemoryEntry.addEventListener('click', openFuzzyMemoryPage);
  if (pmFishMemoryEntry) pmFishMemoryEntry.addEventListener('click', openFishMemoryPage);
  if (pmImportantMemoryEntry) pmImportantMemoryEntry.addEventListener('click', openImportantMemoryPage);
  if (pmVectorMemoryEntry) pmVectorMemoryEntry.addEventListener('click', openVectorMemoryPage);
  if (pmVectorMemoryBack) pmVectorMemoryBack.addEventListener('click', closeVectorMemoryPage);
  if (pmMemoryRetrievalMode) pmMemoryRetrievalMode.addEventListener('click', function(e){ var btn=e.target.closest('[data-memory-mode]'); if(btn) setMemoryRetrievalMode(btn.dataset.memoryMode); });
  if (pmVectorMemoryList) pmVectorMemoryList.addEventListener('click', function(e){
    var selectAll=e.target.closest('[data-vector-memory-select-all]'); if(selectAll){ toggleAllVectorMemorySelection(); return; }
    var deleteSelected=e.target.closest('[data-vector-memory-delete-selected]'); if(deleteSelected && !deleteSelected.disabled){ deleteSelectedVectorMemories(); return; }
    var up=e.target.closest('[data-vector-memory-up]'); if(up){ updateVectorMemoryOrder(currentName,up.dataset.vectorMemoryUp,-1); return; }
    var down=e.target.closest('[data-vector-memory-down]'); if(down){ updateVectorMemoryOrder(currentName,down.dataset.vectorMemoryDown,1); return; }
    var edit=e.target.closest('[data-vector-memory-edit]'); if(edit){ editVectorMemoryEntry(edit.dataset.vectorMemoryEdit); return; }
    var del=e.target.closest('[data-vector-memory-delete]'); if(del){ deleteVectorMemoryEntry(del.dataset.vectorMemoryDelete); return; }
  });
  if (pmVectorMemoryList) pmVectorMemoryList.addEventListener('change', function(e){
    var input=e.target.closest('[data-vector-memory-select]'); if(!input) return;
    setVectorMemorySelected(input.getAttribute('data-vector-memory-select') || '', !!input.checked);
  });
  var vectorAdd = $('pmVectorMemoryAdd'); if (vectorAdd) vectorAdd.addEventListener('click', addManualVectorMemory);
  var vectorSync = $('pmVectorMemorySync'); if (vectorSync) vectorSync.addEventListener('click', function(){ if(!currentName)return; vectorSync.disabled=true; extractVectorMemoriesFromChatHistory(currentName).then(function(ok){toast(ok?'已从原始聊天提取语义记忆':'没有新增可提取的语义记忆');}).catch(function(e){toast('提取失败：'+(e&&e.message||'未知错误'));}).then(function(){vectorSync.disabled=false; renderVectorMemoryPage();}); });
  if (pmMemoryBack) pmMemoryBack.addEventListener('click', closeMemoryPage);
  if (pmFuzzyMemoryBack) pmFuzzyMemoryBack.addEventListener('click', closeMemoryTierPage);
  if (pmFishMemoryBack) pmFishMemoryBack.addEventListener('click', closeMemoryTierPage);
  if (pmImportantMemoryBack) pmImportantMemoryBack.addEventListener('click', closeImportantMemoryPage);
  if (pmMemorySummarySearch) pmMemorySummarySearch.addEventListener('input', function(){ renderMemorySummaryHistory(); });
  if (pmMemorySummarySearchClear) pmMemorySummarySearchClear.addEventListener('click', function(){
    if (pmMemorySummarySearch) { pmMemorySummarySearch.value = ''; pmMemorySummarySearch.focus(); }
    renderMemorySummaryHistory();
  });
  function saveMemoryAgingField(field, key, fallback){
    if (!currentName || !field) return;
    var policy = normalizeMemoryAgingPolicy(currentName);
    var value = parseInt(field.value, 10);
    if (!Number.isFinite(value)) value = fallback;
    policy[key] = Math.max(1, value);
    if (policy.fuzzyDays <= policy.clearDays) policy.fuzzyDays = policy.clearDays + 1;
    if (policy.fishDays <= policy.fuzzyDays) policy.fishDays = policy.fuzzyDays + 1;
    var memState = normalizeChatMemory(currentName);
    memState.memoryAging = policy;
    saveMemoryState().then(function(){ renderMemoryPage(); });
  }
  if (pmMemoryClearDays) pmMemoryClearDays.addEventListener('change', function(){
    saveMemoryAgingField(pmMemoryClearDays, 'clearDays', DEFAULT_MEMORY_AGING_POLICY.clearDays);
  });
  if (pmMemoryFuzzyDays) pmMemoryFuzzyDays.addEventListener('change', function(){
    saveMemoryAgingField(pmMemoryFuzzyDays, 'fuzzyDays', DEFAULT_MEMORY_AGING_POLICY.fuzzyDays + 1);
  });
  if (pmMemoryFishDays) pmMemoryFishDays.addEventListener('change', function(){
    saveMemoryAgingField(pmMemoryFishDays, 'fishDays', DEFAULT_MEMORY_AGING_POLICY.fishDays);
  });
  if (pmMemoryContextDepth) pmMemoryContextDepth.addEventListener('change', function(){
    var cfg = getMemorySettings();
    var value = parseInt(pmMemoryContextDepth.value, 10);
    cfg.contextDepth = Number.isFinite(value) && value > 0 ? value : 40;
    pmMemoryContextDepth.value = String(cfg.contextDepth);
    saveSettings();
    renderMemoryPage();
    maybeSummarizeShortTermMemory(currentName);
  });
  if (pmMemorySummaryThreshold) pmMemorySummaryThreshold.addEventListener('change', function(){
    var cfg = getMemorySettings();
    var value = parseInt(pmMemorySummaryThreshold.value, 10);
    cfg.summaryThreshold = Number.isFinite(value) && value > 0 ? value : 20;
    pmMemorySummaryThreshold.value = String(cfg.summaryThreshold);
    saveSettings();
    renderMemoryPage();
    maybeSummarizeShortTermMemory(currentName);
  });
  if (pmMemorySummaryPreset) {
    pmMemorySummaryPreset.addEventListener('change', function(){
      var cfg = getMemorySettings();
      var id = String(pmMemorySummaryPreset.value || 'default');
      var hit = id === 'default' ? { id:'default', prompt:DEFAULT_MEMORY_SUMMARY_PROMPT } : (cfg.summaryPresets || []).find(function(p){ return p.id === id; });
      if (!hit) return;
      cfg.activeSummaryPresetId = id;
      cfg.summaryPrompt = String(hit.prompt || DEFAULT_MEMORY_SUMMARY_PROMPT).trim() || DEFAULT_MEMORY_SUMMARY_PROMPT;
      saveSettings().then(function(){ renderMemoryPage(); });
    });
  }
  var pmMemorySummaryPresetList = $('pmMemorySummaryPresetList');
  if (pmMemorySummaryPresetList) {
    pmMemorySummaryPresetList.addEventListener('click', function(e){
      var selectBtn = e.target.closest('[data-memory-summary-preset-id]');
      if (selectBtn) {
        var cfg = getMemorySettings();
        var id = String(selectBtn.getAttribute('data-memory-summary-preset-id') || 'default');
        var hit = id === 'default' ? { id:'default', prompt:DEFAULT_MEMORY_SUMMARY_PROMPT } : (cfg.summaryPresets || []).find(function(p){ return p.id === id; });
        if (!hit) return;
        cfg.activeSummaryPresetId = id;
        cfg.summaryPrompt = String(hit.prompt || DEFAULT_MEMORY_SUMMARY_PROMPT).trim() || DEFAULT_MEMORY_SUMMARY_PROMPT;
        saveSettings().then(function(){ renderMemoryPage(); toast('已切换总结预设“' + (hit.name || '默认总结') + '”'); });
        return;
      }
      var deleteBtn = e.target.closest('[data-memory-summary-preset-delete]');
      if (deleteBtn) deleteMemorySummaryPreset(deleteBtn.getAttribute('data-memory-summary-preset-delete') || '');
    });
  }
  var pmMemorySummaryPresetNew = $('pmMemorySummaryPresetNew');
  var pmMemorySummaryPresetUpdate = $('pmMemorySummaryPresetUpdate');
  if (pmMemorySummaryPresetNew) pmMemorySummaryPresetNew.addEventListener('click', saveMemorySummaryAsPreset);
  if (pmMemorySummaryPresetUpdate) pmMemorySummaryPresetUpdate.addEventListener('click', saveMemorySummaryPreset);
  if (pmMemorySummaryPrompt) {
    pmMemorySummaryPrompt.addEventListener('change', function(){
      var cfg = getMemorySettings();
      var value = String(pmMemorySummaryPrompt.value || '').trim() || DEFAULT_MEMORY_SUMMARY_PROMPT;
      cfg.summaryPrompt = value;
      saveSettings();
    });
  }
  if (pmMemorySummaryRetryPrompt) {
    pmMemorySummaryRetryPrompt.addEventListener('change', function(){
      var cfg = getMemorySettings();
      var value = String(pmMemorySummaryRetryPrompt.value || '').trim() || DEFAULT_MEMORY_SUMMARY_RETRY_PROMPT;
      cfg.summaryRetryPrompt = value;
      saveSettings().then(function(){ toast('已保存敏感内容总结处理规则'); });
    });
  }
  if (pmMemorySummaryRetrySave) pmMemorySummaryRetrySave.addEventListener('click', function(){
    var cfg = getMemorySettings();
    var value = String(pmMemorySummaryRetryPrompt ? pmMemorySummaryRetryPrompt.value : '').trim() || DEFAULT_MEMORY_SUMMARY_RETRY_PROMPT;
    cfg.summaryRetryPrompt = value;
    if (pmMemorySummaryRetryPrompt) pmMemorySummaryRetryPrompt.value = value;
    saveSettings().then(function(){ toast('已保存敏感内容总结处理规则'); });
  });
  if (pmMemorySummaryRetryRun) pmMemorySummaryRetryRun.addEventListener('click', function(){
    if (!currentName) return;
    pmMemorySummaryRetryRun.disabled = true;
    pmMemorySummaryRetryRun.textContent = '重试中…';
    maybeSummarizeShortTermMemory(currentName, true, true).then(function(){
      pmMemorySummaryRetryRun.disabled = false;
      pmMemorySummaryRetryRun.textContent = '用处理规则重试';
      renderMemoryPage();
    });
  });
  if (pmMemorySummaryHistory) {
    pmMemorySummaryHistory.addEventListener('click', function(e){
      var selectAllBtn = e.target.closest('[data-memory-summary-select-all]');
      if (selectAllBtn) { toggleAllMemorySummarySelection(); return; }
      var deleteSelectedBtn = e.target.closest('[data-memory-summary-delete-selected]');
      if (deleteSelectedBtn && !deleteSelectedBtn.disabled) { deleteSelectedChatMemorySummaries(); return; }
      var selectInput = e.target.closest('[data-memory-summary-select]');
      if (selectInput) {
        setMemorySummarySelected(selectInput.getAttribute('data-memory-summary-select') || '', !!selectInput.checked);
        return;
      }
      var editBtn = e.target.closest('[data-memory-summary-edit]');
      if (editBtn) { startEditChatMemorySummary(editBtn.getAttribute('data-memory-summary-edit') || ''); return; }
      var saveEditBtn = e.target.closest('[data-memory-summary-save-edit]');
      if (saveEditBtn) { saveEditedChatMemorySummary(saveEditBtn.getAttribute('data-memory-summary-save-edit') || ''); return; }
      var cancelEditBtn = e.target.closest('[data-memory-summary-cancel-edit]');
      if (cancelEditBtn) { cancelEditChatMemorySummary(); return; }
      var btn = e.target.closest('[data-memory-summary-delete]');
      if (!btn) return;
      var id = btn.getAttribute('data-memory-summary-delete') || '';
      if (!id) return;
      if (!window.confirm('确定删除这条已总结的记忆记录吗？聊天原文不会被删除。')) return;
      deleteChatMemorySummary(id);
    });
    pmMemorySummaryHistory.addEventListener('change', function(e){
      var selectInput = e.target.closest('[data-memory-summary-select]');
      if (!selectInput) return;
      setMemorySummarySelected(selectInput.getAttribute('data-memory-summary-select') || '', !!selectInput.checked);
    });
  }
  if (pmMemorySummarize) pmMemorySummarize.addEventListener('click', function(){
    if (!currentName) return;
    pmMemorySummarize.disabled = true;
    pmMemorySummarize.textContent = '总结中…';
    var list = Array.isArray(MESSAGES[currentName]) ? MESSAGES[currentName] : [];
    var mem = normalizeChatMemory(currentName);
    if (list.length <= mem.summarizedThrough) {
      pmMemorySummarize.disabled = false; pmMemorySummarize.textContent = '立即总结当前聊天';
      showMemorySummaryNotice('没有新的消息', '当前聊天里没有尚未总结的新消息。', false, 1800);
      return;
    }
    maybeSummarizeShortTermMemory(currentName, true).then(function(ok){
      if (!ok && pmMemoryHint && !pmMemoryHint.textContent) pmMemoryHint.textContent = '本次总结未完成。';
      pmMemorySummarize.disabled = false; pmMemorySummarize.textContent = '立即总结当前聊天';
      renderMemoryPage();
    });
  });
  if (pmMemoryImportantAdd) pmMemoryImportantAdd.addEventListener('click', addCustomImportantMemory);
  if (pmMemoryImportantExtract) pmMemoryImportantExtract.addEventListener('click', function(){
    pmMemoryImportantExtract.disabled = true;
    pmMemoryImportantExtract.textContent = '摘取中…';
    extractImportantMemories().then(function(){
      pmMemoryImportantExtract.disabled = false;
      pmMemoryImportantExtract.textContent = '摘取重要记忆';
      renderMemoryPage();
      renderImportantMemoryPage();
    });
  });
  var pmMemoryImportantList = $('pmMemoryImportantList');
  if (pmMemoryImportantList) {
    pmMemoryImportantList.addEventListener('click', function(e){
      var selectAllBtn = e.target.closest('[data-important-memory-select-all]');
      if (selectAllBtn) { toggleAllImportantMemorySelection(); return; }
      var deleteSelectedBtn = e.target.closest('[data-important-memory-delete-selected]');
      if (deleteSelectedBtn && !deleteSelectedBtn.disabled) { deleteSelectedImportantMemories(); return; }
      var btn = e.target.closest('[data-important-memory-delete]');
      if (!btn) return;
      var id = btn.getAttribute('data-important-memory-delete') || '';
      if (!id) return;
      if (window.confirm('确定删除这条重要记忆吗？')) deleteImportantMemory(id);
    });
    pmMemoryImportantList.addEventListener('change', function(e){
      var input = e.target.closest('[data-important-memory-select]');
      if (!input) return;
      setImportantMemorySelected(input.getAttribute('data-important-memory-select') || '', !!input.checked);
    });
  }

  if (pmPanelInner) {
    pmPanelInner.addEventListener('click', function(e){
      var sticker = e.target.closest('[data-sticker-url]');
      if (sticker) {
        if (stickerIgnoreNextClick) { stickerIgnoreNextClick = false; return; }
        var stickerId = sticker.dataset.stickerId || '';
        if (stickerSelectionMode) { toggleStickerSelection(stickerId); return; }
        sendSticker(sticker.dataset.stickerUrl); return;
      }
      var group = e.target.closest('[data-sticker-group]');
      if (group) { clearStickerSelection(); var st = getStickerState(); st.activeGroupId = group.dataset.stickerGroup; saveStickers().then(function(){ renderStickerPanelInto(); }); return; }
      var manage = e.target.closest('[data-sticker-manage]');
      if (manage) {
        var action = manage.dataset.stickerManage;
        if (action === 'import') { pmPanel.classList.add('is-sticker-manage'); pmPanelInner.innerHTML = renderStickerImportPanel(); }
        else if (action === 'groups') { pmPanel.classList.add('is-sticker-manage'); pmPanelInner.innerHTML = renderStickerGroupsPanel(); }
        else if (action === 'move-panel') { pmPanel.classList.add('is-sticker-manage'); pmPanelInner.innerHTML = renderStickerMovePanel(); }
        else if (action === 'back') { renderStickerPanelInto(); }
        return;
      }
      var actionBtn = e.target.closest('[data-sticker-action]');
      if (actionBtn) {
        var actionName = actionBtn.dataset.stickerAction;
        if (actionName === 'import') importStickerUrls();
        else if (actionName === 'choose-file') { var input = $('stickerFileInput'); if (input) input.click(); }
        else if (actionName === 'add-group') addStickerGroup();
        else if (actionName === 'select-all') selectAllStickers();
        else if (actionName === 'move-group') { if (!selectedStickerCount()) { toast('请先选择表情包'); } else { pmPanel.classList.add('is-sticker-manage'); pmPanelInner.innerHTML = renderStickerMovePanel(); } }
        else if (actionName === 'delete-selected') deleteSelectedStickers();
        else if (actionName === 'cancel-select') { clearStickerSelection(); renderStickerPanelInto(); }
        return;
      }
      var moveGroup = e.target.closest('[data-sticker-move-to]');
      if (moveGroup) { moveSelectedStickers(moveGroup.dataset.stickerMoveTo); return; }
      var delGroup = e.target.closest('[data-sticker-delete-group]');
      if (delGroup) { deleteStickerGroup(delGroup.dataset.stickerDeleteGroup); return; }
      var imageTool = e.target.closest('[data-tool="图片"]');
      if (imageTool) { if (pmImageInput) { pmImageInput.value = ''; pmImageInput.click(); } return; }
      var cameraTool = e.target.closest('[data-tool="拍摄"]');
      if (cameraTool) { if (pmCameraInput) { pmCameraInput.value = ''; pmCameraInput.click(); } return; }
      var fileTool = e.target.closest('[data-tool="文件"]');
      if (fileTool) { if (pmFileInput) { pmFileInput.value = ''; pmFileInput.click(); } return; }
      var voiceCallTool = e.target.closest('[data-tool="语音通话"]');
      if (voiceCallTool) { openVoiceCallView(); return; }
      var locationTool = e.target.closest('[data-tool="位置"]');
      if (locationTool) { openLocationModal(); return; }
      var transferTool = e.target.closest('[data-tool="转账"]');
      if (transferTool) { openTransferModal(); return; }
      var languageTool = e.target.closest('[data-tool="语言"]');
      if (languageTool) { renderCharLanguageModal(); return; }
      var roleCardTool = e.target.closest('[data-tool="角色卡"]');
      if (roleCardTool) {
        closePanel();
        if (currentName) openPersonaSheetForEdit(currentName); else toast('请先进入一个角色聊天');
        return;
      }
      var memoryTool = e.target.closest('[data-tool="记忆"]');
      if (memoryTool) { openMemoryPage(); return; }
      var tool = e.target.closest('[data-tool]');
      if (tool) toast(tool.dataset.tool + ' · 开发中');
    });
    pmPanelInner.addEventListener('change', function(e){
      if (e.target && e.target.id === 'stickerFileInput') importStickerFiles(e.target.files);
    });
    function beginStickerLongPress(sticker, x, y){
      if (!sticker || stickerSelectionMode || stickerLongPressTimer) return;
      stickerLongPressMoveX = Number.isFinite(x) ? x : 0;
      stickerLongPressMoveY = Number.isFinite(y) ? y : 0;
      stickerLongPressTriggered = false;
      var id = sticker.dataset.stickerId || '';
      sticker.classList.add('is-selecting');
      stickerLongPressTimer = setTimeout(function(){
        stickerLongPressTimer = 0;
        sticker.classList.remove('is-selecting');
        enterStickerSelection(id);
      }, 430);
    }
    function cancelStickerLongPress(){
      if (stickerLongPressTimer) { clearTimeout(stickerLongPressTimer); stickerLongPressTimer = 0; }
      $$('.sticker-item.is-selecting', pmPanelInner).forEach(function(el){ el.classList.remove('is-selecting'); });
    }
    pmPanelInner.addEventListener('pointerdown', function(e){
      var sticker = e.target.closest('[data-sticker-id]');
      if (!sticker || !pmPanelInner.contains(sticker) || stickerSelectionMode) return;
      beginStickerLongPress(sticker, e.clientX, e.clientY);
    });
    pmPanelInner.addEventListener('pointermove', function(e){
      if (!stickerLongPressTimer) return;
      var dx = (e.clientX || 0) - stickerLongPressMoveX;
      var dy = (e.clientY || 0) - stickerLongPressMoveY;
      if ((dx * dx + dy * dy) > 900) cancelStickerLongPress();
    });
    pmPanelInner.addEventListener('pointerup', cancelStickerLongPress);
    pmPanelInner.addEventListener('pointercancel', cancelStickerLongPress);
    // Pointer Events 统一处理鼠标 / 触摸，避免图片元素吞掉长按事件。
    pmPanelInner.addEventListener('contextmenu', function(e){
      if (e.target.closest('[data-sticker-id]')) e.preventDefault();
    });
  }
  if (pmImageInput) pmImageInput.addEventListener('change', function(){ sendChatImageFiles(pmImageInput.files); });
  if (pmCameraInput) pmCameraInput.addEventListener('change', function(){ sendChatImageFiles(pmCameraInput.files); });
  if (pmFileInput) pmFileInput.addEventListener('change', function(){ sendChatFiles(pmFileInput.files); });
  if (pmIncomingCallAccept) pmIncomingCallAccept.addEventListener('click', function(){ acceptIncomingVoiceCall(); });
  if (pmIncomingCallDecline) pmIncomingCallDecline.addEventListener('click', function(){ rejectIncomingVoiceCall(); });
  if (pmScroll) {
    pmScroll.addEventListener('click', function(e){
      var mediaView = e.target.closest('[data-media-view-index]');
      if (mediaView && pmScroll.contains(mediaView) && !messageSelectionMode) {
        if (messageLongPressState.triggered) { messageLongPressState.triggered = false; return; }
        e.preventDefault();
        openMediaViewModal(Number(mediaView.dataset.mediaViewIndex));
        return;
      }
      var imageTextCard = e.target.closest('[data-image-text-index]');
      if (imageTextCard && pmScroll.contains(imageTextCard)) {
        e.preventDefault();
        openImageTextModal(Number(imageTextCard.dataset.imageTextIndex));
        return;
      }
      var fileCard = e.target.closest('[data-file-view-index]');
      if (fileCard && pmScroll.contains(fileCard) && !messageSelectionMode) {
        if (messageLongPressState.triggered) { messageLongPressState.triggered = false; return; }
        e.preventDefault();
        openFileViewModal(Number(fileCard.dataset.fileViewIndex));
        return;
      }
      var transferAction = e.target.closest('[data-transfer-action]');
      if (transferAction && pmScroll.contains(transferAction)) {
        e.preventDefault();
        var transferIndex = Number(transferAction.dataset.transferIndex);
        var transferActionName = transferAction.dataset.transferAction || '';
        if (transferActionName === 'accept') respondToIncomingTransfer(transferIndex, 'received');
        else if (transferActionName === 'decline') respondToIncomingTransfer(transferIndex, 'declined');
        return;
      }
      var locationCard = e.target.closest('[data-location-open]');
      if (!locationCard || !pmScroll.contains(locationCard)) return;
      var index = Number(locationCard.dataset.locationOpen);
      var list = MESSAGES[currentName] || [];
      var msg = list[index];
      if (msg && msg.type === 'location') openSharedLocation(msg);
    });
    var activeVoiceAudio = null;
    var activeVoiceButton = null;
    pmScroll.addEventListener('pointerdown', function(e){
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      closeVoiceMessageActionMenu();
      var row = e.target.closest('.chat-message[data-message-index]');
      if (!row || !pmScroll.contains(row)) return;
      var index = Number(row.dataset.messageIndex);
      if (!Number.isInteger(index)) return;
      if (messageSelectionMode) return;
      if (messageLongPressState.timer) clearTimeout(messageLongPressState.timer);
      messageLongPressState.pointerId = e.pointerId;
      messageLongPressState.row = row;
      messageLongPressState.index = index;
      messageLongPressState.startX = e.clientX || 0;
      messageLongPressState.startY = e.clientY || 0;
      messageLongPressState.triggered = false;
      messageLongPressState.timer = setTimeout(function(){
        messageLongPressState.timer = null;
        messageLongPressState.triggered = true;
        renderMessageActionMenu(index, row);
        try { if (navigator.vibrate) navigator.vibrate(18); } catch(err) {}
      }, 450);
    });
    pmScroll.addEventListener('pointermove', function(e){
      if (messageLongPressState.pointerId !== e.pointerId || !messageLongPressState.timer) return;
      var dx = (e.clientX || 0) - messageLongPressState.startX, dy = (e.clientY || 0) - messageLongPressState.startY;
      if ((dx * dx + dy * dy) > 196) {
        clearTimeout(messageLongPressState.timer);
        messageLongPressState.timer = null;
        messageLongPressState.row = null;
      }
    });
    pmScroll.addEventListener('pointerup', function(e){
      if (messageLongPressState.pointerId !== e.pointerId) return;
      if (messageLongPressState.timer) { clearTimeout(messageLongPressState.timer); messageLongPressState.timer = null; }
      if (messageLongPressState.triggered) e.preventDefault();
      var avatar = e.target.closest && e.target.closest('.chat-message__char-avatar');
      var userAvatar = e.target.closest && e.target.closest('.chat-message__user-avatar');
      if (avatar && pmScroll.contains(avatar) && !messageSelectionMode && !messageLongPressState.triggered) {
        if (handleAvatarDoubleTap(avatar, e, 'char')) {
          e.preventDefault();
          e.stopPropagation();
          charAvatarTapState.time = 0;
        }
      } else if (userAvatar && pmScroll.contains(userAvatar) && !messageSelectionMode && !messageLongPressState.triggered) {
        if (handleAvatarDoubleTap(userAvatar, e, 'user')) {
          e.preventDefault();
          e.stopPropagation();
          charAvatarTapState.time = 0;
        }
      }
      messageLongPressState.pointerId = null;
      messageLongPressState.row = null;
      messageLongPressState.index = -1;
      messageLongPressState.triggered = false;
    });
    pmScroll.addEventListener('pointercancel', function(e){
      if (messageLongPressState.pointerId !== e.pointerId) return;
      charAvatarTapState.element = null;
      charAvatarTapState.time = 0;
      if (messageLongPressState.timer) clearTimeout(messageLongPressState.timer);
      messageLongPressState.timer = null;
      messageLongPressState.pointerId = null;
      messageLongPressState.row = null;
      messageLongPressState.index = -1;
      messageLongPressState.triggered = false;
    });
    pmScroll.addEventListener('contextmenu', function(e){
      if (e.target.closest('.chat-message')) e.preventDefault();
    });
    pmScroll.addEventListener('click', function(e){
      var selectCheck = e.target.closest('[data-message-select-index]');
      if (selectCheck && pmScroll.contains(selectCheck)) {
        e.preventDefault(); e.stopPropagation();
        if (messageSelectionMode) toggleMessageSelected(Number(selectCheck.dataset.messageSelectIndex));
        return;
      }
      var quoteEl = e.target.closest('.pm-bubble-quote');
      if (quoteEl && pmScroll.contains(quoteEl) && !messageSelectionMode) {
        e.preventDefault();
        locateQuotedMessage(quoteEl);
        return;
      }

      var row = e.target.closest('.chat-message[data-message-index]');
      if (row && pmScroll.contains(row) && messageSelectionMode) {
        if (e.target.closest('button, a, input, select, textarea')) return;
        e.preventDefault();
        toggleMessageSelected(Number(row.dataset.messageIndex));
        return;
      }

      var chatRecordCard = e.target.closest('.chat-bubble--chat-record');
      if (chatRecordCard && pmScroll.contains(chatRecordCard) && !messageSelectionMode) {
        var recordRow = chatRecordCard.closest('.chat-message[data-message-index]');
        if (recordRow) {
          e.preventDefault();
          openForwardRecordView(Number(recordRow.dataset.messageIndex));
          return;
        }
      }

      var popoverAction = e.target.closest('[data-message-action]');
      if (popoverAction && pmMessageActionPopover && pmMessageActionPopover.contains(popoverAction)) {
        var action = popoverAction.dataset.messageAction || '';
        var index = Number(popoverAction.dataset.messageActionIndex);
        closeVoiceMessageActionMenu();
        if (action === 'transcribe') toggleVoiceTranscript(index);
        else if (action === 'copy') copyMessageText(index);
        else if (action === 'translate') translateMessage(index);
        else if (action === 'quote') quoteMessage(index);
        else if (action === 'favorite') toggleMessageFavorite(index);
        else if (action === 'forward') openForwardPicker(index);
        else if (action === 'delete') deleteMessageAt(index);
        else if (action === 'select') enterMessageSelection(index);
        return;
      }
      if (messageLongPressState.triggered) { messageLongPressState.triggered = false; return; }

      var btn = e.target.closest('[data-voice-index]');
      if (!btn || !pmScroll.contains(btn) || messageSelectionMode) return;
      var idx = Number(btn.dataset.voiceIndex), list = MESSAGES[currentName] || [], msg = list[idx], url = btn.dataset.voiceUrl || '';
      if (!msg || msg.type !== 'voice' || !url) return;
      if (activeVoiceAudio) { try { activeVoiceAudio.pause(); } catch(err) {} if (activeVoiceButton) activeVoiceButton.classList.remove('is-playing'); activeVoiceAudio = null; activeVoiceButton = null; }
      var audio = new Audio(url); audio.preload = 'auto'; activeVoiceAudio = audio; activeVoiceButton = btn; btn.classList.add('is-playing');
      audio.onended = function(){ btn.classList.remove('is-playing'); if (activeVoiceAudio === audio) { activeVoiceAudio = null; activeVoiceButton = null; } };
      audio.onerror = function(){ btn.classList.remove('is-playing'); if (activeVoiceAudio === audio) { activeVoiceAudio = null; activeVoiceButton = null; } toast('语音播放失败'); };
      audio.play().catch(function(){ btn.classList.remove('is-playing'); if (activeVoiceAudio === audio) { activeVoiceAudio = null; activeVoiceButton = null; } toast('请再次点击播放语音'); });
    });
    pmScroll.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var quoteEl = e.target.closest('.pm-bubble-quote');
      if (quoteEl && pmScroll.contains(quoteEl) && !messageSelectionMode) {
        e.preventDefault();
        locateQuotedMessage(quoteEl);
        return;
      }
      var mediaView = e.target.closest('[data-media-view-index]');
      if (mediaView && !messageSelectionMode && pmScroll.contains(mediaView)) {
        e.preventDefault();
        openMediaViewModal(Number(mediaView.dataset.mediaViewIndex));
        return;
      }
      var card = e.target.closest('.chat-bubble--chat-record');
      if (!card || messageSelectionMode || !pmScroll.contains(card)) return;
      var row = card.closest('.chat-message[data-message-index]');
      if (!row) return;
      e.preventDefault();
      openForwardRecordView(Number(row.dataset.messageIndex));
    });
    if (pmMessageActionPopover) {
      pmMessageActionPopover.addEventListener('click', function(e){
        var actionBtn = e.target.closest('[data-message-action]');
        if (!actionBtn) return;
        e.preventDefault();
        e.stopPropagation();
        var action = actionBtn.dataset.messageAction || '';
        var index = Number(actionBtn.dataset.messageActionIndex);
        closeVoiceMessageActionMenu();
        if (action === 'transcribe') toggleVoiceTranscript(index);
        else if (action === 'copy') copyMessageText(index);
        else if (action === 'translate') translateMessage(index);
        else if (action === 'quote') quoteMessage(index);
        else if (action === 'favorite') toggleMessageFavorite(index);
        else if (action === 'forward') openForwardPicker(index);
        else if (action === 'delete') deleteMessageAt(index);
        else if (action === 'select') enterMessageSelection(index);
      });
    }
  }
  if (pmScroll) pmScroll.addEventListener('scroll', closeVoiceMessageActionMenu, { passive:true });
  window.addEventListener('resize', closeVoiceMessageActionMenu);
  updateMessageSelectionChrome();
  document.addEventListener('click', function(e){
    if (pmMessageActionPopover && pmMessageActionPopover.classList.contains('is-open') && !pmMessageActionPopover.contains(e.target)) {
      var insideVoice = e.target.closest && e.target.closest('.pm-voice-bubble');
      if (!insideVoice) closeVoiceMessageActionMenu();
    }
  });
  if (pmAiBtn) {
    pmAiBtn.addEventListener('click', function(){
      if (!currentName) return;
      if (!isApiReady()) { toast('请先在设置中配置 AI 接口'); return; }
      closePanel();
      scheduleReply(200);
    });
  }
}
