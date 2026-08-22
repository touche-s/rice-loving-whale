/**
 * dsh-maid-whale-pet — DSH client 插件（浏览器端，自包含单文件）
 *
 * 🐳 鲸鱼娘桌宠网页版：在 DSH Web UI 右下角浮动一只鲸鱼娘，
 * 跟随 Agent 状态切换表情，实时显示 AI 思考心声，审批/提问时举手提醒。
 *
 * 事件来源：注入的 connection 服务 → api.subscribeEnvelopes 观察信封流
 * （官方 observer 模式：client-runtime 已用 connection.start 建立 mux/host 流，
 *  所有信封经 api.onEnvelope 批量缓冲，本插件订阅同一批帧，不独占不冲突）。
 */
window.__ModuleLoader__.load({
  id: "dsh-maid-whale-pet",
  factory: (require) => {
    // 诊断标记：bundle 是否被浏览器执行
    try { console.log('[maid-whale-pet] ✅ client bundle factory 执行'); } catch (e) {}
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // ══════════════════════════════════════════════════════════
    // 状态机（内联：DSH client 插件为单文件 bundle）
    // ══════════════════════════════════════════════════════════
    const STATE = {
      THINKING: 'thinking',
      WORKING: 'working',
      COMPLETED: 'completed',
      ERROR: 'error',
      IDLE: 'idle'
    };

    function classifyFrame(payload) {
      if (!payload || typeof payload !== 'object') return null;
      const type = payload.type;
      const ctx = { source: type, sessionId: payload.sessionId || '' };

      if (type === 'session/event') {
        const ev = payload.event;
        if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') return null;
        ctx.event = ev.type;
        const d = ev.data && typeof ev.data === 'object' ? ev.data : {};
        switch (ev.type) {
          case 'assistant/chunk': {
            const delta = (d.chunk && d.chunk.type === 'text-delta' && typeof d.chunk.text === 'string') ? d.chunk.text : '';
            return { state: STATE.THINKING, info: { ...ctx, delta }, event: ev };
          }
          case 'assistant/message': {
            let full = '';
            const content = d.message && Array.isArray(d.message.content) ? d.message.content : [];
            for (const b of content) if (b && b.type === 'text' && typeof b.text === 'string') full += b.text;
            return { state: STATE.THINKING, info: { ...ctx, full }, event: ev };
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
            return null;
        }
      }
      if (type === 'approval/requested') {
        return { state: STATE.WORKING, info: { ...ctx, toolName: payload.toolName, approvalId: payload.approvalId, reason: payload.reason }, kind: 'approval' };
      }
      if (type === 'question/requested') {
        return { state: STATE.WORKING, info: { ...ctx, questions: payload.questions }, kind: 'question' };
      }
      if (type === 'stream/error') {
        return { state: STATE.ERROR, info: { ...ctx, message: payload.error && payload.error.message } };
      }
      if (type === 'host/session-status') {
        return { state: payload.running ? STATE.WORKING : STATE.IDLE, info: { ...ctx, running: payload.running } };
      }
      if (type === 'host/agent-error') {
        return { state: STATE.ERROR, info: { ...ctx, message: payload.message } };
      }
      return null;
    }

    class PetStateMachine {
      constructor(options = {}) {
        this.options = Object.assign({
          debounceMs: 1500,
          idleTimeoutMs: 8000,
          errorImmediate: true
        }, options);
        this.currentState = STATE.IDLE;
        this._pending = null;
        this._debounceTimer = null;
        this._idleTimer = null;
        this._onStatus = null;
        this._onThought = null;
        this._onApproval = null;
        this._onQuestion = null;
        this._started = false;
      }
      onStatus(cb) { this._onStatus = cb; return this; }
      onThought(cb) { this._onThought = cb; return this; }
      onApproval(cb) { this._onApproval = cb; return this; }
      onQuestion(cb) { this._onQuestion = cb; return this; }
      start() {
        if (this._started) return;
        this._started = true;
        this._touch();
      }
      stop() {
        this._started = false;
        clearTimeout(this._debounceTimer);
        clearTimeout(this._idleTimer);
      }
      handleFrame(payload) {
        if (!this._started) return;
        this._touch();
        const cls = classifyFrame(payload);
        if (!cls) return;
        const { state, info, kind } = cls;

        if (kind === 'approval' && this._onApproval) {
          try { this._onApproval(info); } catch (e) {}
        } else if (kind === 'question' && this._onQuestion) {
          try { this._onQuestion(info); } catch (e) {}
        }
        if (this._onThought && (typeof info.delta === 'string' || typeof info.full === 'string')) {
          const text = info.delta || info.full || '';
          if (text.length > 0) {
            try { this._onThought(text, info); } catch (e) {}
          }
        }
        if (state === STATE.ERROR && this.options.errorImmediate) {
          this._pending = null;
          clearTimeout(this._debounceTimer);
          this._commit(state, info);
          return;
        }
        if (!this._pending || this._pending.state !== state) {
          this._pending = { state, info };
          clearTimeout(this._debounceTimer);
          this._debounceTimer = setTimeout(() => {
            this._pending = null;
            this._commit(state, info);
          }, this.options.debounceMs);
        } else {
          this._pending.info = info;
        }
      }
      _commit(state, info) {
        const prev = this.currentState;
        if (state === prev) return;
        this.currentState = state;
        const merged = Object.assign({}, info || {}, { prev, at: Date.now() });
        if (this._onStatus) {
          try { this._onStatus(state, merged); } catch (e) {}
        }
      }
      _touch() {
        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
          if (this.currentState !== STATE.IDLE) {
            this._commit(STATE.IDLE, { source: 'idle-timeout' });
          }
        }, this.options.idleTimeoutMs);
      }
    }

    // ══════════════════════════════════════════════════════════
    // 插件主体
    // ══════════════════════════════════════════════════════════
    const name = "maid-whale-pet";
    const inject = ["connection"];

    const PET_TEXT = {
      thinking: '🤔 思考中…',
      working: '💻 干活中…',
      completed: '🎉 完成！',
      error: '💥 出错了',
      idle: '🐳 待机中…'
    };
    const PET_FACE = {
      thinking: '🤔', working: '💻', completed: '🎉', error: '💢', idle: '🐳'
    };

    function createPetEl() {
      const el = document.createElement('div');
      el.setAttribute('data-plugin', name);
      el.id = 'maid-whale-pet-root';
      el.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'width:110px',
        'font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
        'pointer-events:none',
        'user-select:none',
        'transform-origin:bottom right'
      ].join(';');
      el.innerHTML =
        '<div id="maid-whale-pet-bubble" style="' +
          'position:relative;margin-bottom:6px;background:rgba(255,255,255,0.96);' +
          'border-radius:10px;padding:5px 9px;font-size:11px;line-height:1.4;color:#1e293b;' +
          'box-shadow:0 2px 10px rgba(0,0,0,0.15);border:1px solid rgba(59,130,246,0.25);' +
          'opacity:0;transition:opacity .25s;word-break:break-word;' +
          'max-width:110px;' +
        '"><span id="maid-whale-pet-text"></span></div>' +
        '<div id="maid-whale-pet-body" style="' +
          'width:88px;height:88px;border-radius:50%;background:linear-gradient(160deg,#bfdbfe,#60a5fa);' +
          'display:flex;align-items:center;justify-content:center;font-size:50px;' +
          'box-shadow:0 4px 16px rgba(37,99,235,0.35);transition:transform .3s;' +
          'margin-left:11px;' +
        '">🐳</div>' +
        '<div id="maid-whale-pet-badge" style="' +
          'margin-top:4px;text-align:center;font-size:10px;color:#475569;' +
          'background:rgba(255,255,255,0.85);border-radius:999px;padding:2px 8px;' +
        '">待机中</div>';
      return el;
    }

    function apply(ctx) {
      try { console.log('[maid-whale-pet] apply 被调用, connection=', typeof ctx.connection, ctx.connection ? !!ctx.connection.api : 'N/A'); } catch (e) {}
      const machine = new PetStateMachine({ debounceMs: 1500, idleTimeoutMs: 8000 });

      // ── UI 挂载（shadow DOM 隔离 + 挂到 body，免疫宿主 CSS 与 DOM 协调）──
      let ui = null;
      let bubbleTimer = null;
      let thoughtBuf = '';
      let uiObserver = null;
      function ensureUi() {
        if (ui && ui.host && ui.host.isConnected) return true;
        if (typeof document === 'undefined' || !document.body) return false;
        try {
          const host = document.createElement('div');
          host.id = 'maid-whale-pet-root';
          const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
          const petEl = createPetEl();
          shadow.appendChild(petEl);
          document.body.appendChild(host);
          ui = { petEl, host, textEl: petEl.querySelector('#maid-whale-pet-text'), bodyEl: petEl.querySelector('#maid-whale-pet-body'), bubbleEl: petEl.querySelector('#maid-whale-pet-bubble'), badgeEl: petEl.querySelector('#maid-whale-pet-badge') };
          try { console.log('[maid-whale-pet] ✅ UI 已挂载(body+shadow), connected=', host.isConnected, 'shadow=', !!host.shadowRoot); } catch (e) {}
          if (!uiObserver && typeof MutationObserver === 'function') {
            uiObserver = new MutationObserver(() => {
              if (ui && ui.host && !ui.host.isConnected) {
                try { console.log('[maid-whale-pet] 🔄 UI 被移除，自动重生'); } catch (e) {}
                ui = null;
                ensureUi();
              }
            });
            uiObserver.observe(document.body, { childList: true, subtree: true });
          }
          return true;
        } catch (e) {
          try { console.log('[maid-whale-pet] ❌ UI 挂载异常:', e && e.message || e); } catch (e2) {}
          return false;
        }
      }
      function showBubble(text, keepMs, wide) {
        if (!ui) return;
        ui.textEl.textContent = text;
        ui.bubbleEl.style.width = wide ? '148px' : 'auto';
        ui.bubbleEl.style.opacity = '1';
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => { if (ui) ui.bubbleEl.style.opacity = '0'; }, keepMs || 2600);
      }

      // ── 状态 → UI ──
      machine.onStatus((state, info) => {
        if (!ui) return;
        ui.badgeEl.textContent = PET_TEXT[state] || state;
        ui.bodyEl.textContent = PET_FACE[state] || '🐳';
        ui.bodyEl.style.transform = state === 'completed' ? 'scale(1.12)' : state === 'error' ? 'rotate(-6deg)' : 'scale(1)';
        if (state === 'idle') showBubble('Zzz… 待机中', 2000);
        if (state === 'completed') showBubble('搞定啦！🎉', 2600);
        if (state === 'error') showBubble('呜哇！出错了！', 3000);
        if (state !== 'thinking') thoughtBuf = '';
      });

      machine.onThought((text) => {
        if (!ui || machine.currentState !== STATE.THINKING) return;
        thoughtBuf = (thoughtBuf + text).slice(-20);
        ui.textEl.textContent = thoughtBuf;
        ui.bubbleEl.style.width = '148px';
        ui.bubbleEl.style.opacity = '1';
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => { if (ui) { ui.bubbleEl.style.opacity = '0'; thoughtBuf = ''; } }, 4000);
      });

      machine.onApproval((info) => {
        showBubble(`⚠️ 需要确认：${info.toolName || '未知操作'}${info.reason ? '（' + info.reason + '）' : ''}`, 6000, true);
        if (ui) ui.bodyEl.textContent = '✋';
      });
      machine.onQuestion((info) => {
        const q = (info.questions && info.questions[0] && info.questions[0].question) || 'AI 想问你问题';
        showBubble(`❓ AI 在问你：${q}`, 6000, true);
        if (ui) ui.bodyEl.textContent = '✋';
      });

      // ── 订阅信封流（官方 observer 模式，不独占）──
      let unsubscribe = null;
      function subscribeFrames() {
        const connection = ctx.connection;
        if (unsubscribe || !connection || !connection.api || typeof connection.api.subscribeEnvelopes !== 'function') return false;
        try {
          unsubscribe = connection.api.subscribeEnvelopes((batch) => {
            for (const envelope of batch) {
              if (envelope && envelope.payload && envelope.payload.type) {
                machine.handleFrame(envelope.payload);
              }
            }
          });
          return true;
        } catch (e) {
          try { ctx.logger?.warn?.('maid-whale-pet: 信封订阅失败: ' + (e && e.message || e)); } catch (e2) {}
          return false;
        }
      }

      // ── 启动：DOM + connection 就绪后挂载/订阅，带重试兜底 ──
      machine.start();

      // ── 心跳诊断（提前注册，确保一定输出）──
      let heartbeat = 0;
      const heartbeatTimer = setInterval(() => {
        heartbeat++;
        if (heartbeat > 15) { clearInterval(heartbeatTimer); return; }
        try {
          const connected = ui && ui.host && ui.host.isConnected;
          const inDoc = ui && ui.host && document.documentElement.contains(ui.host);
          if (heartbeat <= 3 || !connected) {
            console.log('[maid-whale-pet] ❤️ 心跳#' + heartbeat, 'host存在=', !!ui, 'connected=', !!connected, 'inDoc=', !!inDoc);
          }
        } catch (e) {}
      }, 1000);

      ensureUi();
      subscribeFrames();
      const retryTimer = setTimeout(() => {
        ensureUi();
        subscribeFrames();
      }, 3000);
      const retryTimer2 = setTimeout(() => {
        ensureUi();
        subscribeFrames();
      }, 10000);

      const dispose = () => {
        machine.stop();
        try { unsubscribe && unsubscribe(); } catch (e) {}
        clearTimeout(bubbleTimer);
        clearTimeout(retryTimer);
        clearTimeout(retryTimer2);
        clearInterval(heartbeatTimer);
        if (uiObserver) { try { uiObserver.disconnect(); } catch (e) {} uiObserver = null; }
        if (ui && ui.host && ui.host.remove) ui.host.remove();
        ui = null;
      };
      ctx.effect(dispose);
    }

    module.exports = { apply, inject, name };
    return module.exports;
  }
});
