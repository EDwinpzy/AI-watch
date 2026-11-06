import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js';
const hmlPath = 'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.hml';
// The Node VM has no HarmonyOS modules; adapt only the known platform imports.
const pageSource = fs.readFileSync(sourcePath, 'utf8');
for (const specifier of [
  '@ohos.pasteboard',
  '@ohos.multimedia.audio',
  '@ohos.ability.featureAbility',
  '@ohos.net.http',
  '@system.fetch',
  '@ohos.multimedia.media'
]) {
  assert.ok(
    pageSource.includes(`from '${specifier}'`),
    `expected HarmonyOS import ${specifier}`
  );
}
const source = pageSource
  .replace(/^import .* from '@(?:ohos|system)\.[^']+';\r?$/gm, '')
  .replace('export default {', 'module.exports = {');
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
          throw new Error('Permission flow is outside this unit-test scope');
        }
      };
    }
  },
  http: {
    RequestMethod: { GET: 'GET', POST: 'POST' },
    createHttp() {
      throw new Error('Network access is outside this unit-test scope');
    }
  },
  systemFetch: {
    fetch(options) {
      options.success({ code: 200, data: JSON.stringify({ ok: true }) });
    }
  },
  media: {
    createAudioPlayer() {
      throw new Error('Audio playback is outside this unit-test scope');
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
const page = Object.assign({}, structuredClone(component.data), component);

assert.equal(page.threads.length, 2);
assert.equal(page.getServiceUrl('/health'), 'http://192.168.1.129:8787/health');
const pcm = new Int16Array([0, 16384, -16384]);
assert.ok(page.computePcmLevel(pcm.buffer) > 20);
assert.equal(page.encodePcmBase64(new Uint8Array([97, 98, 99]).buffer), 'YWJj');
const fetchResult = await page.networkRequest('http://example.test/health', { method: 'GET' });
assert.equal(fetchResult.responseCode, 200);
assert.equal(page.parseHttpResult(fetchResult.result).ok, true);
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

page.newChat();
const newThreadId = page.currentThreadId;
page.chatTitle = 'NewThread';
page.chatMessages.push({ role: 'user', text: 'new-thread-message' });
page.syncCurrentThread();
assert.equal(page.threads.length, 3);

page.clearChat();
assert.equal(page.findThread(newThreadId).messages.length, 0);
assert.equal(page.findThread('ai').messages.at(-1).text, 'persist-api8');

assert.equal(page.chatVisible, true);
assert.equal(page.subPage, 'chat');
page.onBackPress();
assert.equal(page.chatVisible, false);
assert.equal(page.subPage, '');
assert.equal(page.mainVisible, true);
assert.equal(page.pageIndex, 2);

let recordingTickerStopped = false;
page.pageIndex = 1;
page.recordRunning = true;
page.recordSeconds = 9;
page.recordTimer = '00:09';
page.recordHasProgress = true;
page.recordTicker = 1;
const originalStopRecordingTickerOnly = page.stopRecordingTickerOnly;
page.stopRecordingTickerOnly = function () {
  recordingTickerStopped = true;
  originalStopRecordingTickerOnly.call(this);
};
page.setPage(0);

assert.equal(page.pageIndex, 0);
assert.equal(page.recordRunning, false);
assert.equal(page.recordPaused, false);
assert.equal(page.recordHasProgress, false);
assert.equal(page.recordTicker, null);
assert.equal(page.recordStatus, '轻触开始录音');
assert.equal(page.recordControlLabel, '开始录音');
assert.equal(page.recordSeconds, 0);
assert.equal(page.recordTimer, '00:00');
assert.equal(recordingTickerStopped, true);

page.pageIndex = 1;
page.recordRunning = true;
page.recordSeconds = 7;
page.recordTimer = '00:07';
page.onPageChange({ index: 2 });
assert.equal(page.pageIndex, 2);
assert.equal(page.recordRunning, false);
assert.equal(page.recordSeconds, 0);
assert.equal(page.recordTimer, '00:00');

page.pageIndex = 1;
page.startRecording();
assert.equal(page.recordRunning, true);
assert.equal(page.recordHasProgress, true);
assert.equal(page.recordControlLabel, 'Ⅱ 暂停');
page.pauseRecording();
assert.equal(page.recordRunning, false);
assert.equal(page.recordPaused, true);
assert.equal(page.recordControlLabel, '● 继续');
page.resumeRecording();
assert.equal(page.recordRunning, true);
assert.equal(page.recordPaused, false);
page.finishRecording();
assert.equal(page.recordRunning, false);
assert.equal(page.subPage, 'transcript');
assert.equal(page.mainVisible, false);
assert.equal(page.resultTab, 'summary');
page.showTranscript();
assert.equal(page.resultTab, 'original');
page.showSummary();
assert.equal(page.resultTab, 'summary');
page.closeSubPage();
assert.equal(page.pageIndex, 1);
assert.equal(page.subPage, '');
assert.equal(page.mainVisible, true);

page.openApiSettings();
assert.equal(page.subPage, 'api');
page.openField('url');
assert.equal(page.subPage, 'field');
page.fieldValue = 'http://192.168.1.129:8787';
page.saveField();
assert.equal(page.subPage, 'api');
assert.equal(page.apiBaseUrl, 'http://192.168.1.129:8787');
page.openField('key');
page.fieldValue = 'test-key';
page.saveField();
assert.equal(page.apiKey, 'test-key');
page.toggleHaptics();
assert.equal(page.hapticsEnabled, false);

page.openThreadById('ai');
page.networkRequest = function () {
  return Promise.resolve({ result: JSON.stringify({ ok: true, reply: '真实模型回复' }) });
};
page.chatInput = '网络请求测试';
page.sendChat();
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(page.chatMessages.at(-1).text, '真实模型回复');
assert.equal(page.serviceStatus, '已连接');

// Horizontal gestures must never change the main menu or end a recording.
const navigationState = { subPage: page.subPage, mainVisible: page.mainVisible, pageIndex: page.pageIndex };
page.subPage = '';
page.mainVisible = true;
page.pageIndex = 1;
assert.equal(page.onBackPress(), true);
assert.equal(page.pageIndex, 1);
page.handleSwipe({ direction: 'left' });
assert.equal(page.pageIndex, 1);
page.handleSwipe({ direction: 'right' });
assert.equal(page.pageIndex, 1);
page.pageIndex = 3;
page.handleSwipe({ direction: 'left' });
assert.equal(page.pageIndex, 3);
page.handleSwipe({ direction: 'right' });
assert.equal(page.pageIndex, 3);
page.mainListReachedEnd();
page.handleSwipe({ direction: 'up' });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(page.pageIndex, 0);
page.handleSwipe({ direction: 'down' });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(page.pageIndex, 3);
page.pageIndex = 1;
page.recordRunning = true;
page.recordSeconds = 4;
page.handleSwipe({ direction: 'up' });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(page.pageIndex, 2);
assert.equal(page.recordRunning, false);
assert.equal(page.recordSeconds, 0);
page.pageIndex = 2;
page.mainListReachedStart();
page.handleSwipe({ direction: 'up' });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(page.pageIndex, 2, 'active list scrolling must not switch the menu');
assert.equal(page.menuSwipeTimer, null);
page.mainListReachedEnd();
page.handleSwipe({ direction: 'up' });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(page.pageIndex, 3);
Object.assign(page, navigationState);

const hml = fs.readFileSync(hmlPath, 'utf8');
assert.ok(!hml.includes('<swiper'), 'native drag offset must not compete with menu gestures');
assert.match(hml, /pageIndex === 3/);
assert.ok(hml.includes('上下滑动切换菜单'));
assert.match(hml, /for="\{\{threads\}\}"/);
assert.match(hml, /openThread\(\$item\)/);
assert.match(hml, /glass-pill/);
assert.match(hml, /segment-indicator/);
assert.match(hml, /openField\('url'\)/);
assert.ok(!hml.includes('value="‹"'), 'prototype navigation must not render a back button');
const assertionCount = (fs.readFileSync(new URL(import.meta.url)).toString().match(/\bassert\./g) || []).length;

console.log(JSON.stringify({
  success: true,
  assertions: assertionCount,
  threads: page.threads.length,
  activeThread: page.currentThreadId,
  api8Source: sourcePath
}, null, 2));
