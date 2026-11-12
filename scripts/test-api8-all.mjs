import { spawnSync } from 'node:child_process';

const suites = [
  'scripts/test-api8-threads.mjs',
  'scripts/test-api8-round.mjs'
];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
