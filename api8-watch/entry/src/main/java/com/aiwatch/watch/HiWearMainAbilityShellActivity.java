package com.aiwatch.watch;

import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;

import ohos.abilityshell.AbilityShellActivity;

public class HiWearMainAbilityShellActivity extends AbilityShellActivity {

    private static final int HARDWARE_KEY_BUTTON_9 = 196;
    private static final int HARDWARE_KEY_SOS = 265;
    private static final int KEY_DPAD_CENTER = 23;
    private static final long DEBOUNCE_MS = 600L;
    private static final long SYNTHETIC_CENTER_WINDOW_MS = 350L;
    private static final String ACTION_START_VOICE =
        "com.aiwatch.watch.action.START_VOICE";

    private long lastHardwareKeyDownAt = 0L;
    private long lastHardwareKeyDispatchAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event == null ? 0 : event.getKeyCode();
        if (keyCode == HARDWARE_KEY_BUTTON_9 || keyCode == HARDWARE_KEY_SOS) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                long now = System.currentTimeMillis();
                lastHardwareKeyDispatchAt = now;
                if (now - lastHardwareKeyDownAt >= DEBOUNCE_MS) {
                    lastHardwareKeyDownAt = now;
                    Log.i("NOVA_KEY", "shell hardware key down code=" + keyCode);
                    publishStartVoice();
                }
            }
            return true;
        }

        if (keyCode == KEY_DPAD_CENTER &&
            System.currentTimeMillis() - lastHardwareKeyDispatchAt < SYNTHETIC_CENTER_WINDOW_MS) {
            Log.i("NOVA_KEY", "shell suppress synthetic center");
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    private void publishStartVoice() {
        try {
            Class<?> intentClass = Class.forName("ohos.aafwk.content.Intent");
            Object intent = intentClass.getConstructor().newInstance();
            intentClass.getMethod("setAction", String.class).invoke(intent, ACTION_START_VOICE);

            Class<?> dataClass = Class.forName("ohos.event.commonevent.CommonEventData");
            Object eventData = dataClass.getConstructor(intentClass).newInstance(intent);

            Class<?> managerClass = Class.forName("ohos.event.commonevent.CommonEventManager");
            managerClass.getMethod("publishCommonEvent", dataClass)
                .invoke(null, eventData);
            Log.i("NOVA_KEY", "shell common event published");
        } catch (Throwable error) {
            Log.e("NOVA_KEY", "shell publish failed", error);
        }
    }
}
