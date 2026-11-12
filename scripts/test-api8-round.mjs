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
  '@system.router',
  '@system.fetch',
  '@ohos.util',
  '@ohos.pasteboard'
]) {
  assert.ok(
    pageSource.includes(`from '${specifier}'`),
    `expected HarmonyOS import ${specifier}`
  );
}

const source = pageSource
  .replace(/^import .* from '(?:@(?:ohos|system)\.[^']+|\.\.\/\.\.\/built-in-config)';\r?$/gm, '')
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
  codexCalls: [],
  codexPolls: [],
  codexFailStatus: 0,
  response: {
    responseCode: 200,
    result: JSON.stringify({
      model: 'group/http-fallback',
      ok: true
    })
  }
};
const pasteboardState = {
  values: [],
  failNext: false
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
          let response = httpState.response;
          if (url.includes('/api/codex/')) {
            httpState.codexCalls.push({ url, options });
            if (httpState.codexFailStatus) {
              const status = httpState.codexFailStatus;
              httpState.codexFailStatus = 0;
              setTimeout(() => callback(null, {
                responseCode: status,
                result: JSON.stringify({ ok: false, error: 'test failure' })
              }), 0);
              return;
            }
            if (url.endsWith('/api/codex/voice')) {
              response = {
                responseCode: 200,
                result: JSON.stringify({
                  taskId: 'task-voice',
                  status: 'queued',
                  stage: '已排队',
                  message: '等待 Codex 执行',
                  transcript: '请介绍一下当前仓库。',
                  elapsedMs: 0
                })
              };
            } else if (url.endsWith('/api/codex/task') && options.method === 'POST') {
              response = {
                responseCode: 200,
                result: JSON.stringify({
                  taskId: 'task-text',
                  status: 'queued',
                  stage: '已排队',
                  message: '等待 Codex 执行',
                  transcript: '检查项目结构',
                  elapsedMs: 0
                })
              };
            } else if (url.endsWith('/cancel')) {
              response = {
                responseCode: 200,
                result: JSON.stringify({ ok: true, status: 'cancelled' })
              };
            } else {
              const poll = httpState.codexPolls.shift() || {
                status: 'succeeded',
                stage: '完成',
                message: '任务完成',
                finalText: '项目结构清晰，语音页和任务页均已接入。',
                speechText: '项目结构清晰。',
                elapsedMs: 2150
              };
              response = {
                responseCode: 200,
                result: JSON.stringify(Object.assign({
                  taskId: 'task-voice',
                  transcript: '请介绍一下当前仓库。'
                }, poll))
              };
            }
          }
          setTimeout(() => callback(null, response), 0);
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
  pasteboard: {
    createPlainTextData(value) {
      return { value };
    },
    getSystemPasteboard() {
      return {
        setPasteData(data, callback) {
          if (pasteboardState.failNext) {
            pasteboardState.failNext = false;
            callback(new Error('pasteboard denied'));
            return;
          }
          pasteboardState.values.push(data.value);
          callback(null);
        }
      };
    }
  },
  router: {
    back() {
      routerState.backCalls++;
    }
  },
  builtInConfig: {
    baseUrl: 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1',
    apiKey: 'sk-test-local-placeholder',
    model: 'group/ai-watch',
    codexBaseUrl: 'http://127.0.0.1:8787',
    codexToken: 'test-codex-token',
    codexRepoId: 'watch'
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

assert.equal(permissionRequests, 0);
assert.equal(page.voiceOutputEnabled, false);
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
assert.equal(typeof page.startRecording, 'function');
assert.equal(typeof page.submitCodexText, 'function');
assert.equal(typeof page.pollCodexTask, 'function');
assert.equal(typeof page.openCodexTask, 'function');
assert.equal(typeof page.copyResult, 'function');
assert.equal(page.voiceMode, 'builtin');
assert.equal(page.getCodexServiceUrl('/api/codex/task'), 'http://127.0.0.1:8787/api/codex/task');
page.voiceMode = 'builtin';
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

page.voiceOutputEnabled = false;
page.voiceMode = 'codex';
page.voiceModeLabel = 'Codex 只读';
page.newChat();
const codexThreadId = page.currentThreadId;
const codexCallsBefore = httpState.codexCalls.length;
const textTaskResult = await page.sendChatText('检查项目结构', false);
await wait(20);
assert.equal(textTaskResult, true);
assert.equal(page.subPage, 'task');
assert.equal(page.mainVisible, false);
assert.equal(page.codexTaskId, 'task-text');
assert.equal(page.taskHistory[0].id, 'task-text');
assert.equal(page.taskHistory[0].statusLabel, '已排队');
assert.equal(page.chatMessages.at(-1).text, '检查项目结构');
const textCreate = httpState.codexCalls[codexCallsBefore];
assert.match(textCreate.url, /\/api\/codex\/task$/);
assert.equal(textCreate.options.header['X-Nova-Token'], 'test-codex-token');
assert.equal(JSON.parse(textCreate.options.extraData).mode, 'readonly');
assert.equal(JSON.parse(textCreate.options.extraData).repoId, 'watch');
page.stopCodexPolling();
httpState.codexPolls = [{
  taskId: 'task-text',
  status: 'succeeded',
  stage: '正在整理',
  message: '任务完成',
  transcript: '检查项目结构',
  finalText: '项目结构清晰。\n语音页、录音摘要和 Codex 任务均已接入。',
  speechText: '项目结构清晰。',
  elapsedMs: 3200
}];
page.pollCodexTask();
await wait(30);
assert.equal(page.subPage, 'result');
assert.equal(page.codexStatus, 'succeeded');
assert.equal(page.summaryItems.length, 2);
assert.equal(page.resultTranscriptText, '检查项目结构');
assert.equal(page.taskHistory[0].status, 'succeeded');
assert.equal(page.findThread(codexThreadId).messages.at(-1).text, page.codexFinalText);

page.showTranscript();
page.beginTranscriptEdit();
assert.equal(page.editingTranscript, true);
page.onTranscriptInput({ value: '编辑后的转写文本' });
page.saveTranscript();
assert.equal(page.editingTranscript, false);
assert.equal(page.codexTranscript, '编辑后的转写文本');
page.copyResult();
await wait(5);
assert.equal(pasteboardState.values.at(-1), '编辑后的转写文本');
page.continueFromResult();
assert.equal(page.subPage, 'chat');
assert.equal(page.chatMessages[0].text, '编辑后的转写文本');
assert.equal(page.chatMessages[1].text, page.codexFinalText);

page.pageIndex = 0;
page.mainVisible = false;
page.subPage = 'task';
page.openCodexTask({
  id: 'task-history',
  status: 'failed',
  stage: '执行失败',
  error: 'Magpie 后端不可用',
  transcript: '读取失败测试',
  elapsedText: '00:08'
});
assert.equal(page.subPage, 'task');
assert.equal(page.codexError, 'Magpie 后端不可用');
assert.ok(page.codexPollTimer, 'terminal history without a synced result must still allow one poll');
httpState.codexPolls = [{
  taskId: 'task-history',
  status: 'cancelled',
  stage: '已停止',
  message: '任务已取消',
  transcript: '读取失败测试',
  elapsedMs: 9000
}];
page.stopCodexPolling();
page.pollCodexTask();
await wait(30);
assert.equal(page.codexStatus, 'cancelled');
assert.equal(page.codexStatusLabel(page.codexStatus), '已停止');

page.voiceMode = 'codex';
httpState.codexFailStatus = 409;
page.newChat();
const conflictResult = await page.sendChatText('并发任务测试', false);
await wait(20);
assert.equal(conflictResult, false);
assert.equal(page.chatMessages.at(-1).text, 'Codex 任务创建失败：已有 Codex 任务正在执行');
assert.equal(page.toastText, '已有 Codex 任务正在执行');
assert.equal(page.describeCodexError(new Error('HTTP 401')), 'Codex 访问令牌无效');

page.voiceMode = 'codex';
page.resetRecordingState();
page.startRecording();
await wait(12);
assert.equal(page.recordRunning, true);
assert.equal(permissionRequestCode, 102);
page.recordPcmChunks = [new Uint8Array(32000)];
page.markRecording();
assert.equal(page.recordMarks.length, 1);
page.pauseRecording();
assert.equal(page.recordPaused, true);
assert.equal(page.recordRunning, false);
page.resumeRecording();
await wait(12);
assert.equal(page.recordRunning, true);
const voiceCallsBefore = httpState.codexCalls.length;
page.recordPcmChunks = [new Uint8Array(32000)];
page.finishRecording();
await wait(220);
assert.equal(page.subPage, 'task');
assert.equal(page.codexOrigin, 'record');
assert.equal(page.taskHistory[0].id, 'task-voice');
const recordCreate = httpState.codexCalls[voiceCallsBefore];
assert.match(recordCreate.url, /\/api\/codex\/voice$/);
assert.equal(JSON.parse(recordCreate.options.extraData).sampleRate, 16000);
assert.ok(JSON.parse(recordCreate.options.extraData).pcmBase64.length > 100);
assert.equal(page.recordPcmChunks.length, 0);
assert.match(pageSource, /RECORD_MAX_SECONDS = 60/);

page.stopCodexPolling();
page.newChat();
const voiceThreadId = page.currentThreadId;
page.codexUserCommitted = false;
page.codexAssistantCommitted = true;
await page.submitCodexVoice(new Uint8Array(32000), 'voice');
await wait(20);
assert.equal(page.codexOrigin, 'voice');
assert.equal(page.codexAssistantCommitted, false);
assert.equal(page.codexUserCommitted, true);
assert.equal(page.findThread(voiceThreadId).messages.at(-1).text, '请介绍一下当前仓库。');

page.stopCodexPolling();
page.newChat();
const lateTranscriptThreadId = page.currentThreadId;
page.codexTaskId = 'task-late-transcript';
page.codexOrigin = 'voice';
page.codexChatThreadId = lateTranscriptThreadId;
page.codexUserCommitted = false;
page.codexAssistantCommitted = false;
page.applyCodexSnapshot({
  status: 'running',
  stage: '正在识别',
  message: '语音识别完成',
  transcript: '稍后返回的语音转写',
  elapsedMs: 1200
});
assert.equal(page.codexUserCommitted, true);
assert.equal(page.findThread(lateTranscriptThreadId).messages.at(-1).text, '稍后返回的语音转写');

page.voiceMode = 'builtin';
page.voiceModeLabel = 'Magpie 即时';
page.networkRequest = function () {
  return Promise.resolve({
    result: JSON.stringify({
      choices: [{ message: { content: '这是直接语音回答。' } }]
    })
  });
};
page.newChat();
const answerResult = await page.sendChatText('直接语音问题', true);
assert.equal(answerResult, true);
assert.equal(page.subPage, 'answer');
assert.equal(page.voiceQuestionText, '直接语音问题');
assert.equal(page.voiceAnswerText, '这是直接语音回答。');
page.copyVoiceAnswer();
await wait(5);
assert.equal(pasteboardState.values.at(-1), '这是直接语音回答。');
page.continueVoiceChat();
assert.equal(page.subPage, 'chat');

page.toggleHaptics();
assert.equal(page.hapticsEnabled, false);
page.toggleHaptics();
assert.equal(page.hapticsEnabled, true);
assert.equal(typeof page.toggleVoiceMode, 'undefined');

const navigationState = {
  subPage: page.subPage,
  mainVisible: page.mainVisible,
  pageIndex: page.pageIndex
};
page.subPage = '';
page.mainVisible = true;
page.pageIndex = 1;
assert.equal(page.onBackPress(), true);
assert.equal(page.pageIndex, 1);
page.subPage = 'chat';
page.handleSwipe({ direction: 'right' });
assert.equal(page.subPage, 'chat');
page.handleSwipe({ direction: 'left' });
assert.equal(page.subPage, '');
assert.equal(page.pageIndex, 2);
page.pageIndex = 3;
page.mainListReachedEnd();
page.handleSwipe({ direction: 'up' });
await wait(260);
assert.equal(page.pageIndex, 0);
page.handleSwipe({ direction: 'down' });
await wait(260);
assert.equal(page.pageIndex, 3);

const savedTaskHistory = page.taskHistory;
page.taskHistory = [{}, {}, {}];
page.pageIndex = 2;
page.mainListAtStart = true;
page.mainListAtEnd = false;
page.mainListAtStartAtTouch = true;
page.mainListAtEndAtTouch = false;
page.handleSwipe({ direction: 'up' });
assert.equal(page.pageIndex, 2, 'a scrolled list must keep the page during the same gesture');
page.mainListAtEnd = true;
page.mainListAtStart = false;
page.handleSwipe({ direction: 'up' });
assert.equal(page.pageIndex, 2, 'reaching the list edge during a gesture must not page');
page.onRootTouchStart();
page.handleSwipe({ direction: 'up' });
assert.equal(page.pageIndex, 2, 'the menu must wait for the finger to lift');
page.onRootTouchEnd();
assert.equal(page.pageIndex, 3, 'a new gesture from the list edge must page');
page.pageIndex = 2;
page.mainListAtStart = true;
page.mainListAtEnd = false;
page.mainListAtStartAtTouch = false;
page.mainListAtEndAtTouch = false;
page.handleSwipe({ direction: 'down' });
assert.equal(page.pageIndex, 2, 'reaching the list top during a gesture must not page');
page.onRootTouchStart();
page.handleSwipe({ direction: 'down' });
assert.equal(page.pageIndex, 2, 'the menu must wait for the finger to lift');
page.onRootTouchEnd();
assert.equal(page.pageIndex, 1, 'a new gesture from the list top must page back');
page.taskHistory = savedTaskHistory;
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
assert.match(hml, /@touchstart="onRootTouchStart"/, 'root touch start must snapshot list edges');
assert.match(hml, /@touchend="onRootTouchEnd"/, 'root touch end must commit a pending menu change');
assert.match(hml, /@touchcancel="onRootTouchCancel"/, 'cancelled touches must not change menus');
assert.equal((hml.match(/class="home-action /g) || []).length, 1, 'home must keep one secondary action');
assert.ok(!hml.includes('>文字对话</text>'), 'text chat belongs under the recent menu');
assert.ok(hml.includes('<text class="fixed-page-title">任务结果</text>'), 'result title must match the classic interface');
assert.ok(!hml.includes('<swiper'), 'native drag offset must not compete with menu gestures');
assert.match(hml, /pageIndex === 3/);
assert.match(hml, /for="\{\{threads\}\}"/);
assert.match(hml, /openThread\(\$item\)/);
assert.match(hml, /class="hero-complication"/);
assert.match(hml, /@click="startVoiceChat"/);
assert.match(hml, /class="voice-button/);
assert.match(hml, /class="voice-state"/);
assert.match(hml, /class="composer-input"/);
assert.ok(!hml.includes('toggleVoiceOutput'), 'voice playback toggle must be removed');
assert.match(hml, /class="page record-page"/);
assert.match(hml, /startRecordingFromHome/);
assert.match(hml, /class="record-actions"/);
assert.match(hml, /for="\{\{recordWaveBars\}\}"/);
assert.match(hml, /markRecording/);
assert.match(hml, /finishRecording/);
assert.match(hml, /for="\{\{taskHistory\}\}"/);
assert.match(hml, /openCodexTask\(\$item\)/);
assert.match(hml, /class="task-status-chip/);
assert.match(hml, /cancelCodexTask/);
assert.match(hml, /subPage === 'answer'/);
assert.match(hml, /copyVoiceAnswer/);
assert.match(hml, /subPage === 'task'/);
assert.match(hml, /subPage === 'result'/);
assert.match(hml, /beginTranscriptEdit/);
assert.match(hml, /saveTranscript/);
assert.match(hml, /copyResult/);
assert.match(hml, /continueFromResult/);
assert.ok(!hml.includes('toggleVoiceMode'), 'voice backend switch must be removed');
assert.match(hml, /toggleHaptics/);
assert.match(hml, /始终静音/);
assert.ok(!hml.includes('openField('), 'service field editor must be removed');
assert.ok(!hml.includes('API 密钥'), 'API key editor must not render');
assert.ok(!hml.includes('runVoiceSelfTest'), 'unavailable relay voice self-test must be removed');
assert.ok(!hml.includes('演示录音'), 'fake recording copy must be removed');
assert.ok(!hml.includes('不采集声音'), 'text-only recording copy must be removed');
assert.ok(!hml.includes('value="‹"'), 'prototype navigation must not render a back button');
assert.ok(!/@click="(goBack|closeSubPage|closeChat|cancelTranscriptEdit)"/.test(hml),
  'visible navigation controls are forbidden');
assert.match(css, /\.mic-glyph/);
assert.match(css, /\.voice-button-live/);
assert.match(css, /\.record-wave-bar/);
assert.match(css, /\.task-orbit/);
assert.match(css, /\.answer-assistant-card/);
assert.match(css, /\.transcript-input/);
assert.match(css, /\.switch-track/);
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
