import pasteboard from '@ohos.pasteboard';
import audio from '@ohos.multimedia.audio';
import featureAbility from '@ohos.ability.featureAbility';
import http from '@ohos.net.http';
import systemFetch from '@system.fetch';

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
var VOICE_MAX_SECONDS = 15;
var RECORD_MAX_SECONDS = 60;
var CODEX_POLL_MS = 1500;
var LOCAL_SERVICE_URL = 'http://192.168.1.129:8787';
var LOCAL_MODEL = 'translategemma:4b';
var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default {
  data: {
    clockText: '00:00',
    dateText: '',
    pageIndex: 0,
    mainVisible: true,
    subPage: '',

    toastVisible: false,
    toastText: '',

    voiceActive: false,
    voiceState: 'idle',
    voiceTimer: '00:00',
    voiceStatus: '正在聆听',
    voiceResponseText: '',
    voiceAnswerText: '',
    voiceMode: 'codex',
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
    recordControlLabel: '开始录音',
    recordInputLevel: 0,
    recordWaveBars: [],
    recordMarks: [],
    resultTab: 'summary',
    recordText: '',

    codexToken: '',
    codexRepoId: 'watch',
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

    apiBaseUrl: LOCAL_SERVICE_URL,
    apiKey: '',
    apiModel: LOCAL_MODEL,
    apiSaved: false,
    apiStateText: '尚未测试',
    apiMark: 'API',
    hapticsEnabled: true,
    fieldName: 'url',
    fieldTitle: '服务地址',
    fieldHint: 'HTTP / HTTPS 地址',
    fieldStep: '1 / 3',
    fieldValue: ''
  },


  continueChat() {
    this.chatInput = '继续展开';
    this.sendChat();
  },

  onInit() {
    var self = this;
    this.clockTicker = null;
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
    this.voiceStartedAt = 0;
    this.recordStartedAt = 0;
    this.chatSwipeAt = 0;
    this.menuSwipeTimer = null;
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.recordWaveBars = this.buildWaveBars();
    this.updateClock();
    this.clockTicker = setInterval(function () {
      self.updateClock();
    }, 15000);
  },

  onDestroy() {
    this.clearAllTimers();
    if (this.clockTicker) {
      clearInterval(this.clockTicker);
      this.clockTicker = null;
    }
  },

  clearAllTimers() {
    if (this.menuSwipeTimer) {
      clearTimeout(this.menuSwipeTimer);
      this.menuSwipeTimer = null;
    }
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
    if (this.subPage === 'task' && this.codexTaskId) {
      this.startCodexPolling();
    }
  },

  buildWaveBars() {
    var bars = [];
    for (var i = 0; i < 58; i++) {
      var distance = Math.abs(i - 28.5) / 28.5;
      var height = 8 + Math.round((1 - distance) * 42 + Math.abs(Math.sin(i * 1.71)) * 14);
      bars.push({ height: height, delay: ((i * 7) % 10) / 10 });
    }
    return bars;
  },

  updateClock() {
    var now = new Date();
    this.clockText = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    this.dateText = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + WEEKDAYS[now.getDay()];
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
      var shortList = this.pageIndex === 2 &&
        this.taskHistory.length + this.threads.length + 1 <= 5;
      if (event.direction === 'up' && !this.mainListAtEnd && !shortList) {
        this.mainListAtStart = false;
        return;
      }
      if (event.direction === 'down' && !this.mainListAtStart) {
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

  mainListReachedStart() {
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
  },

  mainListReachedEnd() {
    this.mainListAtEnd = true;
    this.mainListAtStart = false;
  },

  queueMenuPage(index) {
    if (this.menuSwipeTimer) return;
    var self = this;
    // Wait for the current finger drag to finish before mounting a fresh list.
    this.menuSwipeTimer = setTimeout(function () {
      self.menuSwipeTimer = null;
      if (!self.subPage && self.mainVisible) self.setPage(index);
    }, 220);
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
    this.pageIndex = nextIndex;
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
    if (this.subPage === 'field') {
      this.subPage = 'api';
      this.mainVisible = false;
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
    } else if (this.subPage === 'api') {
      this.pageIndex = 3;
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
    var self = this;
    this.voiceParentSubPage = this.subPage === 'chat' ? 'chat' : '';
    this.openSubPage('voice');
    this.clearVoiceTimers();
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
          self.showToast('未获得麦克风权限');
          return;
        }
        self.createAndStartCapturer();
      }).catch(function (error) {
        self.voiceCaptureStarting = false;
        self.voiceState = 'error';
        self.voiceStatus = '麦克风权限请求失败';
        self.voiceResponseText = '无法请求系统权限';
        self.showToast('麦克风权限请求失败');
      });
    } catch (error) {
      this.voiceCaptureStarting = false;
      this.voiceState = 'error';
      this.voiceStatus = '麦克风权限不可用';
      this.voiceResponseText = '当前系统未提供录音权限接口';
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
      self.voiceStatus = '正在聆听 · 麦克风已连接';
      self.captureAudioChunk();
      self.armVoiceMaxDuration();
    }).catch(function (error) {
      self.voiceCaptureActive = false;
      self.voiceState = 'error';
      self.voiceStatus = '麦克风启动失败';
      self.voiceResponseText = '无法打开真实麦克风';
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
      self.voiceStatus = '正在聆听 · 输入 ' + self.voiceInputLevel + '%';
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

  simulateVoiceTurn() {
    if (!this.voiceActive) {
      this.startVoice();
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
      this.showToast('说话时间太短，请再说一次');
      return;
    }
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
        self.serviceStatus = '连接失败';
        self.showToast('Codex 后端不可用');
      });
      return;
    }
    this.voiceStatus = '正在识别真实语音';
    var base = this.getServiceUrl('');
    var voiceBody = {
      pcmBase64: this.encodePcmBase64(pcm),
      sampleRate: VOICE_SAMPLE_RATE,
      model: this.apiModel || LOCAL_MODEL
    };
    this.networkRequest(base + '/api/voice', {
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-Nova-Model': this.apiModel || LOCAL_MODEL
      },
      extraData: voiceBody,
      connectTimeout: 60000,
      readTimeout: 180000
    }).then(function (result) {
      if (!self.voiceActive) {
        return;
      }
      var payload = self.parseHttpResult(result.result);
      var transcript = (payload.transcript || '').trim();
      var reply = (payload.reply || '').trim();
      if (!reply) {
        throw new Error('empty response');
      }
      self.voiceTranscriptText = transcript;
      self.voiceResponseText = (transcript ? '识别：' + transcript + '\n' : '') + reply;
      self.voiceAnswerText = reply;
      self.voiceState = 'answered';
      self.voiceStatus = '回答完成 · 手表保持静音';
      self.serviceStatus = '已连接';
      self.apiSaved = true;
      self.apiStateText = '服务已连接';
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
      self.voiceStatus = '真实服务请求失败';
      self.voiceResponseText = self.describeNetworkError(error);
      self.showToast('真实语音请求失败');
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
    this.voiceStatus = '正在聆听';
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
    var base = (this.apiBaseUrl || LOCAL_SERVICE_URL).trim().replace(/\/+$/, '');
    if (!path) {
      return base;
    }
    return base + (path.charAt(0) === '/' ? path : '/' + path);
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
      var body = {
        pcmBase64: self.encodePcmBase64(pcm),
        sampleRate: VOICE_SAMPLE_RATE,
        repoId: self.codexRepoId,
        mode: 'readonly'
      };
      self.networkRequest(self.getServiceUrl('/api/codex/voice'), {
        method: http.RequestMethod.POST,
        header: self.codexHeaders(),
        extraData: body,
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

  toggleVoiceMode() {
    this.voiceMode = this.voiceMode === 'codex' ? 'ollama' : 'codex';
    this.showToast(this.voiceMode === 'codex' ? '语音后端：Codex 只读' : '语音后端：Ollama 即时');
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

  encodePcmBase64(buffer) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var bytes = new Uint8Array(buffer);
    var parts = [];
    var chunkSize = 3 * 4096;
    for (var start = 0; start < bytes.length; start += chunkSize) {
      var end = Math.min(start + chunkSize, bytes.length);
      var chunk = bytes.subarray(start, end);
      var output = '';
      for (var i = 0; i < chunk.length; i += 3) {
        var a = chunk[i];
        var hasB = i + 1 < chunk.length;
        var hasC = i + 2 < chunk.length;
        var b = hasB ? chunk[i + 1] : 0;
        var c = hasC ? chunk[i + 2] : 0;
        output += chars.charAt(a >> 2);
        output += chars.charAt(((a & 3) << 4) | (b >> 4));
        output += hasB ? chars.charAt(((b & 15) << 2) | (c >> 6)) : '=';
        output += hasC ? chars.charAt(c & 63) : '=';
      }
      parts.push(output);
    }
    return parts.join('');
  },

  networkRequest(url, options) {
    if (options.extraData instanceof ArrayBuffer) {
      return this.httpBinaryRequest(url, options);
    }
    var method = options.method || 'GET';
    return new Promise(function (resolve, reject) {
      var fetchOptions = {
        url: url,
        method: method,
        header: options.header || {},
        responseType: 'text',
        success: function (data) {
          var status = data && data.code ? data.code : 200;
          console.info('[NOVA_NET] fetch success ' + url + ' code=' + status);
          if (status < 200 || status >= 300) {
            reject(new Error('HTTP ' + status));
            return;
          }
          resolve({ result: data ? data.data : '', responseCode: status });
        },
        fail: function (error, code) {
          var message = (error && (error.message || error.data)) || ('fetch ' + code);
          console.info('[NOVA_NET] fetch failed: ' + message);
          reject(new Error(message));
        }
      };
      if (options.extraData !== undefined && method !== 'GET') {
        fetchOptions.data = options.extraData;
      }
      try {
        systemFetch.fetch(fetchOptions);
      } catch (error) {
        reject(error);
      }
    });
  },

  httpBinaryRequest(url, options) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var request = http.createHttp();
      request.request(url, {
        method: options.method || http.RequestMethod.POST,
        header: options.header || {},
        extraData: options.extraData,
        connectTimeout: options.connectTimeout || 60000,
        readTimeout: options.readTimeout || 180000
      }, function (error, result) {
        try { request.destroy(); } catch (destroyError) {}
        if (error) {
          var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
          console.info('[NOVA_NET] binary request failed: ' + message);
          reject(new Error(message));
          return;
        }
        if (result.responseCode < 200 || result.responseCode >= 300) {
          reject(new Error('HTTP ' + result.responseCode));
          return;
        }
        resolve(result);
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
    this.recordStatus = '正在转写并创建任务';
    this.recordText = '';
    this.showToast('录音完成，正在提交');
    this.submitCodexVoice(pcm, 'record').catch(function (error) {
      self.recordStatus = '提交失败 · 可重新录音';
      self.recordHasProgress = false;
      self.showToast('Codex 后端不可用');
    });
  },

  markRecording() {
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

  showCodexModelInfo() {
    this.showToast(this.codexModelLabel + ' · 由 PC 固定');
  },

  showSilentInfo() {
    this.showToast('手表不会播放 TTS');
  },

  restartRecording() {
    this.resetRecordingTimer();
    this.subPage = '';
    this.mainVisible = true;
    this.pageIndex = 1;
  },

  checkServiceHealth() {
    var self = this;
    var base = this.getServiceUrl('');
    this.apiStateText = '正在测试服务';
    return this.networkRequest(base + '/health', {
      method: http.RequestMethod.GET,
      connectTimeout: 8000,
      readTimeout: 12000
    }).then(function (result) {
      var payload = self.parseHttpResult(result.result);
      var ok = payload && payload.ok === true;
      var codexAvailable = !!(payload && payload.codex && payload.codex.available);
      self.codexAvailable = codexAvailable;
      if (payload && payload.codex && payload.codex.model) {
        var modelName = String(payload.codex.model);
        self.codexModelLabel = modelName.indexOf('deepseek') >= 0 ?
          'DeepSeek V4.1 Flash' : modelName;
      }
      self.apiSaved = ok && codexAvailable;
      self.serviceStatus = !ok ? '服务异常' :
        (codexAvailable ? '已连接 · Codex 就绪' : '服务已连接 · 后端离线');
      self.apiStateText = !ok ? '服务返回异常' :
        (codexAvailable ? 'Codex 后端可用' : 'Magpie 后端不可用');
      return ok && codexAvailable;
    }).catch(function (error) {
      var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
      console.info('[NOVA_NET] health failed: ' + message);
      self.apiSaved = false;
      self.codexAvailable = false;
      self.serviceStatus = '连接失败';
      self.apiStateText = '错误:' + message.substring(0, 28);
      return false;
    });
  },

  sendChat() {
    var self = this;
    var text = (this.chatInput || '').trim();
    if (!text) {
      this.showToast('请输入消息');
      return;
    }
    var updated = copyMessages(this.chatMessages);
    updated.push({ role: 'user', text: text });
    this.chatMessages = updated;
    this.refreshChatView();
    if (this.chatTitle === '新对话') {
      this.chatTitle = text.length > 12 ? text.substring(0, 12) + '...' : text;
    }
    this.syncCurrentThread();
    this.chatInput = '';
    if (this.voiceMode === 'codex') {
      this.codexChatThreadId = this.currentThreadId;
      this.submitCodexText(text, text).catch(function (error) {
        var message = self.describeNetworkError(error);
        self.chatMessages.push({ role: 'assistant', text: 'Codex 任务创建失败：' + message });
        self.refreshChatView();
        self.syncCurrentThread();
        self.showToast('Codex 任务创建失败');
      });
      return;
    }
    var pending = '正在请求真实模型…';
    var withPending = copyMessages(this.chatMessages);
    withPending.push({ role: 'assistant', text: pending });
    this.chatMessages = withPending;
    this.refreshChatView();
    this.syncCurrentThread();
    var base = this.getServiceUrl('');
    var isOpenAi = /\/v1\/?$/.test(base);
    var url = isOpenAi ? base + '/chat/completions' : base + '/api/chat';
    var body = isOpenAi ? {
      model: this.apiModel,
      messages: [{ role: 'user', content: text }]
    } : {
      model: this.apiModel || LOCAL_MODEL,
      prompt: text
    };
    var headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = 'Bearer ' + this.apiKey;
    }
    this.apiStateText = '模型生成中';
    this.networkRequest(url, {
      method: http.RequestMethod.POST,
      header: headers,
      extraData: body,
      connectTimeout: 60000,
      readTimeout: 180000
    }).then(function (result) {
      var payload = self.parseHttpResult(result.result);
      var reply = (payload.reply || '').trim();
      if (isOpenAi) {
        var choice = payload.choices && payload.choices[0];
        reply = choice && choice.message ? choice.message.content : reply;
      }
      if (!reply) {
        throw new Error('empty model reply');
      }
      self.replacePendingAssistant(pending, reply);
      self.serviceStatus = '已连接';
      self.apiStateText = '服务已连接';
      self.apiSaved = true;
    }).catch(function (error) {
      self.replacePendingAssistant(pending, '请求失败，请检查服务地址或网络');
      self.serviceStatus = '连接失败';
      self.apiStateText = '服务不可达';
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
    this.threads.push({
      id: id,
      title: '新对话',
      preview: '空对话',
      mark: '新',
      markClass: 'blue-mark',
      messages: []
    });
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

  openApiSettings() {
    this.openSubPage('api');
  },

  openField(name) {
    var labels = { url: '服务地址', token: '访问令牌', repo: '只读仓库', model: 'Ollama 模型' };
    var hints = {
      url: '局域网 HTTP 地址',
      token: 'X-Nova-Token，仅存当前内存',
      repo: '服务端白名单中的仓库 ID',
      model: '仅 Ollama 即时模式使用'
    };
    var steps = { url: '1 / 4', token: '2 / 4', repo: '3 / 4', model: '4 / 4' };
    var values = {
      url: this.apiBaseUrl,
      token: this.codexToken,
      repo: this.codexRepoId,
      model: this.apiModel
    };
    this.fieldName = name;
    this.fieldTitle = labels[name] || '服务设置';
    this.fieldHint = hints[name] || '';
    this.fieldStep = steps[name] || '1 / 4';
    this.fieldValue = values[name] || '';
    this.openSubPage('field');
  },

  onFieldInput(event) {
    this.fieldValue = event.value;
  },

  saveField() {
    var value = (this.fieldValue || '').trim();
    if (this.fieldName === 'url' && value && !/^https?:\/\/\S+$/i.test(value)) {
      this.showToast('请输入有效的 HTTP(S) 地址');
      return;
    }
    if (this.fieldName === 'url') {
      this.apiBaseUrl = value.replace(/\/+$/, '');
    } else if (this.fieldName === 'token') {
      this.codexToken = value;
    } else if (this.fieldName === 'repo') {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        this.showToast('仓库 ID 格式不正确');
        return;
      }
      this.codexRepoId = value;
    } else if (this.fieldName === 'model') {
      this.apiModel = value;
    }
    this.markApiDirty();
    this.subPage = 'api';
    this.mainVisible = false;
    this.showToast('已保存到当前内存');
  },

  toggleHaptics() {
    this.hapticsEnabled = !this.hapticsEnabled;
    this.showToast(this.hapticsEnabled ? '触感反馈已开启' : '触感反馈已关闭');
  },

  onApiUrlInput(event) {
    this.apiBaseUrl = event.value;
    this.markApiDirty();
  },

  onApiKeyInput(event) {
    this.apiKey = event.value;
    this.markApiDirty();
  },

  onApiModelInput(event) {
    this.apiModel = event.value;
    this.markApiDirty();
  },

  markApiDirty() {
    this.apiSaved = false;
    this.apiStateText = '尚未保存';
  },

  saveApiSettings() {
    var self = this;
    var url = (this.apiBaseUrl || '').trim();
    var model = (this.apiModel || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url) || !model) {
      this.apiSaved = false;
      this.apiStateText = '格式错误';
      this.showToast('请检查服务地址和模型名称');
      return;
    }
    if (this.voiceMode === 'codex' && !(this.codexToken || '').trim()) {
      this.apiSaved = false;
      this.apiStateText = '缺少访问令牌';
      this.showToast('Codex 模式必须填写访问令牌');
      return;
    }
    this.apiBaseUrl = url.replace(/\/+$/, '');
    this.apiModel = model;
    this.apiStateText = '正在测试真实服务';
    this.checkServiceHealth().then(function (ok) {
      if (ok) {
        self.showToast('服务与 Codex 后端连接成功');
      } else {
        self.showToast('服务或 Codex 后端不可用');
      }
    });
  },

  resetApiSettings() {
    this.apiBaseUrl = LOCAL_SERVICE_URL;
    this.apiKey = '';
    this.codexToken = '';
    this.apiModel = LOCAL_MODEL;
    this.apiSaved = false;
    this.apiStateText = '尚未测试';
    this.serviceStatus = '未连接';
    this.codexAvailable = false;
    this.showToast('已恢复本地服务默认值');
  }
};
