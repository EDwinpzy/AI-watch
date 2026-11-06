import { pasteboard } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { promptAction } from '@kit.ArkUI';
import {
  buildDemoReply,
  formatDuration,
  isValidApiConfig,
  summarizeRecord
} from '../core/WatchCore';

const DOMAIN: number = 0x0000;
const TAG: string = 'NOVAWatchAI';

const COLOR_BACKGROUND: string = '#05070B';
const COLOR_SURFACE: string = '#10141C';
const COLOR_SURFACE_RAISED: string = '#1B2230';
const COLOR_TEXT: string = '#F4F7FC';
const COLOR_TEXT_SECONDARY: string = '#A4B0C3';
const COLOR_TEXT_MUTED: string = '#718096';
const COLOR_BORDER: string = '#24FFFFFF';
const COLOR_BLUE: string = '#287CFF';
const COLOR_BLUE_BRIGHT: string = '#5BCBFF';
const COLOR_MINT: string = '#24D7AB';
const COLOR_RECORD_RED: string = '#FF4262';

const DEMO_TRANSCRIPT: string =
  '今天的会议主要讨论了项目的进展情况，包括产品设计、开发进度和后续的市场计划。';

class ChatMessage {
  role: string;
  text: string;

  constructor(role: string, text: string) {
    this.role = role;
    this.text = text;
  }
}

class ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;

  constructor(id: string, title: string, messages: ChatMessage[], updatedAt: number) {
    this.id = id;
    this.title = title;
    this.messages = messages;
    this.updatedAt = updatedAt;
  }
}

@Entry
@Component
struct Index {
  @State private screen: string = 'home';
  @State private backStack: string[] = [];
  @State private clockText: string = '00:00';

  @State private voiceActive: boolean = false;
  @State private voiceState: string = 'idle';
  @State private voiceElapsed: number = 0;
  @State private micMuted: boolean = false;
  @State private speakerOn: boolean = true;
  @State private wavePhase: boolean = false;

  @State private recordSeconds: number = 0;
  @State private recordRunning: boolean = false;
  @State private recordText: string = DEMO_TRANSCRIPT;
  @State private summaryItems: string[] = [
    '项目进展整体顺利',
    '产品设计方案已确认',
    '开发预计下周完成',
    '下一步推进市场推广'
  ];
  @State private editingTranscript: boolean = false;
  @State private editBuffer: string = '';

  @State private chatThreads: ChatThread[] = [];
  @State private activeThreadId: string = 'ai';
  @State private activeThreadTitle: string = '人工智能介绍';
  @State private chatMessages: ChatMessage[] = [];
  @State private chatInput: string = '';
  @State private chatInputFocused: boolean = false;

  @State private apiBaseUrl: string = 'https://api.openai.com/v1';
  @State private apiKey: string = '';
  @State private apiModel: string = 'gpt-4o-mini';
  @State private apiSaved: boolean = false;

  private readonly navigationOrder: string[] = [
    'home',
    'recording',
    'transcript',
    'summary',
    'history',
    'settings',
    'apiSettings'
  ];
  private readonly waveBars: number[] = [8, 15, 24, 12, 29, 18, 32, 16, 25, 11, 19, 9];
  private clockTimer: number = -1;
  private voiceTimer: number = -1;
  private voicePhaseTimer: number = -1;
  private recordTimer: number = -1;
  private chatScroller: Scroller = new Scroller();
  private historyScroller: Scroller = new Scroller();
  private transcriptScroller: Scroller = new Scroller();
  private apiScroller: Scroller = new Scroller();

  aboutToAppear(): void {
    this.refreshClock();
    this.clockTimer = setInterval(() => {
      this.refreshClock();
    }, 15000);
    this.seedConversations();
    hilog.info(DOMAIN, TAG, 'NOVA Watch AI page visible');
  }

  aboutToDisappear(): void {
    this.stopVoiceSession();
    this.stopRecordTimer();
    if (this.clockTimer >= 0) {
      clearInterval(this.clockTimer);
      this.clockTimer = -1;
    }
  }

  private refreshClock(): void {
    const now: Date = new Date();
    this.clockText = `${this.pad2(now.getHours())}:${this.pad2(now.getMinutes())}`;
  }

  private pad2(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  private toast(message: string): void {
    promptAction.showToast({ message: message, duration: 1700 });
  }

  private seedConversations(): void {
    const aiMessages: ChatMessage[] = [
      new ChatMessage('user', '帮我介绍一下人工智能'),
      new ChatMessage('assistant',
        '人工智能（AI）是让计算机模拟人类智能的技术，广泛应用于医疗、教育、创作与日常办公。')
    ];
    const fitnessMessages: ChatMessage[] = [
      new ChatMessage('user', '帮我制定一个健身计划'),
      new ChatMessage('assistant',
        '可以从每周 3 次力量训练和 2 次轻有氧开始，结合热身、恢复与循序渐进的强度安排。')
    ];
    const meetingMessages: ChatMessage[] = [
      new ChatMessage('user', '整理一下会议重点'),
      new ChatMessage('assistant',
        '会议重点包括项目进度、设计方案确认、开发排期以及后续市场推广安排。')
    ];
    this.chatThreads = [
      new ChatThread('ai', '人工智能介绍', aiMessages, 3),
      new ChatThread('fitness', '健身计划制定', fitnessMessages, 2),
      new ChatThread('meeting', '会议内容整理', meetingMessages, 1)
    ];
    this.activeThreadId = 'ai';
    this.activeThreadTitle = '人工智能介绍';
    this.chatMessages = this.copyMessages(aiMessages);
  }

  private copyMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    messages.forEach((message: ChatMessage) => {
      result.push(new ChatMessage(message.role, message.text));
    });
    return result;
  }

  private loadThread(threadId: string): void {
    const thread: ChatThread | undefined =
      this.chatThreads.find((item: ChatThread) => item.id === threadId);
    if (!thread) {
      return;
    }
    this.activeThreadId = thread.id;
    this.activeThreadTitle = thread.title;
    this.chatMessages = this.copyMessages(thread.messages);
    setTimeout(() => {
      this.chatScroller.scrollEdge(Edge.Bottom);
    }, 80);
  }

  private syncActiveThread(): void {
    const updated: ChatThread[] = [];
    this.chatThreads.forEach((thread: ChatThread) => {
      if (thread.id === this.activeThreadId) {
        updated.push(new ChatThread(
          thread.id,
          this.activeThreadTitle,
          this.copyMessages(this.chatMessages),
          Date.now()
        ));
      } else {
        updated.push(thread);
      }
    });
    this.chatThreads = updated;
  }

  private newestThreads(): ChatThread[] {
    const sorted: ChatThread[] = this.chatThreads.slice();
    sorted.sort((left: ChatThread, right: ChatThread) => right.updatedAt - left.updatedAt);
    return sorted;
  }

  private newChat(): void {
    const id: string = `thread-${Date.now()}`;
    const thread: ChatThread = new ChatThread(id, '新对话', [], Date.now());
    this.chatThreads = this.chatThreads.concat([thread]);
    this.activeThreadId = id;
    this.activeThreadTitle = '新对话';
    this.chatMessages = [];
    this.navigate('chat');
  }

  private sendChat(): void {
    const messageText: string = this.chatInput.trim();
    if (!messageText) {
      return;
    }
    this.chatMessages = this.chatMessages.concat([
      new ChatMessage('user', messageText)
    ]);
    if (this.activeThreadTitle === '新对话') {
      this.activeThreadTitle =
        messageText.length > 12 ? `${messageText.substring(0, 12)}...` : messageText;
    }
    const reply: string = buildDemoReply(messageText);
    this.chatMessages = this.chatMessages.concat([
      new ChatMessage('assistant', reply)
    ]);
    this.syncActiveThread();
    this.chatInput = '';
    setTimeout(() => {
      this.chatScroller.scrollEdge(Edge.Bottom);
    }, 80);
  }

  private clearChat(): void {
    this.chatMessages = [];
    this.syncActiveThread();
    this.toast('当前对话已清空');
  }

  private startVoiceSession(): void {
    this.clearVoicePhaseTimer();
    this.screen = 'home';
    this.backStack = [];
    this.voiceActive = true;
    this.voiceState = 'listening';
    this.voiceElapsed = 0;
    this.micMuted = false;
    this.speakerOn = true;
    this.startVoiceTimer();
    this.toast('语音对话已开始（演示模式）');
  }

  private startVoiceTimer(): void {
    if (this.voiceTimer >= 0) {
      clearInterval(this.voiceTimer);
    }
    this.voiceTimer = setInterval(() => {
      if (!this.voiceActive || this.screen !== 'home') {
        return;
      }
      this.voiceElapsed += 1;
      this.wavePhase = !this.wavePhase;
    }, 1000);
  }

  private stopVoiceTimer(): void {
    if (this.voiceTimer >= 0) {
      clearInterval(this.voiceTimer);
      this.voiceTimer = -1;
    }
  }

  private clearVoicePhaseTimer(): void {
    if (this.voicePhaseTimer >= 0) {
      clearTimeout(this.voicePhaseTimer);
      this.voicePhaseTimer = -1;
    }
  }

  private stopVoiceSession(): void {
    this.clearVoicePhaseTimer();
    this.stopVoiceTimer();
    this.voiceActive = false;
    this.voiceState = 'idle';
    this.voiceElapsed = 0;
    this.micMuted = false;
    this.speakerOn = true;
  }

  private endVoiceSession(): void {
    this.stopVoiceSession();
    this.screen = 'home';
    this.backStack = [];
    this.toast('语音对话已结束');
  }

  private simulateVoiceTurn(): void {
    if (!this.voiceActive) {
      this.startVoiceSession();
      return;
    }
    if (this.micMuted) {
      this.toast('请先打开麦克风');
      return;
    }
    if (this.voiceState === 'thinking') {
      return;
    }
    if (this.voiceState === 'speaking') {
      this.clearVoicePhaseTimer();
      this.voiceState = 'listening';
      return;
    }
    this.voiceState = 'thinking';
    this.voicePhaseTimer = setTimeout(() => {
      if (!this.voiceActive || this.screen !== 'home') {
        return;
      }
      this.voiceState = 'speaking';
      this.chatMessages = this.chatMessages.concat([
        new ChatMessage('user', '语音输入（演示）'),
        new ChatMessage('assistant',
          '人工智能（AI）让计算机模拟人类智能，可用于医疗、教育、创作与日常办公。')
      ]);
      this.syncActiveThread();
      this.voicePhaseTimer = setTimeout(() => {
        if (this.voiceActive && this.screen === 'home') {
          this.voiceState = 'listening';
        }
      }, 3200);
    }, 850);
  }

  private toggleMic(): void {
    this.clearVoicePhaseTimer();
    this.micMuted = !this.micMuted;
    this.voiceState = this.micMuted ? 'muted' : 'listening';
    this.toast(this.micMuted ? '麦克风已静音' : '麦克风已开启');
  }

  private toggleSpeaker(): void {
    this.speakerOn = !this.speakerOn;
    this.toast(this.speakerOn ? '扬声器已开启' : '已切换为听筒模式');
  }

  private startRecordTimer(): void {
    this.stopRecordTimer();
    this.recordSeconds = 0;
    this.recordRunning = true;
    this.recordTimer = setInterval(() => {
      if (!this.recordRunning || this.screen !== 'recording') {
        return;
      }
      this.recordSeconds += 1;
      this.wavePhase = !this.wavePhase;
    }, 1000);
  }

  private stopRecordTimer(): void {
    if (this.recordTimer >= 0) {
      clearInterval(this.recordTimer);
      this.recordTimer = -1;
    }
    this.recordRunning = false;
  }

  private stopRecording(): void {
    this.recordSeconds = Math.max(1, this.recordSeconds);
    this.stopRecordTimer();
    this.recordText = DEMO_TRANSCRIPT;
    this.summaryItems = summarizeRecord(this.recordText);
    this.editingTranscript = false;
    this.screen = 'transcript';
    this.backStack = [];
    this.toast('录音已结束，转写完成');
  }

  private startTranscriptEdit(): void {
    this.editBuffer = this.recordText;
    this.editingTranscript = true;
  }

  private saveTranscript(): void {
    this.recordText = this.editBuffer.trim();
    this.summaryItems = summarizeRecord(this.recordText);
    this.editingTranscript = false;
    this.toast('转写文本已保存');
  }

  private copySummary(): void {
    let content: string = '录音总结：\n';
    this.summaryItems.forEach((item: string) => {
      content += `- ${item}\n`;
    });
    this.copyText(content);
  }

  private async copyText(text: string): Promise<void> {
    try {
      const data: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text);
      const systemPasteboard: pasteboard.SystemPasteboard =
        pasteboard.getSystemPasteboard();
      await systemPasteboard.setData(data);
      this.toast('已复制到剪贴板');
    } catch {
      this.toast('复制失败，请检查剪贴板权限');
    }
  }

  private saveApiSettings(checkOnly: boolean): void {
    const urlText: string = this.apiBaseUrl.trim();
    const modelText: string = this.apiModel.trim();
    if (!isValidApiConfig(urlText, modelText)) {
      this.toast('请检查 API 地址和模型名称');
      return;
    }
    this.apiBaseUrl = urlText;
    this.apiModel = modelText;
    if (checkOnly) {
      this.toast('地址和模型格式有效，未发起网络请求');
    } else {
      this.apiSaved = true;
      this.toast('配置已保存（当前会话）');
    }
  }

  private navigate(target: string): void {
    if (!this.navigationOrder.includes(target) &&
      target !== 'chat' && target !== 'login') {
      return;
    }
    if (target === this.screen) {
      return;
    }
    const previous: string = this.screen;
    if (this.voiceActive && target !== 'home') {
      this.stopVoiceSession();
    }
    if (this.screen !== 'home' || target !== 'home') {
      this.backStack = this.backStack.concat([this.screen]);
    }
    this.screen = target;
    this.onScreenChanged(previous, target);
  }

  private onScreenChanged(previous: string, target: string): void {
    if (previous === 'recording' && target !== 'recording') {
      this.stopRecordTimer();
    }
    if (target === 'recording') {
      this.startRecordTimer();
    }
    if (target === 'chat') {
      setTimeout(() => {
        this.chatScroller.scrollEdge(Edge.Bottom);
      }, 100);
    }
    if (target === 'apiSettings') {
      this.apiSaved = false;
    }
  }

  private back(): void {
    if (this.voiceActive) {
      this.endVoiceSession();
      return;
    }
    const previous: string = this.screen;
    if (this.screen === 'chat') {
      this.screen = 'history';
      this.backStack = [];
      this.onScreenChanged(previous, this.screen);
      return;
    }
    if (this.backStack.length > 0) {
      this.screen = this.backStack[this.backStack.length - 1];
      this.backStack = this.backStack.slice(0, this.backStack.length - 1);
    } else if (this.screen !== 'home') {
      this.screen = 'home';
    } else {
      return;
    }
    this.editingTranscript = false;
    this.onScreenChanged(previous, this.screen);
  }

  private swipeNavigate(direction: number): void {
    if (this.voiceActive) {
      this.stopVoiceSession();
    }
    const previous: string = this.screen;
    let index: number = this.navigationOrder.indexOf(this.screen);
    if (index < 0) {
      return;
    }
    index = (index + direction + this.navigationOrder.length) % this.navigationOrder.length;
    this.backStack = [];
    this.screen = this.navigationOrder[index];
    this.onScreenChanged(previous, this.screen);
  }

  private handlePan(event: GestureEvent): void {
    if (this.chatInputFocused || this.editingTranscript) {
      return;
    }
    const dx: number = event.offsetX;
    const dy: number = event.offsetY;
    if (Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0) {
      this.back();
      return;
    }
    if (Math.abs(dy) > 58 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      this.swipeNavigate(dy < 0 ? 1 : -1);
    }
  }

  private pageCode(): string {
    const index: number = this.navigationOrder.indexOf(this.screen);
    if (index < 0) {
      return this.screen === 'chat' ? '对话' : '流程';
    }
    return `${this.pad2(index + 1)} / ${this.pad2(this.navigationOrder.length)}`;
  }

  @Builder
  private NovaIcon(source: Resource, size: number, tint: string) {
    Image(source)
      .width(size)
      .height(size)
      .objectFit(ImageFit.Contain)
      .fillColor(tint)
  }

  @Builder
  private PageHeader(title: string) {
    Row() {
      Text(title)
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor(COLOR_TEXT)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Blank()
      Text(this.pageCode())
        .fontSize(9)
        .fontColor(COLOR_TEXT_MUTED)
    }
    .width('100%')
    .height(30)
    .padding({ left: 8, right: 8 })
  }

  @Builder
  private Waveform(phaseShift: number) {
    Row({ space: 3 }) {
      ForEach(this.waveBars, (barHeight: number, index: number) => {
        Column()
          .width(2)
          .height(Math.min(26, this.wavePhase ?
            Math.max(4, barHeight + ((index + phaseShift) % 3) * 3 - 2) :
            Math.max(4, barHeight - ((index + phaseShift) % 2) * 2)))
          .borderRadius(2)
          .backgroundColor(index % 4 === 0 ? COLOR_BLUE_BRIGHT : COLOR_BLUE)
          .opacity(0.55 + (index % 4) * 0.12)
          .animation({ duration: 850, curve: Curve.EaseInOut })
      }, (barHeight: number, index: number) => `${index}-${barHeight}`)
    }
    .height(28)
    .justifyContent(FlexAlign.Center)
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  private VoiceOrb(active: boolean) {
    Stack() {
      Circle()
        .width(active ? 82 : 104)
        .height(active ? 82 : 104)
        .fill(Color.Transparent)
        .stroke(active ? '#4A5BCBFF' : '#2F66BDFF')
        .strokeWidth(1)
        .scale({
          x: active ? (this.wavePhase ? 1.08 : 0.98) : 1,
          y: active ? (this.wavePhase ? 1.08 : 0.98) : 1
        })
        .animation({ duration: 1000, curve: Curve.EaseInOut })
      Circle()
        .width(active ? 66 : 92)
        .height(active ? 66 : 92)
        .fill(Color.Transparent)
        .stroke('#24FFFFFF')
        .strokeWidth(1)
        .opacity(0.7)
      Image($rawfile('orbs/voice-orb.png'))
        .width(active ? 56 : 78)
        .height(active ? 56 : 78)
        .objectFit(ImageFit.Contain)
        .shadow({
          radius: active ? 26 : 18,
          color: '#6B287CFF',
          offsetX: 0,
          offsetY: 0
        })
    }
    .width(active ? 86 : 112)
    .height(active ? 86 : 112)
  }

  @Builder
  private HomePage() {
    if (this.voiceActive) {
      Column({ space: 1 }) {
        Row({ space: 5 }) {
          Circle()
            .width(5)
            .height(5)
            .fill(this.micMuted ? COLOR_RECORD_RED : COLOR_MINT)
          Text(this.micMuted ? '麦克风已静音' :
            this.voiceState === 'thinking' ? '正在思考' :
              this.voiceState === 'speaking' ? '正在回答' : '正在聆听')
            .fontSize(10)
            .fontColor(COLOR_TEXT_SECONDARY)
          Text('·')
            .fontSize(9)
            .fontColor(COLOR_TEXT_MUTED)
          Text(formatDuration(this.voiceElapsed))
            .fontSize(10)
            .fontColor(COLOR_TEXT)
        }
        .height(18)

        Button({ type: ButtonType.Circle, stateEffect: true }) {
          this.VoiceOrb(true)
        }
        .width(86)
        .height(86)
        .backgroundColor(Color.Transparent)
        .onClick(() => this.simulateVoiceTurn())

        this.Waveform(1)

        if (this.voiceState === 'speaking') {
          Text('人工智能（AI）让计算机模拟人类智能，可用于医疗、教育、创作与日常办公。')
            .fontSize(10)
            .lineHeight(13)
            .fontColor(COLOR_TEXT_SECONDARY)
            .textAlign(TextAlign.Center)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .width('78%')
        } else {
          Text(this.micMuted ? '打开麦克风以继续对话' :
            this.voiceState === 'thinking' ? '正在整理回答' : '轻触光球，模拟说完一句话')
            .fontSize(10)
            .fontColor(COLOR_TEXT_MUTED)
            .maxLines(1)
        }

        Row({ space: 8 }) {
          Button({ type: ButtonType.Circle, stateEffect: true }) {
            this.NovaIcon($rawfile('icons/mic.svg'), 17,
              this.micMuted ? COLOR_RECORD_RED : COLOR_TEXT)
          }
          .width(38)
          .height(38)
          .backgroundColor(this.micMuted ? '#2AFF4262' : COLOR_SURFACE_RAISED)
          .border({ width: 1, color: this.micMuted ? '#66FF4262' : COLOR_BORDER })
        .accessibilityText(this.micMuted ? '打开麦克风' : '静音麦克风')
          .onClick(() => this.toggleMic())

          Button({ type: ButtonType.Circle, stateEffect: true }) {
            this.NovaIcon($rawfile('icons/close.svg'), 21, '#FFFFFF')
          }
          .width(42)
          .height(42)
          .linearGradient({
            angle: 135,
            colors: [['#FF5C75', 0.0], ['#E2294D', 1.0]]
          })
          .shadow({ radius: 12, color: '#55FF4262', offsetX: 0, offsetY: 0 })
          .accessibilityText('结束语音对话')
          .onClick(() => this.endVoiceSession())

          Button({ type: ButtonType.Circle, stateEffect: true }) {
            this.NovaIcon($rawfile('icons/volume.svg'), 17,
              this.speakerOn ? COLOR_TEXT : COLOR_TEXT_MUTED)
          }
          .width(38)
          .height(38)
          .backgroundColor(this.speakerOn ? '#22287CFF' : COLOR_SURFACE_RAISED)
          .border({ width: 1, color: this.speakerOn ? '#55287CFF' : COLOR_BORDER })
          .accessibilityText(this.speakerOn ? '关闭扬声器' : '打开扬声器')
          .onClick(() => this.toggleSpeaker())
        }
        .margin({ top: 2 })
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
    } else {
      Column({ space: 3 }) {
        Button({ type: ButtonType.Circle, stateEffect: true }) {
          this.VoiceOrb(false)
        }
        .width(112)
        .height(112)
        .backgroundColor(Color.Transparent)
        .accessibilityText('开始实时语音对话')
        .onClick(() => this.startVoiceSession())

        Text('开始实时对话')
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor(COLOR_TEXT)
          .margin({ top: 5 })
        this.Waveform(0)
        Text('轻触光球开始 · 上下滑动切换功能')
          .fontSize(9)
          .fontColor(COLOR_TEXT_MUTED)
          .textAlign(TextAlign.Center)
          .maxLines(2)
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
    }
  }

  @Builder
  private ChatPage() {
    Column({ space: 5 }) {
      Row({ space: 5 }) {
        Button({ type: ButtonType.Circle, stateEffect: true }) {
          this.NovaIcon($rawfile('icons/back.svg'), 17, COLOR_TEXT)
        }
        .width(32)
        .height(32)
        .backgroundColor(COLOR_SURFACE)
        .border({ width: 1, color: COLOR_BORDER })
        .accessibilityText('返回历史会话')
        .onClick(() => this.back())

        Column({ space: 1 }) {
          Text(this.activeThreadTitle)
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor(COLOR_TEXT)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text('文字对话')
            .fontSize(8)
            .fontColor(COLOR_TEXT_MUTED)
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)

        Button('清空')
          .height(30)
          .padding({ left: 6, right: 6 })
          .fontSize(9)
          .fontColor(COLOR_TEXT_SECONDARY)
          .backgroundColor('#1A1F29')
          .borderRadius(15)
          .onClick(() => this.clearChat())

        Button({ type: ButtonType.Circle, stateEffect: true }) {
          this.NovaIcon($rawfile('icons/mic.svg'), 16, COLOR_BLUE_BRIGHT)
        }
        .width(32)
        .height(32)
        .backgroundColor('#1C2B45')
        .border({ width: 1, color: '#3A4F73' })
        .accessibilityText('回到首页语音对话')
        .onClick(() => this.startVoiceSession())
      }
      .width('100%')
      .height(34)

      Scroll(this.chatScroller) {
        Column({ space: 6 }) {
          if (this.chatMessages.length === 0) {
            Column({ space: 6 }) {
              Image($rawfile('orbs/voice-orb.png'))
                .width(46)
                .height(46)
                .objectFit(ImageFit.Contain)
                .opacity(0.75)
              Text('开始新对话')
                .fontSize(13)
                .fontColor(COLOR_TEXT)
              Text('在下方输入框发送消息')
                .fontSize(9)
                .fontColor(COLOR_TEXT_MUTED)
            }
            .width('100%')
            .padding({ top: 18, bottom: 12 })
          } else {
            ForEach(this.chatMessages, (message: ChatMessage) => {
              Row() {
                if (message.role === 'user') {
                  Blank()
                  Text(message.text)
                    .fontSize(11)
                    .lineHeight(15)
                    .fontColor('#FFFFFF')
                    .padding({ left: 9, right: 9, top: 7, bottom: 7 })
                    .width('78%')
                    .borderRadius(13)
                    .linearGradient({
                      angle: 135,
                      colors: [['#2B7EFF', 0.0], ['#2465DA', 1.0]]
                    })
                } else {
                  Text(message.text)
                    .fontSize(11)
                    .lineHeight(15)
                    .fontColor(COLOR_TEXT)
                    .padding({ left: 9, right: 9, top: 7, bottom: 7 })
                    .width('82%')
                    .borderRadius(13)
                    .backgroundColor(COLOR_SURFACE_RAISED)
                    .border({ width: 1, color: COLOR_BORDER })
                  Blank()
                }
              }
              .width('100%')
            }, (message: ChatMessage, index: number) => `${index}-${message.role}-${message.text.length}`)
          }
        }
        .width('100%')
        .padding({ bottom: 4 })
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)

      Row({ space: 6 }) {
        TextInput({
          text: this.chatInput,
          placeholder: '输入消息...'
        })
          .layoutWeight(1)
          .height(34)
          .fontSize(11)
          .fontColor(COLOR_TEXT)
          .placeholderColor(COLOR_TEXT_MUTED)
          .caretColor(COLOR_BLUE_BRIGHT)
          .backgroundColor(COLOR_SURFACE)
          .borderRadius(17)
          .border({ width: 1, color: COLOR_BORDER })
          .padding({ left: 11, right: 11 })
          .enterKeyType(EnterKeyType.Send)
          .onFocus(() => {
            this.chatInputFocused = true;
          })
          .onBlur(() => {
            this.chatInputFocused = false;
          })
          .onChange((value: string) => {
            this.chatInput = value;
          })
          .onSubmit((_enterKey: EnterKeyType) => {
            this.sendChat();
          })

        Button({ type: ButtonType.Circle, stateEffect: true }) {
          this.NovaIcon($rawfile('icons/send.svg'), 17, '#FFFFFF')
        }
        .width(34)
        .height(34)
        .linearGradient({
          angle: 135,
          colors: [['#2E8BFF', 0.0], ['#2167DF', 1.0]]
        })
        .accessibilityText('发送消息')
        .onClick(() => this.sendChat())
      }
      .width('100%')
      .height(36)
      .padding({ left: 2, right: 2 })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private HistoryPage() {
    Column() {
      Row({ space: 6 }) {
        Text('对话历史')
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor(COLOR_TEXT)
        Blank()
        Button('+ 新对话')
          .height(28)
          .padding({ left: 8, right: 8 })
          .fontSize(9)
          .fontColor(COLOR_BLUE_BRIGHT)
          .backgroundColor('#1B2A43')
          .borderRadius(14)
          .onClick(() => this.newChat())
      }
      .width('100%')
      .height(34)

      Scroll(this.historyScroller) {
        Column({ space: 7 }) {
          ForEach(this.newestThreads(), (thread: ChatThread) => {
            Row({ space: 7 }) {
              Image($rawfile('icons/chat.svg'))
                .width(20)
                .height(20)
                .fillColor(thread.id === this.activeThreadId ? COLOR_BLUE_BRIGHT : COLOR_TEXT_SECONDARY)
              Text(thread.title)
                .fontSize(11)
                .fontColor(COLOR_TEXT)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .layoutWeight(1)
              this.NovaIcon($rawfile('icons/chevron.svg'), 14, COLOR_TEXT_MUTED)
            }
            .width('100%')
            .height(43)
            .padding({ left: 9, right: 9 })
            .borderRadius(14)
            .backgroundColor(thread.id === this.activeThreadId ? '#1A2942' : COLOR_SURFACE)
            .border({
              width: 1,
              color: thread.id === this.activeThreadId ? '#3B5C8E' : COLOR_BORDER
            })
            .onClick(() => {
              this.loadThread(thread.id);
              this.navigate('chat');
            })
          }, (thread: ChatThread) => thread.id)
        }
        .width('100%')
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)

      Text('选择记录继续交流')
        .fontSize(8)
        .fontColor(COLOR_TEXT_MUTED)
        .margin({ top: 3, bottom: 3 })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private RecordingPage() {
    Column() {
      this.PageHeader('独立录音')
      Column({ space: 4 }) {
        Text('正在录音')
          .fontSize(13)
          .fontColor(COLOR_TEXT)
        Button({ type: ButtonType.Circle, stateEffect: true }) {
          Stack() {
            Circle()
              .width(72)
              .height(72)
              .fill(Color.Transparent)
              .stroke('#66FF4262')
              .strokeWidth(1)
              .scale({
                x: this.wavePhase ? 1.08 : 0.96,
                y: this.wavePhase ? 1.08 : 0.96
              })
              .animation({ duration: 1000, curve: Curve.EaseInOut })
            Image($rawfile('orbs/recording-orb.png'))
              .width(64)
              .height(64)
              .objectFit(ImageFit.Contain)
              .shadow({ radius: 20, color: '#55FF4262', offsetX: 0, offsetY: 0 })
          }
          .width(78)
          .height(78)
        }
        .width(78)
        .height(78)
        .backgroundColor(Color.Transparent)
        .accessibilityText('结束录音')
        .onClick(() => this.stopRecording())

        Text(formatDuration(this.recordSeconds))
          .fontSize(21)
          .fontWeight(FontWeight.Medium)
          .fontColor(COLOR_TEXT)
        this.Waveform(2)
        Text('轻触结束录音')
          .fontSize(9)
          .fontColor(COLOR_TEXT_MUTED)
      }
      .width('100%')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private TranscriptPage() {
    Column() {
      Row({ space: 5 }) {
        Text('转文字')
          .fontSize(10)
          .fontColor(COLOR_TEXT)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
          .height(26)
          .backgroundColor('#1A263A')
          .borderRadius(9)
          .padding({ top: 7 })
        Text('总结')
          .fontSize(10)
          .fontColor(COLOR_TEXT_MUTED)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
          .height(26)
          .borderRadius(9)
          .padding({ top: 7 })
          .onClick(() => {
            this.summaryItems = summarizeRecord(this.recordText);
            this.navigate('summary');
          })
      }
      .width('100%')
      .height(28)
      .margin({ bottom: 2 })

      if (this.editingTranscript) {
        TextArea({
          text: this.editBuffer,
          placeholder: '编辑转写文本'
        })
          .width('100%')
          .height(84)
          .fontSize(11)
          .fontColor(COLOR_TEXT)
          .placeholderColor(COLOR_TEXT_MUTED)
          .backgroundColor('#0B0F15')
          .borderRadius(12)
          .border({ width: 1, color: COLOR_BORDER })
          .padding(9)
          .onFocus(() => {
            this.chatInputFocused = true;
          })
          .onBlur(() => {
            this.chatInputFocused = false;
          })
          .onChange((value: string) => {
            this.editBuffer = value;
          })
        Row({ space: 6 }) {
          Button('取消')
            .layoutWeight(1)
            .height(32)
            .fontSize(10)
            .fontColor(COLOR_TEXT_SECONDARY)
            .backgroundColor(COLOR_SURFACE)
            .borderRadius(17)
            .border({ width: 1, color: COLOR_BORDER })
            .onClick(() => {
              this.editingTranscript = false;
            })
          Button('保存修改')
            .layoutWeight(1)
            .height(32)
            .fontSize(10)
            .fontColor('#FFFFFF')
            .linearGradient({
              angle: 135,
              colors: [['#2C85FF', 0.0], ['#2466D9', 1.0]]
            })
            .borderRadius(17)
            .onClick(() => this.saveTranscript())
        }
        .width('100%')
        .margin({ top: 4 })
      } else {
        Scroll(this.transcriptScroller) {
          Text(this.recordText)
            .width('100%')
            .fontSize(11)
            .lineHeight(16)
            .fontColor(COLOR_TEXT)
            .padding(9)
            .borderRadius(12)
            .backgroundColor(COLOR_SURFACE)
            .border({ width: 1, color: COLOR_BORDER })
        }
        .width('100%')
        .height(82)
        .scrollBar(BarState.Off)

        Row({ space: 6 }) {
          Button() {
            Row({ space: 4 }) {
              this.NovaIcon($rawfile('icons/transcript.svg'), 14, COLOR_TEXT_SECONDARY)
              Text('编辑文本')
                .fontSize(10)
                .fontColor(COLOR_TEXT_SECONDARY)
            }
          }
          .layoutWeight(1)
          .height(32)
          .backgroundColor(COLOR_SURFACE)
          .borderRadius(17)
          .border({ width: 1, color: COLOR_BORDER })
          .onClick(() => this.startTranscriptEdit())

          Button('生成总结')
            .layoutWeight(1)
            .height(32)
            .fontSize(10)
            .fontColor('#FFFFFF')
            .linearGradient({
              angle: 135,
              colors: [['#2C85FF', 0.0], ['#2466D9', 1.0]]
            })
            .borderRadius(17)
            .onClick(() => {
              this.summaryItems = summarizeRecord(this.recordText);
              this.navigate('summary');
            })
        }
        .width('100%')
        .margin({ top: 4 })
      }

      Text('转写内容可编辑')
        .fontSize(8)
        .fontColor(COLOR_TEXT_MUTED)
        .margin({ top: 3 })
    }
    .width('100%')
    .height('100%')
    .padding({ top: 2 })
  }

  @Builder
  private SummaryPage() {
    Column() {
      Row({ space: 5 }) {
        Text('转文字')
          .fontSize(10)
          .fontColor(COLOR_TEXT_MUTED)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
          .height(28)
          .borderRadius(9)
          .padding({ top: 7 })
          .onClick(() => this.navigate('transcript'))
        Text('总结')
          .fontSize(10)
          .fontColor(COLOR_TEXT)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
          .height(28)
          .backgroundColor('#1A263A')
          .borderRadius(9)
          .padding({ top: 7 })
      }
      .width('100%')
      .height(30)
      .margin({ bottom: 4 })

      Text('录音总结')
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor(COLOR_TEXT)
        .width('100%')
        .margin({ bottom: 3 })

      Column({ space: 4 }) {
        ForEach(this.summaryItems, (item: string) => {
          Row({ space: 6 }) {
            Circle()
              .width(4)
              .height(4)
              .fill(COLOR_BLUE_BRIGHT)
            Text(item)
              .fontSize(11)
              .lineHeight(14)
              .fontColor(COLOR_TEXT)
              .maxLines(2)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .layoutWeight(1)
          }
          .width('100%')
          .padding({ top: 2, bottom: 2 })
          .alignItems(VerticalAlign.Center)
        }, (item: string, index: number) => `${index}-${item}`)
      }
      .width('100%')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Start)

      Row({ space: 6 }) {
        Button() {
          Row({ space: 4 }) {
            this.NovaIcon($rawfile('icons/copy.svg'), 14, COLOR_TEXT_SECONDARY)
            Text('复制摘要')
              .fontSize(10)
              .fontColor(COLOR_TEXT_SECONDARY)
          }
        }
        .layoutWeight(1)
        .height(34)
        .backgroundColor(COLOR_SURFACE)
        .borderRadius(17)
        .border({ width: 1, color: COLOR_BORDER })
        .onClick(() => this.copySummary())

        Button('重新录制')
          .layoutWeight(1)
          .height(34)
          .fontSize(10)
          .fontColor('#FFFFFF')
          .linearGradient({
            angle: 135,
            colors: [['#2C85FF', 0.0], ['#2466D9', 1.0]]
          })
          .borderRadius(17)
          .onClick(() => {
            this.screen = 'recording';
            this.backStack = [];
            this.startRecordTimer();
          })
      }
      .width('100%')
      .margin({ top: 4 })
    }
    .width('100%')
    .height('100%')
    .padding({ top: 2 })
  }

  @Builder
  private SettingsPage() {
    Column() {
      this.PageHeader('设置')
      Column({ space: 8 }) {
        Row({ space: 10 }) {
          Stack() {
            Circle()
              .width(32)
              .height(32)
              .fill('#1B3562')
            this.NovaIcon($rawfile('icons/api.svg'), 18, COLOR_BLUE_BRIGHT)
          }
          .width(32)
          .height(32)

          Column({ space: 2 }) {
            Text('API 设置')
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(COLOR_TEXT)
            Text('地址 · 密钥 · 模型')
              .fontSize(8)
              .fontColor(COLOR_TEXT_MUTED)
          }
          .alignItems(HorizontalAlign.Start)
          .layoutWeight(1)

          this.NovaIcon($rawfile('icons/chevron.svg'), 15, COLOR_TEXT_MUTED)
        }
        .width('100%')
        .height(54)
        .padding({ left: 10, right: 10 })
        .borderRadius(16)
        .backgroundColor(COLOR_SURFACE)
        .border({ width: 1, color: COLOR_BORDER })
        .onClick(() => this.navigate('apiSettings'))

        Text('原型仅校验表单，不发起真实请求')
          .fontSize(8)
          .fontColor(COLOR_TEXT_MUTED)
          .textAlign(TextAlign.Center)
      }
      .width('100%')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private ApiSettingsPage() {
    Column() {
      this.PageHeader('API 设置')
      Row({ space: 5 }) {
        Circle()
          .width(5)
          .height(5)
          .fill(this.apiSaved ? COLOR_MINT : '#FFB44A')
        Text(this.apiSaved ? '配置已保存（当前会话）' : '配置仅用于原型演示')
          .fontSize(8)
          .fontColor(this.apiSaved ? COLOR_MINT : '#D6A45B')
      }
      .width('100%')
      .height(18)

      Scroll(this.apiScroller) {
        Column({ space: 3 }) {
          Text('API 地址')
            .fontSize(8)
            .fontColor(COLOR_TEXT_SECONDARY)
            .width('100%')
          TextInput({
            text: this.apiBaseUrl,
            placeholder: 'https://api.openai.com/v1'
          })
            .width('100%')
            .height(34)
            .fontSize(9)
            .fontColor(COLOR_TEXT)
            .placeholderColor(COLOR_TEXT_MUTED)
            .backgroundColor('#0B0F15')
            .borderRadius(10)
            .border({ width: 1, color: COLOR_BORDER })
            .padding({ left: 8, right: 8 })
            .onChange((value: string) => {
              this.apiBaseUrl = value;
              this.apiSaved = false;
            })

          Text('API Key')
            .fontSize(8)
            .fontColor(COLOR_TEXT_SECONDARY)
            .width('100%')
            .margin({ top: 2 })
          TextInput({
            text: this.apiKey,
            placeholder: '输入 API Key（可留空）'
          })
            .width('100%')
            .height(34)
            .fontSize(9)
            .fontColor(COLOR_TEXT)
            .placeholderColor(COLOR_TEXT_MUTED)
            .type(InputType.Password)
            .backgroundColor('#0B0F15')
            .borderRadius(10)
            .border({ width: 1, color: COLOR_BORDER })
            .padding({ left: 8, right: 8 })
            .onChange((value: string) => {
              this.apiKey = value;
              this.apiSaved = false;
            })

          Text('模型名称')
            .fontSize(8)
            .fontColor(COLOR_TEXT_SECONDARY)
            .width('100%')
            .margin({ top: 2 })
          TextInput({
            text: this.apiModel,
            placeholder: 'gpt-4o-mini'
          })
            .width('100%')
            .height(34)
            .fontSize(9)
            .fontColor(COLOR_TEXT)
            .placeholderColor(COLOR_TEXT_MUTED)
            .backgroundColor('#0B0F15')
            .borderRadius(10)
            .border({ width: 1, color: COLOR_BORDER })
            .padding({ left: 8, right: 8 })
            .onChange((value: string) => {
              this.apiModel = value;
              this.apiSaved = false;
            })

          Row({ space: 5 }) {
            Button('检查配置')
              .layoutWeight(1)
              .height(32)
              .fontSize(9)
              .fontColor(COLOR_TEXT_SECONDARY)
              .backgroundColor(COLOR_SURFACE)
              .borderRadius(16)
              .border({ width: 1, color: COLOR_BORDER })
              .onClick(() => this.saveApiSettings(true))

            Button('保存配置')
              .layoutWeight(1)
              .height(32)
              .fontSize(9)
              .fontColor('#FFFFFF')
              .linearGradient({
                angle: 135,
                colors: [['#2C85FF', 0.0], ['#2466D9', 1.0]]
              })
              .borderRadius(16)
              .onClick(() => this.saveApiSettings(false))
          }
          .width('100%')
          .margin({ top: 5 })

          Text('不会上传密钥或内容。密钥仅保留在当前页面内存中，重启后清空。')
            .fontSize(7)
            .lineHeight(10)
            .fontColor(COLOR_TEXT_MUTED)
            .width('100%')
            .margin({ top: 3, bottom: 5 })
        }
        .width('100%')
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private ScreenRouter() {
    if (this.screen === 'home') {
      this.HomePage()
    } else if (this.screen === 'chat') {
      this.ChatPage()
    } else if (this.screen === 'recording') {
      this.RecordingPage()
    } else if (this.screen === 'transcript') {
      this.TranscriptPage()
    } else if (this.screen === 'summary') {
      this.SummaryPage()
    } else if (this.screen === 'history') {
      this.HistoryPage()
    } else if (this.screen === 'settings') {
      this.SettingsPage()
    } else {
      this.ApiSettingsPage()
    }
  }

  build() {
    Stack() {
      Circle()
        .width('100%')
        .height('100%')
        .fill(COLOR_BACKGROUND)
        .linearGradient({
          angle: 150,
          colors: [['#08111E', 0.0], ['#05070B', 0.55], ['#060911', 1.0]]
        })

      Column() {
        Text(this.clockText)
          .fontSize(10)
          .fontWeight(FontWeight.Medium)
          .fontColor('#D5E6FF')
          .height(24)
          .textAlign(TextAlign.Center)
        this.ScreenRouter()
      }
      .width('84%')
      .height('92%')
      .padding({ top: 3, bottom: 3 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(COLOR_BACKGROUND)
    .gesture(
      PanGesture({
        fingers: 1,
        direction: PanDirection.All,
        distance: 16
      })
        .onActionEnd((event: GestureEvent) => {
          this.handlePan(event);
        })
    )
  }
}
