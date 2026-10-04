/* 岛屿 · 聊天 · 私聊界面 DOM 引用与状态变量
 * 拆分自原 app.js；所有 js 文件以经典脚本方式共享全局作用域，需按 index.html 中的顺序加载。 */
'use strict';

var pmView = $('pmView'), pmTitle = $('pmTitle');

var pmScroll = $('pmScroll'), pmInput = $('pmInput'), pmBar = $('pmBar');

var pmVoice = $('pmVoice'), pmHold = $('pmHold');

var pmEmojiBtn = $('pmEmojiBtn'), pmAiBtn = $('pmAiBtn'), pmPlusBtn = $('pmPlusBtn');

var pmPanel = $('pmPanel'), pmPanelInner = $('pmPanelInner');

var pmImageInput = $('pmImageInput'), pmCameraInput = $('pmCameraInput'), pmFileInput = $('pmFileInput');

var voiceTextModal = $('voiceTextModal'), voiceTextInput = $('voiceTextInput'), voiceTextSend = $('voiceTextSend'), voiceTextHint = $('voiceTextHint');

var pmVoiceCallView = $('pmVoiceCallView'), pmVoiceCallBack = $('pmVoiceCallBack'), pmVoiceCallEnd = $('pmVoiceCallEnd');

var pmVoiceCallName = $('pmVoiceCallName'), pmVoiceCallProfileName = $('pmVoiceCallProfileName'), pmVoiceCallAvatar = $('pmVoiceCallAvatar');

var pmVoiceCallStatus = $('pmVoiceCallStatus'), pmVoiceCallDuration = $('pmVoiceCallDuration'), pmVoiceCallTurns = $('pmVoiceCallTurns'), pmVoiceCallEmpty = $('pmVoiceCallEmpty');

var pmVoiceCallComposer = $('pmVoiceCallComposer'), pmVoiceCallTextbox = $('pmVoiceCallTextbox');

var pmVoiceCallIncomingActions = $('pmVoiceCallIncomingActions'), pmVoiceCallIncomingAccept = $('pmVoiceCallIncomingAccept'), pmVoiceCallIncomingDecline = $('pmVoiceCallIncomingDecline');

var pmVoiceCallInput = $('pmVoiceCallInput'), pmVoiceCallSend = $('pmVoiceCallSend'), pmVoiceCallMicBtn = $('pmVoiceCallMicBtn'), pmVoiceCallHint = $('pmVoiceCallHint');

var pmLocationModal = $('pmLocationModal'), pmLocationCustomModal = $('pmLocationCustomModal');

var pmTransferModal = $('pmTransferModal'), pmTransferRecipient = $('pmTransferRecipient'), pmTransferAmount = $('pmTransferAmount'), pmTransferNote = $('pmTransferNote'), pmTransferHint = $('pmTransferHint'), pmTransferSend = $('pmTransferSend');

var pmImageTextModal = $('pmImageTextModal'), pmImageTextDescription = $('pmImageTextDescription'), pmMediaViewModal = $('pmMediaViewModal'), pmMediaViewImage = $('pmMediaViewImage'), pmFileViewModal = $('pmFileViewModal'), pmFileViewTitle = $('pmFileViewTitle'), pmFileViewMeta = $('pmFileViewMeta'), pmFileViewContent = $('pmFileViewContent');

var pmLocationStatus = $('pmLocationStatus');

var pmLocationCustomLabel = $('pmLocationCustomLabel'), pmLocationCustomLat = $('pmLocationCustomLat'), pmLocationCustomLng = $('pmLocationCustomLng'), pmLocationCustomSend = $('pmLocationCustomSend');

var pmLocationMapView = $('pmLocationMapView'), pmLocationMapBack = $('pmLocationMapBack'), pmLocationMapApps = $('pmLocationMapApps'), pmLocationMapAppsFallback = $('pmLocationMapAppsFallback'), pmLocationMapOpen = $('pmLocationMapOpen'), pmLocationMapTitle = $('pmLocationMapTitle'), pmLocationMapInfoTitle = $('pmLocationMapInfoTitle'), pmLocationMapInfoMeta = $('pmLocationMapInfoMeta'), pmLocationMapFrame = $('pmLocationMapFrame'), pmLocationMapFallback = $('pmLocationMapFallback');

var pmMemoryHomeView = $('pmMemoryHomeView'), pmMemoryHomeBack = $('pmMemoryHomeBack'), pmMemoryHomeChatName = $('pmMemoryHomeChatName'), pmShortTermMemoryEntry = $('pmShortTermMemoryEntry'), pmShortTermMemoryCount = $('pmShortTermMemoryCount'), pmFuzzyMemoryEntry = $('pmFuzzyMemoryEntry'), pmFuzzyMemoryCount = $('pmFuzzyMemoryCount'), pmFishMemoryEntry = $('pmFishMemoryEntry'), pmFishMemoryCount = $('pmFishMemoryCount'), pmImportantMemoryEntry = $('pmImportantMemoryEntry'), pmImportantMemoryCount = $('pmImportantMemoryCount'), pmMemoryClearDays = $('pmMemoryClearDays'), pmMemoryFuzzyDays = $('pmMemoryFuzzyDays'), pmMemoryFishDays = $('pmMemoryFishDays'), pmMemoryTierHint = $('pmMemoryTierHint');

var pmMemoryView = $('pmMemoryView'), pmMemoryBack = $('pmMemoryBack'), pmMemoryShortTermChatName = $('pmMemoryShortTermChatName'), pmMemoryChatName = $('pmMemoryChatName'), pmFuzzyMemoryView = $('pmFuzzyMemoryView'), pmFuzzyMemoryBack = $('pmFuzzyMemoryBack'), pmFuzzyMemoryChatName = $('pmFuzzyMemoryChatName'), pmFuzzyMemoryList = $('pmFuzzyMemoryList'), pmFishMemoryView = $('pmFishMemoryView'), pmFishMemoryBack = $('pmFishMemoryBack'), pmFishMemoryChatName = $('pmFishMemoryChatName'), pmFishMemoryList = $('pmFishMemoryList'), pmMemoryContextDepth = $('pmMemoryContextDepth'), pmMemorySummaryThreshold = $('pmMemorySummaryThreshold'), pmMemorySummaryPreset = $('pmMemorySummaryPreset'), pmMemorySummaryPrompt = $('pmMemorySummaryPrompt'), pmMemorySummaryRetryPrompt = $('pmMemorySummaryRetryPrompt'), pmMemorySummaryRetrySave = $('pmMemorySummaryRetrySave'), pmMemorySummaryRetryRun = $('pmMemorySummaryRetryRun'), pmMemorySummarySearch = $('pmMemorySummarySearch'), pmMemorySummarySearchClear = $('pmMemorySummarySearchClear'), pmMemorySummaryHistory = $('pmMemorySummaryHistory'), pmMemoryApiState = $('pmMemoryApiState'), pmMemorySummarize = $('pmMemorySummarize'), pmMemoryImportantAdd = $('pmMemoryImportantAdd'), pmMemoryImportantExtract = $('pmMemoryImportantExtract'), pmMemoryImportantList = $('pmMemoryImportantList'), pmImportantMemoryView = $('pmImportantMemoryView'), pmImportantMemoryBack = $('pmImportantMemoryBack'), pmImportantMemoryChatName = $('pmImportantMemoryChatName'), pmImportantMemoryCountPage = $('pmImportantMemoryCountPage'), pmMemoryHint = null;

var pmMemoryNotice = $('pmMemoryNotice'), pmMemoryNoticeSpinner = $('pmMemoryNoticeSpinner'), pmMemoryNoticeTitle = $('pmMemoryNoticeTitle'), pmMemoryNoticeText = $('pmMemoryNoticeText'), memoryNoticeTimer = null;

var pmIncomingCallNotice = $('pmIncomingCallNotice'), pmIncomingCallAvatar = $('pmIncomingCallAvatar'), pmIncomingCallTitle = $('pmIncomingCallTitle'), pmIncomingCallText = $('pmIncomingCallText'), pmIncomingCallAccept = $('pmIncomingCallAccept'), pmIncomingCallDecline = $('pmIncomingCallDecline'), incomingCallNoticeTimer = null;

var pmMemoryClearButton = $('pmMemoryClearButton'), pmMemoryClearModal = $('pmMemoryClearModal'), pmMemoryClearSummary = $('pmMemoryClearSummary'), pmMemoryClearImportant = $('pmMemoryClearImportant'), pmMemoryClearVector = $('pmMemoryClearVector'), pmMemoryClearAll = $('pmMemoryClearAll'), pmMemoryClearSummaryCount = $('pmMemoryClearSummaryCount'), pmMemoryClearImportantCount = $('pmMemoryClearImportantCount'), pmMemoryClearVectorCount = $('pmMemoryClearVectorCount'), pmMemoryClearCancel = $('pmMemoryClearCancel'), pmMemoryClearConfirm = $('pmMemoryClearConfirm');

var charLanguageModal = $('charLanguageModal'), charLanguageOptions = $('charLanguageOptions'), charLanguageSplitNote = $('charLanguageSplitNote'), charLanguageSplitToggle = $('charLanguageSplitToggle'), charLanguageAutoTranslateNote = $('charLanguageAutoTranslateNote'), charLanguageAutoTranslateToggle = $('charLanguageAutoTranslateToggle'), charLanguageDone = $('charLanguageDone');

var pmMessageActionPopover = $('pmMessageActionPopover');

var pmQuoteBar = $('pmQuoteBar'), pmQuoteText = $('pmQuoteText'), pmQuoteCancel = $('pmQuoteCancel');

var pmForwardSheet = $('pmForwardSheet'), pmForwardList = $('pmForwardList'), pmForwardCancel = $('pmForwardCancel'), pmForwardSelected = $('pmForwardSelected');

var pmForwardRecordView = $('pmForwardRecordView'), pmForwardRecordBack = $('pmForwardRecordBack'), pmForwardRecordTitle = $('pmForwardRecordTitle'), pmForwardRecordList = $('pmForwardRecordList');


var currentName = null, currentAvatar = null, panelMode = null, replyTimer = null;

var replyInFlight = {};

var messageQuoteDraft = null;

var forwardMessageIndex = -1;

var forwardSelectedMessageIndices = null;

var voiceRecorder = null, voiceStream = null, voiceChunks = [], voiceRecording = false;

var voiceSpeechRecognition = null, voiceSpeechTranscript = '', voiceSpeechShouldRun = false, voiceSpeechSupported = false;

var voicePointerActive = false, voicePointerId = null, voiceCancelRequested = false;

var voiceStartedAt = 0, voiceTimer = null, voiceObjectUrls = [];

var voicePressTimer = null, voicePressPending = false, voiceLongPressTriggered = false, skipNextHoldClick = false;

var voiceTranscriptOpen = Object.create(null);

var voiceLongPressState = { timer: null, pointerId: null, wrapper: null, bubble: null, index: -1, startX: 0, startY: 0, triggered: false };

var voiceCallState = {
  active:false, name:'', sessionId:'', startedAt:0, durationTimer:null,
  incoming:false, incomingEventId:'', incomingGreeting:'',
  micOn:false, micWanted:false, processing:false, textMode:false, resumeMicAfterText:false,
  stream:null, audioContext:null, analyser:null, analyserSource:null, vadFrame:0,
  recorder:null, chunks:[], recording:false, speechCandidateAt:0, speechStartedAt:0, lastSpeechAt:0, noiseFloor:.012,
  replyBusy:false
};

var voiceMessageActionIndex = -1;

var messageSelectionMode = false;

var selectedMessageIndices = Object.create(null);

var messageLongPressState = { timer: null, pointerId: null, row: null, index: -1, startX: 0, startY: 0, triggered: false };

var activeLocationMapMessage = null;

var memorySummaryJobs = Object.create(null);

var importantMemorySelectedIds = Object.create(null);

var vectorMemoryContextCache = Object.create(null);

var vectorMemoryJobs = Object.create(null);
