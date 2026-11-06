package com.nova.clipboardprobe;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private EditText content;
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        layout.setPadding(24, 28, 24, 24);
        layout.setBackgroundColor(Color.BLACK);

        TextView title = new TextView(this);
        title.setText("Android Clipboard Probe");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        layout.addView(title, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        status = new TextView(this);
        status.setTextColor(Color.rgb(120, 210, 255));
        status.setTextSize(15);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 12, 0, 12);
        layout.addView(status, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        content = new EditText(this);
        content.setTextColor(Color.WHITE);
        content.setHintTextColor(Color.GRAY);
        content.setHint("Clipboard content");
        content.setTextSize(14);
        content.setGravity(Gravity.TOP | Gravity.START);
        LinearLayout.LayoutParams contentParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        contentParams.setMargins(0, 4, 0, 12);
        layout.addView(content, contentParams);

        Button paste = new Button(this);
        paste.setText("Paste again");
        paste.setOnClickListener(v -> pasteClipboard());
        layout.addView(paste, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(layout);
        pasteClipboard();
    }

    private void pasteClipboard() {
        ClipboardManager manager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = manager == null ? null : manager.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) {
            status.setText("EMPTY: no Android clipboard item");
            content.setText("");
            return;
        }
        CharSequence text = clip.getItemAt(0).coerceToText(this);
        String value = text == null ? "" : text.toString();
        status.setText(value.isEmpty() ? "EMPTY: clipboard item has no text" : "PASTED " + value.length() + " chars");
        content.setText(value);
    }
}
