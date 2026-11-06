import pasteboard from '@ohos.pasteboard';
import audio from '@ohos.multimedia.audio';
import featureAbility from '@ohos.ability.featureAbility';
import http from '@ohos.net.http';
import systemFetch from '@system.fetch';
import media from '@ohos.multimedia.media';

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

var DEMO_TRANSCRIPT = '今天的产品评审确定：新版以粒子球作为语音入口，优先保证圆屏上的文字可读性。周三完成交互原型，周五进行手表实机测试。设计负责人确认页面，开发负责人检查动画性能。';
var VOICE_SAMPLE_RATE = 16000;
var VOICE_CHUNK_BYTES = 6400;
var VOICE_MAX_SECONDS = 15;
var LOCAL_SERVICE_URL = 'http://192.168.1.129:8787';
var LOCAL_MODEL = 'translategemma:4b';

export default {
  data: {
    clockText: '00:00',
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
    micMuted: false,
    speakerOn: true,
    micLabel: '麦克风',
    speakerLabel: '扬声器',
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
    resultTab: 'summary',
    recordText: DEMO_TRANSCRIPT,

    editingTranscript: false,
    editBuffer: '',
    summaryItems: ["今天的产品评审确定：新版以粒子球作为语音入口，优先保证圆屏上的文字可读性", "周三完成交互原型，周五进行手表实机测试", "设计负责人确认页面，开发负责人检查动画性能"],

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
    this.toastTimer = null;
    this.voiceMaxTimer = null;
    this.audioCapturer = null;
    this.audioPlayer = null;
    this.httpRequest = null;
    this.voicePcmChunks = [];
    this.voiceCaptureActive = false;
    this.voiceCaptureStarting = false;
    this.voiceStartedAt = 0;
    this.recordStartedAt = 0;
    this.chatSwipeAt = 0;
    this.menuSwipeTimer = null;
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
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
    this.stopVoiceResources();
    this.stopRecordingTickerOnly();
  },

  updateClock() {
    var now = new Date();
    this.clockText = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
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
      if (event.direction === 'right') {
        this.closeSubPage();
      }
      return;
    }
    // Render one menu at a time so native Swiper dragging cannot leave an
    // intermediate offset. Only vertical gestures change the main menu.
    // Scroll the list first; only an outward drag at its edge changes menus.
    if (this.pageIndex >= 2) {
      if (event.direction === 'up' && !this.mainListAtEnd) {
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
    if (!event || event.direction !== 'right') {
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
    if (this.subPage === 'chat') {
      this.syncCurrentThread();
      this.chatVisible = false;
      this.pageIndex = 2;
    } else if (this.subPage === 'transcript') {
      this.resetRecordingTimer();
      this.pageIndex = 1;
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
    this.stopVoicePlayback();
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
    this.speakerOn = true;
    this.micLabel = '麦克风';
    this.speakerLabel = '扬声器';
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
    var total = 0;
    for (var i = 0; i < this.voicePcmChunks.length; i++) {
      total += this.voicePcmChunks[i].byteLength;
    }
    if (!total) {
      return new ArrayBuffer(0);
    }
    var result = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < this.voicePcmChunks.length; j++) {
      result.set(new Uint8Array(this.voicePcmChunks[j]), offset);
      offset += this.voicePcmChunks[j].byteLength;
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
    if (!this.voiceActive || this.voiceState === 'thinking' || this.voiceState === 'speaking') {
      return;
    }
    if (this.voiceCapturedBytes < 6400) {
      this.showToast('说话时间太短，请再说一次');
      return;
    }
    var pcm = this.concatPcmChunks();
    this.stopMicCapture();
    this.voiceState = 'thinking';
    this.voiceStatus = '正在识别真实语音';
    this.voiceResponseText = '';
    this.serviceStatus = '请求中';
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
      self.voiceState = 'speaking';
      self.voiceStatus = '正在回答 · 真实模型';
      self.serviceStatus = '已连接';
      self.apiSaved = true;
      self.apiStateText = '服务已连接';
      if (payload.audioUrl) {
        self.playVoiceAudio(base + payload.audioUrl);
      } else {
        self.finishVoicePlayback();
      }
    }).catch(function (error) {
      if (!self.voiceActive) {
        return;
      }
      var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
      console.info('[NOVA_NET] voice failed: ' + message);
      self.serviceStatus = '连接失败';
      self.voiceState = 'error';
      self.voiceStatus = '真实服务请求失败';
      self.voiceResponseText = '失败原因：' + message.substring(0, 80);
      self.showToast('真实语音请求失败');
    });
  },

  runVoiceSelfTest() {
    var self = this;
    if (!this.voiceActive || this.voiceState !== 'listening' || !this.audioCapturer) {
      this.showToast('请先开始语音对话');
      return;
    }
    if (this.voiceMaxTimer) {
      clearTimeout(this.voiceMaxTimer);
      this.voiceMaxTimer = null;
    }
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceStatus = '正在生成真实自测问题';
    this.networkRequest(this.getServiceUrl('/api/tts'), {
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      extraData: { text: '请用一句话介绍人工智能。' },
      connectTimeout: 30000,
      readTimeout: 60000
    }).then(function (result) {
      if (!self.voiceActive) {
        return;
      }
      var payload = self.parseHttpResult(result.result);
      if (!payload.audioUrl) {
        throw new Error('missing audioUrl');
      }
      self.playSelfTestAudio(self.getServiceUrl(payload.audioUrl));
    }).catch(function (error) {
      self.voiceStatus = '真实语音自测失败';
      self.voiceResponseText = '无法生成自测语音，请检查服务';
      self.showToast('真实语音自测失败');
    });
  },

  playSelfTestAudio(url) {
    var self = this;
    this.stopVoicePlayback();
    try {
      var player = media.createAudioPlayer();
      this.audioPlayer = player;
      player.setVolume(1.0);
      player.on('dataLoad', function () {
        self.voiceStatus = '正在播放真实自测问题';
        player.play();
      });
      player.on('finish', function () {
        self.audioPlayer = null;
        try { player.release(); } catch (error) {}
        self.voiceStatus = '自测问题完成，等待提交';
        self.voicePhaseTimer = setTimeout(function () {
          if (self.voiceActive) {
            self.submitVoiceTurn();
          }
        }, 500);
      });
      player.on('error', function () {
        self.stopVoicePlayback();
        self.voiceStatus = '自测音频播放失败';
        self.showToast('自测音频播放失败');
      });
      player.src = url;
    } catch (error) {
      this.voiceStatus = '自测音频播放不可用';
    }
  },

  playVoiceAudio(url) {
    var self = this;
    this.stopVoicePlayback();
    if (!this.speakerOn) {
      this.finishVoicePlayback();
      return;
    }
    try {
      var player = media.createAudioPlayer();
      this.audioPlayer = player;
      player.on('dataLoad', function () {
        if (self.voiceActive && self.speakerOn && self.audioPlayer === player) {
          player.play();
        }
      });
      player.on('finish', function () {
        self.finishVoicePlayback();
      });
      player.on('error', function () {
        self.voiceStatus = '语音播放失败';
        self.finishVoicePlayback();
      });
      player.src = url;
    } catch (error) {
      this.voiceStatus = '语音播放不可用';
      this.finishVoicePlayback();
    }
  },

  finishVoicePlayback() {
    var self = this;
    var hadResponse = !!(this.voiceResponseText || '').trim();
    this.stopVoicePlayback();
    if (!this.voiceActive) {
      return;
    }
    this.voiceState = 'listening';
    this.voiceStatus = hadResponse ? '回答完成 · 可以继续' : '正在聆听 · 可以继续说';
    this.voiceCapturedBytes = 0;
    this.voicePcmChunks = [];
    if (this.voicePhaseTimer) {
      clearTimeout(this.voicePhaseTimer);
    }
    this.voicePhaseTimer = setTimeout(function () {
      if (!self.voiceActive) {
        return;
      }
      self.voiceResponseText = '';
      self.voiceStatus = '正在聆听 · 可以继续说';
      self.createAndStartCapturer();
      self.armVoiceMaxDuration();
    }, hadResponse ? 5000 : 300);
  },

  toggleMic() {
    this.micMuted = !this.micMuted;
    this.micLabel = this.micMuted ? '麦克风关' : '麦克风';
    this.voiceInputLevel = 0;
    this.showToast(this.micMuted ? '麦克风已静音' : '麦克风已打开');
  },

  toggleSpeaker() {
    this.speakerOn = !this.speakerOn;
    this.speakerLabel = this.speakerOn ? '扬声器' : '扬声器关';
    if (!this.speakerOn && this.voiceState === 'speaking') {
      this.finishVoicePlayback();
    }
    this.showToast(this.speakerOn ? '扬声器已打开' : '扬声器已关闭');
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

  stopVoicePlayback() {
    var player = this.audioPlayer;
    this.audioPlayer = null;
    if (!player) {
      return;
    }
    try { player.stop(); } catch (error) {}
    try { player.release(); } catch (error) {}
  },

  stopVoiceResources() {
    this.stopMicCapture();
    this.stopVoicePlayback();
  },

  getServiceUrl(path) {
    var base = (this.apiBaseUrl || LOCAL_SERVICE_URL).trim().replace(/\/+$/, '');
    if (!path) {
      return base;
    }
    return base + (path.charAt(0) === '/' ? path : '/' + path);
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

  startRecording() {
    var self = this;
    this.stopRecordingTickerOnly();
    this.recordRunning = true;
    this.recordPaused = false;
    this.recordHasProgress = true;
    this.recordSeconds = 0;
    this.recordTimer = '00:00';
    this.recordStatus = '正在录制';
    this.recordControlLabel = 'Ⅱ 暂停';
    this.recordStartedAt = Date.now();
    this.recordTicker = setInterval(function () {
      self.recordSeconds = Math.floor((Date.now() - self.recordStartedAt) / 1000);
      self.recordTimer = pad2(Math.floor(self.recordSeconds / 60)) + ':' + pad2(self.recordSeconds % 60);
    }, 500);
    this.showToast('录音已开始（演示模式）');
  },

  pauseRecording() {
    if (this.recordStartedAt) {
      this.recordSeconds = Math.floor((Date.now() - this.recordStartedAt) / 1000);
    }
    this.stopRecordingTickerOnly();
    this.recordRunning = false;
    this.recordPaused = true;
    this.recordHasProgress = true;
    this.recordStatus = '录制已暂停';
    this.recordControlLabel = '● 继续';
    this.recordTimer = pad2(Math.floor(this.recordSeconds / 60)) + ':' + pad2(this.recordSeconds % 60);
    this.showToast('录音已暂停');
  },

  resumeRecording() {
    var self = this;
    this.stopRecordingTickerOnly();
    this.recordRunning = true;
    this.recordPaused = false;
    this.recordHasProgress = true;
    this.recordStatus = '正在录制';
    this.recordControlLabel = 'Ⅱ 暂停';
    this.recordStartedAt = Date.now() - this.recordSeconds * 1000;
    this.recordTicker = setInterval(function () {
      self.recordSeconds = Math.floor((Date.now() - self.recordStartedAt) / 1000);
      self.recordTimer = pad2(Math.floor(self.recordSeconds / 60)) + ':' + pad2(self.recordSeconds % 60);
    }, 500);
    this.showToast('继续录音');
  },

  finishRecording() {
    if (this.recordRunning && this.recordStartedAt) {
      this.recordSeconds = Math.floor((Date.now() - this.recordStartedAt) / 1000);
    }
    this.stopRecordingTickerOnly();
    this.recordRunning = false;
    this.recordPaused = false;
    this.recordHasProgress = false;
    this.recordControlLabel = '开始录音';
    this.recordText = DEMO_TRANSCRIPT;
    this.summaryItems = this.summarize(this.recordText);
    this.editingTranscript = false;
    this.resultTab = 'summary';
    this.openSubPage('transcript');
    this.showToast('录音结束，整理完成');
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
    this.resultTab = 'original';
    if (this.subPage !== 'transcript') {
      this.openSubPage('transcript');
    }
  },

  showSummary() {
    this.resultTab = 'summary';
    if (this.subPage !== 'transcript') {
      this.openSubPage('transcript');
    }
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
      self.apiSaved = ok;
      self.serviceStatus = ok ? '已连接' : '异常';
      self.apiStateText = ok ? '服务已连接' : '服务返回异常';
      return ok;
    }).catch(function (error) {
      var message = error && (error.message || error.data) ? (error.message || error.data) : String(error);
      console.info('[NOVA_NET] health failed: ' + message);
      self.apiSaved = false;
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
    var pending = '正在请求真实模型…';
    updated.push({ role: 'assistant', text: pending });
    this.chatMessages = updated;
    this.refreshChatView();
    if (this.chatTitle === '新对话') {
      this.chatTitle = text.length > 12 ? text.substring(0, 12) + '...' : text;
    }
    this.syncCurrentThread();
    this.chatInput = '';
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
    var labels = { url: '服务地址', key: 'API 密钥', model: '模型名称' };
    var hints = { url: 'HTTP / HTTPS 地址', key: '输入密钥，仅存当前内存', model: '输入服务模型名称' };
    var steps = { url: '1 / 3', key: '2 / 3', model: '3 / 3' };
    this.fieldName = name;
    this.fieldTitle = labels[name] || '服务设置';
    this.fieldHint = hints[name] || '';
    this.fieldStep = steps[name] || '1 / 3';
    this.fieldValue = name === 'url' ? this.apiBaseUrl : (name === 'key' ? this.apiKey : this.apiModel);
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
    } else if (this.fieldName === 'key') {
      this.apiKey = value;
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
    this.apiBaseUrl = url.replace(/\/+$/, '');
    this.apiModel = model;
    this.apiStateText = '正在测试真实服务';
    this.checkServiceHealth().then(function (ok) {
      if (ok) {
        self.showToast('真实服务连接成功');
      } else {
        self.showToast('真实服务不可达');
      }
    });
  },

  resetApiSettings() {
    this.apiBaseUrl = LOCAL_SERVICE_URL;
    this.apiKey = '';
    this.apiModel = LOCAL_MODEL;
    this.apiSaved = false;
    this.apiStateText = '尚未测试';
    this.serviceStatus = '未连接';
    this.showToast('已恢复本地服务默认值');
  }
};
