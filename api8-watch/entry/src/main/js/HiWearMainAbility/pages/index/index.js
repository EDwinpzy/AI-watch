import audio from '@ohos.multimedia.audio';
import featureAbility from '@ohos.ability.featureAbility';
import http from '@ohos.net.http';
import media from '@ohos.multimedia.media';
import systemFetch from '@system.fetch';
import util from '@ohos.util';

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

function asciiBytes(value) {
  var text = String(value || '');
  var bytes = new Uint8Array(text.length);
  for (var i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 255;
  }
  return bytes;
}

function toBytes(value) {
  if (value && typeof value.byteLength === 'number' && typeof value.length === 'number') {
    return value;
  }
  return new Uint8Array(value);
}

function concatByteParts(parts) {
  var total = 0;
  for (var i = 0; i < parts.length; i++) {
    total += toBytes(parts[i]).byteLength;
  }
  var output = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < parts.length; j++) {
    var part = toBytes(parts[j]);
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function writeAscii(view, offset, value) {
  for (var i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function buildWavFromPcm(pcmBuffer) {
  var pcm = toBytes(pcmBuffer);
  var output = new Uint8Array(44 + pcm.byteLength);
  var view = new DataView(output.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  output.set(pcm, 44);
  return output.buffer;
}

function buildMultipartBody(wavBuffer, boundary, engine, language) {
  var fileHead = '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="voice.wav"\r\n' +
    'Content-Type: audio/wav\r\n\r\n';
  var engineField = '\r\n--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="engine"\r\n\r\n' + engine;
  var languageField = '\r\n--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="language"\r\n\r\n' + language;
  var tail = '\r\n--' + boundary + '--\r\n';
  return concatByteParts([
    asciiBytes(fileHead),
    toBytes(wavBuffer),
    asciiBytes(engineField),
    asciiBytes(languageField),
    asciiBytes(tail)
  ]).buffer;
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

var BUILT_IN_BASE_URL = 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1';
var BUILT_IN_API_KEY = 'sk-magpie-key-ad6d19dafa216d7c0897874814ed03dedf589fe77019f75c';
var BUILT_IN_MODEL = 'group/ai-watch';
var BUILT_IN_SYSTEM_PROMPT = '你是 NOVA 手表 AI 助手。回答简洁清楚，优先给出可以直接执行的建议。';
var STT_URL = 'https://notetakers.vipresearch.ca/stt/v1/transcribe';
var STT_ENGINE = 'nemotron';
var STT_LANGUAGE = 'zh';
var TTS_BASE_URL = 'https://translate.google.com/translate_tts';
var MAX_CONTEXT_MESSAGES = 12;
var VOICE_SAMPLE_RATE = 16000;
var VOICE_CHUNK_BYTES = 6400;
var VOICE_MAX_SECONDS = 15;
var VOICE_MIN_BYTES = 12800;
var TTS_CHUNK_CHARS = 96;

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
    voiceOutputEnabled: true,
    composerPlaceholder: '输入消息',

    serviceStatus: '内置',
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
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    this.voiceStartedAt = 0;
    this.voiceTurnId = 0;
    this.voicePlaybackId = 0;
    this.voiceSpeechChunks = [];
    this.voiceSpeechIndex = 0;
    this.voiceCaptureActive = false;
    this.destroyed = false;
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.updateClock();
    this.clockTicker = setInterval(function () {
      self.updateClock();
    }, 15000);
  },

  onDestroy() {
    this.destroyed = true;
    this.stopVoiceResources();
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
      if (event.direction === 'right') {
        this.closeSubPage();
      }
      return;
    }
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
    this.mainListAtStart = true;
    this.mainListAtEnd = false;
    this.pageIndex = (index + 4) % 4;
  },

  openSubPage(name) {
    this.subPage = name;
    this.mainVisible = false;
  },

  closeSubPage() {
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
    }
    return true;
  },

  onPageChange(event) {
    this.pageIndex = event.index;
  },

  openQuickChat() {
    this.newChat();
  },

  startVoiceChat() {
    this.newChat();
    this.startVoiceInput();
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
        self.createAndStartCapturer(turnId);
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
      var chunk = new Uint8Array(this.voicePcmChunks[j]);
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  },

  finishVoiceCapture() {
    if (this.voicePhase !== 'listening') {
      return;
    }
    var capturedBytes = this.voiceCapturedBytes;
    var pcm = this.concatPcmChunks();
    this.stopMicCapture();
    this.voicePcmChunks = [];
    this.voiceCapturedBytes = 0;
    if (capturedBytes < VOICE_MIN_BYTES || pcm.byteLength < VOICE_MIN_BYTES) {
      this.setVoicePhase('idle', '');
      this.showToast('说话时间太短，请再说一次');
      return;
    }
    this.submitTranscription(pcm, this.voiceTurnId);
  },

  submitTranscription(pcm, turnId) {
    var self = this;
    var wav = buildWavFromPcm(pcm);
    var boundary = '----NOVAWatch' + Date.now().toString(16);
    var body = this.buildVoiceMultipart(wav, boundary, STT_ENGINE, STT_LANGUAGE);
    this.setVoicePhase('transcribing', '正在语音转文字…');
    this.serviceStatus = '转写中';
    this.binaryRequest(STT_URL, {
      method: http.RequestMethod.POST,
      header: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      extraData: body,
      connectTimeout: 30000,
      readTimeout: 120000
    }).then(function (result) {
      if (turnId !== self.voiceTurnId || self.destroyed || self.subPage !== 'chat') {
        return false;
      }
      var payload = self.parseHttpResult(result.result);
      if (!payload || payload.success === false) {
        throw new Error((payload && payload.error) || 'transcription failed');
      }
      var transcript = String(payload.text || '').replace(/\s+/g, ' ').trim();
      if (!transcript) {
        throw new Error('empty transcript');
      }
      if (transcript.length > 500) {
        transcript = transcript.substring(0, 500);
      }
      self.voiceTranscriptText = transcript;
      self.setVoicePhase('thinking', '已转写 · NOVA 正在思考…');
      return self.sendChatText(transcript, true);
    }).catch(function (error) {
      if (turnId !== self.voiceTurnId || self.destroyed) {
        return;
      }
      var reason = error && (error.message || error.data) ? (error.message || error.data) : String(error);
      var message = '语音转写失败，请重试';
      if (reason.indexOf('429') >= 0) {
        message = '语音识别繁忙，请稍后再试';
      } else if (reason.indexOf('timeout') >= 0 || reason.indexOf('timed out') >= 0) {
        message = '语音识别超时，请重试';
      }
      console.info('[NOVA_AI] transcription failed: ' + reason);
      self.serviceStatus = '连接失败';
      self.setVoicePhase('idle', '');
      self.showToast(message);
    });
  },

  buildVoiceMultipart(wavBuffer, boundary, engine, language) {
    return buildMultipartBody(wavBuffer, boundary, engine, language);
  },

  buildVoiceWav(pcmBuffer) {
    return buildWavFromPcm(pcmBuffer);
  },

  getSpeechChunks(text) {
    return splitSpeechText(text, TTS_CHUNK_CHARS);
  },

  getSpeechUrl(text) {
    return TTS_BASE_URL + '?ie=UTF-8&client=tw-ob&tl=zh-CN&q=' + encodeURIComponent(text);
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
      this.showToast('自动播报已开启');
    }
  },

  getServiceUrl(path) {
    var base = BUILT_IN_BASE_URL.replace(/\/+$/, '');
    if (!path) {
      return base;
    }
    return base + (path.charAt(0) === '/' ? path : '/' + path);
  },

  networkRequest(url, options) {
    var method = options.method || 'GET';
    return new Promise(function (resolve, reject) {
      var fetchOptions = {
        url: url,
        method: method,
        header: options.header || {},
        responseType: 'text',
        success: function (data) {
          var status = data && data.code ? data.code : 200;
          console.info('[NOVA_NET] fetch success code=' + status);
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

  binaryRequest(url, options) {
    return new Promise(function (resolve, reject) {
      var client;
      try {
        client = http.createHttp();
        client.request(url, options).then(function (result) {
          try { client.destroy(); } catch (error) {}
          var status = result && result.responseCode ? result.responseCode : 0;
          if (status < 200 || status >= 300) {
            reject(new Error('HTTP ' + status));
            return;
          }
          resolve(result);
        }).catch(function (error) {
          try { client.destroy(); } catch (destroyError) {}
          reject(error);
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
      if (self.subPage === 'chat' && self.voiceOutputEnabled) {
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
