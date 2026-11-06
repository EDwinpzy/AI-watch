import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN = 0x0000;
const TAG = 'AIWatch';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility created: %{public}s', want.abilityName ?? '');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(DOMAIN, TAG, 'Failed to load main page: %{public}s', error.message);
      }
    });
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility foreground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility background');
  }
}
