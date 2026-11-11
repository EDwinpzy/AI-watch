(() => {
  "use strict";

  const screenEl = document.querySelector("#screen");
  const navEl = document.querySelector("#screenNav");
  const contextKicker = document.querySelector("#contextKicker");
  const contextTitle = document.querySelector("#contextTitle");
  const contextDescription = document.querySelector("#contextDescription");
  const stateChips = document.querySelector("#stateChips");
  const globalToast = document.querySelector("#globalToast");
  const playFlowButton = document.querySelector("#playFlow");

  const SCREENS = [
    {
      id: "home",
      label: "首页",
      group: "Talk",
      kicker: "01 / VOICE FIRST",
      title: "让思考，轻声发生。",
      description: "轻触能量球开始对话，或直接进入录音摘要。所有内容都可以在当前圆屏内完成，不用离开手腕。"
    },
    {
      id: "listening",
      label: "聆听中",
      group: "Talk",
      kicker: "02 / LIVE VOICE",
      title: "说话，它就在听。",
      description: "低频呼吸环与实时波形共同表达聆听状态。点击停止后将模拟一次完整的语音问答。"
    },
    {
      id: "answer",
      label: "AI 回答",
      group: "Talk",
      kicker: "03 / ANSWER",
      title: "答案，不大声喧哗。",
      description: "图文混排、可朗读、可复制。核心信息在腕上保持清晰，长内容允许轻扫阅读。"
    },
    {
      id: "actions",
      label: "快捷操作",
      group: "Talk",
      kicker: "04 / FOLLOW-UP",
      title: "下一步，就在手边。",
      description: "朗读、复制、反馈以四个大触控区呈现，适应圆屏边缘与运动中的单手操作。"
    },
    {
      id: "history",
      label: "对话历史",
      group: "Talk",
      kicker: "05 / RECALL",
      title: "随时回到上一次思路。",
      description: "最近对话用大尺寸列表呈现，标题优先，元信息退后。点击任一卡片即可继续。"
    },
    {
      id: "prompts",
      label: "推荐提问",
      group: "Talk",
      kicker: "06 / SHORTCUTS",
      title: "不知道问什么，也没关系。",
      description: "常用意图被整理成一眼可读的快捷卡片；图片生成也从同一个入口启动。"
    },
    {
      id: "generating",
      label: "AI 生成中",
      group: "Create",
      kicker: "07 / WAITING",
      title: "等待，也可以很美。",
      description: "用发光轨道和品牌核心表达处理中状态，不依赖进度条，也不打断表盘的安静感。"
    },
    {
      id: "imagegen",
      label: "图片生成",
      group: "Create",
      kicker: "08 / IMAGE",
      title: "一张图，刚好放进口袋。",
      description: "图片是腕上内容的主角。下载与更多操作沉入图片边缘，保持主体完整。"
    },
    {
      id: "settings",
      label: "应用设置",
      group: "Create",
      kicker: "09 / PREFERENCES",
      title: "按你的习惯，安静一点。",
      description: "语言、语气与表盘快捷方式都可以快速切换，所有设置保持单列、大字、低认知负担。"
    },
    {
      id: "more",
      label: "更多设置",
      group: "Create",
      kicker: "10 / SYSTEM",
      title: "复杂能力，收在更深一层。",
      description: "模型管理、显示与应用信息被收纳在次级页面，不干扰日常语音主路径。"
    },
    {
      id: "record",
      label: "录音摘要",
      group: "Record",
      kicker: "11 / RECORD",
      title: "灵感来了，先留下。",
      description: "一个中心入口开始录音，模型与录音历史留在触手可及处。"
    },
    {
      id: "recording",
      label: "正在录音",
      group: "Record",
      kicker: "12 / CAPTURE",
      title: "此刻，被完整保留。",
      description: "动态波形、清晰计时与三个核心控制构成录音状态，暂停与结束都只有一步。"
    },
    {
      id: "paused",
      label: "录音暂停",
      group: "Record",
      kicker: "13 / PAUSED",
      title: "暂停，不打断思路。",
      description: "波形静止但录音上下文仍在。继续、标记或直接结束，都不需要重新开始。"
    },
    {
      id: "transcript",
      label: "实时转写",
      group: "Record",
      kicker: "14 / TRANSCRIBE",
      title: "声音，正在变成文字。",
      description: "实时转写以阅读卡承载，亮色关键词帮助快速扫读，生成摘要只需一次点击。"
    },
    {
      id: "summary",
      label: "摘要结果",
      group: "Record",
      kicker: "15 / DISTILL",
      title: "重点，不只三条。",
      description: "摘要与完整转写共享同一空间，用分段标签切换。复制与继续追问保持可见。"
    },
    {
      id: "finish",
      label: "录音总结",
      group: "Record",
      kicker: "16 / COMPLETE",
      title: "把会议，折叠成一张卡片。",
      description: "完成态更强调结论与待办，弱化过程信息；查看原文与再次录音保留在底部。"
    },
    {
      id: "recordings",
      label: "录音历史",
      group: "Record",
      kicker: "17 / ARCHIVE",
      title: "声音，也能被翻回。",
      description: "录音历史以可播放的大触控卡片呈现，并用日期、时长与摘要状态建立结构。"
    },
    {
      id: "models",
      label: "模型切换",
      group: "System",
      kicker: "18 / MODELS",
      title: "不同问题，不同大脑。",
      description: "当前模型拥有唯一高亮边框。其他模型以低对比备用态排列，切换结果即时反馈。"
    },
    {
      id: "provider",
      label: "API 配置",
      group: "System",
      kicker: "19 / PROVIDER",
      title: "把你的模型，戴在手上。",
      description: "官方与第三方接口共用一个配置空间。字段可编辑、连接可测试、默认项可切换。"
    },
    {
      id: "vpn",
      label: "VPN 与节点",
      group: "System",
      kicker: "20 / CONNECTION",
      title: "连接世界，保持安静。",
      description: "盾牌核心围绕呼吸轨道，节点与延迟成为主信息。连接状态用颜色和文案双重表达。"
    },
    {
      id: "nodes",
      label: "选择节点",
      group: "System",
      kicker: "21 / NODES",
      title: "更近的路，未必更吵。",
      description: "节点列表按地区组织，延迟和当前选中状态保持高对比，选择后立即返回 VPN 页面。"
    }
  ];

  const SCREEN_MAP = new Map(SCREENS.map((item) => [item.id, item]));
  const PARENTS = {
    listening: "home",
    answer: "home",
    actions: "answer",
    history: "home",
    prompts: "home",
    generating: "prompts",
    imagegen: "generating",
    settings: "home",
    more: "settings",
    record: "home",
    recording: "record",
    paused: "record",
    transcript: "recording",
    summary: "transcript",
    finish: "summary",
    recordings: "record",
    models: "record",
    provider: "models",
    vpn: "home",
    nodes: "vpn"
  };

  const MODEL_OPTIONS = [
    {
      id: "gpt4o",
      name: "GPT-4o",
      subtitle: "更强的多模态能力",
      brand: "openai",
      chip: "GPT-4o"
    },
    {
      id: "chatgpt",
      name: "ChatGPT 官方",
      subtitle: "通用对话模型",
      brand: "openai",
      chip: "ChatGPT"
    },
    {
      id: "claude",
      name: "Claude API",
      subtitle: "擅长长文本分析",
      brand: "anthropic",
      chip: "Claude"
    },
    {
      id: "gemini",
      name: "Gemini API",
      subtitle: "多模态与长上下文",
      brand: "googlegemini",
      chip: "Gemini"
    }
  ];

  const NODES = [
    {
      id: "tokyo",
      name: "日本 · 东京",
      secondary: "Asia / Tokyo 01",
      flag: "jp",
      ping: "38 ms"
    },
    {
      id: "singapore",
      name: "新加坡",
      secondary: "Asia / Singapore 02",
      flag: "sg",
      ping: "56 ms"
    },
    {
      id: "us",
      name: "美国 · 西海岸",
      secondary: "North America / LA 01",
      flag: "us",
      ping: "128 ms"
    },
    {
      id: "de",
      name: "德国 · 法兰克福",
      secondary: "Europe / Frankfurt 01",
      flag: "de",
      ping: "186 ms"
    }
  ];

  const ANSWERS = {
    travel: {
      user: "帮我推荐一个城市旅行清单。",
      intro: "当然可以！这是一个关于<strong>城市旅行</strong>的推荐清单，包含景点、美食和小贴士：",
      travel: true,
      list: ["推荐景点", "清水寺", "伏见稻荷大社", "岚山竹林"],
      suffix: "如果时间充裕，建议把第一站安排在清晨，避开人流。"
    },
    food: {
      user: "附近有什么值得吃的小店？",
      intro: "可以优先试试<strong>步行 10 分钟内</strong>的小店，减少等待，也更容易保持口感：",
      travel: false,
      list: ["一碗热汤面", "本地烘焙咖啡", "一个小份甜点"],
      suffix: "我把距离和营业时间放进了筛选条件，晚一点再给你一份夜间备选。"
    },
    fitness: {
      user: "给我一个今天能完成的健身计划。",
      intro: "今天用过短而完整的<strong>20 分钟循环</strong>就够了，不需要换装备：",
      travel: false,
      list: ["热身 3 分钟", "深蹲 / 俯卧撑 / 平板支撑各 3 组", "慢走 5 分钟收尾"],
      suffix: "强度保持在你还能说短句的程度。结束后记得补水。"
    },
    followup: {
      user: "把推荐整理得更适合第一次去旅行的人。",
      intro: "可以，我把路线压缩成<strong>第一次到访也不会紧张</strong>的版本：",
      travel: true,
      list: ["先到清水寺", "中午沿二年坂用餐", "傍晚去伏见稻荷"],
      suffix: "如果你告诉我季节，我还能把穿衣和日落时间一起算进去。"
    }
  };

  const CONFIG = {
    official: {
      name: "我的 GPT-4o",
      address: "https://api.openai.com/v1",
      model: "gpt-4o",
      protocol: "OpenAI 兼容",
      key: "sk-proj-••••••••••••••7Qp2"
    },
    third: {
      protocol: "OpenAI 兼容",
      address: "https://api.example.com/v1",
      model: "your-model-id",
      key: "saved ••••••••••",
      tested: true
    }
  };

  const state = {
    screen: "home",
    answerKey: "travel",
    recordSeconds: 12,
    recordStatus: "active",
    summaryTab: "summary",
    selectedModel: "gpt4o",
    providerTab: "official",
    providerTest: "ok",
    defaultModel: true,
    vpnConnected: true,
    node: "tokyo",
    speaking: false,
    feedback: null,
    language: "中文（普通话）",
    answerStyle: "平衡",
    editor: null,
    generatingKind: "image",
    flowToken: 0
  };

  let recordTimer = null;
  let flowTimers = [];
  let generationTimer = null;
  let toastTimer = null;
  let swipeStart = null;
  let lastRenderedScreen = "";

  const icon = (name, extra = "") =>
    `<i class="icon ${extra}" style="--icon:url('vendor/phosphor/icons/${name}.svg')" aria-hidden="true"></i>`;

  const brandIcon = (name, extra = "") =>
    `<i class="icon ${extra}" style="--icon:url('vendor/simple-icons/${name}.svg')" aria-hidden="true"></i>`;

  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      const entityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entityMap[character];
    });

  const model = () => MODEL_OPTIONS.find((item) => item.id === state.selectedModel) || MODEL_OPTIONS[0];
  const node = () => NODES.find((item) => item.id === state.node) || NODES[0];
  const answer = () => ANSWERS[state.answerKey] || ANSWERS.travel;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function currentClock() {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  function currentDate() {
    const now = new Date();
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
  }

  function clockText(totalSeconds) {
    return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
  }

  function statusbar() {
    return `
      <div class="statusbar">
        <div class="status-left">${icon("cell-signal-high")}</div>
        <div class="status-clock">
          <strong class="js-clock">${currentClock()}</strong>
          <span class="js-date">${currentDate()}</span>
        </div>
        <div class="status-right"><span>80%</span>${icon("battery-high")}</div>
      </div>
    `;
  }

  function backButton(parent, label = "返回") {
    return `
      <button class="back-button" type="button" data-nav="${parent}" aria-label="${label}">
        ${icon("caret-left")}
      </button>
    `;
  }

  function heading(title, parent = "", subtitle = "", extra = "") {
    return `
      <div class="screen-heading">
        ${parent ? backButton(parent) : ""}
        <h1>${title}</h1>
        ${extra}
        ${subtitle ? `<span class="heading-subtitle">${subtitle}</span>` : ""}
      </div>
    `;
  }

  function shell(content, pageClass = "") {
    return `
      <div class="app-screen ${pageClass}">
        <div class="screen-fx" aria-hidden="true"></div>
        ${statusbar()}
        ${content}
        <div class="inner-toast" data-inner-toast role="status" aria-live="polite"></div>
      </div>
    `;
  }

  function voiceBars(count = 23, spread = 19) {
    return Array.from({ length: count }, (_, index) => {
      const height = 4 + ((index * 7 + Math.round(spread * 0.7)) % spread);
      return `<i style="height:${height}px;--delay:${(index % 9) * 0.07}s"></i>`;
    }).join("");
  }

  function recordingBars(count = 47) {
    return Array.from({ length: count }, (_, index) => {
      const centerBias = 1 - Math.abs(index - (count - 1) / 2) / (count / 2);
      const base = 10 + Math.round(centerBias * 45);
      const variation = ((index * 13) % 31) - 12;
      const height = Math.max(8, Math.min(74, base + variation));
      const speed = 0.55 + (index % 7) * 0.06;
      return `<i style="--h:${height}px;--speed:${speed}s;--delay:${(index % 11) * 0.045}s"></i>`;
    }).join("");
  }

  function flagsMarkup(item) {
    return `<span class="flag"><img src="vendor/flags/${item.flag}.svg" alt=""></span>`;
  }

  function homeScreen() {
    const activeModel = model();
    const activeNode = node();
    return shell(
      `
        <div class="home-chips">
          <button type="button" class="chip-button ${state.vpnConnected ? "accent" : ""}" data-nav="vpn">
            <span class="online-dot"></span>
            ${state.vpnConnected ? "VPN 已连接" : "VPN 未连接"}
          </button>
          <button type="button" class="chip-button model-chip" data-nav="models">
            ${brandIcon(activeModel.brand)}
            ${activeModel.chip}
            ${icon("caret-right")}
          </button>
        </div>

        <div class="hero-orb-wrap" aria-hidden="true">
          <span class="orb-ring"></span>
          <img class="hero-orb" src="assets/home-orb.png" alt="">
        </div>

        <div class="home-brand">
          <strong>NOVA</strong>
          <span>PERSONAL AI · READY</span>
        </div>

        <div class="home-main-actions">
          <button class="home-action home-action-chat" type="button" data-action="start-voice">
            ${icon("chat-circle-dots")}
            <span>开始对话</span>
          </button>
          <button class="home-action home-action-record" type="button" data-nav="record">
            ${icon("waveform")}
            <span>录音摘要</span>
          </button>
        </div>
        <div class="home-scroll-hint">${activeNode.name} · ${activeNode.ping} · 轻触开始</div>
      `,
      "home-screen home-status"
    );
  }

  function listeningScreen() {
    return shell(
      `
        <div class="listening-title">
          <h1>正在聆听</h1>
          <p>${model().chip} · 语音对话</p>
        </div>

        <div class="voice-visual">
          <span class="voice-ring r1"></span>
          <span class="voice-ring r2"></span>
          <span class="voice-ring r3"></span>
          <div class="voice-core">${icon("microphone")}</div>
          <div class="voice-wave-mini" aria-hidden="true">${voiceBars(25, 23)}</div>
        </div>

        <div class="listening-caption">
          <strong>LIVE</strong>
          “帮我安排一个适合周末的城市旅行。”
        </div>

        <div class="listening-controls">
          <button class="icon-button voice-mini" type="button" data-action="toggle-speaker" aria-label="切换语音播报">
            ${icon("speaker-high")}
          </button>
          <button class="icon-button voice-stop" type="button" data-action="voice-stop" aria-label="结束聆听并生成回答">
            ${icon("stop")}
          </button>
          <button class="icon-button voice-mini" type="button" data-nav="home" aria-label="取消对话">
            ${icon("x")}
          </button>
        </div>
        <span class="voice-control-label">点击停止并生成回答</span>
      `,
      "listening-screen"
    );
  }

  function answerScreen() {
    const currentAnswer = answer();
    const card = currentAnswer.travel
      ? `
        <div class="glass-card travel-card">
          <div class="travel-image">
            <img src="assets/travel-thumb.png" alt="京都旅行参考图">
          </div>
          <div class="travel-list">
            <strong>${currentAnswer.list[0]}</strong>
            <ul>
              ${currentAnswer.list.slice(1).map((item) => `<li>${esc(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
      `
      : `
        <div class="glass-card travel-card" style="display:block;padding:14px 15px;">
          <div class="travel-list" style="padding:0;">
            <strong>${esc(currentAnswer.list[0])}</strong>
            <ul>
              ${currentAnswer.list.slice(1).map((item) => `<li>${esc(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
      `;

    return shell(
      `
        <div class="screen-heading">
          ${backButton("home")}
          <div class="answer-brand">
            <span class="round-icon">${brandIcon(model().brand)}</span>
            <h1>NOVA</h1>
          </div>
        </div>

        <div class="screen-scroll answer-scroll">
          <div class="user-bubble">${esc(currentAnswer.user)}</div>
          <p class="assistant-copy">${currentAnswer.intro}</p>
          ${card}
          <p class="assistant-copy" style="margin-top:12px;color:#9fb4b5;font-size:12px;line-height:1.65;">
            ${esc(currentAnswer.suffix)}
          </p>
        </div>

        <div class="answer-footer">
          <button class="icon-button ${state.speaking ? "is-active" : ""}" type="button" data-action="toggle-speak" aria-label="朗读回答">
            ${icon("speaker-high")}
          </button>
          <button class="icon-button" type="button" data-action="copy-answer" aria-label="复制回答">
            ${icon("copy")}
          </button>
          <button class="icon-button ${state.feedback === "up" ? "is-active" : ""}" type="button" data-action="feedback-up" aria-label="有帮助">
            ${icon("thumbs-up")}
          </button>
          <button class="more-button" type="button" data-nav="actions" aria-label="更多操作">
            ${icon("caret-up")}
          </button>
        </div>
      `,
      "answer-screen"
    );
  }

  function actionsScreen() {
    return shell(
      `
        ${heading("快捷操作", "answer")}
        <div class="actions-grid">
          <button class="action-item ${state.speaking ? "is-active" : ""}" type="button" data-action="toggle-speak">
            <span class="round-icon">${icon("speaker-high")}</span>
            <span>${state.speaking ? "停止朗读" : "朗读回答"}</span>
          </button>
          <button class="action-item" type="button" data-action="copy-answer">
            <span class="round-icon">${icon("copy")}</span>
            <span>复制内容</span>
          </button>
          <button class="action-item ${state.feedback === "up" ? "is-active" : ""}" type="button" data-action="feedback-up">
            <span class="round-icon">${icon("thumbs-up")}</span>
            <span>${state.feedback === "up" ? "已反馈" : "有帮助"}</span>
          </button>
          <button class="action-item ${state.feedback === "down" ? "is-active" : ""}" type="button" data-action="feedback-down">
            <span class="round-icon">${icon("thumbs-down")}</span>
            <span>${state.feedback === "down" ? "已反馈" : "没帮助"}</span>
          </button>
        </div>
        <button class="sheet-dismiss" type="button" data-nav="answer" aria-label="关闭快捷操作">
          ${icon("caret-down")}
        </button>
      `,
      "actions-screen"
    );
  }

  function historyScreen() {
    const items = [
      {
        key: "travel",
        title: "日本旅行推荐",
        subtitle: "今天 09:28 · 4 条消息",
        icon: "chat-circle-dots"
      },
      {
        key: "image",
        title: "帮我生成一张图片",
        subtitle: "昨天 20:14 · 3 条消息",
        icon: "image"
      },
      {
        key: "learn",
        title: "解释一下量子计算",
        subtitle: "10月16日 16:20 · 5 条消息",
        icon: "code"
      }
    ];

    return shell(
      `
        ${heading(
          "最近对话",
          "home",
          "",
          `<button class="back-button add-button" type="button" data-action="new-chat" aria-label="新建对话">${icon("plus")}</button>`
        )}
        <div class="screen-scroll">
          <div class="history-topline"><span>3 段对话 · 本周</span><span>长按可删除</span></div>
          <div class="list-stack">
            ${items
              .map(
                (item) => `
                  <button class="list-card" type="button" data-history="${item.key}">
                    <span class="list-icon history-row-icon">${icon(item.icon)}</span>
                    <span class="list-copy">
                      <span class="list-title">${item.title}</span>
                      <span class="list-sub">${item.subtitle}</span>
                    </span>
                    ${icon("caret-right", "list-chevron")}
                  </button>
                `
              )
              .join("")}
          </div>
          <button class="new-chat-button" type="button" data-action="new-chat">
            说句话，开始新的对话
          </button>
        </div>
      `,
      "history-screen"
    );
  }

  function promptsScreen() {
    const prompts = [
      { key: "travel", title: "制定旅行计划", subtitle: "路线、景点和小贴士", icon: "paper-plane-tilt" },
      { key: "food", title: "推荐附近美食", subtitle: "按距离和营业时间筛选", icon: "fork-knife" },
      { key: "fitness", title: "健身计划", subtitle: "短时、可坚持、不需要器械", icon: "barbell" },
      { key: "image", title: "帮我生成一张图片", subtitle: "从一句描述开始创作", icon: "image" }
    ];

    return shell(
      `
        ${heading("推荐提问", "home")}
        <div class="screen-scroll">
          <div class="section-label"><span>常用场景</span><small>点按即问</small></div>
          <div class="prompt-list">
            ${prompts
              .map(
                (item) => `
                  <button class="prompt-card" type="button" data-prompt="${item.key}">
                    <span class="round-icon">${icon(item.icon)}</span>
                    <span class="list-copy">
                      <strong>${item.title}</strong>
                      <small>${item.subtitle}</small>
                    </span>
                    ${icon("caret-right", "list-chevron")}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
        <button class="chip-button prompt-cta" type="button" data-nav="listening">
          ${icon("microphone")} 或者直接说
        </button>
      `,
      "prompts-screen"
    );
  }

  function generatingScreen() {
    const isImage = state.generatingKind === "image";
    return shell(
      `
        <div class="generation-visual">
          <span class="gen-orbit"></span>
          <span class="gen-orbit inner"></span>
          <button class="gen-core" type="button" data-action="generation-result" aria-label="查看生成结果">
            ${brandIcon("openai")}
          </button>
        </div>
        <div class="generation-copy">
          <h1>${isImage ? "AI 正在生成图片" : "AI 正在生成摘要"}</h1>
          <p>${isImage ? "把描述变成一张腕上作品" : "正在提炼重点与下一步"}</p>
          <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        <div class="generation-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      `,
      "generating-screen"
    );
  }

  function imagegenScreen() {
    return shell(
      `
        ${heading("帮我生成一张图片", "prompts")}
        <div class="imagegen-frame">
          <img src="assets/imagegen-sample.png" alt="生成的樱花古塔图片">
          <div class="image-actions">
            <button class="icon-button" type="button" data-action="download-image" aria-label="下载图片">
              ${icon("download-simple")}
            </button>
            <button class="icon-button" type="button" data-action="image-more" aria-label="图片更多操作">
              ${icon("dots-three")}
            </button>
          </div>
        </div>
        <span class="imagegen-caption">古塔、樱花与黄昏 · NOVA 图像模型</span>
        <div class="imagegen-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      `,
      "imagegen-screen"
    );
  }

  function settingsScreen() {
    const rows = [
      {
        action: "cycle-language",
        icon: "translate",
        title: "语音语言",
        subtitle: state.language
      },
      {
        action: "cycle-style",
        icon: "paint-brush",
        title: "回答风格",
        subtitle: state.answerStyle
      },
      {
        nav: "prompts",
        icon: "sliders-horizontal",
        title: "表盘快捷方式",
        subtitle: "当前：推荐提问"
      },
      {
        nav: "more",
        icon: "info",
        title: "更多设置",
        subtitle: "模型、显示与关于"
      }
    ];

    return shell(
      `
        ${heading("设置", "home")}
        <div class="screen-scroll">
          <div class="settings-list">
            ${rows
              .map(
                (row) => `
                  <button class="list-card" type="button" ${row.nav ? `data-nav="${row.nav}"` : `data-action="${row.action}"`}>
                    <span class="list-icon">${icon(row.icon)}</span>
                    <span class="list-copy">
                      <span class="list-title">${row.title}</span>
                      <span class="list-sub">${row.subtitle}</span>
                    </span>
                    ${icon("caret-right", "list-chevron")}
                  </button>
                `
              )
              .join("")}
          </div>
          <p class="settings-footnote">NOVA Watch AI · Aurora build 0.4</p>
        </div>
      `,
      "settings-screen"
    );
  }

  function moreScreen() {
    return shell(
      `
        ${heading("更多设置", "settings")}
        <div class="screen-scroll">
          <div class="settings-list">
            <button class="list-card" type="button" data-nav="models">
              <span class="list-icon">${icon("cube")}</span>
              <span class="list-copy">
                <span class="list-title">模型管理</span>
                <span class="list-sub">添加与管理 AI 模型</span>
              </span>
              ${icon("caret-right", "list-chevron")}
            </button>
            <button class="list-card" type="button" data-action="display-settings">
              <span class="list-icon">${icon("sun-horizon")}</span>
              <span class="list-copy">
                <span class="list-title">界面与显示</span>
                <span class="list-sub">亮度 · 主题 · 常亮时间</span>
              </span>
              ${icon("caret-right", "list-chevron")}
            </button>
            <button class="list-card" type="button" data-action="about-app">
              <span class="list-icon">${icon("info")}</span>
              <span class="list-copy">
                <span class="list-title">关于应用</span>
                <span class="list-sub">版本 1.0.0 · 设计原型</span>
              </span>
              ${icon("caret-right", "list-chevron")}
            </button>
          </div>
          <p class="settings-footnote">敏感配置仅保存在本机安全存储</p>
        </div>
      `,
      "settings-screen more-screen"
    );
  }

  function recordScreen() {
    return shell(
      `
        ${heading("录音摘要", "home")}
        <div class="record-model-chip">
          <button class="chip-button model-chip" type="button" data-nav="models">
            ${brandIcon(model().brand)} ${model().chip} ${icon("caret-right")}
          </button>
        </div>
        <div class="earth-horizon" aria-hidden="true"></div>
        <button class="record-hub" type="button" data-action="start-recording" aria-label="开始录音">
          ${icon("microphone")}
          <strong>开始录音</strong>
          <span>点按后自动开始转写</span>
        </button>
        <div class="record-hub-actions">
          <button class="list-card" type="button" data-nav="recordings">
            <span class="list-icon">${icon("file-text")}</span>
            <span class="list-copy">
              <span class="list-title">录音摘要</span>
              <span class="list-sub">会议记录 · AI 总结</span>
            </span>
            ${icon("caret-right", "list-chevron")}
          </button>
          <button class="list-card" type="button" data-nav="models">
            <span class="list-icon">${icon("cube")}</span>
            <span class="list-copy">
              <span class="list-title">模型切换</span>
              <span class="list-sub">${model().chip} · 更多模型</span>
            </span>
            ${icon("caret-right", "list-chevron")}
          </button>
        </div>
        <span class="record-hub-scroll">轻扫查看更多</span>
      `,
      "record-screen"
    );
  }

  function recordingScreen(paused = false) {
    const clock = clockText(state.recordSeconds);
    return shell(
      `
        ${heading(paused ? "录音已暂停" : "正在录音", "record")}
        <span class="recording-subtitle">${paused ? "暂停一下，思绪还在" : "已录制 " + clock + " · 实时转写中"}</span>
        ${paused ? '<span class="paused-badge">PAUSED</span>' : ""}
        <div class="recording-time">
          <span class="js-record-clock">${clock}</span>
          <small>${model().chip} · 16 kHz</small>
        </div>
        <div class="recording-wave-wrap">
          <div class="wave-bars" aria-label="录音波形">${recordingBars()}</div>
        </div>
        <div class="recording-controls">
          <button class="record-control" type="button" data-action="mark-recording" aria-label="标记片段">
            <span class="icon-btn">${icon("bookmark-simple")}</span>
            <span>标记</span>
          </button>
          <button class="record-control large" type="button" data-action="${paused ? "resume-recording" : "pause-recording"}" aria-label="${paused ? "继续录音" : "暂停录音"}">
            <span class="icon-btn">${paused ? icon("play") : icon("pause")}</span>
            <span>${paused ? "继续" : "暂停"}</span>
          </button>
          <button class="record-control stop" type="button" data-action="stop-recording" aria-label="结束录音">
            <span class="icon-btn">${icon("square")}</span>
            <span>结束</span>
          </button>
        </div>
        <span class="recording-tip">${paused ? "继续录音不会覆盖已录制内容" : "结束后自动转写并发送给模型"}</span>
      `,
      `recording-screen ${paused ? "is-paused" : ""}`
    );
  }

  function transcriptScreen() {
    const metaTime = clockText(Math.max(state.recordSeconds, 12));
    return shell(
      `
        ${heading("实时转写", "recording")}
        <div class="transcript-meta">
          <span class="record-dot"></span>
          <span>00:02:${pad(Math.min(59, state.recordSeconds + 18))}</span>
          <span>· 正在实时转写</span>
        </div>
        <div class="glass-card transcript-card">
          <div class="transcript-time">${metaTime} · 语音片段 03</div>
          <p class="transcript-body">
            我们本次会议主要讨论了<mark class="highlight">产品的未来规划</mark>，包括功能优化、用户体验提升以及下一个版本的发布时间。下一步会先完成核心功能与体验验证，再确定上线日期。
          </p>
          <div class="transcript-typing">
            <span class="wave-mini" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            正在实时转写
          </div>
        </div>
        <div class="transcript-actions">
          <button class="primary-button" type="button" data-action="make-summary">
            生成摘要 ${icon("arrow-right")}
          </button>
          <button class="icon-button" type="button" data-action="copy-transcript" aria-label="复制转写">
            ${icon("copy")}
          </button>
        </div>
      `,
      "transcript-screen"
    );
  }

  function summaryScreen() {
    const points = [
      {
        title: "产品定位与核心目标",
        text: "聚焦 AI 助手的日常场景落地，提升用户效率与使用体验。"
      },
      {
        title: "关键功能与技术方案",
        text: "确定语音交互、多模态能力和云端大模型的集成方案。"
      },
      {
        title: "下一步行动计划",
        text: "完成原型设计并开展用户测试，收集反馈后迭代优化。"
      }
    ];

    return shell(
      `
        ${heading("摘要结果", "transcript")}
        <div class="summary-tabs" role="tablist" aria-label="录音内容">
          <button class="summary-tab ${state.summaryTab === "transcript" ? "is-active" : ""}" type="button" role="tab" data-summary-tab="transcript">转写</button>
          <button class="summary-tab ${state.summaryTab === "summary" ? "is-active" : ""}" type="button" role="tab" data-summary-tab="summary">摘要</button>
        </div>
        <div class="summary-meta">
          <span class="chip-button">${icon("check-circle")} 已转写 · 12分28秒</span>
          <span class="chip-button accent">${brandIcon(model().brand)} 已发送 ${model().chip}</span>
        </div>
        <div class="summary-points ${state.summaryTab === "transcript" ? "summary-scroll" : ""}">
          ${
            state.summaryTab === "transcript"
              ? `
                <div class="long-transcript">
                  <p>本次会议主要围绕产品未来规划展开讨论，明确了<mark>功能优化方向</mark>、用户体验提升方案，以及下一个版本的发布时间和具体任务分工。</p>
                  <p>首先，我们确认新版会继续以语音作为主入口，同时保留图文混排和大屏阅读能力。其次，设计团队需要在周三前完成交互原型，开发团队同步验证动效性能。</p>
                  <p>最后，计划在周五进行首次用户测试，重点关注圆屏阅读、单手操作和录音摘要的信任感。</p>
                </div>
              `
              : points
                  .map(
                    (point, index) => `
                      <section class="summary-point">
                        <span class="point-number">${index + 1}</span>
                        <h3>${point.title}</h3>
                        <p>${point.text}</p>
                      </section>
                    `
                  )
                  .join("")
          }
        </div>
        <div class="summary-actions">
          <button class="secondary-button" type="button" data-action="copy-summary">
            ${icon("copy")} 复制
          </button>
          <button class="primary-button" type="button" data-action="follow-up">
            ${icon("chat-circle-dots")} 继续追问
          </button>
        </div>
      `,
      "summary-screen"
    );
  }

  function finishScreen() {
    return shell(
      `
        ${heading("录音总结", "summary")}
        <div class="glass-card finish-card">
          <div class="finish-check">${icon("check")}</div>
          <div class="finish-meta">总结已完成 · ChatGPT 网页版</div>

          <section class="finish-section">
            <div class="finish-section-title"><i></i>核心结论</div>
            <p>先完成核心功能与体验验证，再确定上线日期。</p>
          </section>

          <section class="finish-section">
            <div class="finish-section-title"><i></i>待办事项</div>
            <ul class="finish-todo">
              <li>整理需求清单</li>
              <li>安排体验测试</li>
            </ul>
          </section>

          <button class="finish-original" type="button" data-action="open-record-original">
            ${icon("file-text")} 查看原文 ${icon("caret-right", "list-chevron")}
          </button>
        </div>
        <div class="finish-actions">
          <button class="primary-button" type="button" data-action="record-again">
            ${icon("microphone")} 再录一段
          </button>
          <span>录音文本已自动发送至当前模型生成总结</span>
        </div>
      `,
      "finish-screen"
    );
  }

  function recordingsScreen() {
    const recordings = [
      {
        title: "产品需求评审会议",
        date: "5月20日 14:30",
        duration: "32:18",
        icon: "file-text"
      },
      {
        title: "周例会讨论",
        date: "5月19日 10:12",
        duration: "28:45",
        icon: "chat-circle-dots"
      },
      {
        title: "用户访谈记录",
        date: "5月18日 16:20",
        duration: "18:03",
        icon: "user-circle"
      }
    ];

    return shell(
      `
        ${heading("录音历史", "record")}
        <div class="screen-scroll">
          <div class="section-label"><span>本周录音</span><small>3 条记录</small></div>
          <div class="list-stack">
            ${recordings
              .map(
                (item, index) => `
                  <button class="list-card recording-card" type="button" data-action="recording-play" data-recording="${index}">
                    <span class="list-icon play-button">${icon("play")}</span>
                    <span class="list-copy">
                      <span class="list-title">${item.title}</span>
                      <span class="recording-card-meta">${item.date}<i></i>${item.duration}<i></i>已摘要</span>
                    </span>
                    ${icon("caret-right", "list-chevron")}
                  </button>
                `
              )
              .join("")}
          </div>
          <p class="settings-footnote">音频仅本机保存 · 点击可预览播放</p>
        </div>
      `,
      "recordings-screen"
    );
  }

  function modelsScreen() {
    return shell(
      `
        ${heading("模型切换", "record")}
        <div class="screen-scroll">
          <div class="model-list">
            ${MODEL_OPTIONS.map((item) => {
              const selected = item.id === state.selectedModel;
              return `
                <button class="list-card model-card ${selected ? "is-selected" : ""}" type="button" data-model="${item.id}">
                  <span class="list-icon model-brand-icon">${brandIcon(item.brand)}</span>
                  <span class="list-copy">
                    <span class="list-title">${item.name}</span>
                    <span class="list-sub">${item.subtitle}</span>
                  </span>
                  ${
                    selected
                      ? `<span class="model-check">${icon("check")}</span>`
                      : `<span class="status-tag">备用</span>`
                  }
                </button>
              `;
            }).join("")}
          </div>
        </div>
        <button class="models-footer" type="button" data-nav="provider">
          ${icon("caret-up")} 长按编辑配置
        </button>
      `,
      "models-screen"
    );
  }

  function providerScreen() {
    const official = state.providerTab === "official";
    const config = official ? CONFIG.official : CONFIG.third;
    const testLabel =
      state.providerTest === "testing"
        ? "测试中…"
        : state.providerTest === "ok"
          ? "连接已通过"
          : "测试连接";

    const officialContent = `
      <div class="provider-section-title"><span>连接信息</span><small>官方配置</small></div>
      <div class="config-list">
        <button class="config-row" type="button" data-edit="name">
          <span class="round-icon">${icon("notebook")}</span>
          <span class="config-copy"><strong>配置名称</strong><span>${esc(config.name)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="address">
          <span class="round-icon">${icon("globe")}</span>
          <span class="config-copy"><strong>API 地址</strong><span>${esc(config.address)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="model">
          <span class="round-icon">${icon("cube")}</span>
          <span class="config-copy"><strong>Model ID</strong><span>${esc(config.model)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="protocol">
          <span class="round-icon">${icon("git-branch")}</span>
          <span class="config-copy"><strong>协议</strong><span>${esc(config.protocol)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="key">
          <span class="round-icon">${icon("key")}</span>
          <span class="config-copy"><strong>密钥</strong><span>${esc(config.key)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
      </div>
      <div class="provider-saved">
        <button class="config-row" type="button" data-action="toggle-default">
          <span class="round-icon">${icon("star")}</span>
          <span class="config-copy"><strong>设为默认</strong><span>启动时自动使用此模型</span></span>
          <span class="small-toggle ${state.defaultModel ? "is-on" : ""}" aria-hidden="true"></span>
        </button>
      </div>
    `;

    const thirdContent = `
      <div class="provider-section-title"><span>接口协议</span><small>第三方模型</small></div>
      <div class="config-list">
        <button class="config-row" type="button" data-edit="protocol">
          <span class="round-icon">${icon("git-branch")}</span>
          <span class="config-copy"><strong>接口协议</strong><span>${esc(config.protocol)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="address">
          <span class="round-icon">${icon("globe")}</span>
          <span class="config-copy"><strong>API 地址</strong><span>${esc(config.address)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="model">
          <span class="round-icon">${icon("cube")}</span>
          <span class="config-copy"><strong>Model ID</strong><span>${esc(config.model)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-edit="key">
          <span class="round-icon">${icon("key")}</span>
          <span class="config-copy"><strong>API Key</strong><span>已保存 ${esc(config.key)}</span></span>
          ${icon("caret-right", "list-chevron")}
        </button>
        <button class="config-row" type="button" data-action="test-connection">
          <span class="round-icon">${icon("wifi-high")}</span>
          <span class="config-copy"><strong>测试连接</strong><span>${testLabel}</span></span>
          ${state.providerTest === "ok" ? `<span class="test-ok">${icon("check-circle")} 可用</span>` : ""}
        </button>
      </div>
      <div class="provider-saved">
        <div class="provider-section-title"><span>已保存配置</span><small>默认 / 备用</small></div>
        <div class="third-party-footer">
          <div class="saved-config">${icon("star")}<span>默认配置</span><small>当前</small></div>
          <div class="saved-config">${icon("file-text")}<span>备用模型</span><small>备用</small></div>
        </div>
      </div>
    `;

    return shell(
      `
        ${heading("API 配置", "models")}
        <div class="provider-tabs" role="tablist" aria-label="API 配置类型">
          <button class="provider-tab ${official ? "is-active" : ""}" type="button" data-provider-tab="official">官方</button>
          <button class="provider-tab ${!official ? "is-active" : ""}" type="button" data-provider-tab="third">第三方</button>
        </div>
        <div class="screen-scroll provider-scroll">
          ${official ? officialContent : thirdContent}
        </div>
        <button class="primary-button provider-save-button" type="button" data-action="save-provider">
          ${icon("check-circle")} ${official ? "保存配置" : "设为当前模型"}
        </button>
        ${state.editor ? fieldEditor() : ""}
      `,
      "provider-screen"
    );
  }

  function fieldEditor() {
    const editor = state.editor;
    const labels = {
      name: "配置名称",
      address: "API 地址",
      model: "Model ID",
      protocol: "接口协议",
      key: "API Key"
    };
    return `
      <div class="editor-backdrop" data-action="close-editor"></div>
      <form class="field-editor" id="fieldEditorForm">
        <span class="editor-kicker">EDIT CONFIGURATION</span>
        <h2>${labels[editor.key] || editor.label}</h2>
        <label for="fieldEditorInput">轻触输入新值</label>
        <input id="fieldEditorInput" name="value" type="${editor.key === "key" ? "password" : "text"}" value="${esc(editor.value)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="editor-actions">
          <button type="button" class="secondary-button" data-action="close-editor">取消</button>
          <button type="submit" class="primary-button">保存</button>
        </div>
      </form>
    `;
  }

  function vpnScreen() {
    const activeNode = node();
    return shell(
      `
        ${heading("VPN", "home")}
        <div class="vpn-orbit" aria-hidden="true">
          <span class="orbit-ring"></span>
          <span class="orbit-ring"></span>
          <span class="orbit-ring"></span>
          <span class="vpn-core">${icon("shield-check")}</span>
        </div>
        <div class="vpn-state">
          <strong>${state.vpnConnected ? "已连接" : "未连接"}</strong>
          <span>${state.vpnConnected ? "网络已加密 · 节点稳定" : "选择一个节点开始加速"}</span>
        </div>
        <div class="glass-card node-card">
          ${flagsMarkup(activeNode)}
          <span class="node-card-copy"><small>当前节点</small><strong>${activeNode.name}</strong></span>
          <span class="node-latency">
            <span class="latency-bars"><i></i><i></i><i></i><i></i></span>
            ${activeNode.ping}
          </span>
          <button class="icon-button" style="width:30px;height:30px;" type="button" data-nav="nodes" aria-label="选择节点">
            ${icon("caret-right")}
          </button>
        </div>
        <div class="vpn-actions">
          <button class="primary-button" type="button" data-action="vpn-toggle">
            ${icon(state.vpnConnected ? "shield-check" : "wifi-high")}
            ${state.vpnConnected ? "断开 VPN" : "连接 VPN"}
          </button>
          <button class="secondary-button" type="button" data-nav="nodes">
            ${icon("globe-hemisphere-east")} 选择节点
          </button>
        </div>
      `,
      `vpn-screen ${state.vpnConnected ? "is-connected" : ""}`
    );
  }

  function nodesScreen() {
    return shell(
      `
        ${heading("选择节点", "vpn")}
        <div class="screen-scroll">
          <div class="section-label"><span>全球节点</span><small>自动选择最快的线路</small></div>
          <div class="node-list">
            ${NODES.map(
              (item) => `
                <button class="list-card node-row ${state.node === item.id ? "is-selected" : ""}" type="button" data-node="${item.id}">
                  ${flagsMarkup(item)}
                  <span class="list-copy">
                    <span class="list-title">${item.name}</span>
                    <span class="list-sub">${item.secondary}</span>
                  </span>
                  <span class="node-latency">
                    <span class="latency-bars"><i></i><i></i><i></i><i></i></span>
                    ${item.ping}
                  </span>
                  ${state.node === item.id ? `<span class="model-check">${icon("check")}</span>` : ""}
                </button>
              `
            ).join("")}
          </div>
        </div>
        <span class="node-picker-hint">选择后立即切换线路</span>
      `,
      "nodes-screen"
    );
  }

  function renderPage() {
    switch (state.screen) {
      case "listening":
        return listeningScreen();
      case "answer":
        return answerScreen();
      case "actions":
        return actionsScreen();
      case "history":
        return historyScreen();
      case "prompts":
        return promptsScreen();
      case "generating":
        return generatingScreen();
      case "imagegen":
        return imagegenScreen();
      case "settings":
        return settingsScreen();
      case "more":
        return moreScreen();
      case "record":
        return recordScreen();
      case "recording":
        return recordingScreen(false);
      case "paused":
        return recordingScreen(true);
      case "transcript":
        return transcriptScreen();
      case "summary":
        return summaryScreen();
      case "finish":
        return finishScreen();
      case "recordings":
        return recordingsScreen();
      case "models":
        return modelsScreen();
      case "provider":
        return providerScreen();
      case "vpn":
        return vpnScreen();
      case "nodes":
        return nodesScreen();
      case "home":
      default:
        return homeScreen();
    }
  }

  function stateChip(label, active = false) {
    return `<span class="state-chip ${active ? "is-active" : ""}">${label}</span>`;
  }

  function currentStateChips() {
    const currentModel = model().chip;
    switch (state.screen) {
      case "home":
        return [
          stateChip(state.vpnConnected ? "VPN 已连接" : "VPN 未连接", state.vpnConnected),
          stateChip(currentModel, true),
          stateChip("语音待机")
        ];
      case "listening":
        return [stateChip("聆听中", true), stateChip(currentModel), stateChip("模拟音频")];
      case "answer":
        return [stateChip("回答完成", true), stateChip(state.speaking ? "朗读中" : "朗读关闭", state.speaking), stateChip(currentModel)];
      case "actions":
        return [
          stateChip(state.speaking ? "朗读中" : "朗读关闭", state.speaking),
          stateChip(state.feedback ? "已反馈" : "待反馈", Boolean(state.feedback))
        ];
      case "history":
        return [stateChip("3 段对话", true), stateChip("本周内容")];
      case "prompts":
        return [stateChip("4 个快捷场景", true), stateChip("含图片生成")];
      case "generating":
        return [stateChip(state.generatingKind === "image" ? "生成图片" : "生成摘要", true), stateChip("处理中")];
      case "imagegen":
        return [stateChip("图片模式", true), stateChip(currentModel)];
      case "settings":
        return [stateChip(state.language), stateChip(state.answerStyle, true)];
      case "more":
        return [stateChip("系统设置", true), stateChip("1.0.0")];
      case "record":
        return [stateChip("准备录音", true), stateChip(currentModel), stateChip(node().name)];
      case "recording":
        return [stateChip("录音中", true), stateChip(clockText(state.recordSeconds)), stateChip("实时转写")];
      case "paused":
        return [stateChip("已暂停", true), stateChip(clockText(state.recordSeconds)), stateChip("内容保留")];
      case "transcript":
        return [stateChip("实时转写", true), stateChip(currentModel), stateChip("已完成")];
      case "summary":
        return [stateChip(state.summaryTab === "summary" ? "摘要视图" : "转写视图", true), stateChip("已发送 " + currentModel)];
      case "finish":
        return [stateChip("已完成", true), stateChip("2 个待办"), stateChip(currentModel)];
      case "recordings":
        return [stateChip("3 条录音", true), stateChip("已摘要")];
      case "models":
        return [stateChip("当前 " + currentModel, true), stateChip("4 个可选")];
      case "provider":
        return [
          stateChip(state.providerTab === "official" ? "官方配置" : "第三方配置", true),
          stateChip(state.defaultModel ? "默认模型" : "非默认")
        ];
      case "vpn":
        return [
          stateChip(state.vpnConnected ? "VPN 已连接" : "VPN 未连接", state.vpnConnected),
          stateChip(node().name),
          stateChip(node().ping)
        ];
      case "nodes":
        return [stateChip("4 个节点", true), stateChip(node().name)];
      default:
        return [];
    }
  }

  function renderNav() {
    const groups = ["Talk", "Create", "Record", "System"];
    const groupLabels = {
      Talk: "Conversation",
      Create: "Create & Settings",
      Record: "Capture & Summary",
      System: "Models & Network"
    };
    navEl.innerHTML = groups
      .map((group) => {
        const groupScreens = SCREENS.filter((item) => item.group === group);
        return `
          <div class="nav-group">
            <span class="nav-group-label">${groupLabels[group]}</span>
            ${groupScreens
              .map((item) => {
                const index = SCREENS.findIndex((screen) => screen.id === item.id) + 1;
                return `
                  <button class="nav-button ${state.screen === item.id ? "is-active" : ""}" type="button" data-screen="${item.id}">
                    <span>${pad(index)}</span>
                    ${item.label}
                  </button>
                `;
              })
              .join("")}
          </div>
        `;
      })
      .join("");
  }

  function updateContext() {
    const meta = SCREEN_MAP.get(state.screen) || SCREEN_MAP.get("home");
    contextKicker.textContent = meta.kicker;
    contextTitle.textContent = meta.title;
    contextDescription.textContent = meta.description;
    stateChips.innerHTML = currentStateChips().join("");
  }

  function updateClockNodes() {
    document.querySelectorAll(".js-clock").forEach((node) => {
      node.textContent = currentClock();
    });
    document.querySelectorAll(".js-date").forEach((node) => {
      node.textContent = currentDate();
    });
  }

  function stopRecordTimer() {
    if (recordTimer) {
      window.clearInterval(recordTimer);
      recordTimer = null;
    }
  }

  function startRecordTimer() {
    stopRecordTimer();
    if (state.screen !== "recording" || state.recordStatus !== "active") return;
    recordTimer = window.setInterval(() => {
      if (state.screen !== "recording" || state.recordStatus !== "active") return;
      state.recordSeconds += 1;
      document.querySelectorAll(".js-record-clock").forEach((node) => {
        node.textContent = clockText(state.recordSeconds);
      });
    }, 1000);
  }

  function clearFlowTimers() {
    flowTimers.forEach((timer) => window.clearTimeout(timer));
    flowTimers = [];
  }

  function clearGenerationTimer() {
    if (generationTimer) {
      window.clearTimeout(generationTimer);
      generationTimer = null;
    }
  }

  function scrollScreenTop() {
    document.querySelectorAll(".screen-scroll, .summary-points, .finish-card").forEach((element) => {
      element.scrollTop = 0;
    });
  }

  function renderScreen() {
    screenEl.innerHTML = renderPage();
    const pageChanged = lastRenderedScreen !== state.screen;
    lastRenderedScreen = state.screen;
    screenEl.classList.remove("is-page-enter");
    void screenEl.offsetWidth;
    screenEl.classList.add("is-page-enter");
    renderNav();
    updateContext();
    updateClockNodes();

    if (pageChanged) {
      scrollScreenTop();
    }

    if (state.screen === "recording" && state.recordStatus === "active") {
      startRecordTimer();
    } else if (state.screen !== "recording") {
      stopRecordTimer();
    }

    if (state.editor) {
      const input = document.querySelector("#fieldEditorInput");
      if (input) {
        window.setTimeout(() => {
          input.focus();
          input.select();
        }, 120);
      }
    }
  }

  function navigate(screenId, options = {}) {
    if (!SCREEN_MAP.has(screenId)) screenId = "home";
    if (!options.preserveFlow) {
      clearFlowTimers();
      clearGenerationTimer();
    }
    if (state.screen === "recording" && screenId !== "recording") {
      stopRecordTimer();
    }
    if (screenId === "paused") {
      state.recordStatus = "paused";
    }
    if (screenId === "recording" && state.recordStatus === "complete") {
      state.recordStatus = "active";
      state.recordSeconds = 0;
    }
    if (screenId === "recording" && state.recordStatus !== "active" && state.recordStatus !== "paused") {
      state.recordStatus = "active";
    }
    state.screen = screenId;
    state.editor = null;
    window.history.replaceState(null, "", `#${screenId}`);
    renderScreen();
  }

  function showGlobalToast(message) {
    window.clearTimeout(toastTimer);
    globalToast.textContent = message;
    globalToast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      globalToast.classList.remove("is-visible");
    }, 2100);
  }

  function showScreenToast(message) {
    const toast = document.querySelector("[data-inner-toast]");
    if (!toast) {
      showGlobalToast(message);
      return;
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 1700);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => showScreenToast("已复制到剪贴板"),
        () => showScreenToast("浏览器未允许复制")
      );
      return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand("copy");
      showScreenToast("已复制到剪贴板");
    } catch {
      showScreenToast("浏览器未允许复制");
    }
    input.remove();
  }

  function summaryText() {
    return [
      "1. 产品定位与核心目标：聚焦 AI 助手的日常场景落地，提升用户效率与使用体验。",
      "2. 关键功能与技术方案：确定语音交互、多模态能力和云端大模型的集成方案。",
      "3. 下一步行动计划：完成原型设计并开展用户测试，收集反馈后迭代优化。"
    ].join("\n");
  }

  function transcriptText() {
    return "本次会议主要围绕产品未来规划展开讨论，明确了功能优化方向、用户体验提升方案，以及下一个版本的发布时间和具体任务分工。";
  }

  function answerText() {
    const current = answer();
    return `${current.intro.replace(/<[^>]+>/g, "")}\n${current.list.join("；")}\n${current.suffix}`;
  }

  function beginRecording() {
    state.recordSeconds = 0;
    state.recordStatus = "active";
    navigate("recording");
    showScreenToast("录音已开始 · 模拟麦克风");
  }

  function stopRecording() {
    stopRecordTimer();
    state.recordStatus = "complete";
    navigate("transcript");
    showScreenToast("录音结束，正在实时转写");
  }

  function startGeneration(kind) {
    state.generatingKind = kind;
    clearGenerationTimer();
    navigate("generating");
    generationTimer = window.setTimeout(() => {
      if (state.screen !== "generating") return;
      navigate(kind === "image" ? "imagegen" : "finish");
    }, 2300);
  }

  function openAnswer(key) {
    state.answerKey = key;
    state.speaking = false;
    state.feedback = null;
    navigate("answer");
  }

  function promptAnswer(promptKey) {
    if (promptKey === "image") {
      startGeneration("image");
      return;
    }
    const answerKey = ["travel", "food", "fitness"].includes(promptKey) ? promptKey : "travel";
    openAnswer(answerKey);
  }

  function openEditor(key) {
    const config = state.providerTab === "official" ? CONFIG.official : CONFIG.third;
    state.editor = {
      key,
      label: key,
      value: config[key] || ""
    };
    renderScreen();
  }

  function saveEditor(value) {
    if (!state.editor) return;
    const config = state.providerTab === "official" ? CONFIG.official : CONFIG.third;
    const key = state.editor.key;
    if (key === "key") {
      config[key] = value.trim() ? `saved ${"•".repeat(10)}` : "";
    } else {
      config[key] = value.trim();
    }
    state.editor = null;
    renderScreen();
    showScreenToast("配置已保存到本机");
  }

  function cycleLanguage() {
    const options = ["中文（普通话）", "English", "日本語"];
    const index = options.indexOf(state.language);
    state.language = options[(index + 1) % options.length];
    renderScreen();
    showScreenToast(`语音语言：${state.language}`);
  }

  function cycleStyle() {
    const options = ["平衡", "简洁", "启发式"];
    const index = options.indexOf(state.answerStyle);
    state.answerStyle = options[(index + 1) % options.length];
    renderScreen();
    showScreenToast(`回答风格：${state.answerStyle}`);
  }

  function playGuidedFlow() {
    clearFlowTimers();
    showGlobalToast("Playback started · voice → answer → follow-up");
    navigate("listening", { preserveFlow: true });
    const sequence = [
      { delay: 2500, screen: "answer" },
      { delay: 5200, screen: "actions" },
      { delay: 7400, screen: "home" }
    ];
    flowTimers = sequence.map((step) =>
      window.setTimeout(() => {
        if (SCREEN_MAP.has(step.screen)) {
          state.screen = step.screen;
          renderScreen();
          window.history.replaceState(null, "", `#${step.screen}`);
        }
        if (step.screen === "home") {
          showGlobalToast("Playback complete · explore the flow rail");
        }
      }, step.delay)
    );
  }

  function nextScreen(direction) {
    const currentIndex = SCREENS.findIndex((item) => item.id === state.screen);
    const nextIndex = (currentIndex + direction + SCREENS.length) % SCREENS.length;
    navigate(SCREENS[nextIndex].id);
  }

  function configureScreenInteraction() {
    screenEl.addEventListener("click", (event) => {
      const navTarget = event.target.closest("[data-nav]");
      if (navTarget) {
        navigate(navTarget.dataset.nav);
        return;
      }

      const historyTarget = event.target.closest("[data-history]");
      if (historyTarget) {
        if (historyTarget.dataset.history === "image") {
          navigate("imagegen");
          return;
        }
        openAnswer(historyTarget.dataset.history === "learn" ? "travel" : historyTarget.dataset.history);
        return;
      }

      const promptTarget = event.target.closest("[data-prompt]");
      if (promptTarget) {
        promptAnswer(promptTarget.dataset.prompt);
        return;
      }

      const modelTarget = event.target.closest("[data-model]");
      if (modelTarget) {
        state.selectedModel = modelTarget.dataset.model;
        renderScreen();
        showScreenToast(`${model().name} 已设为当前模型`);
        return;
      }

      const nodeTarget = event.target.closest("[data-node]");
      if (nodeTarget) {
        state.node = nodeTarget.dataset.node;
        navigate("vpn");
        showScreenToast(`已切换到 ${node().name}`);
        return;
      }

      const summaryTab = event.target.closest("[data-summary-tab]");
      if (summaryTab) {
        state.summaryTab = summaryTab.dataset.summaryTab;
        renderScreen();
        return;
      }

      const providerTab = event.target.closest("[data-provider-tab]");
      if (providerTab) {
        state.providerTab = providerTab.dataset.providerTab;
        state.editor = null;
        renderScreen();
        return;
      }

      const editTarget = event.target.closest("[data-edit]");
      if (editTarget) {
        openEditor(editTarget.dataset.edit);
        return;
      }

      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget) return;

      const action = actionTarget.dataset.action;
      switch (action) {
        case "start-voice":
          navigate("listening");
          break;
        case "voice-stop":
          openAnswer("travel");
          break;
        case "new-chat":
          navigate("listening");
          break;
        case "toggle-speak":
          state.speaking = !state.speaking;
          renderScreen();
          showScreenToast(state.speaking ? "正在朗读回答" : "已停止朗读");
          break;
        case "toggle-speaker":
          showScreenToast("扬声器已开启");
          break;
        case "copy-answer":
          copyText(answerText());
          break;
        case "feedback-up":
          state.feedback = "up";
          renderScreen();
          showScreenToast("感谢反馈 · 已记录");
          break;
        case "feedback-down":
          state.feedback = "down";
          renderScreen();
          showScreenToast("已收到 · 我们会继续改进");
          break;
        case "download-image":
          showScreenToast("图片已保存到相册（演示）");
          break;
        case "image-more":
          showScreenToast("更多：重新生成 / 分享 / 删除");
          break;
        case "cycle-language":
          cycleLanguage();
          break;
        case "cycle-style":
          cycleStyle();
          break;
        case "display-settings":
          showScreenToast("当前使用自动亮度与深色主题");
          break;
        case "about-app":
          showScreenToast("NOVA Watch AI · Aurora 0.4");
          break;
        case "start-recording":
          beginRecording();
          break;
        case "pause-recording":
          state.recordStatus = "paused";
          stopRecordTimer();
          navigate("paused");
          break;
        case "resume-recording":
          state.recordStatus = "active";
          navigate("recording");
          break;
        case "stop-recording":
          stopRecording();
          break;
        case "mark-recording":
          showScreenToast("已标记当前片段");
          break;
        case "copy-transcript":
          copyText(transcriptText());
          break;
        case "make-summary":
          startGeneration("summary");
          break;
        case "copy-summary":
          copyText(state.summaryTab === "summary" ? summaryText() : transcriptText());
          break;
        case "follow-up":
          openAnswer("followup");
          break;
        case "open-record-original":
          state.summaryTab = "transcript";
          navigate("summary");
          break;
        case "record-again":
          beginRecording();
          break;
        case "recording-play":
          showScreenToast("正在播放录音（演示）");
          break;
        case "test-connection":
          state.providerTest = "testing";
          renderScreen();
          window.setTimeout(() => {
            if (state.screen !== "provider") return;
            state.providerTest = "ok";
            renderScreen();
            showScreenToast("连接通过 · 模型可用");
          }, 1050);
          break;
        case "toggle-default":
          state.defaultModel = !state.defaultModel;
          renderScreen();
          showScreenToast(state.defaultModel ? "已设为默认模型" : "已取消默认模型");
          break;
        case "save-provider":
          showScreenToast(state.providerTab === "official" ? "配置已保存" : "已设为当前模型");
          window.setTimeout(() => navigate("models"), 420);
          break;
        case "vpn-toggle":
          state.vpnConnected = !state.vpnConnected;
          renderScreen();
          showScreenToast(state.vpnConnected ? "VPN 已连接 · 流量已加密" : "VPN 已断开");
          break;
        case "generation-result":
          navigate(state.generatingKind === "image" ? "imagegen" : "finish");
          break;
        case "close-editor":
          state.editor = null;
          renderScreen();
          break;
        default:
          break;
      }
    });

    screenEl.addEventListener("submit", (event) => {
      if (event.target.id !== "fieldEditorForm") return;
      event.preventDefault();
      const data = new FormData(event.target);
      saveEditor(String(data.get("value") || ""));
    });
  }

  function configureRail() {
    navEl.addEventListener("click", (event) => {
      const target = event.target.closest("[data-screen]");
      if (!target) return;
      navigate(target.dataset.screen);
    });

    document.querySelector(".brand").addEventListener("click", (event) => {
      event.preventDefault();
      navigate("home");
    });

    playFlowButton.addEventListener("click", playGuidedFlow);
  }

  function configureGestures() {
    screenEl.addEventListener("pointerdown", (event) => {
      if (event.target.closest("input")) return;
      swipeStart = {
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType
      };
    });

    screenEl.addEventListener("pointerup", (event) => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      const isSwipe = Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.25;
      swipeStart = null;
      if (!isSwipe) return;
      event.preventDefault();
      nextScreen(dx < 0 ? 1 : -1);
    });

    window.addEventListener("keydown", (event) => {
      if (["INPUT", "TEXTAREA"].includes(event.target.tagName)) {
        if (event.key === "Escape") {
          event.target.blur();
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextScreen(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nextScreen(-1);
      }
      if (event.key === "Escape") {
        navigate("home");
      }
    });

    window.addEventListener("hashchange", () => {
      const id = window.location.hash.slice(1) || "home";
      if (SCREEN_MAP.has(id) && id !== state.screen) {
        navigate(id);
      }
    });
  }

  function initialize() {
    if (new URLSearchParams(window.location.search).get("capture") === "1") {
      document.body.classList.add("capture-mode");
    }
    const hashScreen = window.location.hash.slice(1);
    state.screen = SCREEN_MAP.has(hashScreen) ? hashScreen : "home";
    configureScreenInteraction();
    configureRail();
    configureGestures();
    renderNav();
    renderScreen();
    window.setInterval(updateClockNodes, 1000);
  }

  initialize();
})();
