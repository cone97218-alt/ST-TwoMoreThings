// 运行与提示词日志记录器：记录模型请求、原始输出以及正文回流注入内容。

const MAX_LOGS = 30;

class Logger {
  constructor() {
    this.logs = [];
    this.lastBackflowPrompt = '';
    this.subscribers = new Set();
  }

  addLog({ title = '模型交互', systemPrompt = '', messages = [], entries = [], reply = '', error = null }) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const id = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id,
      time: timeStr,
      timestamp: now.getTime(),
      title,
      systemPrompt: String(systemPrompt || ''),
      messages: Array.isArray(messages) ? messages : [],
      entries: Array.isArray(entries) && entries.length ? entries : (Array.isArray(messages) ? messages : []),
      reply: reply != null ? String(reply) : '',
      error: error != null ? String(error) : null,
    };
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.length = MAX_LOGS;
    }
    this.notify();
    return entry;
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.notify();
  }

  setLastBackflowPrompt(prompt) {
    this.lastBackflowPrompt = String(prompt || '');
    this.notify();
  }

  getLastBackflowPrompt() {
    return this.lastBackflowPrompt;
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  notify() {
    for (const sub of this.subscribers) {
      try {
        sub();
      } catch {}
    }
  }
}

export const logger = new Logger();

export function detectRequestTitle(request) {
  if (request?.label) return request.label;
  const sys = request?.system || '';
  if (sys.includes('回应用户在ainstgram') || sys.includes('动态下的留言') || sys.includes('动态评论')) return '动态互动回复';
  if (sys.includes('ainstgram') || sys.includes('日常动态') || sys.includes('动态发布')) return 'Ainstagram 动态生成';
  if (sys.includes('世界观与民俗构想助手')) return 'AI 节日构想';
  if (sys.includes('日常日程推演助手')) return 'AI 日程推演';
  if (sys.includes('把手机照片描述转为绘图提示') || sys.includes('照片转绘图描述')) return '生图描述生成';
  if (sys.includes('公众论坛') || sys.includes('公众讨论区')) return 'BBS 论坛生成';
  if (sys.includes('群里的聊天') || sys.includes('group.members')) return '群聊多角色续写';
  if (sys.includes('你在手机中扮演指定联系人')) return '私聊短信生成';
  if (sys.includes('从所给角色卡、世界书或人物简要资料整理')) return '联系人风格提炼';
  if (sys.includes('通讯录')) return '通讯录整理';
  if (sys.includes('字以内的手机参考') || sys.includes('手机参考')) return '正文回流摘要';
  if (sys.includes('短信')) return '私聊短信生成';
  return '模型交互';
}
