export function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function formatDuration(seconds: number): string {
  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
}

export function summarizeRecord(text: string): string[] {
  const source: string = text.replace(/\s+/g, ' ').trim();
  if (!source) {
    return ['没有可总结的内容', '请先录制并转写一段语音'];
  }
  if (source.includes('后续的市场计划') && source.includes('产品设计')) {
    return ['项目进展整体顺利', '产品设计方案已确认', '开发预计下周完成', '下一步推进市场推广'];
  }
  const parts: string[] = source.split(/[，。；;、.!！?？\n]+/)
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
  const result: string[] = parts.slice(0, 4);
  return result.length > 0 ? result : ['已完成录音转写', '可继续编辑文本或重新录制'];
}

export function buildDemoReply(messageText: string): string {
  if (/健身|运动|训练/.test(messageText)) {
    return '可以从每周 3 次力量训练和 2 次轻有氧开始，结合热身、恢复与循序渐进的强度安排。';
  }
  if (/会议|总结|项目/.test(messageText)) {
    return '我会把讨论重点整理为项目进展、已确认事项、待办任务和下一步安排，方便后续跟进。';
  }
  if (/人工智能|AI|模型/.test(messageText)) {
    return '人工智能通过机器学习等方法处理信息、理解语言并辅助完成任务。你可以继续指定应用场景，我会进一步展开。';
  }
  return '当然可以。我会先整理核心信息，再给出清晰、可执行的建议。';
}

export function isValidApiConfig(urlText: string, modelText: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(urlText.trim()) && modelText.trim().length > 0;
}
