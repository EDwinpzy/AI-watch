import audio from '@ohos.multimedia.audio';
import featureAbility from '@ohos.ability.featureAbility';
import http from '@ohos.net.http';
import pasteboard from '@ohos.pasteboard';
import webSocket from '@ohos.net.webSocket';
import media from '@ohos.multimedia.media';
import router from '@system.router';
import systemFetch from '@system.fetch';
import util from '@ohos.util';
import builtInConfig from '../../built-in-config';

function installLegacyTextGlobals() {
  var scope = null;
  if (typeof globalThis !== 'undefined') {
    scope = globalThis;
  } else if (typeof self !== 'undefined') {
    scope = self;
  } else if (typeof window !== 'undefined') {
    scope = window;
  }
  if (!scope) {
    return;
  }
  try {
    if (typeof scope.escape !== 'function') {
      scope.escape = function (value) {
        return encodeURIComponent(String(value)).replace(/%20/g, '%20');
      };
    }
    if (typeof scope.unescape !== 'function') {
      scope.unescape = function (value) {
        return decodeURIComponent(String(value));
      };
    }
  } catch (error) {}
}

installLegacyTextGlobals();

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

function extractMessageText(message) {
  if (!message) {
    return '';
  }
  var content = message.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!content || typeof content.length !== 'number') {
    return '';
  }
  var parts = [];
  for (var i = 0; i < content.length; i++) {
    var part = content[i];
    if (part && typeof part.text === 'string') {
      parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

function toBytes(value) {
  if (value && typeof value.byteLength === 'number' && typeof value.length === 'number') {
    return value;
  }
  return new Uint8Array(value);
}

function toArrayBuffer(value) {
  var bytes = toBytes(value);
  if (bytes.byteOffset === 0 && bytes.buffer.byteLength === bytes.byteLength) {
    return bytes.buffer;
  }
  var copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function normalizeSpeechText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '。')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSpeechText(text, maxLength) {
  var remaining = normalizeSpeechText(text);
  var chunks = [];
  var punctuation = '。！？；，、,.!?;';
  while (remaining.length > maxLength) {
    var minimum = Math.floor(maxLength * 0.55);
    var cut = maxLength;
    for (var i = maxLength - 1; i >= minimum; i--) {
      if (punctuation.indexOf(remaining.charAt(i)) >= 0) {
        cut = i + 1;
        break;
      }
    }
    var chunk = remaining.substring(0, cut).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.substring(cut).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

var BUILT_IN_BASE_URL = builtInConfig.baseUrl || 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1';
var BUILT_IN_API_KEY = builtInConfig.apiKey || '';
var BUILT_IN_MODEL = builtInConfig.model || 'workbuddy/deepseek-v4.1-flash';
var BUILT_IN_SYSTEM_PROMPT = '你是 NOVA 手表 AI 助手。回答简洁清楚，优先给出可以直接执行的建议。';
var STT_WS_URL = 'wss://api.stt.ai/v1/stream';
var STT_MODEL = 'whisper-large-v3-turbo';
var STT_LANGUAGE = 'zh';
var TTS_BASE_URL = 'https://fanyi.baidu.com/gettts';
var MAX_CONTEXT_MESSAGES = 12;
var VOICE_SAMPLE_RATE = 16000;
var VOICE_CHUNK_BYTES = 6400;
var VOICE_MAX_SECONDS = 15;
var VOICE_MIN_BYTES = 12800;
var RECORD_MAX_SECONDS = 60;
var BASE64_CHUNK_BYTES = 6144;
var CODEX_POLL_MS = 1500;
var BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var TTS_CHUNK_CHARS = 96;
var STT_CONNECT_TIMEOUT_MS = 15000;
var STT_FINAL_TIMEOUT_MS = 12000;
var STT_QUIET_FINALIZE_MS = 1600;
var CODE_BASE_URL = String(builtInConfig.codexBaseUrl || '').replace(/\/+$/, '');
var CODE_TOKEN = builtInConfig.codexToken || '';
var CODE_REPO_ID = builtInConfig.codexRepoId || 'watch';

export default {
  data: {
    clockText: '00:00',
    dateText: '',
    pageIndex: 0,
    mainVisible: true,
    subPage: '',

    toastVisible: false,
    toastText: '',

    threads: [
      {
        id: 'ai',
        title: '今天的灵感',
        preview: '先完成最重要的一件事',
        mark: '✦',
        messages: [
          { role: 'user', text: '帮我规划一下今天的工作。' },
          { role: 'assistant', text: '先完成最重要的一件事，再为沟通和整理留出时间。需要我帮你拆分任务吗？' }
        ]
      },
      {
        id: 'fitness',
        title: '周末出行',
        preview: '安排一次半日公园散步',
        mark: '◉',
        messages: [
          { role: 'user', text: '周末想去附近走走。' },
          { role: 'assistant', text: '可以安排一次半日公园散步，留出休息时间，出发前再确认天气。' }
        ]
      }
    ],
    currentThreadId: 'ai',
    chatVisible: false,
    chatTitle: '今天的灵感',
    chatInput: '',
    chatRequestPending: false,
    chatMessages: [
      { role: 'user', text: '帮我规划一下今天的工作。' },
      { role: 'assistant', text: '先完成最重要的一件事，再为沟通和整理留出时间。需要我帮你拆分任务吗？' }
    ],

    voicePhase: 'idle',
    voiceStatusText: '',
    voiceTimer: '00:00',
    voiceInputLevel: 0,
    voiceTranscriptText: '',
    voiceOutputEnabled: false,
    composerPlaceholder: '输入消息',
    voiceMode: 'builtin',
    voiceModeLabel: 'Magpie 即时',
    hapticsEnabled: true,
    voiceQuestionText: '',
    voiceAnswerText: '',

    recordRunning: false,
    recordPaused: false,
    recordHasProgress: false,
    recordStatus: '轻触开始录音',
    recordTimer: '00:00',
    recordSeconds: 0,
    recordInputLevel: 0,
    recordMarks: [],
    recordWaveBars: [],
    recordControlLabel: '开始录音',
    recordText: '',
    recordPcmChunks: [],

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
    taskHistory: [],
    codexRepoId: CODE_REPO_ID,
    codexModelLabel: 'Magpie · Codex',
    resultTab: 'summary',
    summaryItems: [],
    resultTranscriptText: '',
    editingTranscript: false,
    editBuffer: '',

    serviceStatus: BUILT_IN_API_KEY ? '内置' : '缺少本地密钥',
    builtInModel: BUILT_IN_MODEL
  },

  onInit() {
    var self = this;
    this.clockTicker = null;
    this.toastTimer = null;
    this.menuSwipeTimer = null;
    this.voiceTicker = null;
    this.voiceMaxTimer = null;
    this.voicePlaybackTimer = null;
    this.audioCapturer = null;
    this.audioPlayer = null;
    this.voiceSocket = null;
    this.voiceSocketTurnId = 0;
    this.voiceSocketReady = false;
    this.voiceConnectTimer = null;
    this.voiceFinalTimer = null;
    this.voiceQuietTimer = null;
    this.voiceReadySettled = false;
    this.voiceReadyResolve = null;
    this.voiceReadyReject = null;
    this.voiceTranscriptSettled = false;
    this.voiceTranscriptResolve = null;
    this.voiceTranscriptReject = null;
    this.voiceSttFinalText = '';
    this.voiceSttPartialText = '';
    this.voiceStopping = false;
    this.voiceStopSent = false;
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceStartedAt = 0;
    this.voiceTurnId = 0;
    this.voicePlaybackId = 0;
    this.voiceSpeechChunks = [];
    this.voiceSpeechIndex = 0;
    this.voiceCaptureActive = false;
    this.recordTicker = null;
    this.recordMaxTimer = null;
    this.recordAudioCapturer = null;
    this.recordCaptureActive = false;
    this.recordStartedAt = 0;
    this.codexPollTimer = null;
    this.codexUserCommitted = false;
    this.codexAssistantCommitted = false;
    this.codexChatThreadId = '';
    this.destroyed = false;
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.recordWaveBars = this.buildRecordWaveBars();
    this.updateClock();
    this.clockTicker = setInterval(function () {
      self.updateClock();
    }, 15000);
  },

  onDestroy() {
    this.destroyed = true;
    this.stopVoiceResources();
    this.stopRecordCaptureOnly();
    this.clearAllTimers();
    if (this.clockTicker) {
      clearInterval(this.clockTicker);
      this.clockTicker = null;
    }
  },

  onHide() {
    this.stopCodexPolling();
  },

  onShow() {
    if ((this.subPage === 'task' || this.subPage === 'result') && this.codexTaskId &&
      !this.isCodexTerminal(this.codexStatus)) {
      this.startCodexPolling();
    }
  },

  clearAllTimers() {
    if (this.menuSwipeTimer) {
      clearTimeout(this.menuSwipeTimer);
      this.menuSwipeTimer = null;
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.voiceTicker) {
      clearInterval(this.voiceTicker);
      this.voiceTicker = null;
    }
    if (this.voiceMaxTimer) {
      clearTimeout(this.voiceMaxTimer);
      this.voiceMaxTimer = null;
    }
    if (this.voicePlaybackTimer) {
      clearTimeout(this.voicePlaybackTimer);
      this.voicePlaybackTimer = null;
    }
    if (this.voiceConnectTimer) {
      clearTimeout(this.voiceConnectTimer);
      this.voiceConnectTimer = null;
    }
    if (this.voiceFinalTimer) {
      clearTimeout(this.voiceFinalTimer);
      this.voiceFinalTimer = null;
    }
    if (this.voiceQuietTimer) {
      clearTimeout(this.voiceQuietTimer);
      this.voiceQuietTimer = null;
    }
    if (this.recordTicker) {
      clearInterval(this.recordTicker);
      this.recordTicker = null;
    }
    if (this.recordMaxTimer) {
      clearTimeout(this.recordMaxTimer);
      this.recordMaxTimer = null;
    }
    if (this.codexPollTimer) {
      clearTimeout(this.codexPollTimer);
      this.codexPollTimer = null;
    }
  },

  buildRecordWaveBars() {
    var bars = [];
    for (var i = 0; i < 27; i++) {
      var distance = Math.abs(i - 13) / 13;
      var height = 5 + Math.round((1 - distance) * 23 + Math.abs(Math.sin(i * 1.37)) * 8);
      bars.push({
        height: height,
        duration: (0.72 + ((i * 31) % 37) / 100).toFixed(2),
        delay: (((i * 7) % 10) / 10).toFixed(1)
      });
    }
    return bars;
  },

  updateClock() {
    var now = new Date();
    var week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    this.clockText = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    this.dateText = (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + week[now.getDay()];
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
    if (this.pageIndex >= 2) {
      var shortHistory = this.pageIndex === 3 ||
        (this.pageIndex === 2 &&
          this.taskHistory.length + this.threads.length + 1 <= 5);
      if (event.direction === 'up' && !this.mainListAtEnd && !shortHistory) {
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
    if (this.menuSwipeTimer) {
      return;
    }
    var self = this;
    this.menuSwipeTimer = setTimeout(function () {
      self.menuSwipeTimer = null;
      if (!self.subPage && self.mainVisible) {
        self.setPage(index);
      }
    }, 220);
  },

  setPage(index) {
    var nextIndex = (index + 4) % 4;
    if (this.pageIndex === 1 && nextIndex !== 1) {
      this.resetRecordingState();
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
    if (this.subPage === 'answer') {
      this.subPage = 'chat';
      this.mainVisible = false;
      this.setVoicePhase('idle', '');
      return;
    }
    if (this.subPage === 'task' || this.subPage === 'result') {
      this.stopCodexPolling();
      this.editingTranscript = false;
      this.subPage = '';
      this.mainVisible = true;
      this.pageIndex = 2;
      return;
    }
    if (this.subPage === 'chat') {
      this.syncCurrentThread();
      this.stopVoiceResources();
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
    this.stopVoiceResources();
    this.resetRecordingState();
    return false;
  },

  onPageChange(event) {
    var leavingRecording = this.pageIndex === 1 && event.index !== 1;
    this.pageIndex = event.index;
    if (leavingRecording) {
      this.resetRecordingState();
    }
  },

  openQuickChat() {
    this.newChat();
  },

  startVoiceChat() {
    this.newChat();
    this.startVoiceInput();
  },

  startRecordingFromHome() {
    if (this.subPage) {
      this.closeSubPage();
    }
    this.setPage(1);
    this.startRecording();
  },

  setVoicePhase(phase, status) {
    this.voicePhase = phase;
    this.voiceStatusText = status || '';
    if (phase === 'listening') {
      this.composerPlaceholder = '点按麦克风结束并发送';
    } else if (phase === 'requesting') {
      this.composerPlaceholder = '正在连接麦克风…';
    } else if (phase === 'transcribing') {
      this.composerPlaceholder = '正在转成文字…';
    } else if (phase === 'thinking') {
      this.composerPlaceholder = 'NOVA 正在思考…';
    } else if (phase === 'speaking') {
      this.composerPlaceholder = '正在播报回复…';
    } else {
      this.composerPlaceholder = '输入消息';
    }
  },

  toggleVoiceInput() {
    if (this.voicePhase === 'listening') {
      this.finishVoiceCapture();
      return;
    }
    if (this.voicePhase === 'speaking') {
      this.stopVoicePlayback();
      this.setVoicePhase('idle', '');
    }
    if (this.voicePhase === 'requesting' || this.voicePhase === 'transcribing' ||
      this.voicePhase === 'thinking') {
      this.showToast('请等待当前语音处理完成');
      return;
    }
    this.startVoiceInput();
  },

  startVoiceInput() {
    var self = this;
    if (this.voicePhase === 'listening') {
      this.finishVoiceCapture();
      return;
    }
    if (this.voicePhase === 'requesting' || this.voicePhase === 'transcribing' ||
      this.voicePhase === 'thinking') {
      this.showToast('请等待当前语音处理完成');
      return;
    }
    this.stopVoicePlayback();
    this.stopMicCapture();
    this.stopRecordCaptureOnly();
    this.voiceTurnId = (this.voiceTurnId || 0) + 1;
    var turnId = this.voiceTurnId;
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceInputLevel = 0;
    this.voiceTimer = '00:00';
    this.voiceTranscriptText = '';
    this.setVoicePhase('requesting', '正在请求麦克风权限…');
    try {
      var context = featureAbility.getContext();
      context.requestPermissionsFromUser(['ohos.permission.MICROPHONE'], 101).then(function (result) {
        if (turnId !== self.voiceTurnId || self.destroyed) {
          return;
        }
        var granted = result && result.authResults && result.authResults.length &&
          result.authResults[0] === 0;
        if (!granted) {
          self.setVoicePhase('idle', '');
          self.showToast('未获得麦克风权限');
          return;
        }
        if (self.voiceMode === 'codex') {
          self.setVoicePhase('requesting', '正在启动只读 Codex…');
          self.createAndStartCapturer(turnId);
          return;
        }
        self.setVoicePhase('requesting', '正在连接语音服务…');
        self.startSpeechSession(turnId).then(function () {
          if (turnId !== self.voiceTurnId || self.destroyed) {
            return;
          }
          self.createAndStartCapturer(turnId);
        }).catch(function (error) {
          if (turnId !== self.voiceTurnId || self.destroyed) {
            return;
          }
          var reason = error && (error.message || error.data) ? (error.message || error.data) : String(error);
          console.info('[NOVA_STT] connect failed: ' + reason);
        });
      }).catch(function () {
        if (turnId !== self.voiceTurnId || self.destroyed) {
          return;
        }
        self.setVoicePhase('idle', '');
        self.showToast('麦克风权限请求失败');
      });
    } catch (error) {
      this.setVoicePhase('idle', '');
      this.showToast('麦克风权限接口不可用');
    }
  },

  createAndStartCapturer(turnId) {
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
    audio.createAudioCapturer(options).then(function (capturer) {
      if (turnId !== self.voiceTurnId || self.destroyed) {
        try { capturer.release(); } catch (error) {}
        return;
      }
      self.audioCapturer = capturer;
      return capturer.start();
    }).then(function () {
      if (turnId !== self.voiceTurnId || self.destroyed || !self.audioCapturer) {
        self.stopMicCapture();
        return;
      }
      self.voiceCaptureActive = true;
      self.voiceStartedAt = Date.now();
      self.setVoicePhase('listening', '正在聆听…');
      self.startVoiceTimers(turnId);
      self.captureAudioChunk(turnId);
    }).catch(function () {
      if (turnId !== self.voiceTurnId || self.destroyed) {
        return;
      }
      self.stopMicCapture();
      self.setVoicePhase('idle', '');
      self.showToast('麦克风启动失败');
    });
  },

  startVoiceTimers(turnId) {
    var self = this;
    if (this.voiceTicker) {
      clearInterval(this.voiceTicker);
    }
    this.voiceTicker = setInterval(function () {
      if (turnId !== self.voiceTurnId || self.voicePhase !== 'listening') {
        return;
      }
      var seconds = Math.floor((Date.now() - self.voiceStartedAt) / 1000);
      self.voiceTimer = pad2(Math.floor(seconds / 60)) + ':' + pad2(seconds % 60);
    }, 500);
    if (this.voiceMaxTimer) {
      clearTimeout(this.voiceMaxTimer);
    }
    this.voiceMaxTimer = setTimeout(function () {
      self.voiceMaxTimer = null;
      if (turnId === self.voiceTurnId && self.voicePhase === 'listening') {
        self.finishVoiceCapture();
      }
    }, VOICE_MAX_SECONDS * 1000);
  },

  captureAudioChunk(turnId) {
    var self = this;
    if (turnId !== this.voiceTurnId || !this.audioCapturer || !this.voiceCaptureActive) {
      return;
    }
    var capturer = this.audioCapturer;
    capturer.read(VOICE_CHUNK_BYTES, true).then(function (buffer) {
      if (turnId !== self.voiceTurnId || self.audioCapturer !== capturer ||
        !self.voiceCaptureActive) {
        return;
      }
      self.voicePcmChunks.push(buffer);
      self.voiceCapturedBytes += buffer.byteLength;
      self.voiceInputLevel = self.computePcmLevel(buffer);
      self.setVoicePhase('listening', '正在聆听 · 输入 ' + self.voiceInputLevel + '%');
      if (self.voiceMode !== 'codex') {
        self.sendSpeechAudioChunk(buffer);
      }
      if (self.voiceCapturedBytes >= VOICE_SAMPLE_RATE * 2 * VOICE_MAX_SECONDS) {
        self.finishVoiceCapture();
        return;
      }
      self.captureAudioChunk(turnId);
    }).catch(function () {
      if (turnId !== self.voiceTurnId || !self.voiceCaptureActive) {
        return;
      }
      self.stopMicCapture();
      self.setVoicePhase('idle', '');
      self.showToast('麦克风读取失败');
    });
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

  finishVoiceCapture() {
    if (this.voicePhase !== 'listening') {
      return;
    }
    var capturedBytes = this.voiceCapturedBytes;
    var pcm = null;
    if (this.voiceMode === 'codex') {
      pcm = this.concatChunks(this.voicePcmChunks);
    }
    this.stopMicCapture();
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    if (capturedBytes < VOICE_MIN_BYTES) {
      this.cancelSpeechSession();
      this.setVoicePhase('idle', '');
      this.showToast('说话时间太短，请再说一次');
      return;
    }
    if (this.voiceMode === 'codex') {
      var self = this;
      this.setVoicePhase('thinking', '正在创建 Codex 任务…');
      this.serviceStatus = 'Codex 创建中';
      this.submitCodexVoice(pcm, 'voice').catch(function (error) {
        if (self.destroyed) {
          return;
        }
        self.setVoicePhase('idle', '');
        self.showToast(self.describeCodexError(error));
      });
      return;
    }
    this.setVoicePhase('transcribing', '正在整理语音文字…');
    this.serviceStatus = '转写中';
    this.voiceStopping = true;
    this.sendSpeechStop();
  },

  startSpeechSession(turnId) {
    var self = this;
    this.cancelSpeechSession();
    this.voiceSocketTurnId = turnId;
    this.voiceSocketReady = false;
    this.voiceStopping = false;
    this.voiceStopSent = false;
    this.voiceSttFinalText = '';
    this.voiceSttPartialText = '';
    this.voiceReadySettled = false;
    this.voiceTranscriptSettled = false;
    var readyPromise = new Promise(function (resolve, reject) {
      self.voiceReadyResolve = resolve;
      self.voiceReadyReject = reject;
    });
    this.voiceTranscriptPromise = new Promise(function (resolve, reject) {
      self.voiceTranscriptResolve = resolve;
      self.voiceTranscriptReject = reject;
    });
    this.voiceTranscriptPromise.then(function (transcript) {
      self.completeVoiceTranscript(turnId, transcript);
    }).catch(function (error) {
      self.handleVoiceFailure(turnId, error);
    });
    this.voiceConnectTimer = setTimeout(function () {
      self.voiceConnectTimer = null;
      self.failSpeechSession(turnId, new Error('speech connect timeout'));
    }, STT_CONNECT_TIMEOUT_MS);

    var socket = null;
    try {
      socket = webSocket.createWebSocket();
      this.voiceSocket = socket;
      socket.on('open', function (error) {
        if (turnId !== self.voiceSocketTurnId || self.destroyed) {
          return;
        }
        if (error) {
          self.failSpeechSession(turnId, error);
          return;
        }
        self.sendSpeechSocketJson({
          language: STT_LANGUAGE,
          model: STT_MODEL
        });
      });
      socket.on('message', function (error, data) {
        self.handleSpeechMessage(turnId, error, data);
      });
      socket.on('close', function (error, value) {
        self.handleSpeechClose(turnId, error, value);
      });
      socket.on('error', function (error) {
        if (turnId !== self.voiceSocketTurnId || self.destroyed) {
          return;
        }
        self.failSpeechSession(turnId, error || new Error('speech socket error'));
      });
      var connection = socket.connect(STT_WS_URL);
      if (connection && typeof connection.catch === 'function') {
        connection.catch(function (error) {
          self.failSpeechSession(turnId, error || new Error('speech connect failed'));
        });
      }
    } catch (error) {
      this.failSpeechSession(turnId, error);
    }
    return readyPromise;
  },

  sendSpeechSocketJson(payload) {
    var self = this;
    var socket = this.voiceSocket;
    if (!socket) {
      this.failSpeechSession(this.voiceSocketTurnId, new Error('speech socket unavailable'));
      return;
    }
    try {
      var result = socket.send(JSON.stringify(payload));
      if (result && typeof result.catch === 'function') {
        result.catch(function (error) {
          self.failSpeechSession(self.voiceSocketTurnId, error);
        });
      }
    } catch (error) {
      this.failSpeechSession(this.voiceSocketTurnId, error);
    }
  },

  sendSpeechAudioChunk(buffer) {
    if (!this.voiceSocket || !this.voiceSocketReady || this.voiceStopping) {
      return;
    }
    var self = this;
    var socket = this.voiceSocket;
    var turnId = this.voiceSocketTurnId;
    try {
      var payload = toArrayBuffer(buffer);
      var result = socket.send(payload);
      if (result && typeof result.catch === 'function') {
        result.catch(function (error) {
          self.failSpeechSession(turnId, error);
        });
      }
    } catch (error) {
      this.failSpeechSession(turnId, error);
    }
  },

  sendSpeechStop() {
    var self = this;
    var socket = this.voiceSocket;
    var turnId = this.voiceSocketTurnId;
    if (!socket || !this.voiceSocketReady) {
      this.failSpeechSession(turnId, new Error('speech socket not ready'));
      return;
    }
    if (this.voiceStopSent) {
      return;
    }
    this.voiceStopSent = true;
    try {
      var result = socket.send(JSON.stringify({ action: 'stop' }));
      if (result && typeof result.catch === 'function') {
        result.catch(function (error) {
          self.failSpeechSession(turnId, error);
        });
      }
    } catch (error) {
      this.failSpeechSession(turnId, error);
      return;
    }
    this.voiceFinalTimer = setTimeout(function () {
      self.voiceFinalTimer = null;
      if (self.voiceSttFinalText) {
        self.resolveSpeechTranscript(turnId);
      } else {
        self.failSpeechSession(turnId, new Error('speech final timeout'));
      }
    }, STT_FINAL_TIMEOUT_MS);
  },

  handleSpeechMessage(turnId, error, data) {
    if (turnId !== this.voiceSocketTurnId || this.destroyed) {
      return;
    }
    if (error) {
      this.failSpeechSession(turnId, error);
      return;
    }
    var text = data;
    if (typeof text !== 'string' && text && typeof text.byteLength === 'number') {
      try {
        text = new util.TextDecoder('utf-8').decode(new Uint8Array(text));
      } catch (decodeError) {
        return;
      }
    }
    if (typeof text !== 'string') {
      return;
    }
    var payload = null;
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      return;
    }
    if (payload.error) {
      this.failSpeechSession(turnId, new Error(String(payload.error)));
      return;
    }
    if (payload.status === 'ready') {
      this.voiceSocketReady = true;
      console.info('[NOVA_STT] socket ready');
      this.settleSpeechReady();
      return;
    }
    console.info('[NOVA_STT] frame text=' +
      (typeof payload.text === 'string' ? payload.text.length : 0) +
      ' partial=' + (typeof payload.partial === 'string' ? payload.partial.length : 0) +
      ' final=' + (payload.is_final === true ? '1' : '0') +
      ' source=' + (payload.source || ''));
    if (typeof payload.partial === 'string' && payload.partial.trim()) {
      this.voiceSttPartialText = payload.partial.trim();
    }
    if (typeof payload.text === 'string' && payload.text.trim()) {
      this.voiceSttFinalText = payload.text.replace(/\s+/g, ' ').trim();
      if (this.voiceStopping) {
        this.armSpeechFinalize();
      }
    }
    if (payload.is_final && this.voiceStopping && this.voiceSttFinalText) {
      this.resolveSpeechTranscript(turnId);
    }
  },

  handleSpeechClose(turnId, error, value) {
    if (turnId !== this.voiceSocketTurnId || this.destroyed) {
      return;
    }
    console.info('[NOVA_STT] socket closed code=' +
      (value && value.code ? value.code : 0) +
      ' finalChars=' + (this.voiceSttFinalText ? this.voiceSttFinalText.length : 0));
    if (this.voiceStopping && this.voiceSttFinalText) {
      this.resolveSpeechTranscript(turnId);
      return;
    }
    var reason = error && (error.message || error.data) ? (error.message || error.data) :
      ('speech socket closed ' + (value && value.code ? value.code : ''));
    this.failSpeechSession(turnId, new Error(reason));
  },

  settleSpeechReady() {
    if (this.voiceReadySettled) {
      return;
    }
    this.voiceReadySettled = true;
    if (this.voiceConnectTimer) {
      clearTimeout(this.voiceConnectTimer);
      this.voiceConnectTimer = null;
    }
    var resolve = this.voiceReadyResolve;
    this.voiceReadyResolve = null;
    this.voiceReadyReject = null;
    if (resolve) {
      resolve(true);
    }
  },

  settleSpeechReadyError(error) {
    if (this.voiceReadySettled) {
      return;
    }
    this.voiceReadySettled = true;
    if (this.voiceConnectTimer) {
      clearTimeout(this.voiceConnectTimer);
      this.voiceConnectTimer = null;
    }
    var reject = this.voiceReadyReject;
    this.voiceReadyResolve = null;
    this.voiceReadyReject = null;
    if (reject) {
      reject(error);
    }
  },

  rejectSpeechTranscript(error) {
    if (this.voiceTranscriptSettled) {
      return;
    }
    this.voiceTranscriptSettled = true;
    this.clearSpeechResultTimers();
    var reject = this.voiceTranscriptReject;
    this.voiceTranscriptResolve = null;
    this.voiceTranscriptReject = null;
    if (reject) {
      reject(error);
    }
  },

  resolveSpeechTranscript(turnId) {
    if (turnId !== this.voiceSocketTurnId || this.voiceTranscriptSettled) {
      return;
    }
    var transcript = String(this.voiceSttFinalText || '').replace(/\s+/g, ' ').trim();
    if (!transcript) {
      this.failSpeechSession(turnId, new Error('empty transcript'));
      return;
    }
    this.voiceTranscriptSettled = true;
    this.clearSpeechResultTimers();
    var resolve = this.voiceTranscriptResolve;
    this.voiceTranscriptResolve = null;
    this.voiceTranscriptReject = null;
    this.releaseSpeechSocket();
    if (resolve) {
      resolve(transcript);
    }
  },

  armSpeechFinalize() {
    var self = this;
    if (this.voiceQuietTimer) {
      clearTimeout(this.voiceQuietTimer);
    }
    this.voiceQuietTimer = setTimeout(function () {
      self.voiceQuietTimer = null;
      self.resolveSpeechTranscript(self.voiceSocketTurnId);
    }, STT_QUIET_FINALIZE_MS);
  },

  clearSpeechResultTimers() {
    if (this.voiceFinalTimer) {
      clearTimeout(this.voiceFinalTimer);
      this.voiceFinalTimer = null;
    }
    if (this.voiceQuietTimer) {
      clearTimeout(this.voiceQuietTimer);
      this.voiceQuietTimer = null;
    }
    if (this.voiceConnectTimer) {
      clearTimeout(this.voiceConnectTimer);
      this.voiceConnectTimer = null;
    }
  },

  failSpeechSession(turnId, error) {
    if (turnId !== this.voiceSocketTurnId) {
      return;
    }
    this.stopMicCapture();
    this.settleSpeechReadyError(error || new Error('speech failed'));
    this.rejectSpeechTranscript(error || new Error('speech failed'));
    this.releaseSpeechSocket();
  },

  releaseSpeechSocket() {
    var socket = this.voiceSocket;
    this.voiceSocket = null;
    this.voiceSocketTurnId = 0;
    this.voiceSocketReady = false;
    this.clearSpeechResultTimers();
    if (!socket) {
      return;
    }
    try { socket.off('open'); } catch (error) {}
    try { socket.off('message'); } catch (error) {}
    try { socket.off('close'); } catch (error) {}
    try { socket.off('error'); } catch (error) {}
    try {
      var result = socket.close({ code: 1000, reason: 'done' });
      if (result && typeof result.catch === 'function') {
        result.catch(function () {});
      }
    } catch (error) {}
  },

  cancelSpeechSession() {
    var cancelled = new Error('cancelled');
    this.stopMicCapture();
    this.settleSpeechReadyError(cancelled);
    this.rejectSpeechTranscript(cancelled);
    this.releaseSpeechSocket();
  },

  completeVoiceTranscript(turnId, transcript) {
    var self = this;
    if (turnId !== this.voiceTurnId || this.destroyed || this.subPage !== 'chat') {
      return false;
    }
    transcript = String(transcript || '').trim();
    if (!transcript) {
      this.handleVoiceFailure(turnId, new Error('empty transcript'));
      return false;
    }
    if (transcript.length > 500) {
      transcript = transcript.substring(0, 500);
    }
    this.voiceTranscriptText = transcript;
    this.setVoicePhase('thinking', '已转写 · NOVA 正在思考…');
    console.info('[NOVA_STT] transcription complete characters=' + transcript.length);
    return self.sendChatText(transcript, true);
  },

  handleVoiceFailure(turnId, error) {
    if (turnId !== this.voiceTurnId || this.destroyed) {
      return;
    }
    var reason = error && (error.message || error.data) ? (error.message || error.data) : String(error);
    if (reason === 'cancelled') {
      return;
    }
    var message = '语音转写失败，请重试';
    if (reason.indexOf('connect') >= 0) {
      message = '语音服务连接失败，请重试';
    } else if (reason.indexOf('4029') >= 0 || reason.indexOf('limit') >= 0) {
      message = '语音识别额度已用完，请稍后再试';
    } else if (reason.indexOf('4002') >= 0) {
      message = '语音识别服务暂不可用';
    } else if (reason.indexOf('429') >= 0) {
      message = '语音识别繁忙，请稍后再试';
    } else if (reason.indexOf('timeout') >= 0 || reason.indexOf('timed out') >= 0) {
      message = '语音识别超时，请重试';
    }
    console.info('[NOVA_STT] transcription failed: ' + reason);
    this.stopMicCapture();
    this.serviceStatus = '连接失败';
    this.setVoicePhase('idle', '');
    this.showToast(message);
  },

  getSpeechChunks(text) {
    return splitSpeechText(text, TTS_CHUNK_CHARS);
  },

  getSpeechUrl(text) {
    return TTS_BASE_URL + '?lan=zh&spd=5&source=web&text=' + encodeURIComponent(text);
  },

  playSpeechText(text) {
    if (!this.voiceOutputEnabled) {
      this.setVoicePhase('idle', '');
      return;
    }
    var chunks = this.getSpeechChunks(text);
    if (!chunks.length) {
      this.setVoicePhase('idle', '');
      return;
    }
    this.stopVoicePlayback();
    this.voiceSpeechChunks = chunks;
    this.voiceSpeechIndex = 0;
    this.setVoicePhase('speaking', '正在播报 · 1/' + chunks.length);
    this.playSpeechChunk(this.voicePlaybackId);
  },

  playSpeechChunk(playbackId) {
    var self = this;
    if (playbackId !== this.voicePlaybackId ||
      this.voiceSpeechIndex >= this.voiceSpeechChunks.length) {
      return;
    }
    var chunk = this.voiceSpeechChunks[this.voiceSpeechIndex];
    var player = null;
    var completed = false;
    var finishChunk = function () {
      if (completed) {
        return;
      }
      completed = true;
      self.releaseAudioPlayer(player);
      if (playbackId !== self.voicePlaybackId || self.destroyed) {
        return;
      }
      if (self.voicePlaybackTimer) {
        clearTimeout(self.voicePlaybackTimer);
        self.voicePlaybackTimer = null;
      }
      self.voiceSpeechIndex++;
      if (self.voiceSpeechIndex >= self.voiceSpeechChunks.length) {
        self.voiceSpeechChunks = [];
        self.voiceSpeechIndex = 0;
        self.setVoicePhase('idle', '');
        return;
      }
      self.setVoicePhase('speaking', '正在播报 · ' + (self.voiceSpeechIndex + 1) + '/' +
        self.voiceSpeechChunks.length);
      self.playSpeechChunk(playbackId);
    };
    var failChunk = function () {
      if (completed) {
        return;
      }
      completed = true;
      self.releaseAudioPlayer(player);
      if (playbackId !== self.voicePlaybackId || self.destroyed) {
        return;
      }
      if (self.voicePlaybackTimer) {
        clearTimeout(self.voicePlaybackTimer);
        self.voicePlaybackTimer = null;
      }
      self.voiceSpeechChunks = [];
      self.voiceSpeechIndex = 0;
      self.setVoicePhase('idle', '');
      self.showToast('语音播报失败，请阅读文字');
    };
    try {
      player = media.createAudioPlayer();
      this.audioPlayer = player;
      player.setVolume(1.0);
      player.on('dataLoad', function () {
        if (playbackId !== self.voicePlaybackId || self.audioPlayer !== player) {
          return;
        }
        if (self.voicePlaybackTimer) {
          clearTimeout(self.voicePlaybackTimer);
          self.voicePlaybackTimer = null;
        }
        try {
          player.play();
        } catch (error) {
          failChunk();
        }
      });
      player.on('finish', finishChunk);
      player.on('error', failChunk);
      this.voicePlaybackTimer = setTimeout(failChunk, 25000);
      player.src = this.getSpeechUrl(chunk);
    } catch (error) {
      failChunk();
    }
  },

  releaseAudioPlayer(player) {
    if (!player) {
      return;
    }
    if (this.audioPlayer === player) {
      this.audioPlayer = null;
    }
    try { player.stop(); } catch (error) {}
    try { player.release(); } catch (error) {}
  },

  stopMicCapture() {
    var capturer = this.audioCapturer;
    this.audioCapturer = null;
    this.voiceCaptureActive = false;
    if (this.voiceTicker) {
      clearInterval(this.voiceTicker);
      this.voiceTicker = null;
    }
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
    this.voicePlaybackId = (this.voicePlaybackId || 0) + 1;
    if (this.voicePlaybackTimer) {
      clearTimeout(this.voicePlaybackTimer);
      this.voicePlaybackTimer = null;
    }
    var player = this.audioPlayer;
    this.audioPlayer = null;
    this.voiceSpeechChunks = [];
    this.voiceSpeechIndex = 0;
    if (!player) {
      return;
    }
    try { player.stop(); } catch (error) {}
    try { player.release(); } catch (error) {}
  },

  stopVoiceResources() {
    this.voiceTurnId = (this.voiceTurnId || 0) + 1;
    this.cancelSpeechSession();
    this.stopMicCapture();
    this.stopVoicePlayback();
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceInputLevel = 0;
    this.voiceTimer = '00:00';
    this.setVoicePhase('idle', '');
  },

  toggleVoiceOutput() {
    this.voiceOutputEnabled = !this.voiceOutputEnabled;
    if (!this.voiceOutputEnabled) {
      this.stopVoicePlayback();
      this.setVoicePhase('idle', '');
      this.showToast('自动播报已关闭');
    } else {
      this.showToast('自动播报已开启，不会播放测试音');
    }
  },

  toggleHaptics() {
    this.hapticsEnabled = !this.hapticsEnabled;
    this.showToast(this.hapticsEnabled ? '触感反馈已开启' : '触感反馈已关闭');
  },

  switchToClassicInterface() {
    this.stopVoiceResources();
    router.back();
  },

  getServiceUrl(path) {
    var base = BUILT_IN_BASE_URL.replace(/\/+$/, '');
    if (!path) {
      return base;
    }
    return base + (path.charAt(0) === '/' ? path : '/' + path);
  },

  getCodexServiceUrl(path) {
    var base = CODE_BASE_URL.replace(/\/+$/, '');
    if (!path) {
      return base;
    }
    return base + (path.charAt(0) === '/' ? path : '/' + path);
  },

  codexHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    if (CODE_TOKEN) {
      headers['X-Nova-Token'] = CODE_TOKEN;
    }
    return headers;
  },

  ensureCodexConfigured() {
    if (!CODE_BASE_URL) {
      throw new Error('Codex 服务地址未内置');
    }
    if (!CODE_TOKEN) {
      throw new Error('Codex 访问令牌未内置');
    }
  },

  describeCodexError(error) {
    var reason = error && (error.message || error.data) ?
      (error.message || error.data) : String(error || '');
    if (reason.indexOf('401') >= 0 || reason.indexOf('403') >= 0) {
      return 'Codex 访问令牌无效';
    }
    if (reason.indexOf('409') >= 0) {
      return '已有 Codex 任务正在执行';
    }
    if (reason.indexOf('未内置') >= 0) {
      return reason;
    }
    if (reason.indexOf('timeout') >= 0 || reason.indexOf('timed out') >= 0) {
      return 'Codex 服务响应超时';
    }
    return 'Codex 后端不可用';
  },

  codexRequest(url, options) {
    var self = this;
    var extraData = options.extraData;
    if (extraData !== undefined && typeof extraData !== 'string' &&
      !(extraData instanceof ArrayBuffer)) {
      extraData = JSON.stringify(extraData);
    }
    return this.httpRequest(url, {
      method: options.method || http.RequestMethod.GET,
      header: options.header || {},
      extraData: extraData,
      connectTimeout: options.connectTimeout || 8000,
      readTimeout: options.readTimeout || 30000
    }).then(function (result) {
      return { responseCode: result.responseCode || 200, result: result.result };
    }).catch(function (error) {
      var reason = error && (error.message || error.data) ?
        (error.message || error.data) : String(error || '');
      console.info('[NOVA_CODEX] request failed: ' + reason);
      throw error;
    });
  },

  networkRequest(url, options) {
    var self = this;
    var method = options.method || 'GET';
    var extraData = options.extraData;
    if (extraData !== undefined && method !== 'GET' && typeof extraData === 'object' &&
      !(extraData instanceof ArrayBuffer)) {
      extraData = JSON.stringify(extraData);
    }
    var requestOptions = {
      method: method,
      header: options.header || {},
      extraData: extraData,
      connectTimeout: options.connectTimeout,
      readTimeout: options.readTimeout
    };
    return this.fetchRequest(url, requestOptions).catch(function (error) {
      var reason = error && (error.message || error.data) ?
        (error.message || error.data) : String(error);
      console.info('[NOVA_NET] system.fetch fallback: ' + reason);
      return self.httpRequest(url, requestOptions);
    });
  },

  fetchRequest(url, options) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timeoutTimer = null;
      var complete = function (error, result) {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      };
      var fetchOptions = {
        url: url,
        method: options.method || 'GET',
        header: options.header || {},
        responseType: 'text',
        success: function (data) {
          var status = data && data.code ? data.code : 200;
          if (status < 200 || status >= 300) {
            complete(new Error('HTTP ' + status));
            return;
          }
          complete(null, { responseCode: status, result: data ? data.data : '' });
        },
        fail: function (error, code) {
          var body = error && error.data;
          if (code === 200 && typeof body === 'string' &&
            (body.charAt(0) === '{' || body.charAt(0) === '[')) {
            complete(null, { responseCode: 200, result: body });
            return;
          }
          var message = (error && (error.message || error.data)) || ('fetch ' + code);
          complete(new Error(message));
        }
      };
      if (options.extraData !== undefined && fetchOptions.method !== 'GET') {
        fetchOptions.data = options.extraData;
      }
      timeoutTimer = setTimeout(function () {
        complete(new Error('timeout'));
      }, options.readTimeout || 120000);
      try {
        systemFetch.fetch(fetchOptions);
      } catch (error) {
        complete(error);
      }
    });
  },

  httpRequest(url, options) {
    return new Promise(function (resolve, reject) {
      var client;
      var requestOptions = {
        method: options.method || http.RequestMethod.GET,
        header: options.header || {},
        connectTimeout: options.connectTimeout || 60000,
        readTimeout: options.readTimeout || 120000
      };
      if (options.extraData !== undefined) {
        requestOptions.extraData = options.extraData;
      }
      try {
        client = http.createHttp();
        client.request(url, requestOptions, function (error, result) {
          try { client.destroy(); } catch (error) {}
          if (error) {
            var message = (error && (error.message || error.data)) ?
              (error.message || error.data) : String(error);
            console.info('[NOVA_NET] http failed: ' + message);
            reject(new Error(message));
            return;
          }
          var status = result && result.responseCode ? result.responseCode : 0;
          console.info('[NOVA_NET] http success code=' + status);
          if (status < 200 || status >= 300) {
            reject(new Error('HTTP ' + status));
            return;
          }
          resolve(result);
        });
      } catch (error) {
        if (client) {
          try { client.destroy(); } catch (destroyError) {}
        }
        reject(error);
      }
    });
  },

  parseHttpResult(result) {
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    if (result && typeof result.byteLength === 'number') {
      var decoder = new util.TextDecoder('utf-8');
      return JSON.parse(decoder.decode(new Uint8Array(result)));
    }
    return result;
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

  startRecording() {
    var self = this;
    this.stopVoiceResources();
    this.stopRecordCaptureOnly();
    this.recordRunning = true;
    this.recordPaused = false;
    this.recordHasProgress = true;
    this.recordSeconds = 0;
    this.recordTimer = '00:00';
    this.recordStatus = '正在请求麦克风';
    this.recordControlLabel = '暂停';
    this.recordInputLevel = 0;
    this.recordMarks = [];
    this.recordPcmChunks = [];
    this.recordText = '';
    this.recordStartedAt = Date.now();
    this.recordTicker = setInterval(function () {
      if (!self.recordRunning) {
        return;
      }
      self.recordSeconds = Math.floor((Date.now() - self.recordStartedAt) / 1000);
      self.recordTimer = pad2(Math.floor(self.recordSeconds / 60)) + ':' +
        pad2(self.recordSeconds % 60);
    }, 500);
    try {
      var context = featureAbility.getContext();
      context.requestPermissionsFromUser(['ohos.permission.MICROPHONE'], 102).then(function (result) {
        if (self.destroyed) {
          return;
        }
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
      self.recordAudioCapturer = capturer;
      return capturer.start();
    }).then(function () {
      if (!self.recordRunning || !self.recordAudioCapturer) {
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
    if (!this.recordRunning || !this.recordAudioCapturer || !this.recordCaptureActive) {
      return;
    }
    var capturer = this.recordAudioCapturer;
    capturer.read(VOICE_CHUNK_BYTES, true).then(function (buffer) {
      if (!self.recordRunning || !self.recordCaptureActive ||
        self.recordAudioCapturer !== capturer) {
        return;
      }
      self.recordPcmChunks.push(buffer);
      self.recordInputLevel = self.computePcmLevel(buffer);
      self.recordStatus = '正在录音 · 输入 ' + self.recordInputLevel + '%';
      if (self.recordCapturedBytes() >= VOICE_SAMPLE_RATE * 2 * RECORD_MAX_SECONDS) {
        self.finishRecording();
        return;
      }
      self.captureRecordChunk();
    }).catch(function () {
      if (!self.recordRunning) {
        return;
      }
      self.recordRunning = false;
      self.recordStatus = '麦克风读取失败';
      self.stopRecordingTickerOnly();
      self.stopRecordCaptureOnly();
      self.showToast('麦克风读取失败');
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
      this.recordMaxTimer = null;
    }
    if (!this.recordRunning) {
      return;
    }
    var remaining = Math.max(1000, (RECORD_MAX_SECONDS - this.recordSeconds) * 1000);
    this.recordMaxTimer = setTimeout(function () {
      self.recordMaxTimer = null;
      if (self.recordRunning) {
        self.finishRecording();
      }
    }, remaining);
  },

  toggleRecording() {
    if (this.recordRunning) {
      this.pauseRecording();
    } else if (this.recordHasProgress) {
      this.resumeRecording();
    } else {
      this.startRecording();
    }
  },

  pauseRecording() {
    if (!this.recordRunning) {
      return;
    }
    if (this.recordStartedAt) {
      this.recordSeconds = Math.floor((Date.now() - this.recordStartedAt) / 1000);
    }
    this.stopRecordingTickerOnly();
    this.stopRecordCaptureOnly();
    this.recordRunning = false;
    this.recordPaused = true;
    this.recordHasProgress = true;
    this.recordControlLabel = '继续';
    this.recordTimer = pad2(Math.floor(this.recordSeconds / 60)) + ':' +
      pad2(this.recordSeconds % 60);
    this.recordStatus = '录音已暂停';
    this.showToast('录音已暂停');
  },

  resumeRecording() {
    if (this.recordRunning) {
      return;
    }
    this.stopRecordingTickerOnly();
    this.recordRunning = true;
    this.recordPaused = false;
    this.recordHasProgress = true;
    this.recordStatus = '正在继续录音';
    this.recordControlLabel = '暂停';
    this.recordStartedAt = Date.now() - this.recordSeconds * 1000;
    var self = this;
    this.recordTicker = setInterval(function () {
      self.recordSeconds = Math.floor((Date.now() - self.recordStartedAt) / 1000);
      self.recordTimer = pad2(Math.floor(self.recordSeconds / 60)) + ':' +
        pad2(self.recordSeconds % 60);
    }, 500);
    this.startRecordCapturer();
    this.showToast('继续录音');
  },

  finishRecording() {
    if (!this.recordHasProgress) {
      return;
    }
    var self = this;
    if (this.recordRunning && this.recordStartedAt) {
      this.recordSeconds = Math.floor((Date.now() - this.recordStartedAt) / 1000);
    }
    this.stopRecordingTickerOnly();
    this.stopRecordCaptureOnly();
    this.recordRunning = false;
    this.recordPaused = false;
    this.recordControlLabel = '开始录音';
    if (!this.recordPcmChunks.length || this.recordCapturedBytes() < VOICE_SAMPLE_RATE / 2) {
      this.recordHasProgress = false;
      this.recordStatus = '录音太短，请重试';
      this.recordPcmChunks = [];
      this.showToast('录音太短，请重试');
      return;
    }
    var pcm = this.concatChunks(this.recordPcmChunks);
    this.recordPcmChunks = [];
    this.recordStatus = '正在转写并创建任务';
    this.showToast('录音完成，正在提交');
    this.submitCodexVoice(pcm, 'record').catch(function (error) {
      if (self.destroyed) {
        return;
      }
      self.recordHasProgress = false;
      self.recordStatus = '提交失败 · 请重新录音';
      self.showToast(self.describeCodexError(error));
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

  resetRecordingState() {
    this.stopRecordingTickerOnly();
    this.stopRecordCaptureOnly();
    this.recordRunning = false;
    this.recordPaused = false;
    this.recordHasProgress = false;
    this.recordSeconds = 0;
    this.recordTimer = '00:00';
    this.recordStatus = '轻触开始录音';
    this.recordControlLabel = '开始录音';
    this.recordInputLevel = 0;
    this.recordMarks = [];
    this.recordPcmChunks = [];
  },

  stopRecordingTickerOnly() {
    if (this.recordTicker) {
      clearInterval(this.recordTicker);
      this.recordTicker = null;
    }
  },

  stopRecordCaptureOnly() {
    var capturer = this.recordAudioCapturer;
    this.recordAudioCapturer = null;
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

  submitCodexVoice(pcm, origin) {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        self.ensureCodexConfigured();
      } catch (error) {
        reject(error);
        return;
      }
      if (origin === 'voice') {
        self.codexChatThreadId = self.currentThreadId;
        self.codexUserCommitted = false;
        self.codexAssistantCommitted = false;
      }
      self.encodePcmBase64(pcm).then(function (encoded) {
        return self.codexRequest(self.getCodexServiceUrl('/api/codex/voice'), {
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
        });
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
      self.codexChatThreadId = self.currentThreadId;
      self.codexAssistantCommitted = false;
      self.codexRequest(self.getCodexServiceUrl('/api/codex/task'), {
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
    if (this.codexOrigin === 'record' && this.codexTranscript) {
      this.recordText = this.codexTranscript;
      this.resetRecordingState();
    }
    if (this.codexOrigin === 'voice' && this.codexTranscript &&
      !this.codexUserCommitted) {
      this.appendMessageToThread(this.codexChatThreadId, {
        role: 'user',
        text: this.codexTranscript
      });
      this.codexUserCommitted = true;
    }
    this.stopCodexPolling();
    this.stopVoiceResources();
    this.stopRecordCaptureOnly();
    this.voicePcmChunks = [];
    this.recordPcmChunks = [];
    this.setVoicePhase('idle', '');
    this.upsertTaskHistory();
    this.subPage = 'task';
    this.mainVisible = false;
    this.startCodexPolling();
  },

  formatElapsed(milliseconds) {
    var seconds = Math.max(0, Math.floor((milliseconds || 0) / 1000));
    return pad2(Math.floor(seconds / 60)) + ':' + pad2(seconds % 60);
  },

  codexStatusLabel(status) {
    if (status === 'succeeded') {
      return '完成';
    }
    if (status === 'failed') {
      return '失败';
    }
    if (status === 'cancelled') {
      return '已停止';
    }
    if (status === 'running') {
      return '执行中';
    }
    return '已排队';
  },

  codexStatusClass(status) {
    if (status === 'succeeded') {
      return 'status-success';
    }
    if (status === 'failed') {
      return 'status-failed';
    }
    if (status === 'cancelled') {
      return 'status-muted';
    }
    return 'status-running';
  },

  isCodexTerminal(status) {
    return status === 'succeeded' || status === 'failed' || status === 'cancelled';
  },

  upsertTaskHistory() {
    if (!this.codexTaskId) {
      return;
    }
    var title = (this.codexTranscript || this.recordText || 'Codex 只读任务')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length > 16) {
      title = title.substring(0, 16) + '…';
    }
    var item = {
      id: this.codexTaskId,
      title: title || 'Codex 只读任务',
      subtitle: this.codexStage + ' · ' + this.codexElapsedText,
      status: this.codexStatus,
      statusLabel: this.codexStatusLabel(this.codexStatus),
      statusClass: this.codexStatusClass(this.codexStatus),
      stage: this.codexStage,
      elapsedText: this.codexElapsedText,
      transcript: this.codexTranscript,
      finalText: this.codexFinalText,
      speechText: this.codexSpeechText,
      error: this.codexError,
      origin: this.codexOrigin
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
    if (this.codexOrigin === 'voice' && this.codexTranscript &&
      !this.codexUserCommitted) {
      this.appendMessageToThread(this.codexChatThreadId, {
        role: 'user',
        text: this.codexTranscript
      });
      this.codexUserCommitted = true;
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
    this.codexRequest(this.getCodexServiceUrl('/api/codex/task/' + this.codexTaskId), {
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
    }).catch(function () {
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
    this.resultTranscriptText = this.codexTranscript || this.codexFinalText;
    this.resultTab = 'summary';
    this.editingTranscript = false;
    this.subPage = 'result';
    this.mainVisible = false;
    this.stopCodexPolling();
    this.upsertTaskHistory();
    if ((this.codexOrigin === 'text' || this.codexOrigin === 'voice') &&
      !this.codexAssistantCommitted && this.codexFinalText) {
      this.appendMessageToThread(this.codexChatThreadId, {
        role: 'assistant',
        text: this.codexFinalText
      });
      this.codexAssistantCommitted = true;
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
    if (!this.codexTaskId || this.isCodexTerminal(this.codexStatus)) {
      return;
    }
    this.codexStage = '正在停止';
    this.codexMessage = '正在结束 Codex 子进程';
    this.codexRequest(this.getCodexServiceUrl('/api/codex/task/' + this.codexTaskId + '/cancel'), {
      method: http.RequestMethod.POST,
      header: this.codexHeaders(),
      extraData: {},
      connectTimeout: 8000,
      readTimeout: 15000
    }).then(function () {
      self.startCodexPolling(500);
    }).catch(function (error) {
      self.showToast(self.describeCodexError(error));
    });
  },

  openCodexTask(item) {
    if (!item || !item.id) {
      return;
    }
    this.codexTaskId = item.id;
    this.codexStatus = item.status || 'queued';
    this.codexStage = item.stage || '正在同步';
    this.codexMessage = '读取任务状态';
    this.codexTranscript = item.transcript || '';
    this.codexFinalText = item.finalText || '';
    this.codexSpeechText = item.speechText || '';
    this.codexError = item.error || '';
    this.codexElapsedText = item.elapsedText || '00:00';
    this.codexOrigin = 'history';
    this.codexChatThreadId = '';
    this.codexAssistantCommitted = true;
    this.mainVisible = false;
    if (this.codexStatus === 'succeeded' && this.codexFinalText) {
      this.showCodexResult();
      return;
    }
    this.subPage = 'task';
    this.startCodexPolling(0);
  },

  openLatestCodexTask() {
    if (this.taskHistory.length) {
      this.openCodexTask(this.taskHistory[0]);
    }
  },

  appendMessageToThread(threadId, message) {
    var thread = this.findThread(threadId);
    if (!thread || !message) {
      return;
    }
    var messages = copyMessages(thread.messages);
    messages.push({ role: message.role, text: message.text });
    thread.messages = messages;
    thread.preview = message.text.length > 24 ?
      message.text.substring(0, 24) + '…' : message.text;
    if (message.role === 'user' && thread.title === '新对话') {
      thread.title = message.text.length > 12 ?
        message.text.substring(0, 12) + '…' : message.text;
    }
    if (this.currentThreadId === threadId) {
      this.chatMessages = copyMessages(messages);
      this.chatTitle = thread.title;
    }
  },

  copyText(value, name) {
    var self = this;
    var text = String(value || '').trim();
    if (!text) {
      this.showToast('没有可复制的内容');
      return;
    }
    try {
      var data = pasteboard.createPlainTextData(text);
      pasteboard.getSystemPasteboard().setPasteData(data, function (error) {
        self.showToast(error ? '复制失败，请检查剪贴板权限' : name + '已复制');
      });
    } catch (error) {
      this.showToast('复制失败，无法访问剪贴板');
    }
  },

  copyVoiceAnswer() {
    this.copyText(this.voiceAnswerText, '回答');
  },

  continueVoiceChat() {
    this.stopVoicePlayback();
    this.subPage = 'chat';
    this.mainVisible = false;
    this.setVoicePhase('idle', '');
  },

  showTranscript() {
    this.resultTab = 'transcript';
    this.editingTranscript = false;
  },

  showSummary() {
    this.resultTab = 'summary';
    this.editingTranscript = false;
  },

  beginTranscriptEdit() {
    if (this.resultTab !== 'transcript') {
      return;
    }
    this.editBuffer = this.resultTranscriptText;
    this.editingTranscript = true;
  },

  onTranscriptInput(event) {
    this.editBuffer = event && typeof event.value === 'string' ? event.value : '';
  },

  saveTranscript() {
    var value = (this.editBuffer || '').trim();
    if (!value) {
      this.showToast('转写内容不能为空');
      return;
    }
    this.resultTranscriptText = value;
    this.codexTranscript = value;
    this.editingTranscript = false;
    this.upsertTaskHistory();
    this.showToast('转写文本已保存');
  },

  copyResult() {
    if (this.resultTab === 'summary') {
      this.copyText(this.summaryItems.join('\n'), '摘要');
      return;
    }
    this.copyText(this.resultTranscriptText, '转写');
  },

  continueFromResult() {
    this.stopVoiceResources();
    this.stopVoicePlayback();
    var id = 'thread-' + Date.now();
    var question = this.resultTranscriptText || this.codexTranscript || 'Codex 任务结果';
    var answer = this.codexFinalText || this.summaryItems.join('\n');
    var messages = [
      { role: 'user', text: question },
      { role: 'assistant', text: answer }
    ];
    var title = question.length > 12 ? question.substring(0, 12) + '…' : question;
    this.threads.push({
      id: id,
      title: title || '继续追问',
      preview: answer.length > 24 ? answer.substring(0, 24) + '…' : answer,
      mark: '＋',
      messages: messages
    });
    this.currentThreadId = id;
    this.chatTitle = title || '继续追问';
    this.chatMessages = copyMessages(messages);
    this.chatInput = '';
    this.voiceModeLabel = 'Magpie 即时';
    this.setVoicePhase('idle', '');
    this.subPage = 'chat';
    this.mainVisible = false;
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
    this.syncCurrentThread();
  },

  sendChat() {
    var text = (this.chatInput || '').trim();
    this.sendChatText(text, false);
  },

  sendChatText(text, fromVoice) {
    var self = this;
    text = (text || '').trim();
    if (!text) {
      this.setVoicePhase('idle', '');
      this.showToast('请输入消息');
      return Promise.resolve(false);
    }
    if (this.chatRequestPending) {
      this.setVoicePhase('idle', '');
      this.showToast('上一条消息还在生成');
      return Promise.resolve(false);
    }
    if (this.voiceMode === 'codex') {
      var codexMessages = copyMessages(this.chatMessages);
      codexMessages.push({ role: 'user', text: text });
      this.chatMessages = codexMessages;
      if (this.chatTitle === '新对话') {
        this.chatTitle = text.length > 12 ? text.substring(0, 12) + '…' : text;
      }
      this.syncCurrentThread();
      this.chatInput = '';
      this.chatRequestPending = true;
      this.codexUserCommitted = true;
      this.codexAssistantCommitted = false;
      this.serviceStatus = 'Codex 创建中';
      this.setVoicePhase('thinking', '正在创建 Codex 只读任务…');
      return this.submitCodexText(text, text).then(function () {
        self.chatRequestPending = false;
        return true;
      }).catch(function (error) {
        var message = self.describeCodexError(error);
        self.chatRequestPending = false;
        self.codexUserCommitted = false;
        self.appendMessageToThread(self.currentThreadId, {
          role: 'assistant',
          text: 'Codex 任务创建失败：' + message
        });
        self.setVoicePhase('idle', '');
        self.serviceStatus = 'Codex 不可用';
        self.showToast(message);
        return false;
      });
    }
    var context = [];
    var start = this.chatMessages.length > MAX_CONTEXT_MESSAGES ?
      this.chatMessages.length - MAX_CONTEXT_MESSAGES : 0;
    for (var i = start; i < this.chatMessages.length; i++) {
      var item = this.chatMessages[i];
      if (item.role === 'user' || item.role === 'assistant') {
        context.push({ role: item.role, content: item.text });
      }
    }
    var requestMessages = [{ role: 'system', content: BUILT_IN_SYSTEM_PROMPT }];
    for (var j = 0; j < context.length; j++) {
      requestMessages.push(context[j]);
    }
    requestMessages.push({ role: 'user', content: text });

    var updated = copyMessages(this.chatMessages);
    updated.push({ role: 'user', text: text });
    var pending = '正在生成…';
    updated.push({ role: 'assistant', text: pending });
    this.chatMessages = updated;
    if (this.chatTitle === '新对话') {
      this.chatTitle = text.length > 12 ? text.substring(0, 12) + '…' : text;
    }
    this.syncCurrentThread();
    this.chatInput = '';
    this.chatRequestPending = true;
    this.serviceStatus = '请求中';
    this.stopVoicePlayback();
    this.setVoicePhase('thinking', fromVoice ? 'NOVA 正在思考…' : '正在发送…');

    var body = {
      model: BUILT_IN_MODEL,
      messages: requestMessages,
      max_tokens: 512,
      stream: false
    };
    var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + BUILT_IN_API_KEY
    };
    return this.networkRequest(this.getServiceUrl('/chat/completions'), {
      method: http.RequestMethod.POST,
      header: headers,
      extraData: body,
      connectTimeout: 30000,
      readTimeout: 120000
    }).then(function (result) {
      var payload = self.parseHttpResult(result.result);
      var choice = payload.choices && payload.choices[0];
      var reply = extractMessageText(choice && choice.message);
      if (!reply) {
        throw new Error('empty model reply');
      }
      self.chatRequestPending = false;
      self.serviceStatus = '已连接';
      self.replacePendingAssistant(pending, reply);
      if (fromVoice) {
        self.voiceQuestionText = text;
        self.voiceAnswerText = reply;
        self.stopVoicePlayback();
        self.setVoicePhase('idle', '');
        self.subPage = 'answer';
        self.mainVisible = false;
      } else if (self.subPage === 'chat' && self.voiceOutputEnabled) {
        self.playSpeechText(reply);
      } else {
        self.setVoicePhase('idle', '');
      }
      return true;
    }).catch(function (error) {
      var reason = error && (error.message || error.data) ? (error.message || error.data) : String(error);
      var message = '请求失败，请检查网络后重试';
      if (reason.indexOf('401') >= 0 || reason.indexOf('403') >= 0) {
        message = '内置服务鉴权失败';
      } else if (reason.indexOf('429') >= 0) {
        message = '请求过多，请稍后再试';
      } else if (reason.indexOf('timeout') >= 0 || reason.indexOf('timed out') >= 0) {
        message = '网络超时，请稍后重试';
      }
      console.info('[NOVA_AI] chat request failed: ' + reason);
      self.chatRequestPending = false;
      self.serviceStatus = '连接失败';
      self.replacePendingAssistant(pending, message);
      self.setVoicePhase('idle', '');
      self.showToast(message);
      return false;
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
    this.stopVoiceResources();
    this.currentThreadId = thread.id;
    this.chatTitle = thread.title;
    this.chatMessages = copyMessages(thread.messages);
    this.chatVisible = true;
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
      thread.preview = last.length > 24 ? last.substring(0, 24) + '…' : last;
    }
  },

  newChat() {
    this.stopVoiceResources();
    var id = 'thread-' + Date.now();
    this.threads.push({
      id: id,
      title: '新对话',
      preview: '空对话',
      mark: '＋',
      messages: []
    });
    this.currentThreadId = id;
    this.chatTitle = '新对话';
    this.chatMessages = [];
    this.chatInput = '';
    this.chatVisible = true;
    this.openSubPage('chat');
  },

  closeChat() {
    this.closeSubPage();
  },

  clearChat() {
    this.stopVoiceResources();
    this.chatMessages = [];
    this.syncCurrentThread();
    this.showToast('当前对话已清空');
  },

  onChatInput(event) {
    this.chatInput = event && typeof event.value === 'string' ? event.value : '';
  }
};
