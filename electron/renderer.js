// 鲸鱼娘桌宠渲染逻辑（动态立绘引擎）
const ASSET_PREFIX = './assets';

// 皮肤：文件映射（由主进程按当前皮肤下发，{state: 相对路径}）
let SKIN_FILES = {};   // { idle: 'idle.gif', thinking: 'thinking.gif', coding: '...', ... }
let SKIN_VARIANTS = {}; // { eyesClosed: '...', mouthOpen: '...' }
let CURRENT_SKIN = 'default';

// 状态文本（皮肤无关）
const STATE_TEXT = {
  idle: 'Zzz… 鲸鱼娘在云朵上打盹~',
  thinking: '嗯… 正在认真思考这个问题…',
  coding: '噼里啪啦！正在帮你写代码！',
  success: '搞定啦！奖励一大碗白米饭！',
  error: '呜哇！出错了，快看看！'
};

const STATES = {
  idle: { label: '待机中', text: STATE_TEXT.idle, animation: 'float' },
  thinking: { label: '思考中', text: STATE_TEXT.thinking, animation: 'tilt' },
  coding: { label: '正在干活', text: STATE_TEXT.coding, animation: 'type' },
  success: { label: '完成任务', text: STATE_TEXT.success, animation: 'bounce' },
  error: { label: '遇到报错', text: STATE_TEXT.error, animation: 'shake' }
};

function skinFile(state) {
  return SKIN_FILES[state] ? `${ASSET_PREFIX}/${SKIN_FILES[state]}` : null;
}

function skinVariant(name) {
  return SKIN_VARIANTS[name] ? `${ASSET_PREFIX}/${SKIN_VARIANTS[name]}` : null;
}

// 默认皮肤回退：平铺文件（保持旧兼容）
const FALLBACK_FILES = {
  idle: 'idle.gif', thinking: 'thinking.gif', coding: 'coding.gif',
  success: 'success.gif', error: 'error.gif'
};
const FALLBACK_VARIANTS = {
  eyesClosed: 'maid-whale-idle-closed.jpg',
  mouthOpen: 'maid-whale-idle-openmouth.jpg'
};

const petImg = document.getElementById('pet-img');
const petWrapper = document.getElementById('pet-wrapper');
const speechText = document.getElementById('speech-text');
const speechBubble = document.getElementById('speech-bubble');
const statusLabel = document.getElementById('status-label');
const statusDot = document.querySelector('.badge .dot');
let currentState = 'idle';
let bubbleTimer = null;
let autoTimer = null;
let autoEnabled = false;
let dshConnected = false;
let microTimer = null;
let inMicro = false;
let dshLastStateAt = 0;
let dshIdleTimer = null;

// ── 待机三阶段：站立 → 准备睡觉 → 趴睡（一直待机渐进入睡）──
const IDLE_STAGE_MS = { stand: 30000, prep: 15000 }; // 站立 30s → 准备 15s → 趴睡
let idleStage = 'stand';     // stand | prep | sleep
let idleStageTimer = null;
// 趴睡动画图（新生成的趴睡 GIF）
const SLEEP_IMG = 'sleep.gif';
// 成功动画播放锁：success（吃米饭）完整播完前，禁止待机链切入趴睡/睡觉图
let successLock = false;

// 设置待机某个阶段，并启动下一阶段计时
function setIdleStage(stage) {
  clearTimeout(idleStageTimer);
  idleStageTimer = null;
  idleStage = stage;
  if (currentState !== 'idle' || successLock) return;
  if (stage === 'stand') {
    statusLabel.textContent = STATES.idle.label;
    setStateImg(`${ASSET_PREFIX}/${SKIN_FILES.idle || FALLBACK_FILES.idle}`);
    idleStageTimer = setTimeout(() => setIdleStage('prep'), IDLE_STAGE_MS.stand);
  } else if (stage === 'prep') {
    statusLabel.textContent = '准备睡觉…';
    setStateImg(`${ASSET_PREFIX}/sleeping.gif`);
    idleStageTimer = setTimeout(() => setIdleStage('sleep'), IDLE_STAGE_MS.prep);
  } else if (stage === 'sleep') {
    statusLabel.textContent = '睡着啦💤';
    setStateImg(`${ASSET_PREFIX}/${SLEEP_IMG}`);
  }
}

// 唤醒：回到站立待机（互动或 AI 开工时调用）
function wakeFromSleep() {
  if (idleStage !== 'stand') setIdleStage('stand');
}

// 彻底清掉待机三阶段计时（切到非待机状态时调用）
function clearIdleChain() {
  if (idleStageTimer) {
    clearTimeout(idleStageTimer);
    idleStageTimer = null;
  }
}

let thoughtBuf = '';
let thoughtTimer = null;
let alertTimer = null;
const DSH_HOLD_MS = 1200;
const DSH_IDLE_RETURN_MS = 5000;
// success.gif 每帧 80ms × 121 帧 ≈ 9.7s：任务完成的吃米饭动画要完整播完再回待机
const SUCCESS_GIF_MS = 9800;

function preloadVariants() {
  // 预加载所有状态图 + 表情变体
  for (const state of Object.keys(STATES)) {
    const f = skinFile(state);
    if (f) { const img = new Image(); img.src = f; }
  }
  for (const v of [skinVariant('eyesClosed'), skinVariant('mouthOpen')]) {
    if (v) { const img = new Image(); img.src = v; }
  }
}

// 换图带淡入缩放过渡
function setStateImg(file) {
  const img = new Image();
  img.onload = () => {
    petImg.style.transition = 'opacity 0.25s, transform 0.25s';
    petImg.style.opacity = '0';
    petImg.style.transform = 'scale(0.96)';
    requestAnimationFrame(() => {
      petImg.src = file;
      petImg.onload = () => {
        petImg.style.opacity = '1';
        petImg.style.transform = 'scale(1)';
        petImg.onload = null;
      };
    });
  };
  img.src = file;
}

function setState(state, opts = {}) {
  if (!STATES[state]) return;
  const prev = currentState;
  currentState = state;
  const cfg = STATES[state];
  const file = skinFile(state) || `${ASSET_PREFIX}/${FALLBACK_FILES[state] || ''}`;

  // 离开思考状态时彻底清掉心声气泡（文字 + 样式），避免切图那一帧残留整段文字
  if (state !== 'thinking') {
    thoughtBuf = '';
    if (thoughtTimer) { clearTimeout(thoughtTimer); thoughtTimer = null; }
    speechText.textContent = '';
    speechBubble.classList.remove('thought');
    speechBubble.classList.add('hidden');
  }
  // 切换状态时清除审批/提问提示
  if (alertTimer) { clearTimeout(alertTimer); alertTimer = null; }
  speechBubble.classList.remove('alert', 'approval', 'question');
  petWrapper.classList.remove('alert-anim');
  const handEl = document.getElementById('raise-hand');
  if (handEl) { handEl.classList.remove('show'); handEl.classList.add('hidden'); }

  // 中断微观表情动画
  inMicro = false;
  clearTimeout(microTimer);

  // 图片切换带过渡动画（淡入 + 缩放）
  setStateImg(file);

  statusLabel.textContent = cfg.label;
  statusDot.className = 'dot state-' + state;

  // 动画类切换
  petWrapper.classList.remove(
    'state-idle', 'state-thinking', 'state-coding', 'state-success', 'state-error'
  );
  petWrapper.classList.add('state-' + state);

  // 气泡（DSH 驱动时不打扰：只在手动/自动循环时显示）
  if (!opts.fromDsh) {
    showBubble(cfg.text);
  }

  // 启动眨眼 / 嘴型微观动画
  scheduleMicro();

  // DSH 触发的 success/error 在动画播完后自动回到待机，避免一直挂着。
  // success：等吃米饭 GIF 完整播完再回；error：短暂停留。
  if (dshIdleTimer) {
    clearTimeout(dshIdleTimer);
    dshIdleTimer = null;
  }
  if (opts.fromDsh && (state === 'success' || state === 'error')) {
    const holdMs = state === 'success' ? SUCCESS_GIF_MS : DSH_IDLE_RETURN_MS;
    dshIdleTimer = setTimeout(() => setState('idle', { fromDsh: true }), holdMs);
  }

  // 待机三阶段：进入 idle 启动站立→准备睡觉→趴睡链；
  // 切到其他状态则清空待机链（AI 开工等），避免干活时闪入趴睡图。
  // success 播放期间锁定，禁止待机链切入趴睡；结束回 idle 解锁。
  if (state === 'success') {
    successLock = true;
    clearIdleChain();
  } else {
    successLock = false;
    if (state === 'idle') {
      clearIdleChain();
      setIdleStage('stand');
    } else {
      clearIdleChain();
    }
  }
}

function showBubble(text) {
  speechText.textContent = text;
  speechBubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    speechBubble.classList.add('hidden');
  }, 2600);
}

// 微观表情调度：眨眼 + 张嘴呼吸，随机交替触发
function scheduleMicro() {
  clearTimeout(microTimer);
  inMicro = false;
  // 所有 GIF 状态（idle/thinking/coding/success）自带连续动作帧，
  // 不再用静态表情变体打断播放（否则 GIF 会和静态图来回闪）。
  if (['idle', 'thinking', 'coding', 'success'].includes(currentState)) return;

  const eyesClosed = skinVariant('eyesClosed');
  const mouthOpen = skinVariant('mouthOpen');
  const variant = { eyesClosed, mouthOpen };
  if (!variant || (!variant.eyesClosed && !variant.mouthOpen)) return;

  const next = 900 + Math.random() * 1800;
  microTimer = setTimeout(() => {
    const ec = skinVariant('eyesClosed');
    const mo = skinVariant('mouthOpen');
    if (!ec && !mo) return scheduleMicro();

    const candidates = [];
    if (ec) candidates.push({ kind: 'blink', src: ec, duration: 150 });
    if (mo) candidates.push({ kind: 'mouth', src: mo, duration: 360 });
    if (!candidates.length) return scheduleMicro();

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    inMicro = true;
    petImg.src = pick.src;

    microTimer = setTimeout(() => {
      const file = skinFile(currentState) || `${ASSET_PREFIX}/${FALLBACK_FILES[currentState] || ''}`;
      if (file) petImg.src = file;
      inMicro = false;
      scheduleMicro();
    }, pick.duration);
  }, next);
}

function toggleAutoCycle() {
  autoEnabled = !autoEnabled;
  if (autoEnabled) {
    const keys = Object.keys(STATES);
    let idx = keys.indexOf(currentState);
    autoTimer = setInterval(() => {
      idx = (idx + 1) % keys.length;
      setState(keys[idx]);
    }, 3000);
    statusLabel.textContent = '自动循环中';
  } else if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    statusLabel.textContent = STATES[currentState].label;
  }
}

// 摸头互动：气泡反应 + 轻微缩放（不切换图片，保持当前状态显示）
function playPat() {
  showBubble('摸摸头~ 好舒服~ 🐾');
  statusLabel.textContent = '摸头中';
  petWrapper.classList.remove('pat-anim');
  void petWrapper.offsetWidth;
  petWrapper.classList.add('pat-anim');
  setTimeout(() => {
    petWrapper.classList.remove('pat-anim');
    // 动画结束恢复当前状态的标签和颜色
    const cfg = STATES[currentState];
    if (cfg) statusLabel.textContent = cfg.label;
    statusDot.className = 'dot state-' + currentState;
  }, 800);
  // 养成：摸头
  window.petAPI.nurtureAction('pat');
}

// 单击互动（短按 = 喂饭/摸头随机，拖动 = 移动），双击 = 躲藏
let dragging = false;
let pointerDownAt = 0;
let moved = false;
let clickTimer = null;
const CLICK_MAX_MS = 260;
const CLICK_DELAY_MS = 280; // 等待双击判定

petWrapper.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  moved = false;
  pointerDownAt = Date.now();
  window.petAPI.dragStart(e.clientX, e.clientY);
});

window.addEventListener('mousemove', (e) => {
  if (dragging) {
    moved = true;
    window.petAPI.dragMove(e.clientX, e.clientY);
  }
});

window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  const wasDrag = moved || Date.now() - pointerDownAt > CLICK_MAX_MS;
  dragging = false;
  if (e.button === 0 && !wasDrag) {
    // 单击互动：固定摸头（喂饭通过面板/养成的按钮触发）
    playPat();
  }
  window.petAPI.dragEnd();
});

// 控制按钮
document.querySelectorAll('.controls button').forEach((btn) => {
  btn.addEventListener('click', () => {
    setState(btn.dataset.state);
  });
});

// 主进程事件：手动切状态 / 自动循环
window.petAPI.onStateChanged((state) => setState(state));
window.petAPI.onCycleToggled(() => toggleAutoCycle());

// 心声气泡：只取最近 20 字（10 字/行 × 2 行），气泡刚好装下，不截断不滚动
window.petAPI.onDshThought((text) => {
  if (currentState !== 'thinking') return;
  thoughtBuf = (thoughtBuf + text).slice(-20); // 固定最近 20 字 = 正好两行
  speechText.textContent = thoughtBuf;
  speechBubble.classList.add('thought');
  speechBubble.classList.remove('hidden');
  clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(() => {
    speechBubble.classList.add('hidden');
    speechBubble.classList.remove('thought');
    thoughtBuf = '';
  }, 4000);
});

// 完成汇报：本轮用了多少 token / 多少钱（两行：一行 token、一行钱）
window.petAPI.onDshUsageReport((report) => {
  if (!report) return;
  speechText.innerHTML = `本轮 ${report.tokens} tokens<br>${report.costStr}`;
  speechBubble.classList.remove('thought', 'alert', 'approval', 'question');
  speechBubble.classList.add('report');
  speechBubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    speechBubble.classList.add('hidden');
    speechBubble.classList.remove('report');
  }, 4000);
});

// DSH 状态驱动：AI 状态变化自动切换（思考/干活/完成/报错），并停掉手动自动循环
window.petAPI.onDshState((state) => {
  // success 停留保护：吃米饭动画要完整播完。若在 success 停留窗口内
  // 收到 idle（桥的 8s 无事件超时会把 success 推成 idle），忽略之，
  // 避免动画中途被打断。真干活（thinking/coding 等非 idle）仍可打断。
  if (state === 'idle' && currentState === 'success' && dshIdleTimer) {
    return;
  }
  if (autoEnabled) {
    autoEnabled = false;
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }
  // 离开 thinking 时立即清空心声（双保险，防切图帧残留整段文字）
  if (state !== 'thinking') {
    thoughtBuf = '';
    if (thoughtTimer) { clearTimeout(thoughtTimer); thoughtTimer = null; }
    speechText.textContent = '';
    speechBubble.classList.remove('thought', 'alert', 'approval', 'question');
    speechBubble.classList.add('hidden');
  }
  setState(state, { fromDsh: true });
});

// ===== DSH 状态桥（主进程驱动）=====
// 桥逻辑在项目根 dsh-status-bridge.js + electron/ws-client.js，运行于主进程：
// file:// 页面直连 DSH 会被 Origin 校验拒绝（403），因此主进程建连后经
// preload 的 dsh-state / dsh-status IPC 通道推送，渲染进程只消费状态。
// 桥状态 → 桌宠状态映射见主进程 main.js（DSH_STATE_TO_PET）。

// 审批请求 / 问题询问：鲸鱼娘举手提醒（醒目提示条 + 举手动画）
function showAlert(kind, text) {
  // 复用气泡，但换醒目标记样式
  speechBubble.classList.remove('thought');
  speechText.textContent = text;
  speechBubble.classList.add('alert', kind);
  speechBubble.classList.remove('hidden');
  // 举手图标：从身体右侧弹出（审批红圈 / 提问蓝圈）
  const hand = document.getElementById('raise-hand');
  if (hand) {
    hand.classList.remove('hidden', 'show');
    void hand.offsetWidth;
    hand.style.borderColor = kind === 'approval' ? '#ef4444' : '#3b82f6';
    hand.classList.add('show');
  }
  clearTimeout(alertTimer);
  clearTimeout(bubbleTimer);
  alertTimer = setTimeout(() => {
    speechBubble.classList.add('hidden');
    speechBubble.classList.remove('alert', 'approval', 'question');
    if (hand) { hand.classList.remove('show'); hand.classList.add('hidden'); }
  }, 6000);
  // 举手动画（轻轻上下浮动强调）
  petWrapper.classList.remove('alert-anim');
  void petWrapper.offsetWidth;
  petWrapper.classList.add('alert-anim');
}

window.petAPI.onDshApproval((info) => {
  logLine('approval 提示', info);
  showAlert('approval', `⚠️ 需要确认：AI 想执行「${info.toolName || '未知操作'}」${info.reason ? '（' + info.reason + '）' : ''}`);
});

window.petAPI.onDshQuestion((info) => {
  logLine('question 提示', info);
  const text = info.first ? info.first : (info.count ? `${info.count} 个问题` : 'AI 想问你问题');
  showAlert('question', `❓ AI 在问你：${text}`);
});

function logLine() { /* 渲染进程无日志文件，忽略 */ }

// ── 皮肤/主题应用 ──
// 主进程按当前皮肤下发文件映射：{ skin, files: {state: 相对路径}, variants: {...} }
function applyAppearance(app) {
  if (!app) return;
  if (app.skin && app.files) {
    CURRENT_SKIN = app.skin;
    SKIN_FILES = app.files || {};
    SKIN_VARIANTS = app.variants || {};
    preloadVariants();
    // 刷新当前状态图
    setState(currentState, { fromDsh: true });
  }
  if (app.theme) {
    applyTheme(app.theme);
  }
}

// 主题：给 <html> 加 data-theme 属性，CSS 变量切换配色
const THEME_COLORS = {
  light: { bubbleBg: 'rgba(255,255,255,0.95)', bubbleText: '#1e293b', bubbleBorder: 'rgba(59,130,246,0.25)', badgeBg: 'rgba(15,23,42,0.55)' },
  dark: { bubbleBg: 'rgba(30,41,59,0.95)', bubbleText: '#e2e8f0', bubbleBorder: 'rgba(96,165,250,0.35)', badgeBg: 'rgba(15,23,42,0.8)' },
  blue: { bubbleBg: 'rgba(239,246,255,0.96)', bubbleText: '#1e3a8a', bubbleBorder: 'rgba(59,130,246,0.5)', badgeBg: 'rgba(30,64,175,0.7)' },
  pink: { bubbleBg: 'rgba(255,241,242,0.96)', bubbleText: '#881337', bubbleBorder: 'rgba(244,114,182,0.5)', badgeBg: 'rgba(159,18,57,0.7)' }
};
function applyTheme(theme) {
  const c = THEME_COLORS[theme] || THEME_COLORS.light;
  const root = document.documentElement.style;
  root.setProperty('--bubble-bg', c.bubbleBg);
  root.setProperty('--bubble-text', c.bubbleText);
  root.setProperty('--bubble-border', c.bubbleBorder);
  root.setProperty('--badge-bg', c.badgeBg);
  document.documentElement.setAttribute('data-theme', theme);
}

// 监听外观变化（面板/设置切换时即时生效）
window.petAPI.onAppearance((app) => applyAppearance(app));

// ── 养成状态：饿/困提示 + 高好感冒爱心 ──
let lastNurtureMsgAt = 0;
window.petAPI.onNurture((snap) => {
  if (!snap) return;
  // 饿了/困了提示（防抖 30s，避免刷屏）
  const now = Date.now();
  if (now - lastNurtureMsgAt < 30000) return;
  if (snap.hungry) {
    lastNurtureMsgAt = now;
    showBubble('我饿啦~ 快喂我饭饭！🍚');
  } else if (snap.sleepy) {
    lastNurtureMsgAt = now;
    showBubble('好困… 你不陪我我睡觉觉了 💤');
  } else if (snap.affection >= 60 && Math.random() < 0.3) {
    lastNurtureMsgAt = now;
    showBubble('最喜欢主人了~ 💕');
  }
});

// 初始化
preloadVariants();
setState('idle');
// 主动获取初始皮肤/主题（替代被动推送，避免时序问题）
window.petAPI.getAppearance().then((app) => {
  if (app) applyAppearance(app);
}).catch(() => {});
