import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js';
const hmlPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.hml';
const cssPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.css';
const shellActivityPath = 'api8-watch/entry/src/main/java/com/aiwatch/watch/HiWearMainAbilityShellActivity.java';
const hvigorEntryPath = 'api8-watch/entry/hvigorfile.ts';
const pageSource = fs.readFileSync(sourcePath, 'utf8');
const hml = fs.readFileSync(hmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const shellActivitySource = fs.readFileSync(shellActivityPath, 'utf8');
const hvigorEntrySource = fs.readFileSync(hvigorEntryPath, 'utf8');
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '');

function declarationsFor(selector) {
  const declarations = {};
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(cssRules)) !== null) {
    const selectors = match[1].split(',').map((item) => item.trim());
    if (!selectors.includes(selector)) {
      continue;
    }
    for (const declaration of match[2].split(';')) {
      const separator = declaration.indexOf(':');
      if (separator === -1) {
        continue;
      }
      declarations[declaration.slice(0, separator).trim()] =
        declaration.slice(separator + 1).trim();
    }
  }
  return declarations;
}

function pixelProperty(selector, property) {
  const value = declarationsFor(selector)[property];
  return Number.parseFloat(value || '');
}

const requiredImports = [
  '@ohos.pasteboard',
  '@ohos.multimedia.audio',
  '@ohos.ability.featureAbility',
  '@ohos.net.http'
];
for (const specifier of requiredImports) {
  assert.ok(
    pageSource.includes(`from '${specifier}'`),
    `expected HarmonyOS import ${specifier}`
  );
}

assert.ok(
  pageSource.includes("HARDWARE_KEY_EVENT = 'com.aiwatch.watch.action.START_VOICE'") &&
  pageSource.includes('commonEvent.createSubscriber') &&
  pageSource.includes('startVoiceFromHardwareKey') &&
  pageSource.includes('submitVoiceTurn()'),
  'hardware-key voice event path is incomplete'
);
assert.ok(
  shellActivitySource.includes('dispatchKeyEvent') &&
  shellActivitySource.includes('HARDWARE_KEY_BUTTON_9 = 196') &&
  shellActivitySource.includes('com.aiwatch.watch.action.START_VOICE'),
  'shell activity must map F26/button 9 to the voice event'
);
assert.ok(
  hvigorEntrySource.includes('PrepareHardwareKeyAbility'),
  'Hvigor must copy hardware-key Java sources into the legacy build'
);

assert.ok(
  !pageSource.includes("from '@ohos.multimedia.media'"),
  'the watch must not import a media playback API'
);
assert.ok(!/createAudioPlayer|startTts|playAudio|player\.play|\.wav\b/.test(pageSource), 'watch audio playback path is forbidden');
assert.ok(!/vibrator|startVibration|playTts/.test(pageSource), 'the watch must not start vibration or sound playback');
assert.ok(!/@click="(goBack|closeSubPage|closeChat)"/.test(hml), 'visible navigation buttons are forbidden');
assert.equal((hml.match(/@swipe=/g) || []).length, 1, 'swipe handling must exist only on the root container');
assert.match(hml, /@touchstart="onRootTouchStart"/, 'root touch start must snapshot list edges');
assert.equal((hml.match(/class="page-dots"/g) || []).length, 4, 'every main page needs a page indicator');
assert.equal((hml.match(/dot-active/g) || []).length, 4, 'each main page needs exactly one active dot');
assert.ok(hml.includes('<text class="fixed-page-title">最近</text>'), 'history title must match the canonical menu name');
assert.ok(!hml.includes('最近对话'), 'the legacy history title must not return');
assert.match(hml, /id="recentList"/, 'recent list needs a stable id for scroll reset');
assert.match(hml, /id="settingsList"/, 'settings list needs a stable id for scroll reset');
assert.ok(
  pageSource.includes('scrollTop({ smooth: false })'),
  'main lists must reset to the first row when their page opens'
);
assert.ok(
  !/class="(home-clock|clock|status-date|status-signal|status-battery)"/.test(hml),
  'the classic page must not draw an in-app time, date, signal or battery status bar'
);
assert.ok(
  !pageSource.includes('clockText') && !pageSource.includes('updateClock'),
  'the classic page must not keep a hidden clock render loop'
);
assert.equal(
  (hml.match(/class="hero-action /g) || []).length,
  2,
  'the home page must keep exactly two primary actions'
);
assert.match(
  hml,
  /codexTaskId && codexStatus !== 'succeeded'/,
  'the home task chip must only appear while a task is active'
);
assert.ok(
  !hml.includes('record-card') &&
  !hml.includes('record-copy') &&
  !hml.includes('voice-chip') &&
  !hml.includes('result-meta') &&
  !hml.includes('result-chip') &&
  !hml.includes('answer-silent') &&
  !hml.includes('chat-mode-note') &&
  !hml.includes('task-card-label'),
  'secondary explanation blocks must stay out of the quiet pages'
);
assert.ok(
  !hml.includes('Codex 模型') && !hml.includes('showCodexModelInfo'),
  'settings must not repeat model metadata already available in service configuration'
);
assert.ok(
  hml.includes('@touchstart="startVoicePress"') &&
  hml.includes('@touchmove="onVoiceTouchMove"') &&
  hml.includes('@touchend="onVoiceTouchEnd"') &&
  hml.includes('@touchcancel="onVoiceTouchCancel"'),
  'voice press, release and slide-end gestures must be wired'
);
assert.ok(!hml.includes('@click="simulateVoiceTurn"'), 'opening the voice page must not start the microphone');
assert.ok(hml.includes('{{voiceCta}}'), 'the voice gesture label must reflect press state');
assert.ok(hml.includes('始终静音'), 'settings must state that the watch is always silent');
assert.ok(hml.includes('不影响睡眠'), 'silent-mode promise is missing');
assert.ok(
  hml.includes("codexStatus !== 'succeeded' && codexStatus !== 'failed' && codexStatus !== 'cancelled'"),
  'terminal Codex tasks must hide the stop action'
);
assert.ok(!hml.includes('<audio'), 'the watch page must not contain an audio element');
assert.ok(!css.includes('radial-gradient'), 'API 8 CSS must not use radial gradients');
assert.ok(!css.includes('box-shadow'), 'API 8 CSS must not use unsupported shadows');
assert.ok(!hml.includes('voice-glow.png'), 'voice lighting must not rely on transparent PNG blending');
assert.ok(hml.includes('voice-ring-halo'), 'voice page must keep a CSS-only circular halo');
assert.ok(css.includes('record-ring-recording'), 'recording state must use a standalone compatible class');
for (const [selector, minimum] of [
  ['.page-title', 30],
  ['.home-wordmark', 30],
  ['.hero-label', 25],
  ['.row-label', 22],
  ['.row-subtitle', 15],
  ['.pill-label', 19],
  ['.hub-title', 19],
  ['.hub-subtitle', 14],
  ['.voice-live-text', 15],
  ['.record-state', 15],
  ['.record-time', 32],
  ['.answer-user-text', 17],
  ['.answer-assistant-text', 17],
  ['.task-stage', 27],
  ['.task-card-text', 15.5],
  ['.result-point-text', 17],
  ['.transcript-text', 16.5],
  ['.message-text', 17],
  ['.chat-input', 17],
  ['.field-hint', 15],
  ['.toast-text', 14]
]) {
  assert.ok(
    pixelProperty(selector, 'font-size') >= minimum,
    `${selector} must stay legible on the 466 px display`
  );
}
for (const [selector, minimum] of [
  ['.hero-action', 104],
  ['.record-start', 58],
  ['.answer-actions', 58],
  ['.result-actions', 58],
  ['.api-save', 56],
  ['.field-save', 58],
  ['.chat-send', 56],
  ['.task-stop', 52]
]) {
  assert.ok(
    pixelProperty(selector, 'height') >= minimum,
    `${selector} must retain a wrist-friendly touch target`
  );
}
const apiSaveRule = css.match(/\.api-save\s*\{([\s\S]*?)\}/)?.[1] || '';
const apiSaveTop = Number(apiSaveRule.match(/top:\s*(\d+)px/)?.[1] || NaN);
const apiSaveHeight = Number(apiSaveRule.match(/height:\s*(\d+)px/)?.[1] || NaN);
assert.ok(apiSaveTop + apiSaveHeight <= 430, 'service configuration action must stay inside the bottom watch arc');
const chatComposerRule = css.match(/\.chat-composer\s*\{([\s\S]*?)\}/)?.[1] || '';
const chatLeft = Number(chatComposerRule.match(/left:\s*(\d+)px/)?.[1] || NaN);
const chatTop = Number(chatComposerRule.match(/top:\s*(\d+)px/)?.[1] || NaN);
const chatHeight = Number(chatComposerRule.match(/height:\s*(\d+)px/)?.[1] || NaN);
assert.ok(chatLeft >= 89 && chatTop + chatHeight <= 416, 'chat composer must stay inside the bottom watch arc');
assert.ok(
  pageSource.includes("voiceMode: 'magpie'") &&
  pageSource.includes("from '../../built-in-config'") &&
  pageSource.includes('requestModel(') &&
  pageSource.includes("'X-Nova-Token'") &&
  pageSource.includes("'/api/codex/voice'") &&
  pageSource.includes("'/api/codex/task'"),
  'built-in model or hidden Codex contract is incomplete'
);
assert.ok(
  /var CODEX_POLL_MS = 1500;/.test(pageSource),
  'Codex task polling must be 1.5 seconds'
);

const source = pageSource
  .replace(/^import .* from '@(?:ohos|system)\.[^']+';\r?$/gm, '')
  .replace(/^import builtInConfig from '\.\.\/\.\.\/built-in-config';\r?$/gm, '')
  .replace('export default {', 'module.exports = {');

let lastHttpRequest = null;
let nextHttpError = null;
let nextHttpResponse = {
  responseCode: 200,
  result: JSON.stringify({ ok: true })
};
const sandbox = {
  pasteboard: {
    createPlainTextData() {
      return {};
    },
    getSystemPasteboard() {
      return {
        setPasteData() {}
      };
    }
  },
  audio: {
    AudioSamplingRate: { SAMPLE_RATE_16000: 16000 },
    AudioChannel: { CHANNEL_1: 1 },
    AudioSampleFormat: { SAMPLE_FORMAT_S16LE: 1 },
    AudioEncodingType: { ENCODING_TYPE_RAW: 0 },
    SourceType: { SOURCE_TYPE_MIC: 0 },
    createAudioCapturer() {
      throw new Error('Audio capture is outside this unit-test scope');
    }
  },
  featureAbility: {
    getContext() {
      return {
        requestPermissionsFromUser() {
          return Promise.resolve({ authResults: [0] });
        }
      };
    }
  },
  http: {
    RequestMethod: { GET: 'GET', POST: 'POST' },
    createHttp() {
      return {
        request(url, options, callback) {
          lastHttpRequest = { url, options };
          callback(nextHttpError, nextHttpResponse);
        },
        destroy() {}
      };
    }
  },
  builtInConfig: {
    baseUrl: 'https://magpie.example.test/v1',
    apiKey: 'sk-test-local-placeholder',
    model: 'group/ai-watch',
    codexBaseUrl: 'http://192.168.1.129:8787',
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
  Date
};

vm.runInNewContext(source, sandbox, { filename: sourcePath });
const component = sandbox.module.exports;

function createPage() {
  const page = Object.assign({}, structuredClone(component.data), component);
  page.audioCapturer = null;
  page.codexPollTimer = null;
  page.recordTicker = null;
  page.recordMaxTimer = null;
  page.voiceTicker = null;
  page.voicePhaseTimer = null;
  page.voiceMaxTimer = null;
  page.toastTimer = null;
  page.menuSwipeTimer = null;
  page.toastText = '';
  page.showToast = function (message) {
    this.toastText = message;
  };
  return page;
}

const tick = (milliseconds = 0) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const page = createPage();
assert.equal(page.threads.length, 2);
assert.equal(page.voiceMode, 'magpie');
assert.equal(page.codexToken, 'test-codex-token');
assert.equal(page.getServiceUrl('/health'), 'http://192.168.1.129:8787/health');

const gesturePage = createPage();
let gestureMicStarts = 0;
let gestureSubmits = 0;
gesturePage.requestMicrophoneAndStart = function () {
  gestureMicStarts++;
  this.voiceCaptureStarting = false;
  this.voiceCaptureActive = true;
  this.voiceState = 'listening';
  this.voiceStatus = '正在聆听 · 松开发送 · 上滑结束';
};
gesturePage.submitVoiceTurn = function () {
  gestureSubmits++;
  this.voiceActive = false;
  this.voiceState = 'thinking';
};
gesturePage.startVoice();
assert.equal(gesturePage.subPage, 'voice');
assert.equal(gesturePage.voiceActive, false, 'opening voice must wait for a press');
assert.equal(gestureMicStarts, 0, 'opening voice must not start the microphone');
assert.match(gesturePage.voiceStatus, /按住说话/);
assert.equal(gesturePage.voiceCta, '按住说话');

let pressPropagationStopped = false;
gesturePage.startVoicePress({
  touches: [{ globalY: 300 }],
  stopPropagation() {
    pressPropagationStopped = true;
  }
});
assert.equal(gestureMicStarts, 1, 'press must start the microphone');
assert.equal(gesturePage.voiceActive, true);
assert.equal(gesturePage.voiceCta, '松开发送');
assert.equal(pressPropagationStopped, true);
gesturePage.onVoiceTouchMove({ touches: [{ globalY: 285 }] });
assert.equal(gesturePage.voiceEndArmed, false, 'small movement must not end voice');
gesturePage.onVoiceTouchMove({ touches: [{ globalY: 260 }] });
assert.equal(gesturePage.voiceEndArmed, true, 'upward slide must arm voice completion');
assert.match(gesturePage.voiceStatus, /松开结束/);
gesturePage.onVoiceTouchEnd({ changedTouches: [{ globalY: 260 }] });
assert.equal(gestureSubmits, 1, 'up-slide release must submit once');

gesturePage.voiceActive = false;
gesturePage.voiceState = 'idle';
gesturePage.startVoicePress({ touches: [{ clientY: 300 }] });
gesturePage.onVoiceTouchEnd({ changedTouches: [{ clientY: 298 }] });
assert.equal(gestureSubmits, 2, 'normal release must also submit');

gesturePage.voiceActive = false;
gesturePage.voiceState = 'idle';
gesturePage.startVoicePress({ touches: [{ globalX: 300, globalY: 300 }] });
gesturePage.onVoiceTouchMove({ touches: [{ globalX: 260, globalY: 300 }] });
assert.equal(gesturePage.voiceActive, false, 'horizontal swipe must cancel capture');
assert.equal(gesturePage.voiceCta, '按住说话');
assert.equal(gesturePage.subPage, '', 'left swipe must leave the voice page');
gesturePage.onVoiceTouchEnd({ changedTouches: [{ globalX: 260, globalY: 300 }] });
assert.equal(gestureSubmits, 2, 'horizontal swipe release must not submit');

gesturePage.voiceActive = false;
gesturePage.voiceState = 'idle';
gesturePage.startVoicePress({ touches: [{ globalY: 300 }] });
gesturePage.onVoiceTouchCancel({ touches: [{ globalY: 300 }] });
assert.equal(gestureSubmits, 2, 'cancelled touch must not submit');
assert.equal(gesturePage.voiceActive, false);
assert.equal(gesturePage.voiceState, 'idle');
assert.equal(gesturePage.voiceCta, '按住说话');

const pcm = new Int16Array([0, 16384, -16384]);
assert.ok(page.computePcmLevel(pcm.buffer) > 20);

const encoderBytes = new Uint8Array(13000);
for (let i = 0; i < encoderBytes.length; i++) {
  encoderBytes[i] = (i * 37 + 11) & 0xff;
}
let encoderYields = 0;
const sandboxSetTimeout = sandbox.setTimeout;
sandbox.setTimeout = function (callback, delay) {
  encoderYields++;
  return sandboxSetTimeout(callback, delay);
};
const encodedPcm = await page.encodePcmBase64(encoderBytes.buffer);
sandbox.setTimeout = sandboxSetTimeout;
assert.equal(encodedPcm, Buffer.from(encoderBytes).toString('base64'));
assert.ok(encoderYields >= 3, 'large PCM encoding must yield between base64 chunks');

nextHttpResponse = {
  responseCode: 200,
  result: JSON.stringify({ transcript: '测试语音' })
};
const transcript = await page.transcribePcm(encoderBytes.buffer);
assert.equal(transcript, '测试语音');
assert.equal(lastHttpRequest.url, 'http://192.168.1.129:8787/api/asr');
assert.equal(lastHttpRequest.options.method, 'POST');
assert.equal(lastHttpRequest.options.header['Content-Type'], 'application/json');
const asrPayload = JSON.parse(lastHttpRequest.options.extraData);
assert.equal(asrPayload.sampleRate, 16000);
assert.equal(
  Buffer.from(asrPayload.pcmBase64, 'base64').toString('hex'),
  Buffer.from(encoderBytes).toString('hex'),
  'ASR must upload the complete PCM payload as base64'
);

nextHttpResponse = {
  responseCode: 200,
  result: JSON.stringify({ ok: true })
};
const fetchResult = await page.networkRequest('http://example.test/health', { method: 'GET' });
assert.equal(fetchResult.responseCode, 200);
assert.equal(page.parseHttpResult(fetchResult.result).ok, true);
assert.equal(lastHttpRequest.url, 'http://example.test/health');
assert.equal(lastHttpRequest.options.method, 'GET');

nextHttpResponse = {
  responseCode: 200,
  result: JSON.stringify({
    choices: [{ message: { role: 'assistant', content: '收到' } }]
  })
};
const modelReply = await page.requestModel([
  { role: 'system', content: 'test' },
  { role: 'user', content: '你好' }
]);
assert.equal(modelReply, '收到');
assert.equal(lastHttpRequest.url, 'https://magpie.example.test/v1/chat/completions');
assert.equal(lastHttpRequest.options.method, 'POST');
assert.equal(lastHttpRequest.options.header.Authorization, 'Bearer sk-test-local-placeholder');
assert.equal(JSON.parse(lastHttpRequest.options.extraData).model, 'group/ai-watch');
assert.equal(JSON.parse(lastHttpRequest.options.extraData).stream, false);

nextHttpResponse = {
  responseCode: 200,
  result: JSON.stringify({ ok: true, taskId: 'accepted-task' })
};
const accepted = await page.networkRequest('http://example.test/api/codex/task', {
  method: 'POST',
  header: { 'X-Nova-Token': 'test-token' },
  extraData: { prompt: 'hi', mode: 'readonly' }
});
assert.equal(accepted.responseCode, 200);
assert.equal(page.parseHttpResult(accepted.result).taskId, 'accepted-task');
assert.equal(lastHttpRequest.options.method, 'POST');
assert.equal(lastHttpRequest.options.header['X-Nova-Token'], 'test-token');
assert.deepEqual(JSON.parse(lastHttpRequest.options.extraData), {
  prompt: 'hi',
  mode: 'readonly'
});

nextHttpResponse = {
  responseCode: 401,
  result: JSON.stringify({ ok: false, error: 'codex auth failed' })
};
await assert.rejects(
  page.networkRequest('http://example.test/api/codex/task', {
    method: 'POST',
    extraData: { prompt: 'unauthorized' }
  }),
  /HTTP 401/
);
nextHttpResponse = {
  responseCode: 200,
  result: JSON.stringify({ ok: true })
};

page.codexToken = '';
await assert.rejects(
  page.submitCodexVoice(new ArrayBuffer(6400), 'voice'),
  /访问令牌/
);

page.codexToken = 'test-token';
assert.equal(page.codexHeaders()['X-Nova-Token'], 'test-token');

let createRequest = null;
page.networkRequest = async function (url, options) {
  createRequest = { url, options };
  return {
    result: JSON.stringify({
      taskId: 'task-voice-1',
      status: 'queued',
      stage: '已排队',
      message: '等待 Codex 执行',
      transcript: '检查当前播放器状态',
      elapsedMs: 250
    })
  };
};
await page.submitCodexVoice(new ArrayBuffer(6400), 'voice');
assert.equal(createRequest.url, 'http://192.168.1.129:8787/api/codex/voice');
assert.equal(createRequest.options.method, 'POST');
assert.equal(createRequest.options.header['X-Nova-Token'], 'test-token');
assert.equal(createRequest.options.header['Content-Type'], 'application/json');
assert.equal(createRequest.options.extraData.sampleRate, 16000);
assert.equal(createRequest.options.extraData.repoId, 'watch');
assert.equal(createRequest.options.extraData.mode, 'readonly');
assert.equal(Buffer.from(createRequest.options.extraData.pcmBase64, 'base64').length, 6400);
assert.equal(page.codexTaskId, 'task-voice-1');
assert.equal(page.codexOrigin, 'voice');
assert.equal(page.subPage, 'task');
assert.ok(page.codexPollTimer, 'task creation must arm asynchronous polling');
assert.equal(page.taskHistory.length, 1);

page.closeSubPage();
assert.equal(page.subPage, '');
assert.equal(page.codexPollTimer, null, 'leaving the task page must stop polling');

page.codexTaskId = 'task-voice-2';
page.codexStatus = 'running';
page.codexOrigin = 'voice';
page.subPage = 'task';
page.networkRequest = async function () {
  return {
    result: JSON.stringify({
      taskId: 'task-voice-2',
      status: 'succeeded',
      stage: '完成',
      message: '任务完成',
      transcript: '检查播放器',
      finalText: '播放器状态正常。\n后台任务仍在继续。\n手表保持静音。',
      speechText: '播放器状态正常，后台任务仍在继续，手表保持静音。',
      elapsedMs: 3200
    })
  };
};
page.pollCodexTask();
await tick();
assert.equal(page.codexStatus, 'succeeded');
assert.equal(page.subPage, 'result');
assert.equal(page.codexPollTimer, null);
assert.ok(page.summaryItems.length >= 2);
assert.ok(page.summaryItems.join(' ').includes('播放器状态正常'));

let cancelRequest = null;
page.codexTaskId = 'task-cancel-1';
page.codexStatus = 'running';
page.subPage = 'task';
page.networkRequest = async function (url, options) {
  cancelRequest = { url, options };
  return {
    result: JSON.stringify({
      taskId: 'task-cancel-1',
      status: 'cancelled',
      stage: '已取消'
    })
  };
};
page.cancelCodexTask();
await tick();
assert.equal(cancelRequest.url, 'http://192.168.1.129:8787/api/codex/task/task-cancel-1/cancel');
assert.equal(cancelRequest.options.method, 'POST');
assert.equal(cancelRequest.options.header['X-Nova-Token'], 'test-token');
assert.ok(page.codexPollTimer, 'cancel must refresh the terminal task state');
page.stopCodexPolling();

let submittedPcm = 0;
page.subPage = '';
page.mainVisible = true;
page.pageIndex = 1;
page.startRecordCapturer = function () {
  this.recordCaptureActive = true;
};
page.transcribePcm = function (buffer) {
  submittedPcm = buffer.byteLength;
  return Promise.resolve('整理本周项目进度');
};
page.requestModel = function () {
  return Promise.resolve('本周完成界面精简\n模型接口已接入\n下一步进行真机验证');
};
page.startRecording();
assert.equal(page.recordRunning, true);
assert.equal(page.recordHasProgress, true);
assert.equal(page.recordStatus, '正在请求麦克风');
page.recordPcmChunks = [new ArrayBuffer(8000)];
page.finishRecording();
await tick();
assert.equal(page.recordRunning, false);
assert.equal(page.recordTimer, '00:00');
assert.equal(submittedPcm, 8000);
assert.equal(page.recordStatus, '摘要已生成');
assert.equal(page.subPage, 'result');
assert.equal(page.recordText, '整理本周项目进度');
assert.match(page.codexFinalText, /模型接口已接入/);
assert.equal(page.summaryItems.length, 3);

page.recordPcmChunks = [new ArrayBuffer(100)];
page.recordHasProgress = true;
page.finishRecording();
assert.equal(page.recordHasProgress, false);
assert.equal(page.recordStatus, '录音太短，请重试');

assert.equal(typeof page.toggleVoiceMode, 'undefined');
assert.equal(typeof page.openApiSettings, 'undefined');
assert.equal(typeof page.openField, 'undefined');
assert.equal(typeof page.saveField, 'undefined');
assert.ok(!hml.includes('openApiSettings'));
assert.ok(!hml.includes('openField('));
assert.ok(!hml.includes('访问令牌'));
assert.ok(!hml.includes('服务配置'));

page.subPage = 'task';
page.codexTaskId = 'task-navigation-1';
page.startCodexPolling();
assert.ok(page.codexPollTimer);
page.openSubPage('chat');
assert.equal(page.subPage, 'chat');
assert.equal(page.codexPollTimer, null, 'opening settings must stop task polling');
page.handleSwipe({ direction: 'left' });
assert.equal(page.subPage, '');
assert.equal(page.mainVisible, true);

page.pageIndex = 2;
page.handleSwipe({ direction: 'left' });
assert.equal(page.pageIndex, 2);
page.handleSwipe({ direction: 'right' });
assert.equal(page.pageIndex, 2);
page.menuSwipeTimer = null;
assert.equal(page.onBackPress(), true, 'the app must not exit from a main-page back gesture');

const savedTaskHistory = page.taskHistory;
page.taskHistory = [{}, {}, {}];
page.pageIndex = 2;
page.mainListAtStart = true;
page.mainListAtEnd = false;
page.mainListAtStartAtTouch = true;
page.mainListAtEndAtTouch = false;
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 2, 'a long history list must scroll before paging');
page.mainListAtEnd = true;
page.mainListAtStart = false;
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 2, 'reaching the list edge during a gesture must not page');
page.onRootTouchStart();
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 3, 'a new gesture from the list edge must page');
page.taskHistory = savedTaskHistory;

page.taskHistory = [];
page.setPage(2);
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 3, 'a short history list must allow upward menu paging');
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 0, 'the short settings list must page without blocking');
page.taskHistory = savedTaskHistory;

assert.ok(
  !pageSource.split('\n').some((line) =>
    /console\.|hilog/.test(line) && /codexToken|apiKey|apiBaseUrl|prompt/.test(line)
  ),
  'sensitive configuration or prompts must not be logged'
);

page.stopCodexPolling();
page.stopRecordingTickerOnly();
page.stopRecordCaptureOnly();

const assertionCount =
  (fs.readFileSync(new URL(import.meta.url)).toString().match(/\bassert\./g) || []).length;

console.log(JSON.stringify({
  success: true,
  assertions: assertionCount,
  threads: page.threads.length,
  voiceMode: page.voiceMode,
  codexPollMs: 1500,
  silent: true,
  api8Source: sourcePath
}, null, 2));
