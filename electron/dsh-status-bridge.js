#!/usr/bin/env node
/**
 * dsh-status-bridge.js — 鲸鱼娘桌宠 ⇄ DSH 原生事件流 状态桥
 *
 * 监听 DeepSeek Harness 的事件流，把细粒度会话事件折叠成桌宠动画状态：
 *   thinking → working → completed / error / idle
 *
 * ── 传输通道（实测结论，勿再推翻）──────────────────────────────
 * 当前 DSH Web 服务器（dsh web，默认 127.0.0.1:3080）的 /api 前缀路由在
 * client-connection 里对 GET /api/events.mux|host 硬编码返回 426 Upgrade
 * Required（HTTP 层不可达）；浏览器 GUI 实际走 WebSocket downlink
 * （ws://…/api/events.mux）。因此本桥默认 transport='auto'：
 *   1. 优先 WebSocket（Node ≥22 / Chromium / Electron 渲染进程可用）——
 *      实测 63ms 握手成功并收到 session/subscribed 帧；
 *   2. 回退 SSE（fetch + ReadableStream + TextDecoder，Node 18.19+ 可用）——
 *      完整实现 SSE 帧解析，兼容任何把 toFetchHandler 暴露为 HTTP SSE 的部署。
 *
 * ── 帧格式（与任务描述一致）──────────────────────────────────
 * 数据帧：data: {"type":"server-request","rpcId":"…","method":"<payload.type>","payload":{…}}\n\n
 * SSE 首帧可能是注释行 ": connected"，跳过；坏帧跳过不崩溃。
 * WS 消息即单帧 JSON（同一信封结构）。
 *
 * ── 用法 ──────────────────────────────────────────────────────
 * 独立验证：   node dsh-status-bridge.js            （默认连 127.0.0.1:3080）
 * 参数：       --base http://127.0.0.1:3080  --transport auto|websocket|sse
 *              --debounce 1500  --idle 8000  --debug
 * 程序接入：   const { createStatusBridge } = require('./dsh-status-bridge');
 * 浏览器：     <script src="./dsh-status-bridge.js"></script> → window.DshStatusBridge
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    if (require.main === module) module.exports.runCli();
  } else {
    root.DshStatusBridge = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 常量 ────────────────────────────────────────────────────
  const MUX_PATH = '/api/events.mux';
  const HOST_PATH = '/api/events.host';
  const STATE = {
    THINKING: 'thinking',   // 思考 → 歪头呼吸
    WORKING: 'working',     // 干活/打字
    COMPLETED: 'completed', // 完成 → 弹跳
    ERROR: 'error',         // 报错 → 抖动
    IDLE: 'idle'            // 待机
  };
  const STATE_ICON = {
    thinking: '🧠', working: '🛠', completed: '🎉', error: '⚠️', idle: '😴'
  };
  const DEFAULT_OPTIONS = {
    baseUrl: (typeof process !== 'undefined' && process.env && process.env.DSH_WEB_URL) || 'http://127.0.0.1:3080',
    transport: 'auto',      // 'auto' | 'websocket' | 'sse'
    debounceMs: 1500,       // 状态切换防抖：最后一次事件为准
    idleTimeoutMs: 8000,    // 超过该时长无任何事件 → idle
    reconnectBaseMs: 500,   // 指数退避基数
    reconnectMaxMs: 15000,  // 退避上限
    errorImmediate: true,   // error 不防抖，立即提交
    verbose: true,
    log: null               // 自定义日志 (level, msg)
  };

  const sleep = (ms, signal) => new Promise((resolve) => {
    if (signal && signal.aborted) return resolve();
    const done = () => { signal && signal.removeEventListener('abort', done); resolve(); };
    const t = setTimeout(done, ms);
    if (signal) signal.addEventListener('abort', done, { once: true });
  });

  function defaultLog(level, msg) {
    if (level === 'debug' && !(typeof process !== 'undefined' && process.env && process.env.DSH_BRIDGE_DEBUG)) return;
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    console.log(`[bridge ${ts}] ${msg}`);
  }

  // ── 事件 → 状态 分类（结构化字段，非关键词）──────────────────
  function classifyEnvelope(env) {
    if (!env || typeof env !== 'object') return null;
    const payload = env.payload && typeof env.payload === 'object' ? env.payload : null;
    if (!payload || typeof payload.type !== 'string') return null;
    const type = payload.type;
    const ctx = { source: type, sessionId: payload.sessionId || '' };

    // ── mux 流：细粒度会话事件 ──
    if (type === 'session/event') {
      const ev = payload.event;
      if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') return null;
      ctx.event = ev.type;
      const d = ev.data && typeof ev.data === 'object' ? ev.data : {};
      switch (ev.type) {
        case 'assistant/chunk': {
          // 心声：text-delta 增量文本（AI 实时输出的思考/回复文字）
          const delta = (d.chunk && d.chunk.type === 'text-delta' && typeof d.chunk.text === 'string')
            ? d.chunk.text : '';
          return { state: STATE.THINKING, info: { ...ctx, delta }, event: ev };
        }
        case 'assistant/message': {
          // 完整消息文本（content 里 text 块拼接）
          let full = '';
          const content = d.message && Array.isArray(d.message.content) ? d.message.content : [];
          for (const b of content) if (b && b.type === 'text' && typeof b.text === 'string') full += b.text;
          // token 用量（余额/每次消耗统计用）
          const usage = d.usage && typeof d.usage === 'object' ? d.usage : null;
          if (usage && !usage.model && d.model) usage.model = d.model;
          return { state: STATE.THINKING, info: { ...ctx, full, usage }, event: ev };
        }
        case 'tool/call':
        case 'turn/start':
        case 'step/start':
          return { state: STATE.WORKING, info: { ...ctx, toolName: d.name }, event: ev };
        case 'tool/result': {
          const isError = !!d.error || !!(d.message && d.message.content &&
            Array.isArray(d.message.content) && d.message.content.some((b) => b && b.isError));
          return { state: isError ? STATE.ERROR : STATE.COMPLETED,
            info: { ...ctx, toolName: d.name, hasError: isError }, event: ev };
        }
        case 'turn/end': {
          const kind = d.reason && d.reason.kind;
          const failed = kind === 'error' || kind === 'aborted' || kind === 'interrupted' ||
            kind === 'max-tokens' || kind === 'blocked';
          return { state: failed ? STATE.ERROR : STATE.COMPLETED,
            info: { ...ctx, reason: kind || 'completed' }, event: ev };
        }
        case 'step/end':
          return { state: STATE.COMPLETED, info: ctx, event: ev };
        case 'user/message':
        case 'command/run':
        case 'approval/asked':
        case 'todo/write':
          return { state: STATE.WORKING, info: ctx, event: ev };
        case 'command/done':
          return { state: d.kind === 'error' ? STATE.ERROR : STATE.COMPLETED, info: ctx, event: ev };
        default:
          return null; // title/compaction 等不驱动动画
      }
    }
    if (type === 'approval/requested') {
      return {
        state: STATE.WORKING,
        info: { ...ctx, toolName: payload.toolName, approvalId: payload.approvalId, reason: payload.reason },
        kind: 'approval'
      };
    }
    if (type === 'question/requested') {
      return {
        state: STATE.WORKING,
        info: { ...ctx, questions: payload.questions },
        kind: 'question'
      };
    }
    if (type === 'stream/error') {
      return { state: STATE.ERROR, info: { ...ctx, message: payload.error && payload.error.message } };
    }
    if (type === 'session/subscribed' || type === 'session/jobs' ||
        type === 'session/queue' || type === 'session/projection' ||
        type === 'approval/resolved' || type === 'question/resolved') {
      return null; // 确认/批量帧不驱动状态
    }

    // ── host 流：粗粒度兜底 ──
    if (type === 'host/session-status') {
      return { state: payload.running ? STATE.WORKING : STATE.IDLE, info: { ...ctx, running: payload.running } };
    }
    if (type === 'host/agent-error') {
      return { state: STATE.ERROR, info: { ...ctx, message: payload.message } };
    }
    return null; // session-added/removed、workspace-* 等
  }

  // ── 桥主体 ──────────────────────────────────────────────────
  class StatusBridge {
    constructor(options) {
      this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});
      this.baseUrl = String(this.options.baseUrl).replace(/\/+$/, '');
      this.transport = this.options.transport;
      this.currentState = STATE.IDLE;
      this._onStatus = null;
      this._onConnection = null;
      this._aborted = false;
      this._abortController = null;
      this._abortSignal = null;
      this._debounceTimer = null;
      this._idleTimer = null;
      this._pending = null;
      this._streams = {};
      this._log = this.options.log || defaultLog;
    }

    /** 注册状态回调：onStatus(state, info) — info 含 { source, sessionId, event?, toolName?, reason?, message?, prev, at } */
    onStatus(cb) { this._onStatus = cb; return this; }
    /** 注册心声回调：onThought(text, info) — AI 实时输出的文字（text-delta 增量 / assistant/message 全文），thinking 期间高频触发 */
    onThought(cb) { this._onThought = cb; return this; }
    /** 注册审批请求回调：onApproval(info) — AI 请求执行敏感操作（approval/requested） */
    onApproval(cb) { this._onApproval = cb; return this; }
    /** 注册问题询问回调：onQuestion(info) — AI 向用户提问（question/requested） */
    onQuestion(cb) { this._onQuestion = cb; return this; }
    /** 注册用量回调：onUsage(usage) — assistant/message 的 token 用量（input/cache/output/reasoning） */
    onUsage(cb) { this._onUsage = cb; return this; }
    /** 注册连接状态回调：onConnection(connected) */
    onConnection(cb) { this._onConnection = cb; return this; }

    start() {
      this._aborted = false;
      this._abortController = new AbortController();
      this._abortSignal = this._abortController.signal;
      this._run('mux');
      this._run('host');
      this._touch();
      return this;
    }

    async stop() {
      this._aborted = true;
      if (this._abortController) this._abortController.abort();
      for (const kind of Object.keys(this._streams)) {
        const s = this._streams[kind];
        try { if (s && typeof s.close === 'function') s.close(); } catch (e) { /* ignore */ }
      }
      this._streams = {};
      clearTimeout(this._debounceTimer);
      clearTimeout(this._idleTimer);
    }

    // ── 连接循环（每流独立，指数退避）──────────────────────────
    _run(kind) {
      const path = kind === 'host' ? HOST_PATH : MUX_PATH;
      (async () => {
        let attempt = 0;
        while (!this._aborted) {
          const result = await this._connectStream(kind, path);
          if (this._aborted) break;
          if (!result.ok) {
            const delay = Math.min(this.options.reconnectBaseMs * Math.pow(2, attempt), this.options.reconnectMaxMs);
            this._log('warn', `⚠ ${kind} 连接失败（${result.status}），${delay}ms 后重连（第 ${attempt + 1} 次）`);
            attempt++;
            await sleep(delay, this._abortSignal);
          } else {
            attempt = 0;
            const delay = this.options.reconnectBaseMs;
            this._log('warn', `⚠ ${kind} 流断开，${delay}ms 后重连`);
            await sleep(delay, this._abortSignal);
          }
        }
      })();
    }

    _pickTransport() {
      if (this.transport !== 'auto') return this.transport;
      // 当前 dsh web 服务器 HTTP GET 被 426 拦截，WS 是浏览器同款可用通道
      if (typeof globalThis.WebSocket === 'function') return 'websocket';
      if (typeof globalThis.fetch === 'function') return 'sse';
      return 'websocket';
    }

    _connectStream(kind, path) {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + path;
      const sseUrl = this.baseUrl + path;
      return this._pickTransport() === 'sse'
        ? this._connectSse(kind, sseUrl)
        : this._connectWs(kind, wsUrl);
    }

    _connectWs(kind, url) {
      return new Promise((resolve) => {
        let settled = false;
        let ws;
        try { ws = new WebSocket(url); } catch (e) {
          resolve({ ok: false, status: 'environment 不支持 WebSocket' });
          return;
        }
        this._streams[kind] = ws;
        const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
        ws.onopen = () => {
          this._log('info', `✅ SSE CONNECTED — ${kind === 'host' ? HOST_PATH : MUX_PATH} (transport: websocket)`);
          this._emitConnection(true);
          this._touch();
        };
        ws.onmessage = (ev) => {
          let text;
          try {
            if (typeof ev.data === 'string') text = ev.data;
            else if (ev.data instanceof ArrayBuffer) text = new TextDecoder().decode(ev.data);
            else if (ArrayBuffer.isView(ev.data)) text = new TextDecoder().decode(ev.data);
            else text = String(ev.data);
          } catch (e) { return; }
          this._onRaw(text, kind);
        };
        ws.onerror = () => { finish({ ok: false, status: 'websocket 错误' }); };
        ws.onclose = () => { finish({ ok: true, status: 'websocket 关闭' }); this._emitConnection(false); };
      });
    }

    async _connectSse(kind, url) {
      const signal = this._abortSignal;
      let res;
      try {
        res = await fetch(url, { signal, headers: { Accept: 'text/event-stream' }, cache: 'no-store' });
      } catch (e) {
        if (this._aborted) return { ok: false, status: 'aborted' };
        return { ok: false, status: String((e && e.message) || e) };
      }
      if (!res.ok) {
        const hint = res.status === 426
          ? '（该端点要求 WebSocket 通道，当前服务器不接受 HTTP GET — 试试 transport=websocket）' : '';
        this._log('warn', `⚠ SSE ${kind} HTTP ${res.status} ${hint}`);
        try { if (res.body) await res.body.cancel(); } catch (e) { /* ignore */ }
        return { ok: false, status: `HTTP ${res.status}` };
      }
      if (!res.body) return { ok: false, status: '无响应体' };
      this._log('info', `✅ SSE CONNECTED — ${kind === 'host' ? HOST_PATH : MUX_PATH} (transport: sse)`);
      this._emitConnection(true);
      this._touch();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!this._aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            // data: 前缀行合并；注释行（: connected）/空行跳过
            const data = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
            if (!data) continue;
            let env;
            try { env = JSON.parse(data); } catch (e) { this._log('warn', '⚠ 坏帧跳过（JSON 解析失败）'); continue; }
            this._handleEnvelope(env, kind);
          }
        }
      } catch (e) {
        // 流中断（含 AbortError）
      } finally {
        try { reader.releaseLock(); } catch (e) { /* ignore */ }
        this._emitConnection(false);
      }
      return { ok: true, status: 'sse 结束' };
    }

    /** WS 消息可能是单帧 JSON 或 SSE 格式，统一提取 data 行 */
    _onRaw(text, kind) {
      let data = '';
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith(':')) continue;
        if (t.startsWith('data:')) { data += t.slice(5).trim(); continue; }
        data = t;
        break;
      }
      if (!data) return;
      let env;
      try { env = JSON.parse(data); } catch (e) { this._log('warn', '⚠ 坏帧跳过（JSON 解析失败）'); return; }
      this._handleEnvelope(env, kind);
    }

    // ── 状态机：防抖 + idle 超时 ───────────────────────────────
    _handleEnvelope(env, kind) {
      this._touch(); // 任何事件都重置 idle 计时器
      const cls = classifyEnvelope(env);
      if (!cls) return;
      const { state, info, kind: clsKind } = cls;
      this._log('debug', `📡 ${kind}: ${info.event || info.source} → ${state}`);

      // 审批请求 / 问题询问：独立回调，实时通知动画层
      if (clsKind === 'approval' && this._onApproval) {
        try { this._onApproval(info); } catch (e) { /* 动画层异常不致命 */ }
      } else if (clsKind === 'question' && this._onQuestion) {
        try { this._onQuestion(info); } catch (e) { /* 动画层异常不致命 */ }
      }

      // token 用量：assistant/message 的 usage → 余额/消耗统计
      if (this._onUsage && info.usage) {
        try { this._onUsage(info.usage); } catch (e) { /* 统计层异常不致命 */ }
      }

      // 心声：AI 实时输出文字（text-delta 增量 / assistant/message 全文），
      // 实时回调，不参与状态防抖 —— 桌宠气泡可边想边显示
      if (this._onThought && (typeof info.delta === 'string' || typeof info.full === 'string')) {
        const text = info.delta || info.full || '';
        if (text.length > 0) {
          try { this._onThought(text, info); } catch (e) { /* 动画层异常不致命 */ }
        }
      }

      if (state === STATE.ERROR && this.options.errorImmediate) {
        // error 立即提交，不做防抖
        this._pending = null;
        clearTimeout(this._debounceTimer);
        this._commit(state, info);
        return;
      }
      // thinking 与 working 都是"忙碌"状态：AI 干活时两者高频交替
      // （assistant/chunk → thinking、step/start/tool/call → working），
      // 若互相立即打断会疯狂闪动。因此把它们视为"等价忙碌"：
      //  - 首次进入忙碌（从 idle/success/error 进来）→ 立即提交（响应感）
      //  - 忙碌内部 thinking↔working 交替 → 走防抖合并，最后一次为准
      const IS_BUSY = (s) => s === STATE.THINKING || s === STATE.WORKING;
      const busyNow = IS_BUSY(state);
      const busyPending = this._pending && IS_BUSY(this._pending.state);
      const busyCurrent = IS_BUSY(this.currentState);

      // 从非忙碌进入忙碌：立即提交，让鲸鱼娘马上反应
      if (busyNow && !busyCurrent && !busyPending) {
        this._pending = null;
        clearTimeout(this._debounceTimer);
        this._commit(state, info);
        return;
      }
      // 忙碌内切换（thinking↔working 交替）：走下方防抖合并，不立即打断
      // 状态切换防抖：1.5s，最后一次不同状态的事件为准。
      // 同状态事件（如思考期间连续的 assistant/chunk）不重置窗口，
      // 否则长思考会因窗口被无限重置而永远不提交 thinking。
      if (!this._pending || this._pending.state !== state) {
        this._pending = { state, info };
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this._pending = null;
          this._commit(state, info);
        }, this.options.debounceMs);
      }
      // 同状态事件：保留最早进入该状态的计时，只刷新 info
      else {
        this._pending.info = info;
      }
    }

    _commit(state, info) {
      const prev = this.currentState;
      if (state === prev) return;
      this.currentState = state;
      const merged = Object.assign({}, info || {}, { prev, at: Date.now() });
      this._log('info', `🐳 ${STATE_ICON[state] || ''} ${state} ← ${(info && (info.event || info.source)) || '?'}（prev: ${prev}）`);
      if (this._onStatus) {
        try { this._onStatus(state, merged); } catch (e) { /* 动画层异常不致命 */ }
      }
    }

    _touch() {
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => {
        if (this.currentState !== STATE.IDLE) {
          this._commit(STATE.IDLE, { source: 'idle-timeout', reason: `超过 ${this.options.idleTimeoutMs}ms 无事件` });
        }
      }, this.options.idleTimeoutMs);
    }

    _emitConnection(connected) {
      if (this._onConnection) {
        try { this._onConnection(connected); } catch (e) { /* ignore */ }
      }
    }
  }

  function createStatusBridge(options) {
    return new StatusBridge(options);
  }

  // ── 独立运行模式：node dsh-status-bridge.js ─────────────────
  function runCli() {
    const options = {};
    const argv = (typeof process !== 'undefined' && process.argv) ? process.argv.slice(2) : [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--base' || a === '--url') options.baseUrl = argv[++i];
      else if (a === '--transport') options.transport = argv[++i];
      else if (a === '--debounce') options.debounceMs = Number(argv[++i]);
      else if (a === '--idle') options.idleTimeoutMs = Number(argv[++i]);
      else if (a === '--debug') { if (typeof process !== 'undefined' && process.env) process.env.DSH_BRIDGE_DEBUG = '1'; }
    }
    const bridge = createStatusBridge(options);
    console.log(`[bridge] 🐳 DSH 状态桥启动 base=${bridge.baseUrl} transport=${bridge.transport} debounce=${bridge.options.debounceMs}ms idle=${bridge.options.idleTimeoutMs}ms`);
    bridge.start();
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      console.log('[bridge] 正在停止…');
      bridge.stop().then(() => process.exit(0));
    };
    if (typeof process !== 'undefined') {
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }
  }

  return { StatusBridge, createStatusBridge, runCli, classifyEnvelope, DEFAULT_OPTIONS, STATE, MUX_PATH, HOST_PATH };
});
