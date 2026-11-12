import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
const api8BuildProfilePath = 'api8-watch/build-profile.example.json5';
const api8BuildProfileText = read(api8BuildProfilePath);
const api8BuildProfile = JSON.parse(api8BuildProfileText);
const trackedLocalBuildProfile = execFileSync(
  'git',
  ['ls-files', '--', 'api8-watch/build-profile.json5'],
  { cwd: root, encoding: 'utf8' }
).trim();
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
const roundPageSource = read(
  'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/index.js'
);
const roundHml = read(
  'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/index.hml'
);
const roundCss = read(
  'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/index.css'
);
const gitignore = read('.gitignore');
const api8RootHvigorfile = read('api8-watch/hvigorfile.ts');
const api8EntryHvigorfile = read('api8-watch/entry/hvigorfile.ts');

assert.equal(api8BuildProfile.app.compileSdkVersion, 8, 'API 8 project must compile with SDK 8');
assert.equal(api8BuildProfile.app.compatibleSdkVersion, 8, 'API 8 project must support API 8');
assert.equal(trackedLocalBuildProfile, '', 'local signing build-profile must never be tracked');
assert.deepEqual(api8BuildProfile.app.signingConfigs, [], 'tracked build profile must not contain signing configs');
assert.ok(
  !/storePassword|keyPassword|certpath|storeFile/.test(api8BuildProfileText),
  'tracked build profile template must not contain signing material'
);
assert.deepEqual(api8Config.app.apiVersion, { compatible: 8, target: 8 });
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
assert.ok(api8Permissions.has('ohos.permission.MICROPHONE'), 'MICROPHONE permission is missing');
assert.equal(api8Config.deviceConfig.default.network.cleartextTraffic, true, 'cleartext HTTP must be enabled');
assert.ok(api8PageSource.includes('http.createHttp()'), 'real HTTP client is missing');
assert.ok(!api8PageSource.includes('systemFetch.fetch('), 'legacy system.fetch client must not be used');
assert.ok(api8PageSource.includes('audio.createAudioCapturer(options)'), 'real audio capturer is missing');
assert.ok(api8PageSource.includes('requestPermissionsFromUser('), 'runtime permission request is missing');
assert.ok(
  !api8PageSource.includes("from '@ohos.multimedia.media'") &&
  !/createAudioPlayer|player\.play|startTts|playAudio/.test(api8PageSource),
  'the watch must never contain a playback path'
);
assert.ok(api8Hml.includes('始终静音') && api8Hml.includes('不影响睡眠'), 'silent-mode promise is missing');
assert.ok(
  api8PageSource.includes("voiceMode: 'codex'") &&
  api8PageSource.includes("'/api/codex/voice'") &&
  api8PageSource.includes("'/api/codex/task'") &&
  api8PageSource.includes("'/cancel'") &&
  api8PageSource.includes("'X-Nova-Token'"),
  'Codex async client contract is incomplete'
);
assert.ok(api8Hml.includes('访问令牌') && api8PageSource.includes("codexToken: ''"), 'token configuration is missing');
assert.ok(api8Hml.includes('只读仓库') && api8PageSource.includes("codexRepoId: 'watch'"), 'read-only repo selection is missing');
assert.ok(!/@click="(goBack|closeSubPage|closeChat)"/.test(api8Hml), 'visible navigation buttons are forbidden');
assert.ok(api8Hml.includes('@swipe="handleSwipe"'), 'watch gesture navigation is missing');
assert.ok(
  !api8Css.includes('radial-gradient') &&
  !api8Css.includes('box-shadow') &&
  !/^\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\s*\{/m.test(api8Css),
  'API 8 CSS contains unsupported visual syntax'
);
assert.ok(
  !api8PageSource.split('\n').some((line) =>
    /console\.|hilog/.test(line) && /codexToken|apiKey|apiBaseUrl|prompt/.test(line)
  ),
  'API 8 service settings must not be logged'
);

assert.deepEqual(
  api8Config.module.js[0].pages,
  ['pages/index/index', 'pages/round/index'],
  'both watch interfaces must be registered'
);
assert.ok(
  api8PageSource.includes("from '@ohos.router'") &&
  api8PageSource.includes("router.push({ url: 'pages/round/index' })"),
  'classic interface must open the round interface'
);
assert.ok(
  api8Hml.includes('@click="openRoundInterface"') &&
  api8Hml.includes('Apple Watch 圆环'),
  'classic settings must expose the interface switch'
);
assert.ok(
  roundPageSource.includes("from '@ohos.router'") &&
  roundPageSource.includes('router.back()') &&
  roundPageSource.includes("from './built-in-config'"),
  'round interface navigation or local config import is missing'
);
assert.ok(
  roundHml.includes('@click="switchToClassicInterface"') &&
  roundHml.includes('点击返回经典界面'),
  'round settings must expose the classic interface switch'
);
assert.ok(
  roundHml.includes('Apple Watch') &&
  roundHml.includes('1.2.2') &&
  roundCss.includes('.activity-ring'),
  'round interface visual identity is incomplete'
);
assert.ok(
  !roundHml.includes('openField(') &&
  !roundHml.includes('API 密钥'),
  'round interface must keep the service connection built in'
);
assert.ok(
  !/\bsk-[A-Za-z0-9]{20,}\b/.test(roundPageSource),
  'built-in credentials must never be tracked in the round page source'
);
assert.ok(
  gitignore.includes(
    'api8-watch/entry/src/main/js/HiWearMainAbility/pages/round/built-in-config.js'
  ) &&
  exists('scripts/prepare-built-in-config.ps1'),
  'local built-in config generation is not protected'
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

const verificationText = fs.readFileSync(new URL(import.meta.url)).toString();
const verificationCount =
  (verificationText.match(/\bassert\./g) || []).length;

console.log(JSON.stringify({
  success: true,
  screens: requiredScreens.length,
  builders: requiredBuilders.length,
  rawfiles: rawfileRefs.length,
  checks: verificationCount
}, null, 2));
