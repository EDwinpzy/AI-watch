package com.aiwatch.watch;

import ohos.aafwk.content.Intent;
import ohos.aafwk.content.IntentParams;
import ohos.ace.ability.AceAbility;
import ohos.event.commonevent.CommonEventData;
import ohos.event.commonevent.CommonEventManager;
import ohos.global.configuration.Configuration;
import ohos.multimodalinput.event.KeyEvent;
import ohos.rpc.RemoteException;
import ohos.utils.PacMap;

public class HiWearMainAbility extends AceAbility {

    private static final int HARDWARE_KEY_F26 = 196;
    private static final long HARDWARE_KEY_DEBOUNCE_MS = 600L;
    private static final String ACTION_START_VOICE =
        "com.aiwatch.watch.action.START_VOICE";

    private long lastHardwareKeyDownAt = 0L;

    @Override
    public void onStart(Intent intent) {
        setInstanceName("HiWearMainAbility");
        super.onStart(intent);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        int eventKeyCode = event == null ? keyCode : event.getKeyCode();
        if (keyCode == HARDWARE_KEY_F26 || eventKeyCode == HARDWARE_KEY_F26) {
            long now = System.currentTimeMillis();
            if (now - lastHardwareKeyDownAt >= HARDWARE_KEY_DEBOUNCE_MS) {
                lastHardwareKeyDownAt = now;
                System.out.println("NOVA_KEY native down " + eventKeyCode);
                publishStartVoice();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        int eventKeyCode = event == null ? keyCode : event.getKeyCode();
        if (keyCode == HARDWARE_KEY_F26 || eventKeyCode == HARDWARE_KEY_F26) {
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    private void publishStartVoice() {
        Intent eventIntent = new Intent();
        eventIntent.setAction(ACTION_START_VOICE);
        eventIntent.setParam("source", "hardware-key");
        try {
            CommonEventManager.publishCommonEvent(new CommonEventData(eventIntent));
        } catch (RemoteException error) {
            System.out.println("NOVA_KEY publish failed " + error.getMessage());
        }
    }

    @Override
    public void onStop() {
        super.onStop();
    }

    @Override
    public void onForeground(Intent intent) {
        super.onForeground(intent);
    }

    @Override
    public void onBackground() {
        super.onBackground();
    }

    @Override
    public boolean onStartContinuation() {
        return super.onStartContinuation();
    }

    @Override
    public boolean onSaveData(IntentParams saveData) {
        return super.onSaveData(saveData);
    }

    @Override
    public void onCompleteContinuation(int code) {
        super.onCompleteContinuation(code);
    }

    @Override
    public boolean onRestoreData(IntentParams restoreData) {
        return super.onRestoreData(restoreData);
    }

    @Override
    public void onRemoteTerminated() {
        super.onRemoteTerminated();
    }

    @Override
    public void onSaveAbilityState(PacMap outState) {
        super.onSaveAbilityState(outState);
    }

    @Override
    public void onRestoreAbilityState(PacMap outState) {
        super.onRestoreAbilityState(outState);
    }

    @Override
    public void onInactive() {
        super.onInactive();
    }

    @Override
    public void onActive() {
        super.onActive();
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
    }

    @Override
    public void onMemoryLevel(int level) {
        super.onMemoryLevel(level);
    }
}
