import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js';
const hmlPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.hml';
const cssPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.css';
const pageSource = fs.readFileSync(sourcePath, 'utf8');
const hml = fs.readFileSync(hmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

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
  !pageSource.includes("from '@ohos.multimedia.media'"),
  'the watch must not import a media playback API'
);
assert.ok(!/createAudioPlayer|startTts|playAudio|player\.play|\.wav\b/.test(pageSource), 'watch audio playback path is forbidden');
assert.ok(!/@click="(goBack|closeSubPage|closeChat)"/.test(hml), 'visible navigation buttons are forbidden');
assert.equal((hml.match(/@swipe=/g) || []).length, 1, 'swipe handling must exist only on the root container');
assert.ok(hml.includes('始终静音'), 'settings must state that the watch is always silent');
assert.ok(hml.includes('不影响睡眠'), 'silent-mode promise is missing');
assert.ok(!hml.includes('<audio'), 'the watch page must not contain an audio element');
assert.ok(!css.includes('radial-gradient'), 'API 8 CSS must not use radial gradients');
assert.ok(!css.includes('box-shadow'), 'API 8 CSS must not use unsupported shadows');
assert.ok(css.includes('record-ring-recording'), 'recording state must use a standalone compatible class');
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
  pageSource.includes("voiceMode: 'codex'") &&
  pageSource.includes("'X-Nova-Token'") &&
  pageSource.includes("'/api/codex/voice'") &&
  pageSource.includes("'/api/codex/task'"),
  'Codex async client contract is incomplete'
);
assert.ok(
  /var CODEX_POLL_MS = 1500;/.test(pageSource),
  'Codex task polling must be 1.5 seconds'
);

const source = pageSource
  .replace(/^import .* from '@(?:ohos|system)\.[^']+';\r?$/gm, '')
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
assert.equal(page.voiceMode, 'codex');
assert.equal(page.codexToken, '');
assert.equal(page.getServiceUrl('/health'), 'http://192.168.1.129:8787/health');

const pcm = new Int16Array([0, 16384, -16384]);
assert.ok(page.computePcmLevel(pcm.buffer) > 20);
assert.equal(page.encodePcmBase64(new Uint8Array([97, 98, 99]).buffer), 'YWJj');

const fetchResult = await page.networkRequest('http://example.test/health', { method: 'GET' });
assert.equal(fetchResult.responseCode, 200);
assert.equal(page.parseHttpResult(fetchResult.result).ok, true);
assert.equal(lastHttpRequest.url, 'http://example.test/health');
assert.equal(lastHttpRequest.options.method, 'GET');

nextHttpResponse = {
  responseCode: 202,
  result: JSON.stringify({ ok: true, taskId: 'accepted-task' })
};
const accepted = await page.networkRequest('http://example.test/api/codex/task', {
  method: 'POST',
  header: { 'X-Nova-Token': 'test-token' },
  extraData: { prompt: 'hi', mode: 'readonly' }
});
assert.equal(accepted.responseCode, 202);
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
assert.equal(createRequest.options.extraData.mode, 'readonly');
assert.equal(createRequest.options.extraData.repoId, 'watch');
assert.equal(createRequest.options.extraData.sampleRate, 16000);
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
let submittedOrigin = '';
page.subPage = '';
page.mainVisible = true;
page.pageIndex = 1;
page.startRecordCapturer = function () {
  this.recordCaptureActive = true;
};
page.submitCodexVoice = function (buffer, origin) {
  submittedPcm = buffer.byteLength;
  submittedOrigin = origin;
  return Promise.resolve({ taskId: 'task-record-1' });
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
assert.equal(submittedOrigin, 'record');
assert.equal(page.recordStatus, '正在转写并创建任务');

page.recordPcmChunks = [new ArrayBuffer(100)];
page.recordHasProgress = true;
page.finishRecording();
assert.equal(page.recordHasProgress, false);
assert.equal(page.recordStatus, '录音太短，请重试');

page.toggleVoiceMode();
assert.equal(page.voiceMode, 'ollama');
page.toggleVoiceMode();
assert.equal(page.voiceMode, 'codex');

page.openField('token');
assert.equal(page.fieldName, 'token');
assert.equal(page.fieldStep, '2 / 4');
page.fieldValue = 'field-token';
page.saveField();
assert.equal(page.codexToken, 'field-token');
assert.match(hml, /if="\{\{fieldName === 'token'\}\}"[\s\S]*type="password"/);

page.subPage = 'task';
page.codexTaskId = 'task-navigation-1';
page.startCodexPolling();
assert.ok(page.codexPollTimer);
page.openSubPage('api');
assert.equal(page.subPage, 'api');
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
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 3, 'a short history list must allow upward menu paging');
page.mainListAtStart = true;
page.mainListAtEnd = false;
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 3, 'the long settings list must scroll before paging');
page.mainListAtEnd = true;
page.handleSwipe({ direction: 'up' });
await tick(260);
assert.equal(page.pageIndex, 0, 'settings must page after reaching the list end');

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
