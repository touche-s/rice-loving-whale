// 面板渲染逻辑（Docker Desktop 风格侧边栏）
const THEMES = [
  { id: 'light', label: '亮色', color: '#ffffff', fg: '#1e293b' },
  { id: 'dark', label: '暗色', color: '#0f172a', fg: '#e2e8f0' },
  { id: 'blue', label: '蓝色', color: '#eff6ff', fg: '#1e3a8a' },
  { id: 'pink', label: '粉色', color: '#fff1f2', fg: '#881337' }
];
const STAGE_EMOJI = { baby: '🐣', teen: '🐬', adult: '🐋' };
const STAGE_DESC = {
  baby: '刚出生的鲸鱼宝宝，陪 AI 干活慢慢长大',
  teen: '长成小鲸娘了，越来越有精神',
  adult: '成熟的大鲸娘，最可靠的伙伴！'
};
const STATE_LABEL = { idle: '待机中', thinking: '思考中', coding: '干活中', success: '完成了', error: '报错中' };
const FACE = { idle: '🐳', thinking: '🤔', coding: '💻', success: '🎉', error: '💢' };

let currentSkin = 'default';
let currentTheme = 'light';
let currentPetState = 'idle';

// ── 导航切换 ──
function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => { v.style.display = v.dataset.view === view ? '' : 'none'; });
}

async function init() {
  const [state, skins] = await Promise.all([window.panelAPI.getState(), window.panelAPI.getSkins()]);
  currentSkin = state.skin || 'default';
  currentTheme = state.theme || 'light';
  currentPetState = state.currentState || 'idle';

  // 导航事件
  document.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));

  // 渲染各视图
  renderSkins(skins);
  renderThemes();
  renderConn(state);
  renderNurture(await window.panelAPI.getNurture());
  renderUsage(await window.panelAPI.getUsage());
  renderPet();
  await initPetName();

  // 对话 + 设置
  initChat();
  await loadChatHistory();
  await initSettingsValues();
  initSettings();

  // 实时监听
  window.panelAPI.onLog((e) => appendLog(e));
  window.panelAPI.onNurture((snap) => renderNurture(snap));
  window.panelAPI.onUsage((snap) => renderUsage(snap));

  // 按钮
  document.getElementById('btn-feed').addEventListener('click', async () => { renderNurture(await window.panelAPI.nurtureAction('feed')); renderPet(); });
  document.getElementById('btn-pat').addEventListener('click', async () => { renderNurture(await window.panelAPI.nurtureAction('pat')); });
  document.getElementById('btn-refresh-balance').addEventListener('click', async () => {
    document.getElementById('btn-refresh-balance').textContent = '🔄 刷新中…';
    const b = await window.panelAPI.refreshBalance();
    renderBalance(b);
    document.getElementById('btn-refresh-balance').textContent = '🔄 刷新余额';
  });

  // 初始日志
  (await window.panelAPI.getLog()).forEach((e) => appendLog(e));
}

// ── 宠物视图 ──
const PET_IMG = {
  idle: 'maid-whale-idle.jpg',
  thinking: 'maid-whale-thinking.jpg',
  coding: 'maid-whale-coding.jpg',
  success: 'maid-whale-success.jpg',
  error: 'maid-whale-error.jpg'
};
function renderPet() {
  document.getElementById('pet-state').textContent = STATE_LABEL[currentPetState] || currentPetState;
  const img = document.querySelector('#pet-avatar img');
  if (img) img.src = './assets/' + (PET_IMG[currentPetState] || 'maid-whale-idle.jpg');
}

// 宠物名字：显示 + 改名
async function initPetName() {
  try {
    const cfg = await window.panelAPI.getConfig();
    const nameEl = document.getElementById('pet-name');
    if (cfg && cfg.petName) nameEl.textContent = cfg.petName;
  } catch (e) {}
  const editBtn = document.getElementById('btn-rename');
  const nameEl = document.getElementById('pet-name');
  editBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'name-input';
    input.value = nameEl.textContent;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = async () => {
      const newName = input.value.trim() || '鲸鱼娘';
      await window.panelAPI.saveConfig({ petName: newName });
      nameEl.textContent = newName;
      input.replaceWith(nameEl);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.blur(); }
    });
  });
}

// ── 连接状态 ──
function renderConn(state) {
  const pill = document.getElementById('conn-pill');
  pill.className = 'conn-pill' + (state.connected ? ' on' : '');
  document.getElementById('conn-text').textContent = state.connected ? '已连接' : '未连接';
  document.getElementById('pet-sub').textContent =
    `状态源: ${state.source === 'hooks' ? '通用 Hooks 端口' : 'DSH'} · 当前: ${STATE_LABEL[state.currentState] || state.currentState}`;
}

// ── 养成渲染 ──
function renderNurture(snap) {
  if (!snap) return;
  const e = snap.stageId || 'baby';
  const set = (id, w, v) => {
    document.getElementById(id).style.width = (w * (id.includes('growth') ? 100 : 1)) + '%';
  };
  // 宠物视图概览
  document.getElementById('pv-satiety').style.width = snap.satiety + '%';
  document.getElementById('pv-satiety-v').textContent = snap.satiety;
  document.getElementById('pv-affection').style.width = snap.affection + '%';
  document.getElementById('pv-affection-v').textContent = snap.affection;
  document.getElementById('pv-growth').style.width = (snap.stageProgress * 100) + '%';
  document.getElementById('pv-growth-v').textContent = snap.growth;
  // 养成视图
  document.getElementById('nt-stage-emoji').textContent = STAGE_EMOJI[e] || '🐣';
  document.getElementById('nt-stage-name').textContent = snap.stageName;
  document.getElementById('nt-stage-desc').textContent = STAGE_DESC[e] || '';
  document.getElementById('nt-satiety').style.width = snap.satiety + '%';
  document.getElementById('nt-satiety-v').textContent = snap.satiety;
  document.getElementById('nt-affection').style.width = snap.affection + '%';
  document.getElementById('nt-affection-v').textContent = snap.affection;
  document.getElementById('nt-growth').style.width = (snap.stageProgress * 100) + '%';
  document.getElementById('nt-growth-v').textContent = snap.growth;
  document.getElementById('nt-feeds').textContent = snap.totalFeeds;
  document.getElementById('nt-pats').textContent = snap.totalPats;
  document.getElementById('nt-work').textContent = snap.totalWorkSessions;
}

// ── 皮肤渲染 ──
function renderSkins(skins) {
  const grid = document.getElementById('skin-grid');
  grid.innerHTML = '';
  for (const skin of skins) {
    const idleFile = skin.id === 'default'
      ? (skin.files.idle || skin.files.thinking || '')
      : `skins/${skin.id}/${skin.files.idle || skin.files.thinking || ''}`;
    const card = document.createElement('div');
    card.className = 'skin-card' + (skin.id === currentSkin ? ' active' : '');
    card.innerHTML = `<img src="./assets/${idleFile}" alt="${skin.name}" onerror="this.style.visibility='hidden'"><div class="name">${skin.name}</div>`;
    card.addEventListener('click', async () => {
      await window.panelAPI.setAppearance({ skin: skin.id });
      currentSkin = skin.id;
      grid.querySelectorAll('.skin-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
    grid.appendChild(card);
  }
}

// ── 主题渲染 ──
function renderThemes() {
  const grid = document.getElementById('theme-grid');
  grid.innerHTML = '';
  for (const t of THEMES) {
    const card = document.createElement('div');
    card.className = 'theme-card' + (t.id === currentTheme ? ' active' : '');
    card.innerHTML = `<div class="swatch" style="background:${t.color}"></div><div class="tname">${t.label}</div>`;
    card.addEventListener('click', async () => {
      await window.panelAPI.setAppearance({ theme: t.id });
      currentTheme = t.id;
      grid.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
    grid.appendChild(card);
  }
}

// ── 用量/余额渲染 ──
function fmtMoney(v) {
  const n = Number(v);
  return (isFinite(n) && n !== 0) ? '¥' + n.toFixed(4) : '¥0.0000';
}
function renderBalance(b) {
  if (!b) { return; }
  const ok = b.ok === true;
  document.getElementById('ug-balance').textContent = ok ? (b.totalBalance || '0') + ' ' + (b.currency || '') : '--';
  document.getElementById('ug-available').textContent = ok ? (b.isAvailable ? '可用' : '不可用') : '--';
  const note = document.getElementById('ug-balance-note');
  if (ok) {
    note.textContent = `余额：${b.totalBalance} ${b.currency}（赠送 ${b.grantedBalance} · 充值 ${b.toppedUpBalance}）${b.stale ? ' · 缓存数据' : ''}`;
  } else {
    note.textContent = b.error || '未配置 DeepSeek API Key，请在设置里填写后刷新。';
  }
}
function renderUsage(snap) {
  if (!snap) return;
  renderBalance(snap.balance);
  document.getElementById('ug-session-cost').textContent = fmtMoney(snap.sessionCost);
  document.getElementById('ug-session-tokens').textContent = snap.sessionTokens || 0;
  document.getElementById('ug-total-cost').textContent = fmtMoney(snap.totalCost);
  document.getElementById('ug-total-tokens').textContent = snap.totalTokens || 0;
  document.getElementById('ug-turns').textContent = snap.turns || 0;
  const hist = document.getElementById('ug-history');
  const list = snap.history || [];
  if (!list.length) {
    hist.innerHTML = '<div class="empty-tip">暂无结算记录</div>';
    return;
  }
  hist.innerHTML = list.map((h) => {
    const d = new Date(h.ts);
    const time = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    return `<div class="history-row"><span class="h-time">${time}</span><span class="h-tokens">${h.tokens} tokens</span><span class="h-cost">${fmtMoney(h.cost)}</span></div>`;
  }).join('');
}

// ── 对话 ──
const chatHistory = []; // { role, content }
function appendMsg(role, text) {
  const box = document.getElementById('chat-box');
  const row = document.createElement('div');
  row.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (role === 'user') {
    avatar.textContent = '🙂';
  } else {
    const im = document.createElement('img');
    im.src = './assets/maid-whale-idle.jpg';
    im.alt = '鲸鱼娘';
    avatar.appendChild(im);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  row.appendChild(avatar);
  row.appendChild(bubble);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
  return bubble;
}
async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const sendBtn = document.getElementById('btn-chat-send');
  input.value = '';
  appendMsg('user', text);
  chatHistory.push({ role: 'user', content: text });
  // 显示"正在思考"
  const typingBubble = appendMsg('bot', '正在想… 💭');
  typingBubble.classList.add('typing');
  sendBtn.disabled = true;
  sendBtn.textContent = '…';
  let res = null;
  try {
    res = await window.panelAPI.chat(chatHistory);
  } catch (e) {
    res = { ok: false, error: String(e && e.message || e) };
  }
  if (res && res.ok) {
    typingBubble.textContent = res.reply;
    typingBubble.classList.remove('typing');
    chatHistory.push({ role: 'assistant', content: res.reply });
  } else {
    typingBubble.textContent = '呜…出错了：' + ((res && res.error) || '未知错误');
    typingBubble.classList.remove('typing');
    typingBubble.style.color = '#dc2626';
  }
  sendBtn.disabled = false;
  sendBtn.textContent = '发送';
  window.panelAPI.saveChatHistory(chatHistory);
  document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;
}

// 加载本地聊天记录（重开面板恢复）
async function loadChatHistory() {
  try {
    const saved = await window.panelAPI.getChatHistory();
    if (!Array.isArray(saved) || !saved.length) return;
    chatHistory.length = 0;
    const box = document.getElementById('chat-box');
    box.innerHTML = ''; // 清掉初始问候语
    for (const m of saved) {
      if (m && m.role && typeof m.content === 'string') {
        chatHistory.push({ role: m.role, content: m.content });
        appendMsg(m.role === 'user' ? 'user' : 'bot', m.content);
      }
    }
    box.scrollTop = box.scrollHeight;
  } catch (e) { /* 忽略 */ }
}
function initChat() {
  const input = document.getElementById('chat-input');
  const send = document.getElementById('btn-chat-send');
  send.addEventListener('click', sendChat);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
}

// ── 设置 ──
async function initSettingsValues() {
  try {
    const cfg = await window.panelAPI.getConfig();
    if (!cfg) return;
    document.getElementById('set-state-source').value = cfg.stateSource === 'hooks' ? 'hooks' : 'dsh';
    document.getElementById('set-base-url').value = cfg.baseUrl || 'http://127.0.0.1:3080';
    document.getElementById('set-api-key').value = cfg.deepseekApiKey || '';
    document.getElementById('set-auto-start').checked = !!cfg.openAtLogin;
  } catch (e) { /* 忽略 */ }
}

function initSettings() {
  const save = document.getElementById('btn-settings-save');
  const status = document.getElementById('settings-status');
  save.addEventListener('click', async () => {
    const stateSource = document.getElementById('set-state-source').value;
    const baseUrl = document.getElementById('set-base-url').value.trim();
    const apiKey = document.getElementById('set-api-key').value.trim();
    const openAtLogin = document.getElementById('set-auto-start').checked;
    if (stateSource === 'dsh' && !baseUrl) {
      status.textContent = '请输入 DSH 地址';
      status.style.color = '#dc2626';
      return;
    }
    const saved = await window.panelAPI.saveConfig({
      stateSource,
      baseUrl: baseUrl || 'http://127.0.0.1:3080',
      deepseekApiKey: apiKey,
      openAtLogin
    });
    status.textContent = '已保存 ✓（API Key 已加密存储）';
    status.style.color = '#059669';
    // 清空 key 输入框（已保存到加密存储）
    document.getElementById('set-api-key').value = '';
    setTimeout(() => { status.textContent = ''; }, 2500);
    return saved;
  });
}

// ── 日志 ──
function appendLog(entry) {
  const box = document.getElementById('log-box');
  const line = document.createElement('div');
  line.className = 'log-line';
  const time = (entry.t || '').slice(11, 19);
  line.innerHTML = `<span class="time">${time}</span><span class="lvl">[${entry.level}]</span> ${entry.msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

init();
