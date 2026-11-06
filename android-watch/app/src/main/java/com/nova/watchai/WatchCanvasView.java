package com.nova.watchai;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

public final class WatchCanvasView extends View {
    public interface EditorHost {
        void requestEditor(String title, String initial, boolean multiline, Consumer<String> callback);
    }

    private static final int DESIGN_SIZE = 466;
    private static final int HOME = 0;
    private static final int RECORD = 1;
    private static final int TRANSCRIPT = 2;
    private static final int SUMMARY = 3;
    private static final int HISTORY = 4;
    private static final int SETTINGS = 5;
    private static final int API = 6;
    private static final int PAGE_COUNT = 7;

    private static final int BG = Color.rgb(5, 7, 11);
    private static final int SURFACE = Color.rgb(18, 24, 34);
    private static final int SURFACE_2 = Color.rgb(26, 34, 46);
    private static final int BORDER = Color.rgb(43, 56, 74);
    private static final int TEXT = Color.rgb(241, 246, 253);
    private static final int TEXT_2 = Color.rgb(165, 180, 202);
    private static final int MUTED = Color.rgb(120, 139, 163);
    private static final int BLUE = Color.rgb(36, 119, 242);
    private static final int BLUE_SOFT = Color.rgb(64, 139, 243);
    private static final int GREEN = Color.rgb(54, 204, 157);
    private static final int RED = Color.rgb(235, 54, 82);
    private static final int PURPLE = Color.rgb(118, 79, 236);

    private static final String DEMO_TRANSCRIPT =
            "今天的会议主要讨论了项目的进展情况，包括产品设计、开发进度和后续的市场计划。";

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint textPaint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final Typeface tfNormal = Typeface.create("sans-serif", Typeface.NORMAL);
    private final Typeface tfMedium = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    private final Typeface tfBold = Typeface.create("sans-serif", Typeface.BOLD);
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final EditorHost editorHost;

    private float designScale = 1f;
    private float designLeft;
    private float designTop;

    private int pageIndex = HOME;
    private String clockText = "00:00";
    private final DateTimeFormatter clockFormat = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault());

    private boolean toastVisible;
    private String toastText = "";
    private final Runnable toastHide = () -> {
        toastVisible = false;
        invalidate();
    };

    private boolean voiceActive;
    private int voiceState = 1;
    private int voiceSeconds;
    private long voiceStartedAt;
    private boolean micMuted;
    private boolean speakerOn = true;
    private String voiceResponse = "";
    private final Runnable voiceTick = new Runnable() {
        @Override public void run() {
            if (!voiceActive) return;
            voiceSeconds = (int) ((System.currentTimeMillis() - voiceStartedAt) / 1000L);
            invalidate();
            ui.postDelayed(this, 1000L);
        }
    };
    private Runnable phaseRunnable;

    private boolean recordRunning;
    private int recordSeconds;
    private long recordStartedAt;
    private final Runnable recordTick = new Runnable() {
        @Override public void run() {
            if (!recordRunning) return;
            recordSeconds = (int) ((System.currentTimeMillis() - recordStartedAt) / 1000L);
            invalidate();
            ui.postDelayed(this, 500L);
        }
    };

    private String transcript = DEMO_TRANSCRIPT;
    private List<String> summary = new ArrayList<>(Arrays.asList(
            "项目进展整体顺利", "产品设计方案已确认", "开发预计下周完成", "下一步推进市场推广"));

    private String apiUrl = "https://api.openai.com/v1";
    private String apiKey = "";
    private String apiModel = "gpt-4o-mini";
    private boolean apiSaved;
    private String apiState = "尚未保存";

    private final List<ThreadInfo> threads = new ArrayList<>();
    private String currentThreadId = "ai";
    private boolean chatVisible;
    private String chatTitle = "人工智能介绍";
    private final List<Message> chatMessages = new ArrayList<>();
    private float chatScroll;
    private boolean scrollChatToBottom;
    private float touchLastY;
    private float touchDownX;
    private float touchDownY;

    private final Runnable clockTick = new Runnable() {
        @Override public void run() {
            updateClock();
            ui.postDelayed(this, 15000L);
        }
    };

    public WatchCanvasView(Context context, EditorHost editorHost) {
        super(context);
        this.editorHost = editorHost;
        setFocusable(true);
        setClickable(true);
        setBackgroundColor(BG);
        setContentDescription("NOVA Watch AI 首页");
        textPaint.setTypeface(tfNormal);
        initializeThreads();
        openThreadByIdInternal("ai");
        chatVisible = false;
        pageIndex = HOME;
        setContentDescription("NOVA Watch AI 首页");
    }

    private void updateClock() {
        clockText = LocalTime.now().format(clockFormat);
        invalidate();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        ui.removeCallbacks(clockTick);
        ui.post(clockTick);
    }

    @Override
    protected void onDetachedFromWindow() {
        ui.removeCallbacksAndMessages(null);
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        designScale = Math.min(getWidth() / (float) DESIGN_SIZE, getHeight() / (float) DESIGN_SIZE);
        designLeft = (getWidth() - DESIGN_SIZE * designScale) / 2f;
        designTop = (getHeight() - DESIGN_SIZE * designScale) / 2f;

        canvas.save();
        canvas.translate(designLeft, designTop);
        canvas.scale(designScale, designScale);
        canvas.drawColor(BG);
        drawClock(canvas);
        if (chatVisible) {
            drawChat(canvas);
        } else {
            switch (pageIndex) {
                case HOME: drawHome(canvas); break;
                case RECORD: drawRecord(canvas); break;
                case TRANSCRIPT: drawTranscript(canvas); break;
                case SUMMARY: drawSummary(canvas); break;
                case HISTORY: drawHistory(canvas); break;
                case SETTINGS: drawSettings(canvas); break;
                case API: drawApi(canvas); break;
                default: drawHome(canvas); break;
            }
            drawPageDots(canvas);
        }
        if (toastVisible) drawToast(canvas);
        canvas.restore();
    }

    private void drawClock(Canvas c) {
        text(c, "NOVA WATCH AI  " + clockText, 233, 34, 15, Color.rgb(132, 161, 199),
                Paint.Align.CENTER, tfMedium);
    }

    private void drawHome(Canvas c) {
        if (!voiceActive) {
            text(c, "NOVA WATCH AI", 233, 104, 17, Color.rgb(109, 145, 191), Paint.Align.CENTER, tfBold);
            drawOrb(c, 233, 218, 63, 0);
            text(c, "轻触开始对话", 233, 320, 24, TEXT, Paint.Align.CENTER, tfMedium);
            text(c, "上滑切换 · 右滑返回", 233, 350, 14, MUTED, Paint.Align.CENTER, tfNormal);
            return;
        }

        String status = voiceState == 2 ? "正在思考" : voiceState == 3 ? "正在回答" : "正在聆听";
        text(c, status, 233, 108, 23, TEXT, Paint.Align.CENTER, tfMedium);
        drawOrb(c, 233, 178, 48, voiceState);
        drawWaveform(c, 233, 248, 190, 34);
        text(c, timerText(voiceSeconds), 233, 296, 20, Color.rgb(158, 178, 205),
                Paint.Align.CENTER, tfNormal);

        if (voiceState == 3 && !voiceResponse.isEmpty()) {
            fillRound(c, new RectF(82, 315, 384, 377), 15, Color.rgb(21, 27, 37), BORDER);
            drawLayout(c, voiceResponse, 94, 325, 278, 16, TEXT_2, 3, Layout.Alignment.ALIGN_CENTER);
        } else {
            text(c, micMuted ? "麦克风已静音 · 轻触光球重试" : "轻触光球模拟一轮对话",
                    233, 347, 14, micMuted ? Color.rgb(255, 151, 165) : MUTED,
                    Paint.Align.CENTER, tfNormal);
        }

        RectF mic = new RectF(74, 389, 151, 431);
        RectF end = new RectF(177, 386, 289, 434);
        RectF speaker = new RectF(315, 389, 392, 431);
        fillRound(c, mic, 21, micMuted ? Color.rgb(65, 30, 39) : SURFACE_2, Color.TRANSPARENT);
        fillRound(c, end, 24, RED, Color.TRANSPARENT);
        fillRound(c, speaker, 21, speakerOn ? SURFACE_2 : Color.rgb(65, 30, 39), Color.TRANSPARENT);
        text(c, micMuted ? "已静音" : "麦克风", mic.centerX(), mic.centerY() + 5, 14,
                micMuted ? Color.rgb(255, 160, 173) : TEXT_2, Paint.Align.CENTER, tfMedium);
        text(c, "结束", end.centerX(), end.centerY() + 6, 16, Color.WHITE, Paint.Align.CENTER, tfBold);
        text(c, speakerOn ? "扬声器" : "已关闭", speaker.centerX(), speaker.centerY() + 5, 14,
                speakerOn ? TEXT_2 : Color.rgb(255, 160, 173), Paint.Align.CENTER, tfMedium);
    }

    private void drawOrb(Canvas c, float cx, float cy, float radius, int state) {
        long now = System.currentTimeMillis();
        float pulse = state == 1 ? (float) (Math.sin(now / 360.0) * 3.0) : 0f;
        paint.setShader(null);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(state == 2 ? 28 : 42, 46, 133, 255));
        c.drawCircle(cx, cy, radius + 14 + pulse, paint);

        paint.setShader(new LinearGradient(cx - radius, cy - radius, cx + radius, cy + radius,
                new int[]{Color.WHITE, Color.rgb(185, 220, 255), Color.rgb(72, 151, 255), Color.rgb(7, 63, 203)},
                new float[]{0f, .28f, .64f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, radius + pulse, paint);
        paint.setShader(null);

        paint.setColor(Color.argb(178, 255, 255, 255));
        c.drawOval(new RectF(cx - radius * .42f, cy - radius * .62f,
                cx - radius * .02f, cy - radius * .32f), paint);

        paint.setShader(new LinearGradient(cx - radius, cy, cx + radius, cy + radius,
                Color.rgb(184, 231, 255), Color.rgb(11, 70, 194), Shader.TileMode.CLAMP));
        c.drawOval(new RectF(cx - radius * .85f, cy + radius * .12f,
                cx + radius * .92f, cy + radius * .92f), paint);
        paint.setShader(null);

        if (state == 2) {
            for (int i = 0; i < 3; i++) {
                paint.setColor(Color.argb(210, 255, 255, 255));
                c.drawCircle(cx - 14 + i * 14, cy, 3.2f, paint);
            }
        }
    }

    private void drawWaveform(Canvas c, float cx, float y, float width, float height) {
        long now = System.currentTimeMillis();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(6);
        for (int i = 0; i < 9; i++) {
            float phase = (now / 150.0f) + i * .72f;
            float bar = height * (.25f + Math.abs((float) Math.sin(phase)) * .65f);
            float x = cx - width / 2f + i * (width / 8f);
            paint.setColor(i % 2 == 0 ? Color.rgb(103, 207, 255) : Color.rgb(42, 124, 255));
            c.drawLine(x, y - bar / 2f, x, y + bar / 2f, paint);
        }
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawRecord(Canvas c) {
        text(c, "录音", 233, 102, 29, TEXT, Paint.Align.CENTER, tfMedium);
        text(c, "停止后自动生成转写", 233, 132, 15, MUTED, Paint.Align.CENTER, tfNormal);
        float cx = 233, cy = 210;
        paint.setShader(null);
        paint.setColor(Color.argb(recordRunning ? 70 : 30, 255, 64, 95));
        c.drawCircle(cx, cy, recordRunning ? 67 : 59, paint);
        paint.setShader(new LinearGradient(cx - 52, cy - 52, cx + 52, cy + 52,
                new int[]{Color.rgb(255, 158, 172), Color.rgb(255, 61, 91), Color.rgb(200, 20, 51)},
                new float[]{0f, .56f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, 52, paint);
        paint.setShader(null);
        paint.setColor(Color.argb(220, 255, 255, 255));
        if (recordRunning) {
            c.drawRoundRect(new RectF(cx - 12, cy - 12, cx + 12, cy + 12), 5, 5, paint);
        } else {
            c.drawCircle(cx, cy, 19, paint);
        }
        text(c, timerText(recordSeconds), 233, 297, 31, TEXT, Paint.Align.CENTER, tfMedium);
        text(c, recordRunning ? "正在录音 · 轻触停止" : "轻触开始录音", 233, 327, 15,
                recordRunning ? Color.rgb(255, 130, 148) : MUTED, Paint.Align.CENTER, tfNormal);
        if (recordRunning) drawWaveform(c, 233, 358, 150, 28);
    }

    private void drawTranscript(Canvas c) {
        drawHeader(c, "转写", true, "‹", null);
        drawTabs(c, false);
        fillRound(c, new RectF(77, 140, 389, 282), 18, SURFACE, BORDER);
        drawLayout(c, transcript, 91, 154, 284, 17, TEXT, 5, Layout.Alignment.ALIGN_NORMAL);
        drawPillButton(c, new RectF(77, 296, 228, 338), "编辑文本", false);
        drawPillButton(c, new RectF(238, 296, 389, 338), "生成总结", true);
        drawPillButton(c, new RectF(120, 350, 346, 390), "复制转写", false);
    }

    private void drawSummary(Canvas c) {
        drawHeader(c, "总结", true, "‹", null);
        drawTabs(c, true);
        text(c, "录音总结", 233, 170, 23, TEXT, Paint.Align.CENTER, tfMedium);
        fillRound(c, new RectF(77, 185, 389, 300), 18, SURFACE, Color.TRANSPARENT);
        float y = 202;
        for (String item : summary) {
            String line = ellipsize("• " + item, 282, 16);
            text(c, line, 91, y, 16, Color.rgb(226, 234, 244), Paint.Align.LEFT, tfNormal);
            y += 25;
        }
        drawPillButton(c, new RectF(77, 310, 228, 352), "复制摘要", false);
        drawPillButton(c, new RectF(238, 310, 389, 352), "重新录制", true);
    }

    private void drawHistory(Canvas c) {
        drawHeader(c, "对话历史", true, "‹", null);
        int count = threads.size();
        if (count == 0) {
            text(c, "还没有对话", 233, 205, 17, MUTED, Paint.Align.CENTER, tfNormal);
        } else {
            float top = 112f;
            float gap = 8f;
            float total = 200f;
            float rowHeight = Math.min(58f, (total - gap * (count - 1)) / count);
            for (int i = 0; i < count; i++) {
                ThreadInfo t = threads.get(i);
                float y = top + i * (rowHeight + gap);
                drawThreadRow(c, new RectF(77, y, 389, y + rowHeight),
                        t.mark, t.title, t.preview, t.markColor);
            }
        }
        drawPillButton(c, new RectF(128, 316, 338, 360), "新建对话", true);
    }

    private void drawThreadRow(Canvas c, RectF r, String mark, String title, String preview, int markColor) {
        fillRound(c, r, Math.min(18, r.height() / 2f), Color.rgb(20, 26, 35), BORDER);
        float markRadius = Math.min(19, r.height() * .34f);
        float markX = r.left + 12 + markRadius;
        paint.setColor(markColor);
        c.drawCircle(markX, r.centerY(), markRadius, paint);
        text(c, mark, markX, r.centerY() + Math.min(6, markRadius * .35f),
                Math.min(16, markRadius * .86f), Color.WHITE, Paint.Align.CENTER, tfBold);
        float titleY = r.height() >= 46 ? r.top + 24 : r.centerY() + 6;
        text(c, title, r.left + 14 + markRadius * 2, titleY, 16, TEXT, Paint.Align.LEFT, tfMedium);
        if (r.height() >= 46) {
            text(c, ellipsize(preview, 245, 13), r.left + 14 + markRadius * 2, r.top + 43,
                    13, MUTED, Paint.Align.LEFT, tfNormal);
        }
        text(c, "›", r.right - 17, r.centerY() + 7, 26, Color.rgb(108, 124, 146),
                Paint.Align.CENTER, tfNormal);
    }

    private void drawSettings(Canvas c) {
        drawHeader(c, "设置", true, "‹", null);
        RectF row = new RectF(77, 150, 389, 236);
        fillRound(c, row, 18, Color.rgb(20, 26, 35), BORDER);
        paint.setColor(Color.rgb(35, 95, 191));
        c.drawCircle(row.left + 37, row.centerY(), 24, paint);
        text(c, "API", row.left + 37, row.centerY() + 6, 16, Color.WHITE, Paint.Align.CENTER, tfBold);
        text(c, "API 设置", row.left + 74, row.top + 34, 19, TEXT, Paint.Align.LEFT, tfMedium);
        text(c, "地址 · 密钥 · 模型", row.left + 74, row.top + 57, 14, MUTED,
                Paint.Align.LEFT, tfNormal);
        text(c, "›", row.right - 22, row.centerY() + 8, 29, Color.rgb(108, 124, 146),
                Paint.Align.CENTER, tfNormal);
        text(c, "仅用于当前会话 · 不发起网络请求", 233, 266, 14, MUTED,
                Paint.Align.CENTER, tfNormal);
    }

    private void drawApi(Canvas c) {
        drawHeader(c, "API 设置", true, "‹", null);
        fillRound(c, new RectF(144, 103, 322, 132), 15,
                apiSaved ? Color.rgb(20, 49, 40) : SURFACE_2, Color.TRANSPARENT);
        text(c, apiState, 233, 123, 13, apiSaved ? GREEN : Color.rgb(143, 160, 183),
                Paint.Align.CENTER, tfMedium);
        drawField(c, "API 地址", apiUrl, 145);
        drawField(c, "API Key", apiKey.isEmpty() ? "未填写" : "••••••••", 213);
        drawField(c, "模型名称", apiModel, 281);
        drawPillButton(c, new RectF(104, 338, 362, 380), "保存并检查格式", true);
        drawPillButton(c, new RectF(104, 386, 362, 424), "恢复默认", false);
    }

    private void drawField(Canvas c, String label, String value, float y) {
        text(c, label, 80, y, 13, TEXT_2, Paint.Align.LEFT, tfNormal);
        fillRound(c, new RectF(78, y + 7, 388, y + 43), 12, Color.rgb(13, 18, 26), BORDER);
        text(c, ellipsize(value, 286, 15), 90, y + 32, 15, TEXT, Paint.Align.LEFT, tfNormal);
    }

    private void drawChat(Canvas c) {
        drawHeader(c, ellipsize(chatTitle, 190, 20), true, "‹", "清空");
        RectF list = new RectF(88, 108, 378, 348);
        c.save();
        c.clipRect(list);
        if (chatMessages.isEmpty()) {
            text(c, "开始一段新对话", 233, 230, 17, MUTED, Paint.Align.CENTER, tfNormal);
        } else {
            List<MessageLayout> layouts = buildMessageLayouts();
            float total = 0;
            for (MessageLayout ml : layouts) total += ml.height + 8;
            float maxScroll = Math.max(0, total - (list.height() - 12));
            if (scrollChatToBottom) {
                chatScroll = maxScroll;
                scrollChatToBottom = false;
            }
            chatScroll = Math.max(0, Math.min(chatScroll, maxScroll));
            float y = list.top + 6 - chatScroll;
            for (MessageLayout ml : layouts) {
                float x = ml.user ? list.right - ml.width : list.left;
                fillRound(c, new RectF(x, y, x + ml.width, y + ml.height), 15,
                        ml.user ? Color.rgb(38, 49, 64) : SURFACE, ml.user ? Color.TRANSPARENT : BORDER);
                c.save();
                c.translate(x + 10, y + 8);
                ml.layout.draw(c);
                c.restore();
                y += ml.height + 8;
            }
        }
        c.restore();

        fillRound(c, new RectF(77, 363, 312, 407), 22, Color.rgb(16, 22, 31), BORDER);
        text(c, "输入消息", 92, 392, 15, MUTED, Paint.Align.LEFT, tfNormal);
        paint.setColor(BLUE);
        c.drawCircle(359, 385, 23, paint);
        Path send = new Path();
        send.moveTo(350, 385);
        send.lineTo(368, 385);
        send.lineTo(359, 376);
        send.lineTo(359, 394);
        send.close();
        paint.setColor(Color.WHITE);
        c.drawPath(send, paint);
    }

    private List<MessageLayout> buildMessageLayouts() {
        List<MessageLayout> result = new ArrayList<>();
        for (Message m : chatMessages) {
            textPaint.setTypeface(tfNormal);
            textPaint.setTextSize(16);
            float measured = textPaint.measureText(m.text);
            float width = Math.max(120, Math.min(270, measured + 22));
            StaticLayout layout = makeLayout(m.text, (int) (width - 20), textPaint, 6, TEXT);
            float h = layout.getHeight() + 16;
            result.add(new MessageLayout(m.user, width, h, layout));
        }
        return result;
    }

    private void drawHeader(Canvas c, String title, boolean back, String backGlyph, String action) {
        if (back) {
            paint.setColor(Color.rgb(23, 29, 40));
            c.drawCircle(76, 78, 21, paint);
            text(c, backGlyph == null ? "‹" : backGlyph, 76, 85, 28, TEXT, Paint.Align.CENTER, tfNormal);
        }
        text(c, title, 233, 86, 21, TEXT, Paint.Align.CENTER, tfMedium);
        if (!TextUtils.isEmpty(action)) {
            fillRound(c, new RectF(337, 60, 408, 96), 18, Color.rgb(23, 29, 40), Color.TRANSPARENT);
            text(c, action, 372, 84, 14, TEXT_2, Paint.Align.CENTER, tfMedium);
        }
    }

    private void drawTabs(Canvas c, boolean summaryActive) {
        fillRound(c, new RectF(80, 101, 386, 135), 17, Color.rgb(18, 23, 32), Color.TRANSPARENT);
        fillRound(c, new RectF(summaryActive ? 233 : 82, 104, summaryActive ? 384 : 232, 132),
                14, BLUE, Color.TRANSPARENT);
        text(c, "转文字", 157, 124, 14, summaryActive ? MUTED : Color.WHITE,
                Paint.Align.CENTER, tfMedium);
        text(c, "总结", 309, 124, 14, summaryActive ? Color.WHITE : MUTED,
                Paint.Align.CENTER, tfMedium);
    }

    private void drawPillButton(Canvas c, RectF r, String label, boolean primary) {
        fillRound(c, r, r.height() / 2f, primary ? BLUE : Color.rgb(28, 36, 48), Color.TRANSPARENT);
        text(c, label, r.centerX(), r.centerY() + 5, 15, primary ? Color.WHITE : Color.rgb(219, 229, 242),
                Paint.Align.CENTER, tfMedium);
    }

    private void drawPageDots(Canvas c) {
        paint.setColor(Color.rgb(58, 72, 91));
        float total = 7 * 9 - 3;
        float x = 233 - total / 2;
        for (int i = 0; i < 7; i++) {
            paint.setColor(i == pageIndex ? BLUE_SOFT : Color.rgb(58, 72, 91));
            c.drawCircle(x + i * 9, 448, i == pageIndex ? 3.2f : 2.1f, paint);
        }
    }

    private void drawToast(Canvas c) {
        float w = Math.min(320, Math.max(160, measure(toastText, 14, tfMedium) + 34));
        RectF r = new RectF(233 - w / 2, 351, 233 + w / 2, 391);
        fillRound(c, r, 20, Color.rgb(28, 36, 49), Color.rgb(51, 69, 94));
        text(c, ellipsize(toastText, (int) w - 22, 14), 233, 375, 14, TEXT,
                Paint.Align.CENTER, tfMedium);
    }

    private void fillRound(Canvas c, RectF r, float radius, int fill, int stroke) {
        paint.setShader(null);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(fill);
        c.drawRoundRect(r, radius, radius, paint);
        if (stroke != Color.TRANSPARENT) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.5f);
            paint.setColor(stroke);
            c.drawRoundRect(r, radius, radius, paint);
            paint.setStyle(Paint.Style.FILL);
        }
    }

    private void text(Canvas c, String value, float x, float y, float size, int color,
                      Paint.Align align, Typeface typeface) {
        paint.setShader(null);
        paint.setStyle(Paint.Style.FILL);
        paint.setTypeface(typeface);
        paint.setTextSize(size);
        paint.setTextAlign(align);
        paint.setColor(color);
        c.drawText(value, x, y, paint);
    }

    private float measure(String value, float size, Typeface typeface) {
        paint.setTypeface(typeface);
        paint.setTextSize(size);
        return paint.measureText(value == null ? "" : value);
    }

    private String ellipsize(String value, int maxWidth, float size) {
        paint.setTypeface(tfNormal);
        paint.setTextSize(size);
        TextUtils.TruncateAt where = TextUtils.TruncateAt.END;
        return TextUtils.ellipsize(value == null ? "" : value, new TextPaint(paint), maxWidth, where).toString();
    }

    private StaticLayout makeLayout(String value, int width, TextPaint p, int maxLines, int color) {
        p.setColor(color);
        p.setTypeface(tfNormal);
        p.setTextSize(16);
        return StaticLayout.Builder.obtain(value == null ? "" : value, 0,
                        (value == null ? "" : value).length(), p, Math.max(40, width))
                .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                .setIncludePad(false)
                .setLineSpacing(0f, 1.12f)
                .setMaxLines(maxLines)
                .setEllipsize(TextUtils.TruncateAt.END)
                .build();
    }

    private float drawLayout(Canvas c, String value, float x, float y, int width, float size,
                             int color, int maxLines, Layout.Alignment alignment) {
        TextPaint p = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(tfNormal);
        p.setTextSize(size);
        p.setColor(color);
        StaticLayout layout = StaticLayout.Builder.obtain(value == null ? "" : value, 0,
                        (value == null ? "" : value).length(), p, Math.max(30, width))
                .setAlignment(alignment)
                .setIncludePad(false)
                .setLineSpacing(0f, 1.15f)
                .setMaxLines(maxLines)
                .setEllipsize(TextUtils.TruncateAt.END)
                .build();
        c.save();
        c.translate(x, y);
        layout.draw(c);
        c.restore();
        return layout.getHeight();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = toDesignX(event.getX());
        float y = toDesignY(event.getY());
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                touchDownX = x;
                touchDownY = y;
                touchLastY = y;
                getParent().requestDisallowInterceptTouchEvent(true);
                return true;
            case MotionEvent.ACTION_MOVE:
                if (chatVisible) {
                    float dy = y - touchLastY;
                    if (Math.abs(dy) > 1f) {
                        chatScroll -= dy;
                        touchLastY = y;
                        invalidate();
                        return true;
                    }
                }
                return true;
            case MotionEvent.ACTION_UP:
                float dx = x - touchDownX;
                float dy = y - touchDownY;
                if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) && dx > 0) {
                    handleBack();
                    performClick();
                    return true;
                }
                if (Math.abs(dy) > 52 && Math.abs(dy) > Math.abs(dx)) {
                    movePage(dy < 0 ? 1 : -1);
                    performClick();
                    return true;
                }
                if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
                    handleTap(x, y);
                    performClick();
                }
                return true;
            default:
                return super.onTouchEvent(event);
        }
    }

    @Override
    public boolean performClick() {
        super.performClick();
        return true;
    }

    private float toDesignX(float x) {
        return (x - designLeft) / designScale;
    }

    private float toDesignY(float y) {
        return (y - designTop) / designScale;
    }

    private void handleTap(float x, float y) {
        if (chatVisible) {
            if (inRect(x, y, 54, 56, 98, 100)) {
                closeChat();
            } else if (inRect(x, y, 337, 60, 408, 96)) {
                clearCurrentChat();
            } else if (inRect(x, y, 77, 363, 312, 407) || distance(x, y, 359, 385) < 34) {
                composeChat();
            }
            invalidate();
            return;
        }
        switch (pageIndex) {
            case HOME:
                if (voiceActive) {
                    if (distance(x, y, 233, 178) <= 78) simulateVoiceTurn();
                    else if (inRect(x, y, 74, 389, 151, 431)) toggleMic();
                    else if (inRect(x, y, 177, 386, 289, 434)) endVoice(true);
                    else if (inRect(x, y, 315, 389, 392, 431)) toggleSpeaker();
                } else if (distance(x, y, 233, 218) <= 94) {
                    startVoice();
                }
                break;
            case RECORD:
                if (distance(x, y, 233, 210) <= 94) toggleRecording();
                break;
            case TRANSCRIPT:
                if (inRect(x, y, 54, 56, 98, 100)) handleBack();
                else if (inRect(x, y, 80, 101, 386, 135)) showSummary();
                else if (inRect(x, y, 77, 296, 228, 338)) editTranscript();
                else if (inRect(x, y, 238, 296, 389, 338)) showSummary();
                else if (inRect(x, y, 120, 350, 346, 390)) copyTranscript();
                break;
            case SUMMARY:
                if (inRect(x, y, 54, 56, 98, 100) || inRect(x, y, 80, 101, 232, 135)) showTranscript();
                else if (inRect(x, y, 77, 310, 228, 352)) copySummary();
                else if (inRect(x, y, 238, 310, 389, 352)) restartRecording();
                break;
            case HISTORY:
                if (inRect(x, y, 54, 56, 98, 100)) {
                    handleBack();
                } else {
                    int threadIndex = threadIndexAt(x, y);
                    if (threadIndex >= 0) {
                        openThreadById(threads.get(threadIndex).id);
                    } else if (inRect(x, y, 128, 316, 338, 360)) {
                        newChat();
                    }
                }
                break;
            case SETTINGS:
                if (inRect(x, y, 54, 56, 98, 100)) handleBack();
                else if (inRect(x, y, 77, 150, 389, 236)) setPage(API);
                break;
            case API:
                if (inRect(x, y, 54, 56, 98, 100)) handleBack();
                else if (inRect(x, y, 78, 152, 388, 188)) editApiUrl();
                else if (inRect(x, y, 78, 220, 388, 256)) editApiKey();
                else if (inRect(x, y, 78, 288, 388, 324)) editApiModel();
                else if (inRect(x, y, 104, 338, 362, 380)) saveApiSettings();
                else if (inRect(x, y, 104, 386, 362, 424)) resetApiSettings();
                break;
            default: break;
        }
        invalidate();
    }

    private boolean inRect(float x, float y, float left, float top, float right, float bottom) {
        return x >= left && x <= right && y >= top && y <= bottom;
    }

    private float distance(float x1, float y1, float x2, float y2) {
        float dx = x1 - x2, dy = y1 - y2;
        return (float) Math.sqrt(dx * dx + dy * dy);
    }

    private int threadIndexAt(float x, float y) {
        if (x < 77 || x > 389 || threads.isEmpty()) return -1;
        int count = threads.size();
        float top = 112f;
        float gap = 8f;
        float rowHeight = Math.min(58f, (200f - gap * (count - 1)) / count);
        for (int i = 0; i < count; i++) {
            float rowTop = top + i * (rowHeight + gap);
            if (y >= rowTop && y <= rowTop + rowHeight) return i;
        }
        return -1;
    }

    public boolean handleBack() {
        if (chatVisible) {
            closeChat();
            return true;
        }
        if (pageIndex > HOME) {
            setPage(pageIndex - 1);
            return true;
        }
        return false;
    }

    private void movePage(int delta) {
        if (chatVisible) return;
        int target = (pageIndex + delta + PAGE_COUNT) % PAGE_COUNT;
        setPage(target);
    }

    private void setPage(int target) {
        if (pageIndex == RECORD && target != RECORD && recordRunning) stopRecordingTimerOnly();
        if (pageIndex == HOME && target != HOME && voiceActive) endVoice(false);
        pageIndex = target;
        setContentDescription("NOVA Watch AI " + pageName(target));
        invalidate();
    }

    private String pageName(int page) {
        switch (page) {
            case RECORD: return "录音";
            case TRANSCRIPT: return "转写";
            case SUMMARY: return "总结";
            case HISTORY: return "对话历史";
            case SETTINGS: return "设置";
            case API: return "API 设置";
            default: return "首页";
        }
    }

    private void startVoice() {
        voiceActive = true;
        voiceState = 1;
        voiceSeconds = 0;
        voiceStartedAt = System.currentTimeMillis();
        micMuted = false;
        speakerOn = true;
        voiceResponse = "";
        ui.removeCallbacks(voiceTick);
        ui.post(voiceTick);
        showToast("语音对话已开始（演示模式）");
    }

    private void simulateVoiceTurn() {
        if (!voiceActive) {
            startVoice();
            return;
        }
        if (micMuted) {
            showToast("请先打开麦克风");
            return;
        }
        if (voiceState == 2) return;
        if (voiceState == 3) {
            voiceState = 1;
            voiceResponse = "";
            invalidate();
            return;
        }
        voiceState = 2;
        clearPhase();
        phaseRunnable = () -> {
            if (!voiceActive) return;
            voiceState = 3;
            voiceResponse = "人工智能让计算机模拟人类智能，可用于医疗、教育、创作和日常办公。";
            invalidate();
            phaseRunnable = () -> {
                if (!voiceActive) return;
                voiceState = 1;
                voiceResponse = "";
                invalidate();
            };
            ui.postDelayed(phaseRunnable, 3000L);
        };
        ui.postDelayed(phaseRunnable, 850L);
        invalidate();
    }

    private void toggleMic() {
        micMuted = !micMuted;
        showToast(micMuted ? "麦克风已静音" : "麦克风已打开");
    }

    private void toggleSpeaker() {
        speakerOn = !speakerOn;
        showToast(speakerOn ? "扬声器已打开" : "扬声器已关闭");
    }

    private void endVoice(boolean showMessage) {
        voiceActive = false;
        voiceState = 1;
        voiceSeconds = 0;
        voiceResponse = "";
        ui.removeCallbacks(voiceTick);
        clearPhase();
        if (showMessage) showToast("语音对话已结束");
        invalidate();
    }

    private void clearPhase() {
        if (phaseRunnable != null) {
            ui.removeCallbacks(phaseRunnable);
            phaseRunnable = null;
        }
    }

    private void toggleRecording() {
        if (recordRunning) stopRecording();
        else startRecording();
    }

    private void startRecording() {
        recordRunning = true;
        recordSeconds = 0;
        recordStartedAt = System.currentTimeMillis();
        ui.removeCallbacks(recordTick);
        ui.post(recordTick);
        showToast("录音已开始（演示模式）");
    }

    private void stopRecording() {
        stopRecordingTimerOnly();
        recordRunning = false;
        transcript = DEMO_TRANSCRIPT;
        summary = summarize(transcript);
        pageIndex = TRANSCRIPT;
        setContentDescription("NOVA Watch AI 转写");
        showToast("录音结束，转写完成");
    }

    private void stopRecordingTimerOnly() {
        recordRunning = false;
        ui.removeCallbacks(recordTick);
    }

    private void editTranscript() {
        editorHost.requestEditor("编辑转写", transcript, true, value -> {
            transcript = value.trim();
            summary = summarize(transcript);
            showToast("转写文本已保存");
        });
    }

    private List<String> summarize(String source) {
        source = source == null ? "" : source.trim();
        if (source.isEmpty()) {
            return new ArrayList<>(Arrays.asList("没有可总结的内容", "请先录制并转写一段语音"));
        }
        if (source.contains("后续的市场计划") && source.contains("产品设计")) {
            return new ArrayList<>(Arrays.asList(
                    "项目进展整体顺利", "产品设计方案已确认", "开发预计下周完成", "下一步推进市场推广"));
        }
        String[] parts = source.split("[，。；;、.!！?？\\n]+");
        List<String> result = new ArrayList<>();
        for (String part : parts) {
            if (!part.trim().isEmpty() && result.size() < 4) result.add(part.trim());
        }
        if (result.isEmpty()) result.add("已完成录音转写");
        return result;
    }

    private void copyTranscript() {
        copy(transcript, "转写已复制");
    }

    private void copySummary() {
        copy(TextUtils.join("\n", summary), "摘要已复制");
    }

    private void copy(String text, String message) {
        ClipboardManager manager = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (manager != null) manager.setPrimaryClip(ClipData.newPlainText("NOVA Watch AI", text));
        showToast(message);
    }

    private void showTranscript() {
        pageIndex = TRANSCRIPT;
        setContentDescription("NOVA Watch AI 转写");
        invalidate();
    }

    private void showSummary() {
        pageIndex = SUMMARY;
        setContentDescription("NOVA Watch AI 总结");
        invalidate();
    }

    private void restartRecording() {
        stopRecordingTimerOnly();
        recordSeconds = 0;
        pageIndex = RECORD;
        setContentDescription("NOVA Watch AI 录音");
        invalidate();
    }

    private void initializeThreads() {
        threads.clear();
        threads.add(new ThreadInfo("ai", "人工智能介绍", "AI 在医疗、教育与办公中的应用",
                "AI", Color.rgb(38, 120, 239),
                new Message(false, "帮我介绍一下人工智能"),
                new Message(true, "人工智能是让计算机模拟人类智能的技术，广泛应用于医疗、教育、创作与办公。")));
        threads.add(new ThreadInfo("fitness", "健身计划制定", "每周训练与恢复安排",
                "健", Color.rgb(18, 169, 126),
                new Message(false, "帮我制定一个健身计划"),
                new Message(true, "可以从每周 3 次力量训练和 2 次轻有氧开始，并安排热身与恢复。")));
        threads.add(new ThreadInfo("meeting", "会议内容整理", "项目重点与下一步计划",
                "会", PURPLE,
                new Message(false, "整理一下会议重点"),
                new Message(true, "会议重点包括项目进度、设计方案确认、开发排期和后续市场推广。")));
    }

    private ThreadInfo findThread(String id) {
        for (ThreadInfo thread : threads) {
            if (thread.id.equals(id)) return thread;
        }
        return null;
    }

    private void openThreadByIdInternal(String id) {
        ThreadInfo thread = findThread(id);
        if (thread == null) return;
        currentThreadId = thread.id;
        chatTitle = thread.title;
        chatMessages.clear();
        chatMessages.addAll(copyMessages(thread.messages));
        chatScroll = Float.MAX_VALUE;
        scrollChatToBottom = true;
    }

    private void openThreadById(String id) {
        openThreadByIdInternal(id);
        chatVisible = true;
        setContentDescription("NOVA Watch AI 聊天");
        invalidate();
    }

    private void openThreadAi() {
        openThreadById("ai");
    }

    private void openThreadFitness() {
        openThreadById("fitness");
    }

    private void openThreadMeeting() {
        openThreadById("meeting");
    }

    private List<Message> copyMessages(List<Message> source) {
        List<Message> copy = new ArrayList<>();
        for (Message message : source) {
            copy.add(new Message(message.user, message.text));
        }
        return copy;
    }

    private void syncCurrentThread() {
        ThreadInfo thread = findThread(currentThreadId);
        if (thread == null) return;
        thread.title = chatTitle;
        thread.messages = copyMessages(chatMessages);
        if (chatMessages.isEmpty()) {
            thread.preview = "空对话";
        } else {
            String last = chatMessages.get(chatMessages.size() - 1).text;
            thread.preview = ellipsize(last, 240, 13);
        }
    }

    private void setMessages(Message... messages) {
        chatMessages.clear();
        chatMessages.addAll(Arrays.asList(messages));
        chatScroll = Float.MAX_VALUE;
        scrollChatToBottom = true;
    }

    private void newChat() {
        if (threads.size() >= 5) {
            threads.remove(0);
        }
        String id = "thread-" + System.currentTimeMillis();
        ThreadInfo thread = new ThreadInfo(id, "新对话", "空对话",
                "新", Color.rgb(38, 120, 239));
        threads.add(thread);
        currentThreadId = id;
        chatTitle = "新对话";
        chatMessages.clear();
        chatScroll = 0;
        scrollChatToBottom = false;
        chatVisible = true;
        setContentDescription("NOVA Watch AI 新对话");
        invalidate();
    }

    private void closeChat() {
        syncCurrentThread();
        chatVisible = false;
        pageIndex = HISTORY;
        setContentDescription("NOVA Watch AI 对话历史");
        invalidate();
    }

    private void clearCurrentChat() {
        chatMessages.clear();
        chatScroll = 0;
        scrollChatToBottom = false;
        syncCurrentThread();
        showToast("当前对话已清空");
    }

    private void composeChat() {
        editorHost.requestEditor("发送消息", "", false, value -> {
            String message = value == null ? "" : value.trim();
            if (message.isEmpty()) {
                showToast("请输入消息");
                return;
            }
            sendChat(message);
        });
    }

    private void sendChat(String value) {
        if (chatMessages.isEmpty()) chatTitle = ellipsize(value, 190, 17);
        chatMessages.add(new Message(false, value));
        chatMessages.add(new Message(true, demoReply(value)));
        scrollChatToBottom = true;
        syncCurrentThread();
        showToast("演示回复已生成");
    }

    private String demoReply(String value) {
        if (value.contains("健身") || value.contains("训练")) {
            return "建议从每周 3 次力量训练和 2 次轻有氧开始，注意热身和恢复。";
        }
        if (value.contains("会议") || value.contains("项目")) {
            return "可以按项目进展、已确认事项、待办任务和下一步安排整理会议重点。";
        }
        if (value.toLowerCase(Locale.ROOT).contains("ai") || value.contains("人工智能")) {
            return "人工智能通过机器学习理解语言和数据，可辅助医疗、教育、创作与办公。";
        }
        return "我会先整理核心信息，再给出清晰、可执行的建议。";
    }

    private void editApiUrl() {
        editorHost.requestEditor("API 地址", apiUrl, false, value -> {
            apiUrl = value.trim();
            apiSaved = false;
            apiState = "尚未保存";
            invalidate();
        });
    }

    private void editApiKey() {
        editorHost.requestEditor("API Key", apiKey, false, value -> {
            apiKey = value.trim();
            apiSaved = false;
            apiState = "尚未保存";
            invalidate();
        });
    }

    private void editApiModel() {
        editorHost.requestEditor("模型名称", apiModel, false, value -> {
            apiModel = value.trim();
            apiSaved = false;
            apiState = "尚未保存";
            invalidate();
        });
    }

    private void saveApiSettings() {
        String url = apiUrl.trim();
        String model = apiModel.trim();
        if (!url.matches("(?i)^https?://\\S+$") || model.isEmpty()) {
            apiSaved = false;
            apiState = "格式错误";
            showToast("请检查 API 地址和模型名称");
            return;
        }
        apiUrl = url;
        apiModel = model;
        apiSaved = true;
        apiState = "已保存到当前会话";
        showToast("API 配置格式正确");
    }

    private void resetApiSettings() {
        apiUrl = "https://api.openai.com/v1";
        apiKey = "";
        apiModel = "gpt-4o-mini";
        apiSaved = false;
        apiState = "尚未保存";
        showToast("已恢复默认配置");
    }

    private void showToast(String message) {
        toastText = message;
        toastVisible = true;
        ui.removeCallbacks(toastHide);
        ui.postDelayed(toastHide, 1800L);
        invalidate();
    }

    private String timerText(int seconds) {
        return String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }

    @Override
    public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(info);
        info.setClassName("android.widget.FrameLayout");
        info.setContentDescription(getContentDescription());
        info.setClickable(true);
    }

    private static final class ThreadInfo {
        final String id;
        String title;
        String preview;
        final String mark;
        final int markColor;
        List<Message> messages;

        ThreadInfo(String id, String title, String preview, String mark, int markColor,
                   Message... messages) {
            this.id = id;
            this.title = title;
            this.preview = preview;
            this.mark = mark;
            this.markColor = markColor;
            this.messages = new ArrayList<>(Arrays.asList(messages));
        }
    }

    private static final class Message {
        final boolean user;
        final String text;
        Message(boolean user, String text) {
            this.user = user;
            this.text = text;
        }
    }

    private static final class MessageLayout {
        final boolean user;
        final float width;
        final float height;
        final StaticLayout layout;
        MessageLayout(boolean user, float width, float height, StaticLayout layout) {
            this.user = user;
            this.width = width;
            this.height = height;
            this.layout = layout;
        }
    }
}
