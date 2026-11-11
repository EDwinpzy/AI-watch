(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const CAPTURE = params.get("capture") === "1";
  const FREEZE = params.get("freeze") === "1";
  if (CAPTURE) document.body.classList.add("capture-mode");

  const ICONS = {
    signal: "cell-signal-high",
    battery: "battery-high",
    chat: "chat-circle-dots",
    waveform: "waveform",
    mic: "microphone",
    pause: "pause",
    bookmark: "bookmark-simple",
    stop: "stop",
    check: "check-circle",
    copy: "copy",
    arrowRight: "caret-right",
    terminal: "terminal-window",
    history: "clock-counter-clockwise",
    settings: "gear-six",
    sliders: "sliders-horizontal",
    file: "file-text",
    server: "desktop",
    globe: "globe",
    cube: "cube",
    key: "key",
    shield: "shield-check",
    haptics: "brain",
    speakerHigh: "speaker-high",
    sparkle: "sparkle",
    robot: "robot",
    clock: "clock",
    paperPlane: "paper-plane-tilt",
  };

  const SCREENS = [
    { id: "home", label: "首页", parent: null, meta: ["语音入口", "Codex 就绪"] },
    { id: "voice", label: "语音对话", parent: "home", meta: ["正在聆听", "16 kHz"] },
    { id: "answer", label: "语音回答", parent: "home", meta: ["已回答", "语音优先"] },
    { id: "record", label: "录音任务", parent: "home", meta: ["正在录音", "Codex"] },
    { id: "running", label: "任务执行", parent: "home", meta: ["运行中", "异步轮询"] },
    { id: "result", label: "任务结果", parent: "home", meta: ["已完成", "只读模式"] },
    { id: "history", label: "历史任务", parent: "home", meta: ["最近记录", "可继续"] },
    { id: "chat", label: "文字对话", parent: "history", meta: ["对话", "本地服务"] },
    { id: "settings", label: "设置", parent: "home", meta: ["语音后端", "静音"] },
    { id: "service", label: "服务配置", parent: "settings", meta: ["Magpie", "令牌保护"] },
    { id: "field", label: "编辑配置", parent: "service", meta: ["单项编辑", "左滑退出"] },
  ];

  const DEFAULT_TRANSCRIPT =
    "请检查当前仓库的语音任务桥接，先确认前端保留了哪些页面，再说明下一轮需要验证的后端接口。";

  const TASK_FINAL_TEXT =
    "当前前端已收敛为首页、语音、录音任务、任务状态、结果、历史、聊天、设置和本地服务配置。后端新增只读异步桥接，手表通过任务 ID 轮询并在离开页面后继续执行。下一步应验证超过 60 秒的轮询、取消后无残留子进程，以及 Magpie 不可用时的快速失败。";

  const TASK_POINTS = [
    {
      title: "页面范围已收敛",
      text: "移除 VPN、图片生成、推荐提问和模型商清单，只保留现有语音、摘要、历史与服务设置。",
    },
    {
      title: "Codex 任务改为异步",
      text: "录音完成后先创建任务，再由手表按 1.5 秒轮询状态，避开 60 秒 fetch 窗口。",
    },
    {
      title: "安全边界保持只读",
      text: "仓库由服务端白名单固定，任务携带访问令牌，取消和超时只结束本任务进程树。",
    },
  ];

  const HISTORY_SEED = [
    {
      id: "task-1",
      kind: "result",
      icon: "terminal",
      title: "检查语音任务桥接",
      sub: "今天 10:07 · Codex 已完成",
      tag: "只读",
    },
    {
      id: "chat-1",
      kind: "chat",
      icon: "chat",
      title: "整理今天的工作重点",
      sub: "昨天 20:14 · 3 条消息",
      tag: "对话",
    },
    {
      id: "task-2",
      kind: "result",
      icon: "file",
      title: "录音摘要与下一步计划",
      sub: "5 月 18 日 · 2 分 28 秒",
      tag: "摘要",
    },
  ];

  const state = {
    screen: "home",
    toast: "",
    toastTimer: null,
    voiceBackend: "Codex",
    hapticsOn: true,
    connected: true,
    resultTab: "summary",
    provider: {
      url: "http://192.168.1.129:8787",
      repo: "watch",
      model: "translategemma:4b",
      token: "••••••••••••",
      codexModel: "commandcode-plan/deepseek-v4.1-flash",
    },
    chatMessages: [
      { role: "user", text: "帮我把今天的任务排个优先级。" },
      { role: "assistant", text: "先完成影响发布的一项，再集中处理需要沟通的依赖，最后留出 30 分钟复盘。" },
    ],
    chatInput: "",
    record: {
      seconds: 42,
      running: true,
      paused: false,
      marks: 1,
      transcript:
        "我认为接下来可以重点关注用户体验的提升，特别是在语音交互和多模态能力的结合上，可能会带来新的机会……",
    },
    task: {
      status: "idle",
      taskId: "",
      transcript: DEFAULT_TRANSCRIPT,
      startedAt: 0,
      elapsed: 0,
      stage: "已排队",
      message: "等待 Codex 执行",
      finalText: "",
    },
    history: HISTORY_SEED.map((item) => ({ ...item })),
    field: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function icon(name, extra = "") {
    const fileName = ICONS[name] || name;
    return `<i class="icon ${extra}" style="--icon:url('vendor/phosphor/icons/${fileName}.svg')" aria-hidden="true"></i>`;
  }

  function openAiIcon(extra = "") {
    return `<i class="icon ${extra}" style="--icon:url('vendor/simple-icons/openai.svg')" aria-hidden="true"></i>`;
  }

  function pad(value) {
    return value < 10 ? `0${value}` : String(value);
  }

  function timerText(seconds) {
    return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  }

  function modelLabel(model) {
    const id = String(model || "");
    if (id.includes("deepseek")) return "DeepSeek V4.1 Flash";
    return id.split("/").pop() || id;
  }

  function screenMeta(id) {
    return SCREENS.find((item) => item.id === id) || SCREENS[0];
  }

  function statusBar({ home = false } = {}) {
    if (home) {
      return `
        <div class="statusbar is-home">
          <div class="status-clock"><strong>10:09</strong></div>
        </div>`;
    }
    return `
      <div class="statusbar">
        <div class="status-left">${icon("signal")}</div>
        <div class="status-clock"><strong>10:08</strong><span>5月20日 周二</span></div>
        <div class="status-right">${icon("battery")}<span>80%</span></div>
      </div>`;
  }

  function roundToast() {
    return `<div class="round-toast ${state.toast ? "is-visible" : ""}" role="status">${escapeHtml(state.toast)}</div>`;
  }

  function showToast(message) {
    state.toast = message;
    clearTimeout(state.toastTimer);
    const existing = $(".round-toast");
    if (existing) {
      existing.textContent = message;
      existing.classList.add("is-visible");
    } else {
      render();
    }
    state.toastTimer = window.setTimeout(() => {
      state.toast = "";
      const toast = $(".round-toast");
      if (toast) toast.classList.remove("is-visible");
    }, 1800);
  }

  function waveBars(count = 70) {
    return Array.from({ length: count }, (_, index) => {
      const center = Math.abs(index - (count - 1) / 2) / ((count - 1) / 2);
      const height = 8 + Math.round((1 - center) * 46 + Math.abs(Math.sin(index * 1.71)) * 17);
      const delay = `${(index % 9) * 0.06}s`;
      return `<i style="height:${height}px;animation-delay:${delay}"></i>`;
    }).join("");
  }

  function homeScreen() {
    const taskChip =
      state.task.status === "running"
        ? `<button class="soft-chip is-dim home-task" data-nav="running">${icon("terminal")} Codex 执行中 · ${timerText(state.task.elapsed)}</button>`
        : state.task.status === "succeeded"
          ? `<button class="soft-chip is-dim home-task" data-nav="result">${icon("check")} 最近任务已完成</button>`
          : "";
    return `
      <div class="app-screen home-screen">
        ${statusBar({ home: true })}
        <button class="home-orb" data-action="start-voice" aria-label="开始语音对话"><img src="assets/home-orb.png" alt=""></button>
        <div class="home-wordmark">ChatGPT</div>
        ${taskChip}
        <div class="home-actions">
          <button class="hero-action hero-action-primary" data-action="start-voice">
            ${icon("chat")}<span>开始对话</span>
          </button>
          <button class="hero-action hero-action-secondary" data-action="start-codex">
            ${icon("waveform")}<span>录音摘要</span>
          </button>
        </div>
      </div>`;
  }

  function voiceScreen() {
    return `
      <div class="app-screen voice-screen">
        ${statusBar()}
        <div class="voice-chips">
          <span class="soft-chip">${openAiIcon()} ${escapeHtml(state.voiceBackend)} · 只读</span>
        </div>
        <button class="voice-hero" data-action="finish-voice" aria-label="完成本次语音输入">
          <span class="voice-core">${icon("mic")}<span>按住说话</span></span>
        </button>
        <div class="voice-live-label"><i></i>正在聆听</div>
        <div class="voice-hub-actions">
          <button class="voice-hub-row" data-action="start-codex">
            <span class="voice-hub-icon">${icon("file")}</span>
            <span class="row-copy"><strong>录音摘要</strong><small>会议记录 · Codex 任务</small></span>
            ${icon("arrowRight", "row-chevron")}
          </button>
          <button class="voice-hub-row" data-nav="chat">
            <span class="voice-hub-icon is-blue">${icon("chat")}</span>
            <span class="row-copy"><strong>文字对话</strong><small>继续输入 · 本地服务</small></span>
            ${icon("arrowRight", "row-chevron")}
          </button>
        </div>
        <div class="voice-footer-hint"><b>‹</b><span>左滑收起 · 手表全程静音</span></div>
        ${roundToast()}
      </div>`;
  }

  function answerScreen() {
    return `
      <div class="app-screen answer-screen">
        ${statusBar()}
        <div class="screen-title">语音回答</div>
        <div class="scroll-area no-head">
          <div class="answer-bubble user"><small>你</small><p>检查一下当前 Codex 任务的完成情况。</p></div>
          <div class="answer-bubble"><small>ChatGPT</small><p>任务已完成。前端页面已经收敛，后台会在任务注册表中保留结果；现在可以复制回答，或继续追问具体模块。</p></div>
        </div>
        <div class="answer-footer">
          <button class="secondary-pill" data-action="copy-voice">${icon("copy")}复制回答</button>
          <button class="primary-pill" data-action="continue-voice">${icon("chat")}继续追问</button>
        </div>
        ${roundToast()}
      </div>`;
  }

  function recordScreen() {
    return `
      <div class="app-screen record-screen">
        ${statusBar()}
        <div class="screen-title">录音摘要</div>
        <div class="record-visual">
          <div class="record-wave">${waveBars()}</div>
          <div class="record-ring">
            ${icon("waveform")}
            <span class="record-time">${timerText(state.record.seconds)}</span>
            <span class="record-state">${state.record.paused ? "录音已暂停" : "正在录音"}</span>
          </div>
        </div>
        <div class="record-card glass-panel"><p>${escapeHtml(state.record.transcript)}</p></div>
        <div class="record-actions">
          <button class="round-action is-accent" data-action="pause-recording"><i>${icon(state.record.paused ? "mic" : "pause")}</i>${state.record.paused ? "继续" : "暂停"}</button>
          <button class="round-action" data-action="mark-recording"><i>${icon("bookmark")}</i>标记</button>
          <button class="round-action is-danger" data-action="finish-codex"><i>${icon("stop")}</i>结束</button>
        </div>
        <div class="record-hint">结束后自动转写并发送给 Codex · 左滑离开页面</div>
        ${roundToast()}
      </div>`;
  }

  function runningScreen() {
    return `
      <div class="app-screen running-screen">
        ${statusBar()}
        <div class="screen-title">Codex 任务</div>
        <div class="running-orbit"><span class="running-core">${icon("terminal")}</span></div>
        <div class="running-status">
          <strong>${escapeHtml(state.task.stage)}</strong>
          <span>${escapeHtml(state.task.message)} · ${timerText(state.task.elapsed)}</span>
        </div>
        <div class="running-card glass-panel"><p>识别：${escapeHtml(state.task.transcript)}</p></div>
        <button class="danger-pill running-stop" data-action="cancel-task">${icon("stop")}停止任务</button>
        ${roundToast()}
      </div>`;
  }

  function resultScreen() {
    const points = TASK_POINTS.map(
      (point, index) => `
        <section class="result-point">
          <span class="result-number">0${index + 1}</span>
          <strong>${escapeHtml(point.title)}</strong>
          <p>${escapeHtml(point.text)}</p>
        </section>`
    ).join("");
    const body =
      state.resultTab === "summary"
        ? points
        : `<div class="result-transcript">${escapeHtml(TASK_FINAL_TEXT)}</div>`;
    return `
      <div class="app-screen result-screen">
        ${statusBar()}
        <div class="screen-title">任务结果</div>
        <div class="result-tabs" role="tablist" aria-label="结果视图">
          <button class="result-tab ${state.resultTab === "transcript" ? "is-active" : ""}" data-result-tab="transcript" role="tab">转写</button>
          <button class="result-tab ${state.resultTab === "summary" ? "is-active" : ""}" data-result-tab="summary" role="tab">摘要</button>
        </div>
        <div class="result-meta">
          <span class="soft-chip">${icon("check")} Codex 已完成</span>
          <span class="soft-chip is-dim">${openAiIcon()} 只读模式</span>
        </div>
        <div class="scroll-area result-scroll">${body}</div>
        <div class="result-actions">
          <button class="secondary-pill" data-action="copy-result">${icon("copy")}复制</button>
          <button class="primary-pill" data-action="continue-task">${icon("chat")}继续追问</button>
        </div>
        ${roundToast()}
      </div>`;
  }

  function historyScreen() {
    const rows = state.history
      .map(
        (item) => `
          <button class="row-card" data-open-history="${escapeHtml(item.id)}">
            <span class="row-icon">${icon(item.icon)}</span>
            <span class="row-copy"><span class="row-title">${escapeHtml(item.title)}</span><span class="row-sub">${escapeHtml(item.sub)}</span></span>
            <span class="status-tag ${item.kind === "result" ? "is-live" : ""}">${escapeHtml(item.tag)}</span>
            ${icon("arrowRight", "row-chevron")}
          </button>`
      )
      .join("");
    return `
      <div class="app-screen list-screen history-screen">
        ${statusBar()}
        <div class="screen-title">最近任务</div>
        <div class="scroll-area"><div class="list-stack">${rows}</div></div>
        ${roundToast()}
      </div>`;
  }

  function chatScreen() {
    const messages = state.chatMessages
      .map(
        (message) => `
          <div class="message ${message.role === "user" ? "user" : ""}">
            <small>${message.role === "user" ? "你" : "ChatGPT"}</small>
            <p>${escapeHtml(message.text)}</p>
          </div>`
      )
      .join("");
    return `
      <div class="app-screen chat-screen">
        ${statusBar()}
        <div class="screen-title">文字对话</div>
        <div class="scroll-area">${messages || '<div class="empty-state">还没有消息，说一句或打几个字。</div>'}</div>
        <div class="chat-composer">
          <input id="chatInput" class="chat-input" value="${escapeHtml(state.chatInput)}" placeholder="输入消息" aria-label="输入消息">
          <button class="chat-send" data-action="send-chat" aria-label="发送消息">${icon("paperPlane")}</button>
        </div>
        ${roundToast()}
      </div>`;
  }

  function settingsScreen() {
    return `
      <div class="app-screen list-screen settings-screen">
        ${statusBar()}
        <div class="screen-title">设置</div>
        <div class="scroll-area">
          <div class="list-stack">
            <button class="row-card" data-action="cycle-backend">
              <span class="row-icon">${icon("robot")}</span>
              <span class="row-copy"><span class="row-title">语音后端</span><span class="row-sub">${escapeHtml(state.voiceBackend)} · ${state.voiceBackend === "Codex" ? "异步任务" : "即时回答"}</span></span>
              <span class="status-tag is-live">已启用</span>${icon("arrowRight", "row-chevron")}
            </button>
            <button class="row-card" data-nav="service">
              <span class="row-icon">${icon("server")}</span>
              <span class="row-copy"><span class="row-title">AI 服务</span><span class="row-sub">${state.connected ? "已连接 · Magpie" : "未连接"}</span></span>${icon("arrowRight", "row-chevron")}
            </button>
            <button class="row-card" data-action="model-info">
              <span class="row-icon">${icon("cube")}</span>
              <span class="row-copy"><span class="row-title">Codex 模型</span><span class="row-sub">${escapeHtml(modelLabel(state.provider.codexModel))}</span></span>${icon("arrowRight", "row-chevron")}
            </button>
            <div class="row-card static-row" aria-label="手表声音始终静音">
              <span class="row-icon">${icon("speakerHigh")}</span>
              <span class="row-copy"><span class="row-title">手表声音</span><span class="row-sub">始终静音 · 不影响睡眠</span></span>
              <span class="status-tag">固定</span>
            </div>
            <button class="row-card" data-action="toggle-haptics">
              <span class="row-icon">${icon("haptics")}</span>
              <span class="row-copy"><span class="row-title">触感反馈</span><span class="row-sub">${state.hapticsOn ? "开启" : "关闭"}</span></span>
              <span class="mini-toggle ${state.hapticsOn ? "is-on" : ""}" role="switch" aria-checked="${state.hapticsOn}"></span>
            </button>
          </div>
        </div>
        ${roundToast()}
      </div>`;
  }

  function serviceScreen() {
    const rows = [
      ["url", "globe", "API 地址", state.provider.url],
      ["token", "key", "访问令牌", state.provider.token],
      ["repo", "terminal", "只读仓库", state.provider.repo],
      ["model", "cube", "Ollama 模型", state.provider.model],
    ]
      .map(
        ([field, iconName, label, value]) => `
          <button class="row-card config-row" data-field="${field}">
            <span class="row-icon">${icon(iconName)}</span>
            <span class="row-copy"><span class="row-sub">${escapeHtml(label)}</span><span class="row-title">${escapeHtml(value)}</span></span>
            ${icon("arrowRight", "row-chevron")}
          </button>`
      )
      .join("");
    return `
      <div class="app-screen list-screen service-screen">
        ${statusBar()}
        <div class="screen-title">配置详情</div>
        <div class="scroll-area config-scroll">
          <div class="list-stack">
            ${rows}
          </div>
        </div>
        <button class="primary-pill config-save" data-action="save-provider">${icon("shield")}保存配置</button>
        ${roundToast()}
      </div>`;
  }

  function fieldScreen() {
    const field = state.field || { label: "配置", value: "" };
    return `
      <div class="app-screen field-screen">
        <h2>${escapeHtml(field.label)}</h2>
        <p>左滑退出，不保存本次修改</p>
        <input id="fieldInput" class="field-input" value="${escapeHtml(field.value)}" aria-label="${escapeHtml(field.label)}">
        <button class="primary-pill field-save" data-action="save-field">保存</button>
        ${roundToast()}
      </div>`;
  }

  const RENDERERS = {
    home: homeScreen,
    voice: voiceScreen,
    answer: answerScreen,
    record: recordScreen,
    running: runningScreen,
    result: resultScreen,
    history: historyScreen,
    chat: chatScreen,
    settings: settingsScreen,
    service: serviceScreen,
    field: fieldScreen,
  };

  function renderNav() {
    const nav = $("#screenNav");
    nav.innerHTML = SCREENS.map((screen, index) => {
      const active = state.screen === screen.id ? "is-active" : "";
      return `<button class="nav-item ${active}" data-nav="${screen.id}">
        <span class="nav-index">${pad(index + 1)}</span>
        <span class="nav-label">${escapeHtml(screen.label)}</span>
      </button>`;
    }).join("");
    $("#flowCount").textContent = `${SCREENS.length} screens`;
  }

  function renderContext() {
    const meta = screenMeta(state.screen);
    const labels = {
      home: ["01 / HOME", "一句话，交给 Codex。", "保留参考图的能量球、双胶囊入口和圆屏留白；默认静音，不触发任何音频播放。"],
      voice: ["02 / VOICE", "一次触控，直接说话。", "语音页复刻高亮麦克风环和双状态胶囊；左滑返回首页。"],
      answer: ["03 / ANSWER", "回答只保留必要信息。", "用户话语和助手回答采用紧凑圆角气泡，底部动作保持单行。"],
      record: ["04 / RECORD", "录音摘要就是 Codex 任务入口。", "复刻录音波形、玻璃转写卡和三枚圆形控制；结束后自动创建任务。"],
      running: ["05 / TASK", "长任务不再卡住 60 秒。", "异步状态页显示识别、执行、整理和耗时；停止会发送取消请求。"],
      result: ["06 / RESULT", "结果可以读、复制、继续。", "摘要与完整转写同页切换，只保留一个主操作和一个次操作。"],
      history: ["07 / HISTORY", "最近任务只有一个清单。", "聊天与 Codex 任务共用历史入口，点击后进入对应详情。"],
      chat: ["08 / CHAT", "文字和语音共享同一会话。", "底部输入与语音入口同时保留，不额外增加独立页面。"],
      settings: ["09 / SETTINGS", "声音始终关闭。", "语音后端、服务、模型、静音和触感设置集中在一屏。"],
      service: ["10 / SERVICE", "配置是一项一项编辑的。", "地址、令牌、只读仓库和 Ollama 模型采用两级字阶与圆形图标。"],
      field: ["11 / FIELD", "没有返回按钮。", "单项配置在圆屏内编辑，左滑退出；保存后回到配置列表。"],
    };
    const [index, title, description] = labels[state.screen] || labels.home;
    $("#contextIndex").textContent = index;
    $("#contextTitle").textContent = title;
    $("#contextDescription").textContent = description;
    const chips = [...meta.meta];
    if (state.voiceBackend === "Codex") chips.push("Codex");
    chips.push("始终静音");
    $("#contextChips").innerHTML = chips
      .map((chip, i) => `<span class="context-chip ${i === 0 ? "is-live" : ""}">${escapeHtml(chip)}</span>`)
      .join("");
  }

  function bindInputs() {
    const fieldInput = $("#fieldInput");
    if (fieldInput) {
      fieldInput.addEventListener("input", (event) => {
        if (state.field) state.field.value = event.target.value;
      });
      window.setTimeout(() => fieldInput.focus({ preventScroll: true }), 40);
    }
    const chatInput = $("#chatInput");
    if (chatInput) {
      chatInput.addEventListener("input", (event) => {
        state.chatInput = event.target.value;
      });
    }
    const scroll = $(".scroll-area");
    if (scroll && state.screen === "chat") {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  function render() {
    const screen = $("#screen");
    const renderer = RENDERERS[state.screen] || homeScreen;
    screen.innerHTML = renderer();
    screen.firstElementChild?.classList.add("is-enter");
    renderNav();
    renderContext();
    bindInputs();
  }

  function navigate(screen, { replace = false } = {}) {
    if (!RENDERERS[screen]) screen = "home";
    state.screen = screen;
    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", `#${screen}`);
    render();
  }

  function goBack() {
    const parent = screenMeta(state.screen).parent;
    if (!parent) {
      showToast("已在首页");
      return;
    }
    navigate(parent);
  }

  function mainScreenStep(direction) {
    const order = ["home", "history", "settings"];
    const index = order.indexOf(state.screen);
    if (index < 0) return false;
    const next = (index + (direction > 0 ? 1 : order.length - 1)) % order.length;
    navigate(order[next]);
    return true;
  }

  function isEditable(target) {
    return ["INPUT", "TEXTAREA"].includes(target?.tagName);
  }

  function bindGestures() {
    const screen = $("#screen");
    let start = null;
    let current = null;

    screen.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || isEditable(event.target)) return;
      start = { x: event.clientX, y: event.clientY, target: event.target, scroll: event.target.closest?.(".scroll-area") };
      current = null;
      screen.setPointerCapture?.(event.pointerId);
    });

    screen.addEventListener("pointermove", (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      current = { dx, dy };
      if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
        screen.firstElementChild?.style.setProperty("--drag-x", `${Math.max(dx * 0.24, -18)}px`);
        screen.firstElementChild?.classList.add("is-drag");
      }
    });

    const finish = () => {
      if (!start) return;
      const app = screen.firstElementChild;
      app?.classList.remove("is-drag");
      app?.style.removeProperty("--drag-x");
      const dx = current?.dx || 0;
      const dy = current?.dy || 0;
      if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goBack();
      } else if (Math.abs(dy) > 62 && Math.abs(dy) > Math.abs(dx)) {
        mainScreenStep(dy < 0 ? 1 : -1);
      }
      start = null;
      current = null;
    };
    screen.addEventListener("pointerup", finish);
    screen.addEventListener("pointercancel", finish);
  }

  function startVoice() {
    state.voiceBackend = state.voiceBackend === "Ollama" ? "Ollama" : "Codex";
    navigate("voice");
  }

  function finishVoice() {
    navigate("answer");
  }

  function startCodexRecording() {
    state.record = {
      seconds: 42,
      running: true,
      paused: false,
      marks: 1,
      transcript:
        "我认为接下来可以重点关注用户体验的提升，特别是在语音交互和多模态能力的结合上，可能会带来新的机会……",
    };
    navigate("record");
  }

  function toggleRecordingPause() {
    state.record.paused = !state.record.paused;
    state.record.running = !state.record.paused;
    showToast(state.record.paused ? "录音已暂停" : "继续录音");
  }

  function finishCodexRecording() {
    state.record.running = false;
    state.task = {
      status: "running",
      taskId: `task-${Date.now()}`,
      transcript: state.record.transcript.replace(/……$/, ""),
      startedAt: Date.now(),
      elapsed: 0,
      stage: "正在分析任务",
      message: "Codex 正在理解录音内容",
      finalText: "",
    };
    navigate("running");
  }

  function tickTask() {
    if (state.task.status !== "running") return;
    state.task.elapsed += 1;
    const elapsed = state.task.elapsed;
    if (elapsed < 3) {
      state.task.stage = "正在分析任务";
      state.task.message = "Codex 正在理解录音内容";
    } else if (elapsed < 6) {
      state.task.stage = "正在检查仓库";
      state.task.message = "读取文件与运行只读命令";
    } else if (elapsed < 8) {
      state.task.stage = "正在整理结果";
      state.task.message = "压缩成适合圆屏阅读的摘要";
    } else if (elapsed < 10) {
      state.task.stage = "正在生成语音摘要";
      state.task.message = "准备 120 字以内的文字摘要";
    } else {
      completeTask();
    }
  }

  function completeTask() {
    state.task.status = "succeeded";
    state.task.stage = "完成";
    state.task.message = "Codex 已返回结果";
    state.task.finalText = TASK_FINAL_TEXT;
    state.history.unshift({
      id: "task-new",
      kind: "result",
      icon: "terminal",
      title: "检查语音任务桥接",
      sub: "刚刚 · Codex 已完成",
      tag: "只读",
    });
    if (state.screen === "running") navigate("result");
  }

  function cancelTask() {
    state.task.status = "cancelled";
    state.task.stage = "已停止";
    state.task.message = "任务已停止，子进程已结束";
    state.history.unshift({
      id: "task-cancelled",
      kind: "result",
      icon: "terminal",
      title: "已停止的 Codex 任务",
      sub: "刚刚 · 已取消",
      tag: "已停止",
    });
    showToast("任务已停止");
    navigate("history");
  }

  function copyText(text, label) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast(`${label}已复制`))
      .catch(() => showToast("复制失败"));
  }

  function openHistory(id) {
    const item = state.history.find((entry) => entry.id === id);
    if (!item) return;
    if (item.kind === "chat") navigate("chat");
    else navigate("result");
  }

  function openField(field) {
    const fields = {
      url: { key: "url", label: "API 地址", value: state.provider.url },
      token: { key: "token", label: "访问令牌", value: state.provider.token },
      repo: { key: "repo", label: "只读仓库", value: state.provider.repo },
      model: { key: "model", label: "Ollama 模型", value: state.provider.model },
    };
    state.field = fields[field] ? { ...fields[field] } : null;
    if (state.field) navigate("field");
  }

  function saveField() {
    if (!state.field) return;
    state.provider[state.field.key] = state.field.value.trim();
    showToast("配置已保存");
    navigate("service");
  }

  function sendChat() {
    const text = state.chatInput.trim();
    if (!text) {
      showToast("请输入消息");
      return;
    }
    state.chatMessages.push({ role: "user", text });
    state.chatInput = "";
    state.chatMessages.push({
      role: "assistant",
      text: "收到。我会把结果控制在圆屏可读的长度，并在需要长时间执行时切换成 Codex 异步任务。",
    });
    render();
  }

  function handleAction(action) {
    switch (action) {
      case "start-voice":
        startVoice();
        break;
      case "start-codex":
        startCodexRecording();
        break;
      case "finish-voice":
        finishVoice();
        break;
      case "voice-end":
        goBack();
        break;
      case "copy-voice":
        copyText("任务已完成。前端页面已经收敛，后台会在任务注册表中保留结果。", "回答");
        break;
      case "continue-voice":
        state.chatMessages = [
          { role: "user", text: "继续说明语音任务桥接。" },
          { role: "assistant", text: "手表只负责录音、创建任务和轮询结果；PC 端负责 ASR 与 Codex 子进程，结果只以文字返回。" },
        ];
        navigate("chat");
        break;
      case "mark-recording":
        state.record.marks += 1;
        state.record.transcript += " [标记]";
        showToast(`已添加 ${state.record.marks} 个标记`);
        break;
      case "pause-recording":
        toggleRecordingPause();
        break;
      case "finish-codex":
        finishCodexRecording();
        break;
      case "cancel-task":
        cancelTask();
        break;
      case "copy-result":
        copyText(state.resultTab === "summary" ? TASK_POINTS.map((item) => `${item.title}：${item.text}`).join("\n") : TASK_FINAL_TEXT, "结果");
        break;
      case "continue-task":
        state.chatMessages = [
          { role: "user", text: "继续展开刚才的 Codex 结果。" },
          { role: "assistant", text: "可以继续检查任务轮询、取消和日志脱敏；写模式暂不开放。" },
        ];
        navigate("chat");
        break;
      case "send-chat":
        sendChat();
        break;
      case "cycle-backend":
        state.voiceBackend = state.voiceBackend === "Codex" ? "Ollama" : "Codex";
        showToast(`语音后端：${state.voiceBackend}`);
        break;
      case "model-info":
        showToast("Codex 模型由 PC 服务固定");
        break;
      case "toggle-haptics":
        state.hapticsOn = !state.hapticsOn;
        showToast(state.hapticsOn ? "触感反馈已开启" : "触感反馈已关闭");
        break;
      case "save-provider":
        state.connected = true;
        showToast("配置已保存");
        break;
      case "save-field":
        saveField();
        break;
      default:
        break;
    }
  }

  function bindActions() {
    document.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-nav]");
      if (nav) {
        navigate(nav.dataset.nav);
        return;
      }
      const historyButton = event.target.closest("[data-open-history]");
      if (historyButton) {
        openHistory(historyButton.dataset.openHistory);
        return;
      }
      const tab = event.target.closest("[data-result-tab]");
      if (tab) {
        state.resultTab = tab.dataset.resultTab;
        render();
        return;
      }
      const field = event.target.closest("[data-field]");
      if (field) {
        openField(field.dataset.field);
        return;
      }
      const action = event.target.closest("[data-action]");
      if (action) handleAction(action.dataset.action);
    });
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (isEditable(event.target)) {
        if (event.key === "Enter" && state.screen === "chat") {
          event.preventDefault();
          sendChat();
        }
        if (event.key === "Enter" && state.screen === "field") {
          event.preventDefault();
          saveField();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Escape") {
        event.preventDefault();
        goBack();
      } else if (["home", "history", "settings"].includes(state.screen) && event.key === "ArrowDown") {
        event.preventDefault();
        mainScreenStep(-1);
      } else if (["home", "history", "settings"].includes(state.screen) && event.key === "ArrowUp") {
        event.preventDefault();
        mainScreenStep(1);
      }
    });
  }

  function tick() {
    if (FREEZE) return;
    const beforeTask = state.task.elapsed;
    if (state.record.running && !state.record.paused) state.record.seconds += 1;
    tickTask();
    if (state.screen === "record" || state.screen === "running") {
      if (state.task.elapsed !== beforeTask || state.record.running) render();
    }
  }

  function initFromHash() {
    const initial = window.location.hash.slice(1);
    if (RENDERERS[initial]) state.screen = initial;
    if (state.screen === "record") {
      state.record.running = true;
      state.record.paused = false;
      state.record.seconds = 42;
    }
    if (state.screen === "running" && state.task.status !== "running") {
      state.task = {
        status: "running",
        taskId: "task-preview",
        transcript: DEFAULT_TRANSCRIPT,
        startedAt: Date.now(),
        elapsed: 32,
        stage: "正在检查仓库",
        message: "读取文件与运行只读命令",
        finalText: "",
      };
    }
    if (state.screen === "result") {
      state.task.status = "succeeded";
      state.task.finalText = TASK_FINAL_TEXT;
    }
    render();
  }

  bindActions();
  bindGestures();
  bindKeyboard();
  initFromHash();
  window.addEventListener("popstate", () => {
    const screen = window.location.hash.slice(1);
    state.screen = RENDERERS[screen] ? screen : "home";
    render();
  });
  window.setInterval(tick, 1000);
})();
