import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) =>
  fs.existsSync(path.join(root, relativePath));

const indexSource = read('entry/src/main/ets/pages/Index.ets');
const coreSource = read('entry/src/main/ets/core/WatchCore.ets');
const moduleJson = JSON.parse(read('entry/src/main/module.json5'));
const appJson = JSON.parse(read('AppScope/app.json5'));
const appStrings = JSON.parse(
  read('AppScope/resources/base/element/string.json')
);

const requiredScreens = [
  'home',
  'chat',
  'recording',
  'transcript',
  'summary',
  'history',
  'settings',
  'apiSettings'
];
const requiredBuilders = [
  'HomePage',
  'ChatPage',
  'RecordingPage',
  'TranscriptPage',
  'SummaryPage',
  'HistoryPage',
  'SettingsPage',
  'ApiSettingsPage'
];

for (const screen of requiredScreens) {
  assert.match(indexSource, new RegExp(`['"]${screen}['"]`), `missing screen ${screen}`);
}
for (const builder of requiredBuilders) {
  assert.ok(
    indexSource.includes(`private ${builder}(`),
    `missing builder ${builder}`
  );
}

const rawfileRefs = [...indexSource.matchAll(/\$rawfile\('([^']+)'\)/g)]
  .map((match) => match[1]);
assert.ok(rawfileRefs.length > 0, 'no rawfile assets are referenced');
for (const rawfile of rawfileRefs) {
  assert.ok(
    exists(path.join('entry/src/main/resources/rawfile', rawfile)),
    `missing rawfile ${rawfile}`
  );
}

assert.equal(moduleJson.module.deviceTypes.includes('wearable'), true);
assert.equal(moduleJson.module.type, 'entry');
assert.equal(appJson.app.bundleName, 'com.aiwatch.watch');
assert.equal(appStrings.string[0].value, 'NOVA Watch AI');
const api8BuildProfile = JSON.parse(read('api8-watch/build-profile.json5'));
const api8Config = JSON.parse(read('api8-watch/entry/src/main/config.json'));
const api8PageSource = read(
  'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js'
);
const api8Hml = read(
  'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.hml'
);
const api8Css = read(
  'api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.css'
);
const api8Strings = JSON.parse(
  read('api8-watch/entry/src/main/resources/base/element/string.json')
);
const api8RootHvigorfile = read('api8-watch/hvigorfile.ts');
const api8EntryHvigorfile = read('api8-watch/entry/hvigorfile.ts');

assert.equal(api8BuildProfile.app.compileSdkVersion, 8, 'API 8 project must compile with SDK 8');
assert.equal(api8BuildProfile.app.compatibleSdkVersion, 8, 'API 8 project must support API 8');
assert.deepEqual(api8Config.app.apiVersion, { compatible: 8, target: 8 });
assert.equal(api8Config.app.version.name, '1.2.0', 'device version must include voice support');
assert.equal(api8Config.app.version.code, 3, 'device version code must be incremented');
assert.deepEqual(api8Config.module.deviceType, ['wearable']);
assert.match(api8RootHvigorfile, /export \{\s*legacyAppTasks\s*\}/);
assert.match(api8EntryHvigorfile, /export \{\s*legacyHapTasks\s*\}/);
assert.ok(exists('api8-watch/entry/package.json'), 'legacy FA module package.json is missing');
assert.ok(
  !/border-radius\s*:\s*[^;]*%/.test(api8Css),
  'API 8 CSS must not use percentage border-radius'
);

const api8Permissions = new Set(
  (api8Config.module.reqPermissions || []).map((item) => item.name)
);
assert.ok(api8Permissions.has('ohos.permission.INTERNET'), 'INTERNET permission is missing');
assert.ok(api8Permissions.has('ohos.permission.MICROPHONE'), 'microphone permission is missing');
assert.ok(
  api8Strings.string.some((item) =>
    item.name === 'microphone_reason' && item.value.includes('语音对话')
  ),
  'microphone permission reason is missing'
);
assert.equal(api8Config.deviceConfig.default.network.cleartextTraffic, false, 'HTTPS-only transport must be enforced');
assert.ok(
  api8PageSource.includes("var BUILT_IN_BASE_URL = 'https://magpie-relay.pengzhiyuan0724.workers.dev/v1';"),
  'built-in relay URL is missing'
);
assert.ok(
  api8PageSource.includes("var BUILT_IN_MODEL = 'group/ai-watch';"),
  'built-in relay model is missing'
);
assert.ok(
  api8PageSource.includes("getServiceUrl('/chat/completions')"),
  'built-in chat completion endpoint is missing'
);
assert.ok(api8PageSource.includes('systemFetch.fetch(fetchOptions)'), 'real system.fetch client is missing');
assert.ok(api8PageSource.includes('http.createHttp()'), 'binary multipart HTTP client is missing');
assert.ok(api8PageSource.includes('audio.createAudioCapturer(options)'), 'microphone capture is missing');
assert.ok(api8PageSource.includes('requestPermissionsFromUser'), 'runtime microphone permission is missing');
assert.ok(api8PageSource.includes('media.createAudioPlayer()'), 'speech playback is missing');
assert.ok(
  api8PageSource.includes("STT_URL = 'https://notetakers.vipresearch.ca/stt/v1/transcribe'"),
  'speech-to-text endpoint is missing'
);
assert.ok(
  api8PageSource.includes("TTS_BASE_URL = 'https://translate.google.com/translate_tts'"),
  'text-to-speech endpoint is missing'
);
assert.ok(api8PageSource.includes('buildWavFromPcm(pcm)'), 'PCM to WAV conversion is missing');
assert.ok(api8PageSource.includes('buildMultipartBody('), 'multipart upload body is missing');
assert.ok(api8PageSource.includes('splitSpeechText(text, TTS_CHUNK_CHARS)'), 'speech chunking is missing');
assert.ok(api8PageSource.includes('max_tokens: 512'), 'chat token budget is missing');
assert.ok(api8PageSource.includes("extractMessageText(choice && choice.message)"), 'OpenAI response parsing is missing');
assert.ok(api8Hml.includes('class="composer-input"'), 'chat text composer is missing');
assert.ok(api8Hml.includes('class="voice-button'), 'chat microphone button is missing');
assert.ok(api8Hml.includes('class="voice-state"'), 'voice processing state is missing');
assert.ok(api8Hml.includes('@click="startVoiceChat"'), 'voice entry is missing');
assert.ok(api8Hml.includes('toggleVoiceOutput'), 'speech playback setting is missing');
assert.ok(api8Hml.includes('class="built-in-card"'), 'built-in service status is missing');
assert.ok(api8Hml.includes('class="hero-complication"'), 'Apple-style circular complication is missing');
assert.ok(!api8Hml.includes('openField('), 'service field editor must be removed');
assert.ok(!api8Hml.includes('API 密钥'), 'API key must not render on the watch');
assert.ok(!api8Hml.includes('当前服务仅支持文本'), 'text-only capability copy must be removed');
assert.ok(!api8Hml.includes('演示录音'), 'fake recording UI must be removed');
assert.ok(!api8PageSource.includes('/api/voice'), 'legacy voice endpoint must be removed');
assert.ok(!api8PageSource.includes('/api/tts'), 'legacy TTS endpoint must be removed');
assert.ok(!api8PageSource.includes('apiBaseUrl'), 'editable service URL must be removed');
assert.ok(
  !api8PageSource.split('\n').some((line) =>
    /console\.|hilog/.test(line) && /BUILT_IN_API_KEY|sk-magpie-key|BUILT_IN_MODEL|BUILT_IN_BASE_URL/.test(line)
  ),
  'built-in service credentials must not be logged'
);

assert.ok(
  indexSource.includes('apiKey: string') &&
  indexSource.includes('type(InputType.Password)'),
  'API key input must remain password-masked'
);
assert.ok(
  indexSource.includes('不会上传密钥或内容'),
  'privacy boundary copy is missing'
);
assert.ok(
  !/@kit\.NetworkKit|fetch\s*\(|http\.request|axios|WebSocket/.test(indexSource),
  'prototype must not issue network requests'
);
assert.ok(
  !/AppStorage|PersistentStorage|preferences|localStorage|sessionStorage/.test(indexSource),
  'prototype data must remain in memory'
);
assert.ok(
  !indexSource.split('\n').some((line) =>
    /hilog|console\./.test(line) && /apiKey|apiBaseUrl|apiModel/.test(line)
  ),
  'API settings must not be logged'
);

const bracketPairs = [
  ['{', '}'],
  ['(', ')'],
  ['[', ']']
];
for (const [open, close] of bracketPairs) {
  const openCount = [...indexSource].filter((char) => char === open).length;
  const closeCount = [...indexSource].filter((char) => char === close).length;
  assert.equal(openCount, closeCount, `unbalanced ${open}${close}`);
}

assert.ok(
  indexSource.includes('swipeNavigate(') &&
  indexSource.includes('PanGesture(') &&
  indexSource.includes('onActionEnd'),
  'watch gesture navigation is missing'
);
assert.ok(
  indexSource.includes('startVoiceSession()') &&
  indexSource.includes('simulateVoiceTurn()') &&
  indexSource.includes('stopRecording()'),
  'core interaction state machine is incomplete'
);
for (const functionName of [
  'formatDuration',
  'summarizeRecord',
  'buildDemoReply',
  'isValidApiConfig'
]) {
  assert.ok(
    coreSource.includes(`function ${functionName}(`),
    `missing core function ${functionName}`
  );
}

const checkCount = (fs.readFileSync(new URL(import.meta.url)).toString().match(/\bassert\./g) || []).length;

console.log(JSON.stringify({
  success: true,
  screens: requiredScreens.length,
  builders: requiredBuilders.length,
  rawfiles: rawfileRefs.length,
  checks: checkCount
}, null, 2));
