import pasteboard from '@ohos.pasteboard';
import audio from '@ohos.multimedia.audio';
import featureAbility from '@ohos.ability.featureAbility';
import http from '@ohos.net.http';
import router from '@system.router';
import commonEvent from '@ohos.commonEvent';
import builtInConfig from '../../built-in-config';

function pad2(value) {
  return value < 10 ? '0' + value : '' + value;
}

function copyMessages(messages) {
  var copy = [];
  for (var i = 0; i < messages.length; i++) {
    copy.push({ role: messages[i].role, text: messages[i].text });
  }
  return copy;
}

var VOICE_SAMPLE_RATE = 16000;
var VOICE_CHUNK_BYTES = 6400;
var BASE64_CHUNK_BYTES = 6144;
var VOICE_MAX_SECONDS = 15;
var VOICE_END_SLIDE_PX = 28;
var VOICE_CANCEL_SLIDE_X_PX = 32;
var RECORD_MAX_SECONDS = 60;
var CODEX_POLL_MS = 1500;
var BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var LOCAL_SERVICE_URL = String(builtInConfig.codexBaseUrl || 'http://192.168.1.129:8787')
  .replace(/\/+$/, '');
var MODEL_BASE_URL = String(builtInConfig.baseUrl || '')
  .replace(/\/+$/, '');
var MODEL_API_KEY = builtInConfig.apiKey || '';
var MODEL_NAME = builtInConfig.model || 'workbuddy/deepseek-v4.1-flash';
var MODEL_SYSTEM_PROMPT = '你是圆形手表上的中文智能助手。回答简短、自然，优先控制在 80 个汉字以内。';
var HARDWARE_KEY_EVENT = 'com.aiwatch.watch.action.START_VOICE';

export default {
  data: {
    pageIndex: 0,
    mainVisible: true,
    subPage: '',

    toastVisible: false,
    toastText: '',

    voiceActive: false,
    voiceState: 'idle',
    voiceTimer: '00:00',
    voiceStatus: '按住说话 · 上滑结束',
    voiceCta: '按住说话',
    voiceEndArmed: false,
    voiceResponseText: '',
    voiceAnswerText: '',
    voiceMode: 'magpie',
    micMuted: false,
    micLabel: '麦克风',
    voiceInputLevel: 0,
    voiceCapturedBytes: 0,
    voiceTranscriptText: '',
    voiceParentSubPage: '',
    serviceStatus: '未连接',


    recordRunning: false,
    recordSeconds: 0,
    recordTimer: '00:00',
    recordStatus: '轻触开始录音',
    recordPaused: false,
    recordHasProgress: false,
    recordSubmitting: false,
    recordControlLabel: '开始录音',
    recordInputLevel: 0,
    recordWaveBars: [],
    recordMarks: [],
    resultTab: 'summary',
    recordText: '',

    codexToken: builtInConfig.codexToken || '',
    codexRepoId: builtInConfig.codexRepoId || 'watch',
    codexModelLabel: 'Magpie · Codex',
    codexAvailable: false,
    codexTaskId: '',
    codexStatus: 'idle',
    codexStage: '空闲',
    codexMessage: '等待任务',
    codexElapsedText: '00:00',
    codexTranscript: '',
    codexFinalText: '',
    codexSpeechText: '',
    codexError: '',
    codexOrigin: '',
    codexChatThreadId: '',
    codexResultCommitted: false,
    taskHistory: [],

    editingTranscript: false,
    editBuffer: '',
    summaryItems: [],

    recentThreads: [],
    threads: [
    {
        "id": "ai",
        "title": "今天的灵感",
        "preview": "2 条消息",
        "mark": "◷",
        "markClass": "blue-mark",
        "messages": [
            {
                "role": "user",
                "text": "帮我规划一下今天的工作。"
            },
            {
                "role": "assistant",
                "text": "先完成最重要的一件事，再为沟通和整理留出时间。需要我帮你拆分任务吗？"
            }
        ]
    },
    {
        "id": "fitness",
        "title": "周末出行",
        "preview": "2 条消息",
        "mark": "◷",
        "markClass": "blue-mark",
        "messages": [
            {
                "role": "user",
                "text": "周末想去附近走走。"
            },
            {
                "role": "assistant",
                "text": "可以安排一次半日公园散步，留出休息时间，出发前再确认天气。"
            }
        ]
    }
],
    currentThreadId: 'ai',
    chatVisible: false,
    chatTitle: '今天的灵感',
    chatInput: '',
    chatComposerVisible: false,

    chatMessages: [
      { role: 'user', text: '帮我介绍一下人工智能' },
      { role: 'assistant', text: '人工智能是让计算机模拟人类智能的技术，广泛应用于医疗、教育、创作与办公。' }
    ],
    visibleChatMessages: [
      { role: 'user', text: '帮我介绍一下人工智能' },
      { role: 'assistant', text: '人工智能是让计算机模拟人类智能的技术，广泛应用于医疗、教育、创作与办公。' }
    ],

    hapticsEnabled: true
  },


  continueChat() {
    this.chatInput = '继续展开';
    this.sendChat();
  },

  onInit() {
    this.voiceTicker = null;
    this.voicePhaseTimer = null;
    this.recordTicker = null;
    this.recordMaxTimer = null;
    this.toastTimer = null;
    this.voiceMaxTimer = null;
    this.codexPollTimer = null;
    this.audioCapturer = null;
    this.httpRequest = null;
    this.voicePcmChunks = [];
    this.recordPcmChunks = [];
    this.voiceCaptureActive = false;
    this.recordCaptureActive = false;
    this.voiceCaptureStarting = false;
    this.voicePressActive = false;
    this.voiceTouchStartY = null;
    this.voiceTouchStartX = null;
    this.voiceStartedAt = 0;
    this.recordStartedAt = 0;
    this.chatSwipeAt = 0;
    this.menuPendingIndex = null;
    this.rootTouchActive = false;
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.mainListAtStartAtTouch = true;
    this.mainListAtEndAtTouch = false;
    this.hardwareKeyAt = 0;
    this.hardwareKeySubscriber = null;
    this.hardwareKeySubscribing = false;
    this.recordWaveBars = this.buildWaveBars();
    this.subscribeHardwareKeyEvents();
  },

  onDestroy() {
    this.unsubscribeHardwareKeyEvents();
    this.clearAllTimers();
  },

  clearAllTimers() {
    this.menuPendingIndex = null;
    this.rootTouchActive = false;
    if (this.voiceTicker) {
      clearInterval(this.voiceTicker);
      this.voiceTicker = null;
    }
    if (this.voicePhaseTimer) {
      clearTimeout(this.voicePhaseTimer);
      this.voicePhaseTimer = null;
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.codexPollTimer) {
      clearTimeout(this.codexPollTimer);
      this.codexPollTimer = null;
    }
    if (this.recordMaxTimer) {
      clearTimeout(this.recordMaxTimer);
      this.recordMaxTimer = null;
    }
    this.stopVoiceResources();
    this.stopRecordCaptureOnly();
    this.stopRecordingTickerOnly();
  },

  onHide() {
    this.stopCodexPolling();
  },

  onShow() {
    this.focusHardwareKey();
    if (this.subPage === 'task' && this.codexTaskId) {
      this.startCodexPolling();
    }
  },

  subscribeHardwareKeyEvents() {
    var self = this;
    if (this.hardwareKeySubscriber || this.hardwareKeySubscribing) {
      return;
    }
    this.hardwareKeySubscribing = true;
    try {
      commonEvent.createSubscriber({ events: [HARDWARE_KEY_EVENT] }, function (error, subscriber) {
        self.hardwareKeySubscribing = false;
        if (error) {
          console.error('NOVA_KEY subscriber create failed: ' + JSON.stringify(error));
          return;
        }
        self.hardwareKeySubscriber = subscriber;
        commonEvent.subscribe(subscriber, function (subscribeError, data) {
          if (subscribeError) {
            console.error('NOVA_KEY subscribe failed: ' + JSON.stringify(subscribeError));
            return;
          }
          self.handleHardwareKeyTrigger('common-event');
        });
      });
    } catch (error) {
      this.hardwareKeySubscribing = false;
      console.error('NOVA_KEY common event unavailable: ' + JSON.stringify(error));
    }
  },

  unsubscribeHardwareKeyEvents() {
    var subscriber = this.hardwareKeySubscriber;
    this.hardwareKeySubscriber = null;
    if (!subscriber) {
      return;
    }
    try {
      commonEvent.unsubscribe(subscriber, function () {});
    } catch (error) {
      // Page teardown must continue even if the event service is already gone.
    }
  },

  focusHardwareKey() {
    var self = this;
    setTimeout(function () {
      try {
        var root = self.$element('hardwareKeySink');
        if (root && root.focus) {
          root.focus();
        }
      } catch (error) {
        // Hardware keys remain optional when the runtime has no focus API.
      }
    }, 80);
  },

  handleHardwareKey(event) {
    var keyCode = event && (event.keyCode !== undefined ? event.keyCode : event.code);
    console.info('NOVA_KEY keyCode=' + keyCode +
      ' isPressed=' + (event && event.isPressed) +
      ' keyAction=' + (event && event.keyAction));
    if (Number(keyCode) !== 196) {
      return false;
    }
    if (event && (event.isPressed === false || event.keyAction === 1)) {
      return true;
    }
    this.handleHardwareKeyTrigger('hml');
    return true;
  },

  handleHardwareKeyTrigger(source) {
    var now = Date.now();
    if (now - (this.hardwareKeyAt || 0) < 600) {
      return true;
    }
    this.hardwareKeyAt = now;
    console.info('NOVA_KEY trigger source=' + source);
    this.startVoiceFromHardwareKey();
    return true;
  },

  startVoiceFromHardwareKey() {
    if (this.subPage === 'voice' && this.voiceState === 'listening') {
      this.voicePressActive = false;
      this.submitVoiceTurn();
      return;
    }
    if (this.subPage === 'voice' && this.voiceState === 'thinking') {
      this.showToast('正在处理，请稍候');
      return;
    }
    if (this.subPage === 'voice' && (this.voiceActive || this.voiceCaptureStarting)) {
      this.endVoice(false);
      return;
    }
    this.startVoice();
    this.startVoicePress(null);
    this.voicePressActive = false;
    this.voiceCta = '结束并发送';
    this.voiceStatus = '正在聆听 · 再次按键结束';
  },

  buildWaveBars() {
    var bars = [];
    for (var i = 0; i < 58; i++) {
      var distance = Math.abs(i - 28.5) / 28.5;
      var height = 8 + Math.round((1 - distance) * 42 + Math.abs(Math.sin(i * 1.71)) * 14);
      var duration = 0.78 + ((i * 37) % 43) / 100;
      bars.push({
        height: height,
        delay: ((i * 7) % 10) / 10,
        duration: duration.toFixed(2)
      });
    }
    return bars;
  },

  showToast(message) {
    var self = this;
    this.toastText = message;
    this.toastVisible = true;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(function () {
      self.toastVisible = false;
      self.toastTimer = null;
    }, 1700);
  },

  handleSwipe(event) {
    if (!event) {
      return;
    }
    if (this.subPage) {
      if (event.direction === 'left') {
        this.closeSubPage();
      }
      return;
    }
    // Render one menu at a time so native Swiper dragging cannot leave an
    // intermediate offset. Only vertical gestures change the main menu.
    // Scroll the list first; only an outward drag at its edge changes menus.
    if (this.pageIndex >= 2) {
      var shortList = this.pageIndex === 3 ||
        (this.pageIndex === 2 && this.taskHistory.length + this.threads.length + 1 <= 3);
      if (event.direction === 'up' && !this.mainListAtEndAtTouch && !shortList) {
        this.mainListAtStart = false;
        return;
      }
      if (event.direction === 'down' && !this.mainListAtStartAtTouch && !shortList) {
        this.mainListAtEnd = false;
        return;
      }
    }
    if (event.direction === 'up') {
      this.queueMenuPage((this.pageIndex + 1) % 4);
    } else if (event.direction === 'down') {
      this.queueMenuPage((this.pageIndex + 3) % 4);
    }
  },

  onRootTouchStart() {
    this.rootTouchActive = true;
    this.mainListAtStartAtTouch = this.mainListAtStart;
    this.mainListAtEndAtTouch = this.mainListAtEnd;
  },

  onRootTouchEnd() {
    this.rootTouchActive = false;
    this.commitMenuPage();
  },

  onRootTouchCancel() {
    this.rootTouchActive = false;
    this.menuPendingIndex = null;
  },

  mainListReachedStart() {
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.mainListAtStartAtTouch = true;
    this.mainListAtEndAtTouch = false;
  },

  mainListReachedEnd() {
    this.mainListAtEnd = true;
    this.mainListAtStart = false;
    this.mainListAtEndAtTouch = true;
    this.mainListAtStartAtTouch = false;
  },

  queueMenuPage(index) {
    this.menuPendingIndex = index;
    if (!this.rootTouchActive) {
      this.commitMenuPage();
    }
  },

  commitMenuPage() {
    var index = this.menuPendingIndex;
    this.menuPendingIndex = null;
    if (index === null || typeof index === 'undefined') {
      return;
    }
    if (!this.subPage && this.mainVisible) {
      this.setPage(index);
    }
  },

  handleChatSwipe(event) {
    if (!event || event.direction !== 'left') {
      return;
    }
    this.closeSubPage();
    if (event.stopPropagation) {
      event.stopPropagation();
    }
    return true;
  },

  setPage(index) {
    var nextIndex = (index + 4) % 4;
    if (this.pageIndex === 1 && nextIndex !== 1) {
      this.resetRecordingTimer();
    }
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.mainListAtStartAtTouch = true;
    this.mainListAtEndAtTouch = false;
    this.pageIndex = nextIndex;
    this.resetListScroll(nextIndex);
  },

  resetListScroll(index) {
    var self = this;
    if (!this.$element) {
      return;
    }
    var listId = index === 2 ? 'recentList' : (index === 3 ? 'settingsList' : '');
    if (!listId) {
      return;
    }
    var scrollToStart = function () {
      if (!self.$element || self.pageIndex !== index) {
        return;
      }
      try {
        var list = self.$element(listId);
        if (list && list.scrollTo) {
          list.scrollTo({ index: 0 });
        } else if (list && list.scrollTop) {
          list.scrollTop({ smooth: false });
        }
      } catch (error) {
        // The list can still be mounting; the gesture handler remains usable.
      }
    };
    setTimeout(scrollToStart, 80);
  },

  openSubPage(name) {
    if ((this.subPage === 'task' || this.subPage === 'result') &&
      name !== 'task' && name !== 'result') {
      this.stopCodexPolling();
    }
    this.subPage = name;
    this.mainVisible = false;
  },

  closeSubPage() {
    if (this.subPage === 'voice') {
      this.endVoice();
      return;
    }
    if (this.subPage === 'answer') {
      this.endVoice(false);
      return;
    }
    if (this.subPage === 'task' || this.subPage === 'result') {
      this.stopCodexPolling();
      this.subPage = '';
      this.mainVisible = true;
      this.pageIndex = 0;
      return;
    }
    if (this.subPage === 'chat') {
      this.syncCurrentThread();
      this.chatVisible = false;
      this.pageIndex = 2;
    }
    this.subPage = '';
    this.mainVisible = true;
  },

  onBackPress() {
    if (this.subPage) {
      this.closeSubPage();
      return true;
    }
    // System back gestures must not become horizontal main-menu navigation.
    // The hardware Home/crown remains available to leave the app.
    return true;
  },

  resetRecordingTimer() {
    this.stopRecordingTickerOnly();
    this.stopRecordCaptureOnly();
    this.recordPcmChunks = [];
    this.recordInputLevel = 0;
    this.recordRunning = false;
    this.recordPaused = false;
    this.recordHasProgress = false;
    this.recordSubmitting = false;
    this.recordSeconds = 0;
    this.recordTimer = '00:00';
    this.recordStatus = '轻触开始录音';
    this.recordControlLabel = '开始录音';
  },

  onPageChange(event) {
    var leavingRecording = this.pageIndex === 1 && event.index !== 1;
    this.pageIndex = event.index;
    if (leavingRecording) {
      this.resetRecordingTimer();
    }
  },

  goBack() {
    if (this.subPage) {
      this.closeSubPage();
      return;
    }
    if (this.pageIndex > 0) {
      if (this.pageIndex === 1) {
        this.resetRecordingTimer();
      }
      this.setPage(this.pageIndex - 1);
    }
  },

  startVoice() {
    this.voiceParentSubPage = this.subPage === 'chat' ? 'chat' : '';
    this.clearVoiceTimers();
    this.stopVoiceResources();
    this.openSubPage('voice');
    this.voiceActive = false;
    this.voiceState = 'idle';
    this.voiceStatus = '按住说话 · 上滑结束';
    this.voiceCta = '按住说话';
    this.voiceEndArmed = false;
    this.voicePressActive = false;
    this.voiceTouchStartY = null;
    this.voiceTouchStartX = null;
    this.voiceResponseText = '';
    this.voiceTranscriptText = '';
    this.voiceTimer = '00:00';
    this.voiceStartedAt = 0;
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceInputLevel = 0;
    this.micMuted = false;
    this.micLabel = '麦克风';
  },

  startVoicePress(event) {
    var self = this;
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }
    if (this.subPage !== 'voice' || this.voiceState === 'thinking' || this.voiceCaptureStarting) {
      return;
    }
    if (this.voiceActive && this.voiceState === 'listening') {
      return;
    }
    this.clearVoiceTimers();
    this.stopVoiceResources();
    this.voiceTouchStartY = this.readTouchY(event);
    this.voiceTouchStartX = this.readTouchX(event);
    this.voicePressActive = true;
    this.voiceEndArmed = false;
    this.voiceCta = '松开发送';
    this.voiceActive = true;
    this.voiceState = 'listening';
    this.voiceStatus = '正在请求麦克风权限';
    this.voiceResponseText = '';
    this.voiceTranscriptText = '';
    this.voiceTimer = '00:00';
    this.voiceStartedAt = Date.now();
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceInputLevel = 0;
    this.micMuted = false;
    this.micLabel = '麦克风';
    this.voiceTicker = setInterval(function () {
      var seconds = Math.floor((Date.now() - self.voiceStartedAt) / 1000);
      self.voiceTimer = pad2(Math.floor(seconds / 60)) + ':' + pad2(seconds % 60);
    }, 1000);
    this.requestMicrophoneAndStart();
  },

  readTouchY(event) {
    var touches = event && event.touches && event.touches.length ? event.touches : null;
    if (!touches && event && event.changedTouches && event.changedTouches.length) {
      touches = event.changedTouches;
    }
    var point = touches && touches.length ? touches[0] : event;
    if (!point) {
      return null;
    }
    if (typeof point.globalY === 'number') {
      return point.globalY;
    }
    if (typeof point.clientY === 'number') {
      return point.clientY;
    }
    if (typeof point.screenY === 'number') {
      return point.screenY;
    }
    return typeof point.y === 'number' ? point.y : null;
  },

  readTouchX(event) {
    var touches = event && event.touches && event.touches.length ? event.touches : null;
    if (!touches && event && event.changedTouches && event.changedTouches.length) {
      touches = event.changedTouches;
    }
    var point = touches && touches.length ? touches[0] : event;
    if (!point) {
      return null;
    }
    if (typeof point.globalX === 'number') {
      return point.globalX;
    }
    if (typeof point.clientX === 'number') {
      return point.clientX;
    }
    if (typeof point.screenX === 'number') {
      return point.screenX;
    }
    return typeof point.x === 'number' ? point.x : null;
  },

  onVoiceTouchMove(event) {
    if (!this.voicePressActive || !this.voiceActive || this.voiceState !== 'listening') {
      return;
    }
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }
    var currentY = this.readTouchY(event);
    if (this.voiceTouchStartY === null || currentY === null) {
      return;
    }
    var upward = this.voiceTouchStartY - currentY;
    var currentX = this.readTouchX(event);
    if (this.voiceTouchStartX !== null && currentX !== null) {
      var horizontal = currentX - this.voiceTouchStartX;
      if (Math.abs(horizontal) >= VOICE_CANCEL_SLIDE_X_PX &&
        Math.abs(horizontal) > Math.abs(upward) * 1.2) {
        this.cancelVoicePress();
        if (horizontal < 0) {
          this.closeSubPage();
        }
        return;
      }
    }
    if (upward >= VOICE_END_SLIDE_PX) {
      this.voiceEndArmed = true;
      this.voiceStatus = '已上滑 · 松开结束';
    }
  },

  onVoiceTouchEnd(event) {
    if (!this.voicePressActive) {
      return;
    }
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }
    this.voicePressActive = false;
    this.voiceTouchStartY = null;
    this.voiceTouchStartX = null;
    if (this.voiceActive && this.voiceState === 'listening') {
      this.submitVoiceTurn();
    }
  },

  onVoiceTouchCancel(event) {
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }
    if (!this.voicePressActive) {
      return;
    }
    this.cancelVoicePress();
    this.showToast('本次语音未发送');
  },

  cancelVoicePress() {
    this.voicePressActive = false;
    this.voiceTouchStartY = null;
    this.voiceTouchStartX = null;
    this.stopVoiceResources();
    this.clearVoiceTimers();
    this.voiceActive = false;
    this.voiceState = 'idle';
    this.voiceEndArmed = false;
    this.voiceCta = '按住说话';
    this.voiceStatus = '按住说话 · 上滑结束';
    this.voiceInputLevel = 0;
  },

  requestMicrophoneAndStart() {
    var self = this;
    this.voiceCaptureStarting = true;
    try {
      var context = featureAbility.getContext();
      context.requestPermissionsFromUser(['ohos.permission.MICROPHONE'], 101).then(function (result) {
        self.voiceCaptureStarting = false;
        if (!self.voiceActive) {
          return;
        }
        var granted = result && result.authResults && result.authResults.length &&
          result.authResults[0] === 0;
        if (!granted) {
          self.voiceState = 'error';
          self.voiceStatus = '未获得麦克风权限';
          self.voiceResponseText = '请允许麦克风权限后重试';
          self.voicePressActive = false;
          self.voiceEndArmed = false;
          self.voiceCta = '按住重试';
          self.showToast('未获得麦克风权限');
          return;
        }
        self.createAndStartCapturer();
      }).catch(function (error) {
        self.voiceCaptureStarting = false;
        self.voiceState = 'error';
        self.voiceStatus = '麦克风权限请求失败';
        self.voiceResponseText = '无法请求系统权限';
        self.voicePressActive = false;
        self.voiceEndArmed = false;
        self.voiceCta = '按住重试';
        self.showToast('麦克风权限请求失败');
      });
    } catch (error) {
      this.voiceCaptureStarting = false;
      this.voiceState = 'error';
      this.voiceStatus = '麦克风权限不可用';
      this.voiceResponseText = '当前系统未提供录音权限接口';
      this.voicePressActive = false;
      this.voiceEndArmed = false;
      this.voiceCta = '按住重试';
      this.showToast('麦克风权限接口不可用');
    }
  },

  createAndStartCapturer() {
    var self = this;
    var options = {
      streamInfo: {
        samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
        channels: audio.AudioChannel.CHANNEL_1,
        sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
        encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW
      },
      capturerInfo: {
        source: audio.SourceType.SOURCE_TYPE_MIC,
        capturerFlags: 0
      }
    };
    this.stopMicCapture();
    audio.createAudioCapturer(options).then(function (capturer) {
      self.audioCapturer = capturer;
      return capturer.start();
    }).then(function () {
      if (!self.voiceActive) {
        self.stopMicCapture();
        return;
      }
      self.voiceCaptureActive = true;
      self.voiceState = 'listening';
      self.voiceStatus = '正在聆听 · 松开发送 · 上滑结束';
      self.captureAudioChunk();
      self.armVoiceMaxDuration();
    }).catch(function (error) {
      self.voiceCaptureActive = false;
      self.voiceState = 'error';
      self.voiceStatus = '麦克风启动失败';
      self.voiceResponseText = '无法打开真实麦克风';
      self.voicePressActive = false;
      self.voiceEndArmed = false;
      self.voiceCta = '按住重试';
      self.showToast('麦克风启动失败');
    });
  },

  captureAudioChunk() {
    var self = this;
    if (!this.voiceActive || !this.audioCapturer || !this.voiceCaptureActive || this.micMuted) {
      if (this.voiceActive && this.voiceCaptureActive) {
        this.voicePhaseTimer = setTimeout(function () {
          if (self.voiceActive && self.voiceCaptureActive && !self.micMuted) {
            self.captureAudioChunk();
          }
        }, 180);
      }
      return;
    }
    var capturer = this.audioCapturer;
    capturer.read(VOICE_CHUNK_BYTES, true).then(function (buffer) {
      if (!self.voiceActive || !self.audioCapturer || self.audioCapturer !== capturer ||
        !self.voiceCaptureActive || self.micMuted) {
        return;
      }
      self.voicePcmChunks.push(buffer);
      self.voiceCapturedBytes += buffer.byteLength;
      self.voiceInputLevel = self.computePcmLevel(buffer);
      if (!self.voiceEndArmed) {
        self.voiceStatus = '正在聆听 · 输入 ' + self.voiceInputLevel + '% · 上滑结束';
      }
      if (self.voiceCapturedBytes >= VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS) {
        self.submitVoiceTurn();
        return;
      }
      self.captureAudioChunk();
    }).catch(function () {
      if (self.voiceActive) {
        self.voiceState = 'error';
        self.voiceStatus = '麦克风读取失败';
        self.voiceResponseText = '请重新开始语音对话';
        self.voicePressActive = false;
        self.voiceEndArmed = false;
        self.voiceCta = '按住重试';
      }
    });
  },

  armVoiceMaxDuration() {
    var self = this;
    if (this.voiceMaxTimer) {
      clearTimeout(this.voiceMaxTimer);
    }
    this.voiceMaxTimer = setTimeout(function () {
      self.voiceMaxTimer = null;
      if (self.voiceActive && self.voiceCaptureActive) {
        self.submitVoiceTurn();
      }
    }, VOICE_MAX_SECONDS * 1000);
  },

  computePcmLevel(buffer) {
    var samples = new Int16Array(buffer);
    if (!samples.length) {
      return 0;
    }
    var stride = Math.max(1, Math.floor(samples.length / 500));
    var sum = 0;
    var peak = 0;
    var count = 0;
    for (var i = 0; i < samples.length; i += stride) {
      var value = samples[i];
      if (value < 0) {
        value = -value;
      }
      if (value > peak) {
        peak = value;
      }
      sum += value * value;
      count++;
    }
    var rms = count ? Math.sqrt(sum / count) : 0;
    return Math.min(100, Math.round((rms / 32768) * 190 + (peak / 32768) * 45));
  },

  concatPcmChunks() {
    return this.concatChunks(this.voicePcmChunks);
  },

  concatChunks(chunks) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) {
      total += chunks[i].byteLength;
    }
    if (!total) {
      return new ArrayBuffer(0);
    }
    var result = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < chunks.length; j++) {
      result.set(new Uint8Array(chunks[j]), offset);
      offset += chunks[j].byteLength;
    }
    return result.buffer;
  },

  encodeBase64Chunk(bytes, start, end) {
    var chars = [];
    for (var i = start; i < end; i += 3) {
      var remaining = end - i;
      var b0 = bytes[i];
      var b1 = remaining > 1 ? bytes[i + 1] : 0;
      var b2 = remaining > 2 ? bytes[i + 2] : 0;
      chars.push(BASE64_ALPHABET.charAt(b0 >> 2));
      chars.push(BASE64_ALPHABET.charAt(((b0 & 3) << 4) | (b1 >> 4)));
      chars.push(remaining > 1 ?
        BASE64_ALPHABET.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=');
      chars.push(remaining > 2 ? BASE64_ALPHABET.charAt(b2 & 63) : '=');
    }
    return chars.join('');
  },

  encodePcmBase64(pcm) {
    var self = this;
    var bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
    return new Promise(function (resolve, reject) {
      if (!bytes.length) {
        resolve('');
        return;
      }
      var parts = [];
      var offset = 0;
      function encodeNextChunk() {
        try {
          if (offset >= bytes.length) {
            resolve(parts.join(''));
            return;
          }
          var end = Math.min(bytes.length, offset + BASE64_CHUNK_BYTES);
          parts.push(self.encodeBase64Chunk(bytes, offset, end));
          offset = end;
          setTimeout(encodeNextChunk, 0);
        } catch (error) {
          reject(error);
        }
      }
      encodeNextChunk();
    });
  },

  simulateVoiceTurn() {
    if (!this.voiceActive) {
      this.startVoicePress(null);
      return;
    }
    if (this.micMuted) {
      this.showToast('请先打开麦克风');
      return;
    }
    this.submitVoiceTurn();
  },

  submitVoiceTurn() {
    var self = this;
    if (!this.voiceActive || this.voiceState === 'thinking' || this.voiceState === 'error') {
      return;
    }
    if (this.voiceCapturedBytes < 6400) {
      this.stopMicCapture();
      this.clearVoiceTimers();
      this.voiceActive = false;
      this.voiceState = 'idle';
      this.voiceStatus = '按住说话 · 上滑结束';
      this.voiceCta = '按住说话';
      this.voiceEndArmed = false;
      this.voicePressActive = false;
      this.voiceInputLevel = 0;
      this.showToast('说话时间太短，请再说一次');
      return;
    }
    this.voicePressActive = false;
    this.voiceTouchStartY = null;
    this.voiceTouchStartX = null;
    this.voiceEndArmed = false;
    this.voiceCta = '正在处理';
    var pcm = this.concatPcmChunks();
    this.stopMicCapture();
    this.voiceState = 'thinking';
    this.voiceResponseText = '';
    this.serviceStatus = '请求中';
    if (this.voiceMode === 'codex') {
      this.voiceStatus = '正在创建 Codex 任务';
      this.submitCodexVoice(pcm, 'voice').catch(function (error) {
        if (!self.voiceActive) {
          return;
        }
        self.voiceState = 'error';
        self.voiceStatus = 'Codex 后端不可用';
        self.voiceResponseText = self.describeNetworkError(error);
        self.voiceCta = '按住重试';
        self.serviceStatus = '连接失败';
        self.showToast('Codex 后端不可用');
      });
      return;
    }
    this.voiceStatus = '正在识别语音';
    this.transcribePcm(pcm).then(function (transcript) {
      if (!self.voiceActive) {
        return null;
      }
      self.voiceTranscriptText = transcript;
      self.voiceStatus = '正在生成回答';
      return self.requestModel([
        { role: 'system', content: MODEL_SYSTEM_PROMPT },
        { role: 'user', content: transcript }
      ]).then(function (reply) {
        return { transcript: transcript, reply: reply };
      });
    }).then(function (response) {
      if (!response || !self.voiceActive) {
        return;
      }
      var transcript = response.transcript;
      var reply = response.reply;
      self.voiceResponseText = (transcript ? '识别：' + transcript + '\n' : '') + reply;
      self.voiceAnswerText = reply;
      self.voiceState = 'answered';
      self.voiceStatus = '回答完成 · 手表保持静音';
      self.serviceStatus = '已连接';
      self.voiceActive = false;
      self.clearVoiceTimers();
      self.stopVoiceResources();
      self.openSubPage('answer');
    }).catch(function (error) {
      if (!self.voiceActive) {
        return;
      }
      var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
      console.info('[NOVA_NET] voice failed: ' + message);
      self.serviceStatus = '连接失败';
      self.voiceState = 'error';
      self.voiceStatus = '语音请求失败';
      self.voiceResponseText = self.describeNetworkError(error);
      self.voiceCta = '按住重试';
      self.showToast('语音请求失败');
    });
  },

  describeNetworkError(error) {
    var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
    if (!message || message === 'undefined') {
      message = '请检查服务地址、令牌和局域网连接';
    }
    return message.substring(0, 100);
  },

  toggleMic() {
    this.micMuted = !this.micMuted;
    this.micLabel = this.micMuted ? '麦克风关' : '麦克风';
    this.voiceInputLevel = 0;
    this.showToast(this.micMuted ? '麦克风已静音' : '麦克风已打开');
  },

  endVoice(showMessage) {
    var shouldToast = showMessage !== false;
    this.clearVoiceTimers();
    this.stopVoiceResources();
    this.voiceActive = false;
    this.voiceState = 'idle';
    this.voiceStatus = '按住说话 · 上滑结束';
    this.voiceCta = '按住说话';
    this.voiceEndArmed = false;
    this.voicePressActive = false;
    this.voiceTouchStartY = null;
    this.voiceTouchStartX = null;
    this.voiceResponseText = '';
    this.voiceTranscriptText = '';
    this.voiceTimer = '00:00';
    this.voiceCapturedBytes = 0;
    this.voicePcmChunks = [];
    if (this.voiceParentSubPage === 'chat' && this.chatVisible) {
      this.subPage = 'chat';
      this.mainVisible = false;
    } else {
      this.subPage = '';
      this.mainVisible = true;
    }
    this.voiceParentSubPage = '';
    if (shouldToast) {
      this.showToast('语音对话已结束');
    }
  },

  clearVoiceTimers() {
    if (this.voiceTicker) {
      clearInterval(this.voiceTicker);
      this.voiceTicker = null;
    }
    if (this.voicePhaseTimer) {
      clearTimeout(this.voicePhaseTimer);
      this.voicePhaseTimer = null;
    }
    if (this.voiceMaxTimer) {
      clearTimeout(this.voiceMaxTimer);
      this.voiceMaxTimer = null;
    }
  },

  stopMicCapture() {
    var capturer = this.audioCapturer;
    this.audioCapturer = null;
    this.voiceCaptureActive = false;
    this.voiceCaptureStarting = false;
    if (this.voiceMaxTimer) {
      clearTimeout(this.voiceMaxTimer);
      this.voiceMaxTimer = null;
    }
    if (!capturer) {
      return;
    }
    try {
      capturer.stop().then(function () {
        return capturer.release();
      }).catch(function () {
        try { capturer.release(); } catch (error) {}
      });
    } catch (error) {
      try { capturer.release(); } catch (releaseError) {}
    }
  },

  stopVoiceResources() {
    this.stopMicCapture();
  },

  getServiceUrl(path) {
    var base = LOCAL_SERVICE_URL;
    if (!path) {
      return base;
    }
    return base + (path.charAt(0) === '/' ? path : '/' + path);
  },

  getModelUrl(path) {
    if (!path) {
      return MODEL_BASE_URL;
    }
    return MODEL_BASE_URL + (path.charAt(0) === '/' ? path : '/' + path);
  },

  requestModel(messages) {
    var self = this;
    var base = MODEL_BASE_URL.trim().replace(/\/+$/, '');
    if (!base || !MODEL_API_KEY) {
      return Promise.reject(new Error('内置模型配置不可用'));
    }
    var url = base + '/chat/completions';
    return this.networkRequest(url, {
      method: http.RequestMethod.POST,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MODEL_API_KEY
      },
      extraData: {
        model: MODEL_NAME,
        messages: messages,
        max_tokens: 128,
        temperature: 0.2,
        reasoning_effort: 'none',
        stream: false
      },
      connectTimeout: 10000,
      readTimeout: 30000
    }).then(function (result) {
      var payload = self.parseHttpResult(result.result);
      var choice = payload.choices && payload.choices[0];
      var message = choice && choice.message;
      var content = message && message.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('empty model reply');
      }
      return content.trim();
    });
  },

  transcribePcm(pcm) {
    var self = this;
    return this.encodePcmBase64(pcm).then(function (encoded) {
      return self.networkRequest(self.getServiceUrl('/api/asr'), {
        method: http.RequestMethod.POST,
        header: { 'Content-Type': 'application/json' },
        extraData: {
          pcmBase64: encoded,
          sampleRate: VOICE_SAMPLE_RATE
        },
        connectTimeout: 10000,
        readTimeout: 180000
      });
    }).then(function (result) {
      var payload = self.parseHttpResult(result.result);
      var transcript = String(payload.transcript || '').trim();
      if (!transcript) {
        throw new Error('empty transcript');
      }
      return transcript;
    });
  },

  codexHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    if (this.codexToken) {
      headers['X-Nova-Token'] = this.codexToken;
    }
    return headers;
  },

  ensureCodexConfigured() {
    if (!(this.codexToken || '').trim()) {
      throw new Error('未填写 Codex 访问令牌');
    }
  },

  submitCodexVoice(pcm, origin) {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        self.ensureCodexConfigured();
      } catch (error) {
        reject(error);
        return;
      }
      if (self.voiceActive) {
        self.voiceStatus = '正在准备语音';
      }
      self.encodePcmBase64(pcm).then(function (encoded) {
        if (self.voiceActive) {
          self.voiceStatus = '正在创建 Codex 任务';
        }
        self.networkRequest(self.getServiceUrl('/api/codex/voice'), {
          method: http.RequestMethod.POST,
          header: self.codexHeaders(),
          extraData: {
            pcmBase64: encoded,
            sampleRate: VOICE_SAMPLE_RATE,
            repoId: self.codexRepoId,
            mode: 'readonly'
          },
          connectTimeout: 10000,
          readTimeout: 60000
        }).then(function (result) {
          var payload = self.parseHttpResult(result.result);
          if (!payload.taskId) {
            throw new Error(payload.error || '任务创建失败');
          }
          self.adoptCodexTask(payload, origin);
          resolve(payload);
        }).catch(function (error) {
          reject(error);
        });
      }).catch(function (error) {
        reject(error);
      });
    });
  },

  submitCodexText(prompt, transcript) {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        self.ensureCodexConfigured();
      } catch (error) {
        reject(error);
        return;
      }
      self.networkRequest(self.getServiceUrl('/api/codex/task'), {
        method: http.RequestMethod.POST,
        header: self.codexHeaders(),
        extraData: {
          prompt: prompt,
          transcript: transcript || prompt,
          repoId: self.codexRepoId,
          mode: 'readonly'
        },
        connectTimeout: 10000,
        readTimeout: 30000
      }).then(function (result) {
        var payload = self.parseHttpResult(result.result);
        if (!payload.taskId) {
          throw new Error(payload.error || '任务创建失败');
        }
        self.adoptCodexTask(payload, 'text');
        resolve(payload);
      }).catch(function (error) {
        reject(error);
      });
    });
  },

  adoptCodexTask(payload, origin) {
    this.codexTaskId = payload.taskId;
    this.codexStatus = payload.status || 'queued';
    this.codexStage = payload.stage || '已排队';
    this.codexMessage = payload.message || '等待 Codex 执行';
    this.codexTranscript = payload.transcript || '';
    this.codexFinalText = payload.finalText || '';
    this.codexSpeechText = payload.speechText || '';
    this.codexError = payload.error || '';
    this.codexElapsedText = this.formatElapsed(payload.elapsedMs || 0);
    this.codexOrigin = origin || 'voice';
    this.codexResultCommitted = false;
    this.recordPcmChunks = [];
    this.voicePcmChunks = [];
    this.stopCodexPolling();
    if (this.voiceActive) {
      this.clearVoiceTimers();
      this.stopVoiceResources();
      this.voiceActive = false;
    }
    this.upsertTaskHistory();
    this.subPage = 'task';
    this.mainVisible = false;
    this.startCodexPolling();
  },

  formatElapsed(milliseconds) {
    var seconds = Math.max(0, Math.floor((milliseconds || 0) / 1000));
    return pad2(Math.floor(seconds / 60)) + ':' + pad2(seconds % 60);
  },

  upsertTaskHistory() {
    if (!this.codexTaskId) {
      return;
    }
    var title = (this.codexTranscript || 'Codex 只读任务')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length > 15) {
      title = title.substring(0, 15) + '...';
    }
    var item = {
      id: this.codexTaskId,
      title: title || 'Codex 只读任务',
      subtitle: this.codexStage + ' · ' + this.codexElapsedText,
      status: this.codexStatus
    };
    var next = [item];
    for (var i = 0; i < this.taskHistory.length; i++) {
      if (this.taskHistory[i].id !== item.id) {
        next.push(this.taskHistory[i]);
      }
      if (next.length >= 8) {
        break;
      }
    }
    this.taskHistory = next;
  },

  applyCodexSnapshot(payload) {
    this.codexStatus = payload.status || this.codexStatus;
    this.codexStage = payload.stage || this.codexStage;
    this.codexMessage = payload.message || this.codexMessage;
    this.codexTranscript = payload.transcript || this.codexTranscript;
    this.codexFinalText = payload.finalText || this.codexFinalText;
    this.codexSpeechText = payload.speechText || this.codexSpeechText;
    this.codexError = payload.error || '';
    this.codexElapsedText = this.formatElapsed(payload.elapsedMs || 0);
    if (this.codexOrigin === 'record' && this.codexTranscript) {
      this.recordText = this.codexTranscript;
    }
    this.upsertTaskHistory();
  },

  startCodexPolling(delay) {
    var self = this;
    if (!this.codexTaskId || this.codexPollTimer) {
      return;
    }
    if (this.subPage !== 'task' && this.subPage !== 'result') {
      return;
    }
    this.codexPollTimer = setTimeout(function () {
      self.codexPollTimer = null;
      self.pollCodexTask();
    }, delay === undefined ? CODEX_POLL_MS : delay);
  },

  stopCodexPolling() {
    if (this.codexPollTimer) {
      clearTimeout(this.codexPollTimer);
      this.codexPollTimer = null;
    }
  },

  pollCodexTask() {
    var self = this;
    if (!this.codexTaskId || (this.subPage !== 'task' && this.subPage !== 'result')) {
      return;
    }
    this.networkRequest(this.getServiceUrl('/api/codex/task/' + this.codexTaskId), {
      method: http.RequestMethod.GET,
      header: this.codexHeaders(),
      connectTimeout: 8000,
      readTimeout: 15000
    }).then(function (result) {
      var payload = self.parseHttpResult(result.result);
      self.applyCodexSnapshot(payload);
      if (payload.status === 'succeeded') {
        self.showCodexResult();
        return;
      }
      if (payload.status === 'failed' || payload.status === 'cancelled') {
        self.showToast(payload.status === 'cancelled' ? '任务已停止' : '任务执行失败');
        return;
      }
      self.startCodexPolling();
    }).catch(function (error) {
      if (self.subPage !== 'task' && self.subPage !== 'result') {
        return;
      }
      self.codexStage = '连接中断';
      self.codexMessage = '任务仍在 PC 执行，恢复连接后继续同步';
      self.startCodexPolling(3000);
    });
  },

  showCodexResult() {
    this.summaryItems = this.buildCodexSummary(this.codexFinalText);
    this.resultTab = 'summary';
    this.subPage = 'result';
    this.mainVisible = false;
    this.stopCodexPolling();
    if (this.codexOrigin === 'text' && !this.codexResultCommitted &&
      this.codexChatThreadId === this.currentThreadId && this.codexFinalText) {
      this.chatMessages.push({ role: 'assistant', text: this.codexFinalText });
      this.refreshChatView();
      this.syncCurrentThread();
      this.codexResultCommitted = true;
    }
  },

  buildCodexSummary(text) {
    var source = (text || '').replace(/\r/g, '').trim();
    if (!source) {
      return ['Codex 未返回内容'];
    }
    var lines = source.split('\n');
    var items = [];
    for (var i = 0; i < lines.length && items.length < 4; i++) {
      var line = lines[i].replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)])\s*/, '').trim();
      if (line && line.indexOf('```') < 0 && line.charAt(0) !== '|') {
        items.push(line);
      }
    }
    if (items.length <= 1) {
      var sentences = source.match(/[^。！？；]+[。！？；]?/g) || [source];
      items = [];
      for (var j = 0; j < sentences.length && items.length < 4; j++) {
        var sentence = sentences[j].trim();
        if (sentence) {
          items.push(sentence);
        }
      }
    }
    return items.length ? items : [source.substring(0, 120)];
  },

  cancelCodexTask() {
    var self = this;
    if (!this.codexTaskId || this.codexStatus === 'succeeded' || this.codexStatus === 'failed' ||
      this.codexStatus === 'cancelled') {
      return;
    }
    this.codexStage = '正在停止';
    this.codexMessage = '正在结束 Codex 子进程';
    this.networkRequest(this.getServiceUrl('/api/codex/task/' + this.codexTaskId + '/cancel'), {
      method: http.RequestMethod.POST,
      header: this.codexHeaders(),
      extraData: {},
      connectTimeout: 8000,
      readTimeout: 15000
    }).then(function () {
      self.startCodexPolling(500);
    }).catch(function () {
      self.showToast('停止请求失败');
    });
  },

  openCodexTask(item) {
    if (!item || !item.id) {
      return;
    }
    this.codexTaskId = item.id;
    this.codexStatus = item.status || 'queued';
    this.codexStage = '正在同步';
    this.codexMessage = '读取任务状态';
    this.codexOrigin = 'history';
    this.subPage = this.codexStatus === 'succeeded' ? 'result' : 'task';
    this.mainVisible = false;
    this.startCodexPolling(0);
  },

  openLatestCodexTask() {
    if (this.taskHistory.length) {
      this.openCodexTask(this.taskHistory[0]);
    }
  },

  resumeVoiceFromAnswer() {
    this.subPage = '';
    this.mainVisible = true;
    this.startVoice();
  },

  copyVoiceAnswer() {
    this.copyText(this.voiceAnswerText || this.voiceResponseText || '', '回答');
  },

  continueVoiceChat() {
    this.subPage = '';
    this.mainVisible = true;
    this.newChat();
  },

  continueFromResult() {
    this.subPage = '';
    this.mainVisible = true;
    this.newChat();
  },

  openTextChatFromVoice() {
    if (this.voiceActive) {
      this.endVoice(false);
    }
    this.pageIndex = 2;
    this.mainVisible = true;
    this.subPage = '';
    if (this.threads.length) {
      this.openThreadById(this.currentThreadId);
    } else {
      this.newChat();
    }
  },

  openRecordFromVoice() {
    if (this.voiceActive) {
      this.endVoice(false);
    }
    this.mainVisible = true;
    this.subPage = '';
    this.pageIndex = 1;
    this.startRecording();
  },

  networkRequest(url, options) {
    return new Promise(function (resolve, reject) {
      var request = http.createHttp();
      var extraData = options.extraData;
      if (extraData !== undefined && !(extraData instanceof ArrayBuffer) &&
        typeof extraData !== 'string') {
        extraData = JSON.stringify(extraData);
      }
      request.request(url, {
        method: options.method || http.RequestMethod.GET,
        header: options.header || {},
        extraData: extraData,
        connectTimeout: options.connectTimeout || 60000,
        readTimeout: options.readTimeout || 180000
      }, function (error, result) {
        try { request.destroy(); } catch (destroyError) {}
        if (error) {
          var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
          console.info('[NOVA_NET] request failed: ' + message);
          reject(new Error(message));
          return;
        }
        var status = result && result.responseCode ? result.responseCode : 200;
        console.info('[NOVA_NET] response ' + url + ' code=' + status);
        if (status < 200 || status >= 300) {
          reject(new Error('HTTP ' + status));
          return;
        }
        resolve({ result: result ? result.result : '', responseCode: status });
      });
    });
  },

  parseHttpResult(result) {
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    if (result instanceof ArrayBuffer) {
      var bytes = new Uint8Array(result);
      var text = '';
      for (var i = 0; i < bytes.length; i++) {
        text += String.fromCharCode(bytes[i]);
      }
      return JSON.parse(text);
    }
    return result;
  },

  refreshChatView() {
    var start = this.chatMessages.length > 3 ? this.chatMessages.length - 3 : 0;
    this.visibleChatMessages = copyMessages(this.chatMessages.slice(start));
  },

  replacePendingAssistant(pending, finalText) {
    var messages = copyMessages(this.chatMessages);
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].text === pending) {
        messages[i].text = finalText;
        break;
      }
    }
    this.chatMessages = messages;
    this.refreshChatView();
    this.syncCurrentThread();
  },

  toggleRecording() {
    if (this.recordSubmitting) {
      return;
    }
    if (this.recordRunning) {
      this.pauseRecording();
    } else if (this.recordSeconds > 0) {
      this.resumeRecording();
    } else {
      this.startRecording();
    }
  },

  startRecordingFromHome() {
    if (this.subPage) {
      this.closeSubPage();
    }
    this.setPage(1);
    this.startRecording();
  },

  startRecording() {
    var self = this;
    if (this.voiceActive) {
      this.endVoice(false);
    }
    this.stopRecordCaptureOnly();
    this.stopRecordingTickerOnly();
    this.recordRunning = true;
    this.recordPaused = false;
    this.recordHasProgress = true;
    this.recordSubmitting = false;
    this.recordSeconds = 0;
    this.recordTimer = '00:00';
    this.recordStatus = '正在请求麦克风';
    this.recordControlLabel = 'Ⅱ 暂停';
    this.recordInputLevel = 0;
    this.recordMarks = [];
    this.recordPcmChunks = [];
    this.recordText = '';
    this.recordStartedAt = Date.now();
    this.recordTicker = setInterval(function () {
      self.recordSeconds = Math.floor((Date.now() - self.recordStartedAt) / 1000);
      self.recordTimer = pad2(Math.floor(self.recordSeconds / 60)) + ':' + pad2(self.recordSeconds % 60);
    }, 500);
    try {
      var context = featureAbility.getContext();
      context.requestPermissionsFromUser(['ohos.permission.MICROPHONE'], 102).then(function (result) {
        var granted = result && result.authResults && result.authResults.length &&
          result.authResults[0] === 0;
        if (!granted) {
          self.recordRunning = false;
          self.recordHasProgress = false;
          self.recordStatus = '未获得麦克风权限';
          self.stopRecordingTickerOnly();
          self.showToast('未获得麦克风权限');
          return;
        }
        self.startRecordCapturer();
      }).catch(function () {
        self.recordRunning = false;
        self.recordHasProgress = false;
        self.recordStatus = '麦克风权限请求失败';
        self.stopRecordingTickerOnly();
        self.showToast('麦克风权限请求失败');
      });
    } catch (error) {
      this.recordRunning = false;
      this.recordHasProgress = false;
      this.recordStatus = '麦克风不可用';
      this.stopRecordingTickerOnly();
      this.showToast('麦克风不可用');
    }
  },

  startRecordCapturer() {
    var self = this;
    var options = {
      streamInfo: {
        samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
        channels: audio.AudioChannel.CHANNEL_1,
        sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
        encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW
      },
      capturerInfo: {
        source: audio.SourceType.SOURCE_TYPE_MIC,
        capturerFlags: 0
      }
    };
    this.stopRecordCaptureOnly();
    audio.createAudioCapturer(options).then(function (capturer) {
      self.audioCapturer = capturer;
      return capturer.start();
    }).then(function () {
      if (!self.recordRunning) {
        self.stopRecordCaptureOnly();
        return;
      }
      self.recordCaptureActive = true;
      self.recordStatus = '正在录音';
      self.captureRecordChunk();
      self.armRecordMaxDuration();
    }).catch(function () {
      self.recordCaptureActive = false;
      self.recordRunning = false;
      self.recordHasProgress = false;
      self.recordStatus = '麦克风启动失败';
      self.stopRecordingTickerOnly();
      self.showToast('麦克风启动失败');
    });
  },

  captureRecordChunk() {
    var self = this;
    if (!this.recordRunning || !this.audioCapturer || !this.recordCaptureActive) {
      return;
    }
    var capturer = this.audioCapturer;
    capturer.read(VOICE_CHUNK_BYTES, true).then(function (buffer) {
      if (!self.recordRunning || !self.recordCaptureActive || self.audioCapturer !== capturer) {
        return;
      }
      self.recordPcmChunks.push(buffer);
      self.recordInputLevel = self.computePcmLevel(buffer);
      self.recordStatus = '正在录音 · 输入 ' + self.recordInputLevel + '%';
      var bytes = self.recordCapturedBytes();
      if (bytes >= VOICE_SAMPLE_RATE * 2 * RECORD_MAX_SECONDS) {
        self.finishRecording();
        return;
      }
      self.captureRecordChunk();
    }).catch(function () {
      if (self.recordRunning) {
        self.recordStatus = '麦克风读取失败';
        self.recordRunning = false;
        self.stopRecordingTickerOnly();
        self.stopRecordCaptureOnly();
      }
    });
  },

  recordCapturedBytes() {
    var total = 0;
    for (var i = 0; i < this.recordPcmChunks.length; i++) {
      total += this.recordPcmChunks[i].byteLength;
    }
    return total;
  },

  armRecordMaxDuration() {
    var self = this;
    if (this.recordMaxTimer) {
      clearTimeout(this.recordMaxTimer);
    }
    var remaining = Math.max(1000, (RECORD_MAX_SECONDS - this.recordSeconds) * 1000);
    this.recordMaxTimer = setTimeout(function () {
      self.recordMaxTimer = null;
      if (self.recordRunning) {
        self.finishRecording();
      }
    }, remaining);
  },

  pauseRecording() {
    if (this.recordStartedAt) {
      this.recordSeconds = Math.floor((Date.now() - this.recordStartedAt) / 1000);
    }
    this.stopRecordingTickerOnly();
    this.stopRecordCaptureOnly();
    this.recordRunning = false;
    this.recordPaused = true;
    this.recordHasProgress = true;
    this.recordStatus = '录制已暂停';
    this.recordControlLabel = '● 继续';
    this.recordTimer = pad2(Math.floor(this.recordSeconds / 60)) + ':' + pad2(this.recordSeconds % 60);
    this.showToast('录音已暂停');
  },

  resumeRecording() {
    this.stopRecordingTickerOnly();
    this.recordRunning = true;
    this.recordPaused = false;
    this.recordHasProgress = true;
    this.recordStatus = '正在录制';
    this.recordControlLabel = 'Ⅱ 暂停';
    this.recordStartedAt = Date.now() - this.recordSeconds * 1000;
    var self = this;
    this.recordTicker = setInterval(function () {
      self.recordSeconds = Math.floor((Date.now() - self.recordStartedAt) / 1000);
      self.recordTimer = pad2(Math.floor(self.recordSeconds / 60)) + ':' + pad2(self.recordSeconds % 60);
    }, 500);
    this.startRecordCapturer();
    this.showToast('继续录音');
  },

  finishRecording() {
    var self = this;
    if (this.recordSubmitting) {
      return;
    }
    if (this.recordRunning && this.recordStartedAt) {
      this.recordSeconds = Math.floor((Date.now() - this.recordStartedAt) / 1000);
    }
    this.stopRecordingTickerOnly();
    this.stopRecordCaptureOnly();
    this.recordRunning = false;
    this.recordPaused = false;
    this.recordControlLabel = '开始录音';
    if (this.recordCapturedBytes() < VOICE_SAMPLE_RATE / 2) {
      this.recordHasProgress = false;
      this.recordStatus = '录音太短，请重试';
      this.recordPcmChunks = [];
      this.showToast('录音太短，请重试');
      return;
    }
    var pcm = this.concatChunks(this.recordPcmChunks);
    this.recordPcmChunks = [];
    this.recordHasProgress = true;
    this.recordSubmitting = true;
    this.recordStatus = '正在识别录音';
    this.recordText = '';
    this.showToast('录音完成，正在提交');
    var transcript = '';
    this.transcribePcm(pcm).then(function (text) {
      transcript = text;
      self.recordText = text;
      self.recordStatus = '正在生成摘要';
      return self.requestModel([
        { role: 'system', content: '你是会议记录助手。把用户提供的录音转写整理成 3 到 4 条简洁中文摘要，每行一条，不要添加标题。' },
        { role: 'user', content: text }
      ]);
    }).then(function (summary) {
      self.recordSubmitting = false;
      self.codexTranscript = transcript;
      self.codexFinalText = summary;
      self.summaryItems = self.buildCodexSummary(summary);
      self.resultTab = 'summary';
      self.recordStatus = '摘要已生成';
      self.subPage = 'result';
      self.mainVisible = false;
      self.showToast('摘要已生成');
    }).catch(function () {
      self.recordSubmitting = false;
      if (transcript) {
        self.codexTranscript = transcript;
        self.codexFinalText = transcript;
        self.summaryItems = self.summarize(transcript);
        self.resultTab = 'summary';
        self.recordStatus = '已转写 · 摘要使用本地整理';
        self.subPage = 'result';
        self.mainVisible = false;
        self.showToast('摘要生成失败，已保留转写');
        return;
      }
      self.recordStatus = '提交失败 · 可重新录音';
      self.recordHasProgress = false;
      self.showToast('语音服务不可用');
    });
  },

  markRecording() {
    if (this.recordSubmitting) {
      return;
    }
    if (!this.recordHasProgress) {
      this.showToast('请先开始录音');
      return;
    }
    this.recordMarks.push(this.recordTimer);
    this.showToast('已标记 ' + this.recordTimer);
  },

  stopRecording() {
    this.finishRecording();
  },

  stopRecordingTickerOnly() {
    if (this.recordTicker) {
      clearInterval(this.recordTicker);
      this.recordTicker = null;
    }
  },

  stopRecordCaptureOnly() {
    var capturer = this.audioCapturer;
    this.audioCapturer = null;
    this.recordCaptureActive = false;
    if (this.recordMaxTimer) {
      clearTimeout(this.recordMaxTimer);
      this.recordMaxTimer = null;
    }
    if (!capturer) {
      return;
    }
    try {
      capturer.stop().then(function () {
        return capturer.release();
      }).catch(function () {
        try { capturer.release(); } catch (error) {}
      });
    } catch (error) {
      try { capturer.release(); } catch (releaseError) {}
    }
  },

  summarize(text) {
    var source = (text || '').replace(/\s+/g, ' ').trim();
    if (!source) {
      return ['没有可总结的内容', '请先录制并转写一段语音'];
    }
    if (source.indexOf('后续的市场计划') >= 0 && source.indexOf('产品设计') >= 0) {
      return ['项目进展整体顺利', '产品设计方案已确认', '开发预计下周完成', '下一步推进市场推广'];
    }
    var parts = source.split(/[。！？\n]+/);
    var result = [];
    for (var i = 0; i < parts.length && result.length < 4; i++) {
      var item = parts[i].trim();
      if (item) {
        result.push(item);
      }
    }
    return result.length ? result : ['已完成录音转写', '可继续编辑文本或重新录制'];
  },

  editTranscript() {
    this.editBuffer = this.recordText;
    this.editingTranscript = true;
  },

  cancelTranscriptEdit() {
    this.editingTranscript = false;
  },

  onTranscriptInput(event) {
    this.editBuffer = event.value;
  },

  saveTranscript() {
    this.recordText = (this.editBuffer || '').trim();
    this.summaryItems = this.summarize(this.recordText);
    this.editingTranscript = false;
    this.showToast('转写文本已保存');
  },

  copyTranscript() {
    this.copyText(this.recordText, '转写');
  },

  copySummary() {
    this.copyText(this.summaryItems.join('\n'), '摘要');
  },

  copyResult() {
    if (this.resultTab === 'summary') {
      this.copySummary();
    } else {
      this.copyText(this.codexFinalText, '转写');
    }
  },

  copyText(value, name) {
    var self = this;
    try {
      var data = pasteboard.createPlainTextData(value);
      pasteboard.getSystemPasteboard().setPasteData(data, function (error) {
        self.showToast(error ? '复制失败，请检查剪贴板权限' : name + '已复制');
      });
    } catch (error) {
      this.showToast('复制失败，无法访问剪贴板');
    }
  },

  showTranscript() {
    this.resultTab = 'transcript';
    if (this.subPage !== 'result') {
      this.openSubPage('result');
    }
  },

  showSummary() {
    this.resultTab = 'summary';
    if (this.subPage !== 'result') {
      this.openSubPage('result');
    }
  },

  openRoundInterface() {
    this.stopVoiceResources();
    try {
      router.push({ uri: 'pages/round/index' });
    } catch (error) {
      this.showToast('打开失败');
    }
  },

  restartRecording() {
    this.resetRecordingTimer();
    this.subPage = '';
    this.mainVisible = true;
    this.pageIndex = 1;
  },

  sendChat() {
    var self = this;
    var text = (this.chatInput || '').trim();
    if (!text) {
      this.showToast('请输入消息');
      return;
    }
    var context = [{ role: 'system', content: MODEL_SYSTEM_PROMPT }];
    var start = this.chatMessages.length > 12 ? this.chatMessages.length - 12 : 0;
    for (var i = start; i < this.chatMessages.length; i++) {
      var item = this.chatMessages[i];
      if (item.role === 'user' || item.role === 'assistant') {
        context.push({ role: item.role, content: item.text });
      }
    }
    context.push({ role: 'user', content: text });
    var pending = '思考中…';
    var withPending = copyMessages(this.chatMessages);
    withPending.push({ role: 'user', text: text });
    withPending.push({ role: 'assistant', text: pending });
    this.chatMessages = withPending;
    this.refreshChatView();
    if (this.chatTitle === '新对话') {
      this.chatTitle = text.length > 12 ? text.substring(0, 12) + '...' : text;
    }
    this.syncCurrentThread();
    this.chatInput = '';
    this.requestModel(context).then(function (reply) {
      self.replacePendingAssistant(pending, reply);
      self.serviceStatus = '已连接';
    }).catch(function (error) {
      var message = self.describeNetworkError(error);
      self.replacePendingAssistant(pending, '请求失败：' + message);
      self.serviceStatus = '连接失败';
      self.showToast('真实模型请求失败');
    });
  },

  findThread(id) {
    for (var i = 0; i < this.threads.length; i++) {
      if (this.threads[i].id === id) {
        return this.threads[i];
      }
    }
    return null;
  },

  openThread(thread) {
    if (thread && thread.id) {
      this.openThreadById(thread.id);
    }
  },

  openThreadById(id) {
    var thread = this.findThread(id);
    if (!thread) {
      this.showToast('会话不存在');
      return;
    }
    this.currentThreadId = thread.id;
    this.chatTitle = thread.title;
    this.chatMessages = copyMessages(thread.messages);
    this.refreshChatView();
    this.chatVisible = true;
    this.chatComposerVisible = false;
    this.openSubPage('chat');
  },

  syncCurrentThread() {
    var thread = this.findThread(this.currentThreadId);
    if (!thread) {
      return;
    }
    thread.title = this.chatTitle;
    thread.messages = copyMessages(this.chatMessages);
    if (this.chatMessages.length === 0) {
      thread.preview = '空对话';
    } else {
      var last = this.chatMessages[this.chatMessages.length - 1].text;
      thread.preview = last.length > 24 ? last.substring(0, 24) + '...' : last;
    }
  },

  openThreadAi() {
    this.openThreadById('ai');
  },

  openThreadFitness() {
    this.openThreadById('fitness');
  },

  openThreadMeeting() {
    this.openThreadById('meeting');
  },

  newChat() {
    var id = 'thread-' + Date.now();
    var thread = {
      id: id,
      title: '新对话',
      preview: '空对话',
      mark: '新',
      markClass: 'blue-mark',
      messages: []
    };
    this.threads.push(thread);
    this.recentThreads.push(thread);
    this.currentThreadId = id;
    this.chatTitle = '新对话';
    this.chatMessages = [];
    this.visibleChatMessages = [];
    this.chatInput = '';
    this.chatVisible = true;
    this.chatComposerVisible = false;
    this.openSubPage('chat');
  },

  closeChat() {
    this.syncCurrentThread();
    this.chatVisible = false;
    this.pageIndex = 2;
    this.subPage = '';
    this.mainVisible = true;
  },

  toggleChatComposer() {
    this.chatComposerVisible = !this.chatComposerVisible;
  },

  clearChat() {
    this.chatMessages = [];
    this.syncCurrentThread();
    this.showToast('当前对话已清空');
  },

  onChatInput(event) {
    this.chatInput = event.value;
  },

  demoReply(text) {
    if (text.indexOf('健身') >= 0 || text.indexOf('训练') >= 0) {
      return '建议从每周 3 次力量训练和 2 次轻有氧开始，注意热身和恢复。';
    }
    if (text.indexOf('会议') >= 0 || text.indexOf('项目') >= 0) {
      return '可以按项目进展、已确认事项、待办任务和下一步安排整理会议重点。';
    }
    if (text.indexOf('AI') >= 0 || text.indexOf('人工智能') >= 0) {
      return '人工智能通过机器学习理解语言和数据，可辅助医疗、教育、创作与办公。';
    }
    return '我会先整理核心信息，再给出清晰、可执行的建议。';
  },

  toggleHaptics() {
    this.hapticsEnabled = !this.hapticsEnabled;
    this.showToast(this.hapticsEnabled ? '触感反馈已开启' : '触感反馈已关闭');
  }
};
