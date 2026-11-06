import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const sourcePath = 'entry/src/main/ets/core/WatchCore.ets';
const source = fs.readFileSync(sourcePath, 'utf8');
const javascript = stripTypeScriptTypes(source, { mode: 'transform' });
const dataUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
const core = await import(dataUrl);

assert.equal(core.formatDuration(0), '00:00');
assert.equal(core.formatDuration(61), '01:01');
assert.equal(core.formatDuration(3599), '59:59');

assert.deepEqual(
  core.summarizeRecord(
    '今天的会议主要讨论了项目的进展情况，包括产品设计、开发进度和后续的市场计划。'
  ),
  [
    '项目进展整体顺利',
    '产品设计方案已确认',
    '开发预计下周完成',
    '下一步推进市场推广'
  ]
);
assert.deepEqual(
  core.summarizeRecord('完成设计，开始开发。检查风险'),
  ['完成设计', '开始开发', '检查风险']
);
assert.deepEqual(
  core.summarizeRecord('   '),
  ['没有可总结的内容', '请先录制并转写一段语音']
);

assert.match(core.buildDemoReply('帮我制定健身计划'), /力量训练/);
assert.match(core.buildDemoReply('整理会议重点'), /讨论重点/);
assert.match(core.buildDemoReply('介绍一下 AI'), /机器学习/);
assert.match(core.buildDemoReply('随便聊聊'), /核心信息/);

assert.equal(core.isValidApiConfig('https://api.example.com/v1', 'model-a'), true);
assert.equal(core.isValidApiConfig('http://localhost:8080/v1', 'model-a'), true);
assert.equal(core.isValidApiConfig('ftp://api.example.com/v1', 'model-a'), false);
assert.equal(core.isValidApiConfig('https://api.example.com/v1', '  '), false);
assert.equal(core.isValidApiConfig('not-a-url', 'model-a'), false);

console.log(JSON.stringify({
  success: true,
  source: sourcePath,
  assertions: 14
}, null, 2));
