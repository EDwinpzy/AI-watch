package com.nova.watchai;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.function.Consumer;

public final class MainActivity extends Activity {
    private WatchCanvasView watchView;
    private LinearLayout editorPanel;
    private TextView editorTitle;
    private EditText editorInput;
    private Consumer<String> editorCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().setBackgroundDrawableResource(android.R.color.black);
        getWindow().setDecorFitsSystemWindows(false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 7, 11));
        watchView = new WatchCanvasView(this, this::showEditor);
        root.addView(watchView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        editorPanel = buildEditorPanel();
        editorPanel.setVisibility(View.GONE);
        root.addView(editorPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);
        enterImmersiveMode();
    }

    private LinearLayout buildEditorPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(22), dp(28), dp(22), dp(24));
        panel.setBackgroundColor(Color.rgb(5, 7, 11));
        panel.setClickable(true);

        editorTitle = new TextView(this);
        editorTitle.setTextColor(Color.WHITE);
        editorTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f);
        editorTitle.setGravity(Gravity.CENTER);
        panel.addView(editorTitle, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(46)));

        editorInput = new EditText(this);
        editorInput.setTextColor(Color.rgb(238, 244, 252));
        editorInput.setHintTextColor(Color.rgb(118, 133, 153));
        editorInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f);
        editorInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        editorInput.setBackground(rounded(Color.rgb(16, 22, 31), 18, Color.rgb(51, 68, 89)));
        editorInput.setSelectAllOnFocus(false);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        inputParams.topMargin = dp(10);
        inputParams.bottomMargin = dp(14);
        panel.addView(editorInput, inputParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        Button cancel = makeButton("取消", false);
        Button save = makeButton("保存", true);
        LinearLayout.LayoutParams left = new LinearLayout.LayoutParams(0, dp(44), 1f);
        left.setMarginEnd(dp(8));
        LinearLayout.LayoutParams right = new LinearLayout.LayoutParams(0, dp(44), 1f);
        right.setMarginStart(dp(8));
        actions.addView(cancel, left);
        actions.addView(save, right);
        panel.addView(actions, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(44)));

        cancel.setOnClickListener(v -> hideEditor(false));
        save.setOnClickListener(v -> commitEditor());
        editorInput.setOnEditorActionListener((v, actionId, event) -> {
            if (!editorInput.isSingleLine() || actionId != EditorInfo.IME_ACTION_DONE) return false;
            commitEditor();
            return true;
        });
        return panel;
    }

    private Button makeButton(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(219, 229, 242));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f);
        button.setAllCaps(false);
        button.setPadding(0, 0, 0, 0);
        button.setBackground(rounded(
                primary ? Color.rgb(36, 119, 242) : Color.rgb(28, 36, 48), 22, Color.TRANSPARENT));
        return button;
    }

    private GradientDrawable rounded(int fill, int radiusDp, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radiusDp));
        if (stroke != Color.TRANSPARENT) drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private void showEditor(String title, String initial, boolean multiline, Consumer<String> callback) {
        editorCallback = callback;
        editorTitle.setText(title);
        editorInput.setText(initial == null ? "" : initial);
        editorInput.setHint(multiline ? "输入多行文本" : "输入内容");
        editorInput.setSingleLine(!multiline);
        editorInput.setMinLines(multiline ? 4 : 1);
        editorInput.setMaxLines(multiline ? 8 : 1);
        editorInput.setInputType(multiline
                ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                : InputType.TYPE_CLASS_TEXT);
        editorInput.setImeOptions(multiline ? EditorInfo.IME_ACTION_NONE : EditorInfo.IME_ACTION_DONE);
        editorPanel.setVisibility(View.VISIBLE);
        editorInput.requestFocus();
        editorInput.setSelection(editorInput.getText().length());
        editorInput.postDelayed(() -> {
            InputMethodManager imm = getSystemService(InputMethodManager.class);
            if (imm != null) imm.showSoftInput(editorInput, InputMethodManager.SHOW_IMPLICIT);
        }, 120);
    }

    private void commitEditor() {
        if (editorCallback == null) return;
        Consumer<String> callback = editorCallback;
        String text = editorInput.getText().toString();
        hideEditor(false);
        callback.accept(text);
    }

    private void hideEditor(boolean clearCallback) {
        editorPanel.setVisibility(View.GONE);
        InputMethodManager imm = getSystemService(InputMethodManager.class);
        if (imm != null) imm.hideSoftInputFromWindow(editorInput.getWindowToken(), 0);
        if (clearCallback) editorCallback = null;
        watchView.requestFocus();
    }

    @Override
    public void onBackPressed() {
        if (editorPanel.getVisibility() == View.VISIBLE) {
            hideEditor(true);
            return;
        }
        if (watchView != null && watchView.handleBack()) return;
        super.onBackPressed();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) {
            controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
