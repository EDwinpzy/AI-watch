import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/index.js';
const hmlPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/index.hml';
const cssPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/index.css';
const pageSource = fs.readFileSync(sourcePath, 'utf8');

for (const specifier of [
  '@ohos.multimedia.audio',
  '@ohos.ability.featureAbility',
  '@ohos.net.http',
  '@ohos.multimedia.media',
  '@ohos.net.webSocket',
  '@ohos.router',
  '@system.fetch',
  '@ohos.util'
]) {
  assert.ok(
    pageSource.includes(`from '${specifier}'`),
    `expected HarmonyOS import ${specifier}`
  );
}

const source = pageSource
  .replace(/^import .* from '(?:@(?:ohos|system)\.[^']+|\.\/built-in-config)';\r?$/gm, '')
  .replace('export default {', 'module.exports = {');

let permissionGranted = true;
let permissionRequests = 0;
let requestedPermissions = null;
let permissionRequestCode = 0;
let capturerStarts = 0;
let capturerStops = 0;
let audioOptions = null;
let activeCapturer = null;
const mediaPlayers = [];
const fetchState = {
  calls: 0,
  options: null,
  response: {
    code: 200,
    data: JSON.stringify({
      model: 'group/ai-watch',
      ok: true
    })
  },
  failNext: false
};
const webSocketState = {
  connectCalls: 0,
  url: '',
  handlers: {},
  sent: [],
  binaryBytes: 0,
  closed: false,
  closeAfterText: false
};
const httpState = {
  calls: 0,
  destroys: 0,
  capturedUrl: '',
  capturedOptions: null,
  response: {
    responseCode: 200,
    result: JSON.stringify({
      model: 'group/http-fallback',
      ok: true
    })
  }
};
const routerState = {
  backCalls: 0
};

const sandbox = {
  audio: {
    AudioSamplingRate: { SAMPLE_RATE_16000: 16000 },
    AudioChannel: { CHANNEL_1: 1 },
    AudioSampleFormat: { SAMPLE_FORMAT_S16LE: 3 },
    AudioEncodingType: { ENCODING_TYPE_RAW: 0 },
    SourceType: { SOURCE_TYPE_MIC: 1 },
    createAudioCapturer(options) {
      audioOptions = options;
      activeCapturer = {
        start() {
          capturerStarts++;
          return Promise.resolve();
        },
        read() {
          return new Promise(() => {});
        },
        stop() {
          capturerStops++;
          return Promise.resolve();
        },
        release() {
          return Promise.resolve();
        }
      };
      return Promise.resolve(activeCapturer);
    }
  },
  featureAbility: {
    getContext() {
      return {
        requestPermissionsFromUser(permissions, requestCode) {
          permissionRequests++;
          requestedPermissions = permissions;
          permissionRequestCode = requestCode;
          return Promise.resolve({
            authResults: [permissionGranted ? 0 : -1]
          });
        }
      };
    }
  },
  systemFetch: {
    fetch(options) {
      fetchState.calls++;
      fetchState.options = options;
      setTimeout(() => {
        if (fetchState.failNext) {
          fetchState.failNext = false;
          options.fail({ message: 'request data error' }, 0);
          return;
        }
        options.success(fetchState.response);
      }, 0);
    }
  },
  http: {
    RequestMethod: { GET: 'GET', POST: 'POST' },
    createHttp() {
      httpState.calls++;
      return {
        request(url, options, callback) {
          httpState.capturedUrl = url;
          httpState.capturedOptions = options;
          setTimeout(() => callback(null, httpState.response), 0);
        },
        destroy() {
          httpState.destroys++;
        }
      };
    }
  },
  media: {
    createAudioPlayer() {
      const handlers = {};
      let stopped = false;
      let released = false;
      let source = '';
      const player = {
        setVolume() {},
        on(type, callback) {
          handlers[type] = callback;
        },
        play() {
          if (!stopped && !released) {
            setTimeout(() => {
              if (!stopped && !released && handlers.finish) {
                handlers.finish();
              }
            }, 0);
          }
        },
        stop() {
          stopped = true;
        },
        release() {
          released = true;
        },
        get src() {
          return source;
        },
        set src(value) {
          source = value;
          setTimeout(() => {
            if (!stopped && !released && handlers.dataLoad) {
              handlers.dataLoad();
            }
          }, 0);
        }
      };
      mediaPlayers.push(player);
      return player;
    }
  },
  webSocket: {
    createWebSocket() {
      const socket = {
        on(type, callback) {
          webSocketState.handlers[type] = callback;
        },
        off(type) {
          delete webSocketState.handlers[type];
        },
        connect(url) {
          webSocketState.connectCalls++;
          webSocketState.url = url;
          setTimeout(() => {
            if (webSocketState.handlers.open) {
              webSocketState.handlers.open(null, {});
            }
          }, 0);
          return Promise.resolve(true);
        },
        send(data) {
          webSocketState.sent.push(data);
          if (typeof data === 'string') {
            const payload = JSON.parse(data);
            if (payload.language && payload.model) {
              setTimeout(() => {
                if (webSocketState.handlers.message) {
                  webSocketState.handlers.message(null, JSON.stringify({ status: 'ready' }));
                }
              }, 0);
            } else if (payload.action === 'stop') {
              setTimeout(() => {
                if (webSocketState.handlers.message) {
                  webSocketState.handlers.message(null, JSON.stringify({
                    text: '',
                    partial: '',
                    is_final: true,
                    source: 'vosk'
                  }));
                  webSocketState.handlers.message(null, JSON.stringify({
                    text: '今天天气',
                    partial: '今天天气',
                    is_final: false,
                    source: 'whisper'
                  }));
                }
              }, 0);
              setTimeout(() => {
                if (webSocketState.handlers.message) {
                  webSocketState.handlers.message(null, JSON.stringify({
                    text: '今天天气怎么样？',
                    partial: '今天天气怎么样',
                    is_final: !webSocketState.closeAfterText,
                    source: 'whisper'
                  }));
                  if (webSocketState.closeAfterText && webSocketState.handlers.close) {
                    webSocketState.handlers.close(null, { code: 1006, reason: '' });
                  }
                }
              }, 5);
            }
          } else {
            webSocketState.binaryBytes += data.byteLength;
          }
          return Promise.resolve(true);
        },
        close() {
          if (!webSocketState.closed) {
            webSocketState.closed = true;
            setTimeout(() => {
              if (webSocketState.handlers.close) {
                webSocketState.handlers.close(null, { code: 1000, reason: '' });
              }
            }, 0);
          }
          return Promise.resolve(true);
        }
      };
      return socket;
    }
  },
  util: {
    TextDecoder
  },
  router: {
    back() {
      routerState.backCalls++;
    }
  },
  builtInConfig: {
    baseUrl: 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1',
    apiKey: 'sk-test-local-placeholder',
    model: 'group/ai-watch'
  },
  module: { exports: {} },
  exports: {},
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Uint8Array,
  Int16Array,
  DataView,
  ArrayBuffer,
  Promise
};

vm.runInNewContext(source, sandbox, { filename: sourcePath });
const component = sandbox.module.exports;
const page = Object.assign({}, structuredClone(component.data), component);
page.onInit();

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.equal(page.threads.length, 2);
assert.equal(page.builtInModel, 'group/ai-watch');
assert.equal(
  page.getServiceUrl('/chat/completions'),
  'https://magpie-relay.pengzhiyuan0724.workers.dev/v1/chat/completions'
);
assert.equal(page.getServiceUrl(), 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1');
assert.equal(typeof page.openApiSettings, 'undefined');
assert.equal(typeof page.openField, 'undefined');
assert.equal(typeof page.submitVoiceTurn, 'undefined');
assert.equal(typeof page.runVoiceSelfTest, 'undefined');
assert.equal(typeof page.startRecording, 'undefined');
assert.ok(!pageSource.includes('/api/voice'));
assert.ok(!pageSource.includes('/api/tts'));
assert.ok(!pageSource.includes('apiBaseUrl'));
assert.ok(!pageSource.includes('apiKey:'));
assert.match(pageSource, /STT_WS_URL = 'wss:\/\/api\.stt\.ai\/v1\/stream'/);
assert.match(pageSource, /STT_MODEL = 'whisper-large-v3-turbo'/);
assert.match(pageSource, /TTS_BASE_URL = 'https:\/\/fanyi\.baidu\.com\/gettts'/);
assert.ok(!pageSource.includes('@ohos.fileio'));
assert.ok(!pageSource.includes('@ohos.request'));
assert.ok(!pageSource.includes('uploadVoiceWav'));
assert.equal(typeof page.buildVoiceWav, 'undefined');

const fetchResult = await page.networkRequest('https://example.test/v1/models', { method: 'GET' });
assert.equal(fetchResult.responseCode, 200);
assert.equal(page.parseHttpResult(fetchResult.result).model, 'group/ai-watch');
assert.equal(fetchState.calls, 1);
assert.equal(httpState.calls, 0);

fetchState.failNext = true;
const fallbackResult = await page.networkRequest('https://example.test/v1/models', { method: 'GET' });
assert.equal(fallbackResult.responseCode, 200);
assert.equal(page.parseHttpResult(fallbackResult.result).model, 'group/http-fallback');
assert.equal(httpState.calls, 1);
assert.equal(httpState.destroys, 1);

const utf8Json = new TextEncoder().encode(JSON.stringify({ text: '中文语音' }));
assert.equal(page.parseHttpResult(utf8Json.buffer).text, '中文语音');

const pcm = new Uint8Array(32000);
for (let index = 0; index < pcm.length; index++) {
  pcm[index] = index % 256;
}
assert.ok(!pageSource.includes('notetakers.vipresearch.ca'));
assert.ok(!pageSource.includes('buildWavFromPcm'));
assert.ok(!pageSource.includes('multipart/form-data'));

const speechChunks = page.getSpeechChunks(
  '第一句说明天气和出行安排。第二句说明工作重点，并提醒休息。' +
  '第三句给出今天的行动建议。第四句提醒补充水分并安排短暂散步。' +
  '第五句说明晚间复盘和明天优先级。第六句再次确认播报分片能够覆盖较长回复内容。'
);
assert.ok(speechChunks.length >= 2);
assert.ok(speechChunks.every((chunk) => chunk.length <= 96));
assert.ok(speechChunks.join('').includes('今天的行动建议'));
assert.equal(
  page.getSpeechUrl('你好 世界'),
  'https://fanyi.baidu.com/gettts?lan=zh&spd=5&source=web&text=' +
    encodeURIComponent('你好 世界')
);

let capturedChat = null;
page.networkRequest = function (url, options) {
  capturedChat = { url, options };
  return Promise.resolve({
    result: JSON.stringify({
      model: 'group/ai-watch',
      choices: [{
        message: {
          content: [
            { type: 'text', text: '内置模型回复' },
            { type: 'text', text: '。' }
          ]
        }
      }]
    })
  });
};

page.voiceOutputEnabled = false;
page.newChat();
page.startVoiceInput();
await wait(40);
assert.equal(page.voicePhase, 'listening');
assert.equal(webSocketState.connectCalls, 1);
assert.equal(webSocketState.url, 'wss://api.stt.ai/v1/stream');
assert.equal(JSON.parse(webSocketState.sent[0]).language, 'zh');
assert.equal(JSON.parse(webSocketState.sent[0]).model, 'whisper-large-v3-turbo');
page.sendSpeechAudioChunk(pcm.buffer);
page.voicePcmChunks = [pcm.buffer];
page.voiceCapturedBytes = pcm.byteLength;
page.finishVoiceCapture();
await wait(80);
assert.equal(webSocketState.binaryBytes, pcm.byteLength);
assert.equal(JSON.parse(webSocketState.sent.at(-1)).action, 'stop');
assert.equal(page.voiceTranscriptText, '今天天气怎么样？');
assert.equal(page.chatMessages.at(-2).text, '今天天气怎么样？');
assert.equal(page.chatMessages.at(-1).text, '内置模型回复。');
assert.equal(page.voicePhase, 'idle');

page.voiceOutputEnabled = false;
page.newChat();
page.chatInput = '网络请求测试';
page.sendChat();
await wait(20);
assert.equal(page.chatMessages.at(-1).text, '内置模型回复。');
assert.equal(page.serviceStatus, '已连接');
assert.equal(page.chatRequestPending, false);
assert.equal(page.voicePhase, 'idle');
assert.equal(capturedChat.url, page.getServiceUrl('/chat/completions'));
assert.equal(capturedChat.options.extraData.model, 'group/ai-watch');
assert.equal(capturedChat.options.extraData.max_tokens, 512);
assert.equal(capturedChat.options.extraData.stream, false);
assert.equal(capturedChat.options.extraData.messages[0].role, 'system');
assert.equal(capturedChat.options.extraData.messages.at(-1).content, '网络请求测试');
assert.match(capturedChat.options.header.Authorization, /^Bearer sk-/);

page.networkRequest = function () {
  return Promise.reject(new Error('HTTP 429'));
};
page.chatInput = '限流测试';
page.sendChat();
await wait(20);
assert.equal(page.chatMessages.at(-1).text, '请求过多，请稍后再试');
assert.equal(page.serviceStatus, '连接失败');
assert.equal(page.voicePhase, 'idle');

permissionGranted = false;
page.newChat();
const deniedCount = permissionRequests;
page.startVoiceInput();
await wait(20);
assert.equal(permissionRequests, deniedCount + 1);
assert.deepEqual(Array.from(requestedPermissions), ['ohos.permission.MICROPHONE']);
assert.equal(permissionRequestCode, 101);
assert.equal(page.voicePhase, 'idle');
assert.equal(page.toastText, '未获得麦克风权限');
permissionGranted = true;

page.networkRequest = function (url, options) {
  capturedChat = { url, options };
  return Promise.resolve({
    result: JSON.stringify({
      choices: [{
        message: { content: '这是语音问题的回答。' }
      }]
    })
  });
};
page.voiceOutputEnabled = false;
page.newChat();
const startsBefore = capturerStarts;
const permissionBefore = permissionRequests;
const binaryBefore = webSocketState.binaryBytes;
const socketCallsBefore = webSocketState.connectCalls;
webSocketState.closeAfterText = true;
page.startVoiceInput();
await wait(40);
assert.equal(permissionRequests, permissionBefore + 1);
assert.equal(capturerStarts, startsBefore + 1);
assert.equal(webSocketState.connectCalls, socketCallsBefore + 1);
assert.equal(page.voicePhase, 'listening');
assert.equal(audioOptions.streamInfo.samplingRate, 16000);
assert.equal(audioOptions.streamInfo.channels, 1);
assert.equal(audioOptions.streamInfo.sampleFormat, 3);
assert.equal(audioOptions.capturerInfo.source, 1);

const capturedPcm = new Uint8Array(16000);
page.sendSpeechAudioChunk(capturedPcm.buffer);
page.voicePcmChunks = [capturedPcm.buffer];
page.voiceCapturedBytes = 16000;
const stopsBefore = capturerStops;
page.finishVoiceCapture();
await wait(60);
assert.equal(capturerStops, stopsBefore + 1);
assert.equal(webSocketState.binaryBytes, binaryBefore + capturedPcm.byteLength);
assert.equal(JSON.parse(webSocketState.sent.at(-1)).action, 'stop');
assert.equal(page.chatMessages.at(-2).text, '今天天气怎么样？');
assert.equal(page.chatMessages.at(-1).text, '这是语音问题的回答。');
assert.equal(page.voicePhase, 'idle');
assert.equal(page.voicePcmChunks.length, 0);
webSocketState.closeAfterText = false;

page.voiceOutputEnabled = true;
const playersBefore = mediaPlayers.length;
page.playSpeechText(
  '第一段播报内容比较长，需要在标点处切开并保持语义完整。' +
  '第二段继续说明手表端使用短句分片，避免单次请求过长。' +
  '第三段完成语音合成播报。'
);
await wait(80);
assert.ok(mediaPlayers.length > playersBefore);
assert.ok(
  mediaPlayers.slice(playersBefore).every((player) =>
    player.src.startsWith('https://fanyi.baidu.com/gettts?')
  )
);
assert.equal(page.voicePhase, 'idle');

page.chatMessages = [{ role: 'user', text: 'persist-api8' }];
page.syncCurrentThread();
page.openThreadById('ai');
page.chatTitle = '人工智能介绍';
page.chatMessages.push({ role: 'user', text: 'persist-api8' });
page.syncCurrentThread();
page.openThreadById('fitness');
assert.equal(page.currentThreadId, 'fitness');
assert.equal(page.chatMessages.some((message) => message.text === 'persist-api8'), false);
page.openThreadById('ai');
assert.equal(page.chatMessages.at(-1).text, 'persist-api8');
assert.match(page.threads[0].preview, /persist-api8/);

const navigationState = {
  subPage: page.subPage,
  mainVisible: page.mainVisible,
  pageIndex: page.pageIndex
};
page.subPage = '';
page.mainVisible = true;
page.pageIndex = 1;
assert.equal(page.onBackPress(), false);
assert.equal(page.pageIndex, 1);
page.pageIndex = 3;
page.mainListReachedEnd();
page.handleSwipe({ direction: 'up' });
await wait(260);
assert.equal(page.pageIndex, 0);
page.handleSwipe({ direction: 'down' });
await wait(260);
assert.equal(page.pageIndex, 3);
Object.assign(page, navigationState);

page.newChat();
page.startVoiceInput();
await wait(40);
assert.equal(page.voicePhase, 'listening');
page.onBackPress();
assert.equal(page.subPage, '');
assert.equal(page.voicePhase, 'idle');
assert.equal(page.mainVisible, true);
routerState.backCalls = 0;
page.switchToClassicInterface();
assert.equal(routerState.backCalls, 1);
assert.equal(page.voicePhase, 'idle');

const hml = fs.readFileSync(hmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
assert.ok(!hml.includes('<swiper'), 'native drag offset must not compete with menu gestures');
assert.match(hml, /pageIndex === 3/);
assert.match(hml, /for="\{\{threads\}\}"/);
assert.match(hml, /openThread\(\$item\)/);
assert.match(hml, /class="hero-complication"/);
assert.match(hml, /@click="startVoiceChat"/);
assert.match(hml, /class="voice-button/);
assert.match(hml, /class="voice-state"/);
assert.match(hml, /class="composer-input"/);
assert.match(hml, /class="built-in-card"/);
assert.match(hml, /toggleVoiceOutput/);
assert.ok(!hml.includes('openField('), 'service field editor must be removed');
assert.ok(!hml.includes('API 密钥'), 'API key editor must not render');
assert.ok(!hml.includes('runVoiceSelfTest'), 'unavailable relay voice self-test must be removed');
assert.ok(!hml.includes('演示录音'), 'fake recording copy must be removed');
assert.ok(!hml.includes('不采集声音'), 'text-only recording copy must be removed');
assert.ok(!hml.includes('value="‹"'), 'prototype navigation must not render a back button');
assert.match(css, /\.mic-glyph/);
assert.match(css, /\.voice-button-live/);
assert.ok(!/border-radius\s*:\s*[^;]*%/.test(css), 'API 8 CSS must not use percentage border-radius');
assert.ok(!/background\s*:\s*[^;]*#[0-9a-fA-F]{3,8}/.test(css), 'API 8 solid colors must use background-color');
assert.ok(!/:active\s+[.#]/.test(css), 'API 8 CSS must not use descendant :active selectors');

page.onDestroy();

const assertionCount = (fs.readFileSync(new URL(import.meta.url)).toString().match(/\bassert\./g) || []).length;
console.log(JSON.stringify({
  success: true,
  assertions: assertionCount,
  threads: page.threads.length,
  activeThread: page.currentThreadId,
  chatEndpoint: page.getServiceUrl('/chat/completions'),
  transcriptionEndpoint: 'wss://api.stt.ai/v1/stream',
  ttsEndpoint: 'https://fanyi.baidu.com/gettts',
  api8Source: sourcePath
}, null, 2));
