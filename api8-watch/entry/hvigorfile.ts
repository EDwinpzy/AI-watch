import { legacyHapTasks } from '@ohos/hvigor-ohos-plugin';

const fs = require('fs');
const path = require('path');

export function watchEntryTasks(module: any) {
  const plugin = legacyHapTasks(module);
  const abilitySource = path.resolve(
    module.getNodeDir(),
    'src/main/java/com/aiwatch/watch/HiWearMainAbility.java'
  );
  const shellSource = path.resolve(
    module.getNodeDir(),
    'src/main/java/com/aiwatch/watch/HiWearMainAbilityShellActivity.java'
  );

  if (!fs.existsSync(abilitySource) || !fs.existsSync(shellSource)) {
    throw new Error('Missing hardware-key Java source files.');
  }

  const prepare = module.task(() => {
    const buildRoot = path.resolve(module.getNodeDir(), 'build');
    let copied = 0;

    if (fs.existsSync(buildRoot)) {
      fs.readdirSync(buildRoot).forEach((product) => {
        const javaTargets = path.resolve(buildRoot, product, 'intermediates', 'java');
        if (!fs.existsSync(javaTargets)) {
          return;
        }
        fs.readdirSync(javaTargets).forEach((target) => {
          const destination = path.resolve(
            javaTargets,
            target,
            'com/aiwatch/watch/HiWearMainAbility.java'
          );
          if (fs.existsSync(destination)) {
            fs.copyFileSync(abilitySource, destination);
            copied += 1;
          }
        });
      });

      fs.readdirSync(buildRoot).forEach((product) => {
        const shellTargets = path.resolve(buildRoot, product, 'intermediates', 'shell');
        if (!fs.existsSync(shellTargets)) {
          return;
        }
        fs.readdirSync(shellTargets).forEach((target) => {
          const destination = path.resolve(
            shellTargets,
            target,
            'src/main/java/com/aiwatch/watch/HiWearMainAbilityShellActivity.java'
          );
          if (fs.existsSync(destination)) {
            fs.copyFileSync(shellSource, destination);
            copied += 1;
          }
        });
      });
    }

    if (copied === 0) {
      throw new Error('Generated HiWearMainAbility.java was not found.');
    }
  }, 'PrepareHardwareKeyAbility');

  const tasks = module.getAllTasks();
  const generateTasks = tasks.filter((task) =>
    task.getName().endsWith('@GenerateShellJavaFiles'));
  const compileTasks = tasks.filter((task) =>
    task.getName().endsWith('@CompileShellJavaWithJavac'));
  if (generateTasks.length === 0 || compileTasks.length === 0) {
    throw new Error('Legacy Java build tasks were not registered.');
  }
  generateTasks.forEach((task) => prepare.dependsOn(task));
  compileTasks.forEach((task) => task.dependsOn(prepare));

  return plugin;
}
