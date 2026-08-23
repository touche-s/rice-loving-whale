// 面板渲染逻辑（粉紫色二次元创作者中心布局）
const THEMES = [
  { id: 'light', label: '亮色', color: '#f5f7fa', fg: '#172536' },
  { id: 'dark', label: '暗色', color: '#0e141f', fg: '#e5edf7' }
];
// 把旧主题名映射到 light/dark（blue/pink 归入 light）
function mapTheme(t) {
  return (t === 'dark') ? 'dark' : 'light';
}
// 应用主题到面板：设 html data-theme
function applyPanelTheme(theme) {
  document.documentElement.setAttribute('data-theme', mapTheme(theme));
}
const STAGE_EMOJI = { baby: '🐣', teen: '🐬', adult: '🐋' };
const STAGE_DESC = {
  baby: '刚出生的鲸鱼宝宝，陪 AI 干活慢慢长大',
  teen: '长成小鲸娘了，越来越有精神',
  adult: '成熟的大鲸娘，最可靠的伙伴！'
};
const STATE_LABEL = { idle: '待机中', thinking: '思考中', coding: '干活中', success: '完成了', error: '报错中' };
const STATE_ICON = { idle: '💤', thinking: '🤔', coding: '💻', success: '✨', error: '💢' };

let currentSkin = 'default';
let currentTheme = 'light';
let currentPetState = 'idle';

const PAGE_TITLES = {
  pet: '我的鲸鱼娘',
  nurture: '养成',
  skin: '皮肤装扮',
  theme: '主题配色',
  usage: '用量与余额',
  chat: '和鲸鱼娘聊天',
  settings: '设置',
  log: '运行日志'
};

// ── 导航切换 ──
function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
  const titleText = document.getElementById('topbar-title-text');
  const sub = document.getElementById('pet-sub');
  if (titleText) titleText.textContent = PAGE_TITLES[view] || '鲸鱼娘';
  if (sub) sub.textContent = view === 'pet' ? '陪伴 AI 干活的桌面伙伴' : '';
  document.getElementById('main-scroll').scrollTop = 0;
}

async function init() {
  const [state, skins, cfg] = await Promise.all([window.panelAPI.getState(), window.panelAPI.getSkins(), window.panelAPI.getConfig()]);
  currentSkin = state.skin || 'default';
  currentTheme = state.theme || 'light';
  currentPetState = state.currentState || 'idle';
  currentPreset = (cfg && cfg.activePreset) || 'default';
  // 应用面板主题
  applyPanelTheme(currentTheme);

  // 导航事件
  document.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));

  // 渲染各视图
  await renderPresets();
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
  initHeroActions();
  initStateTags();

  // 实时监听
  window.panelAPI.onLog((e) => appendLog(e));
  window.panelAPI.onNurture((snap) => renderNurture(snap));
  window.panelAPI.onUsage((snap) => renderUsage(snap));

  // 主按钮
  document.getElementById('btn-feed').addEventListener('click', async () => { renderNurture(await window.panelAPI.nurtureAction('feed')); renderPet(); });
  document.getElementById('btn-pat').addEventListener('click', async () => { renderNurture(await window.panelAPI.nurtureAction('pat')); });
  document.getElementById('btn-refresh-balance').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-balance');
    btn.textContent = '🔄 刷新中…';
    const b = await window.panelAPI.refreshBalance();
    renderBalance(b);
    btn.textContent = '🔄 刷新';
  });

  // 初始日志
  (await window.panelAPI.getLog()).forEach((e) => appendLog(e));
}

// ── 宠物视图 ──
const PET_IMG = {
  idle: 'idle.gif',
  thinking: 'thinking.gif',
  coding: 'coding.gif',
  success: 'success.gif',
  error: 'error.gif'
};
function renderPet() {
  const stateEl = document.getElementById('pet-state');
  if (stateEl) stateEl.textContent = STATE_LABEL[currentPetState] || currentPetState;

  const iconEl = document.getElementById('pet-state-icon');
  if (iconEl) iconEl.textContent = STATE_ICON[currentPetState] || '🐳';

  const img = document.querySelector('#pet-avatar img');
  if (img) img.src = './assets/' + (PET_IMG[currentPetState] || 'idle.gif');

  // 同步更新状态标签选中态
  document.querySelectorAll('#state-tags .quick-tag').forEach((t) => {
    t.classList.toggle('active', t.dataset.state === currentPetState);
  });
}

function initStateTags() {
  document.querySelectorAll('#state-tags .quick-tag').forEach((tag) => {
    tag.addEventListener('click', async () => {
      const state = tag.dataset.state;
      currentPetState = state;
      await window.panelAPI.setState(state);
      renderPet();
    });
  });
}

function initHeroActions() {
  document.getElementById('btn-hero-feed')?.addEventListener('click', async () => {
    renderNurture(await window.panelAPI.nurtureAction('feed'));
    renderPet();
  });
  document.getElementById('btn-hero-pat')?.addEventListener('click', async () => {
    renderNurture(await window.panelAPI.nurtureAction('pat'));
  });
  document.getElementById('btn-hero-chat')?.addEventListener('click', () => switchView('chat'));
  document.getElementById('btn-hero-usage')?.addEventListener('click', () => switchView('usage'));
}

// 宠物名字：显示 + 改名
async function initPetName() {
  try {
    const cfg = await window.panelAPI.getConfig();
    const nameEl = document.getElementById('pet-name');
    if (cfg && cfg.petName && nameEl) nameEl.textContent = cfg.petName;
  } catch (e) {}
  const editBtn = document.getElementById('btn-rename');
  const nameEl = document.getElementById('pet-name');
  if (!editBtn || !nameEl) return;
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
  const text = document.getElementById('conn-text');
  const sub = document.getElementById('pet-sub');
  if (pill) {
    pill.className = 'tag-pill' + (state.connected ? ' on' : ' off');
  }
  if (text) text.textContent = state.connected ? '已连接' : '未连接';
  if (sub) {
    sub.textContent = `状态源: ${state.source === 'hooks' ? '通用 Hooks 端口' : 'DSH'} · 当前: ${STATE_LABEL[state.currentState] || state.currentState}`;
  }
}

// ── 养成渲染 ──
function renderNurture(snap) {
  if (!snap) return;
  const e = snap.stageId || 'baby';

  // 宠物视图概览
  setStat('pv-satiety', snap.satiety);
  setStat('pv-affection', snap.affection);
  setStat('pv-growth', (snap.stageProgress || 0) * 100);

  // 养成视图（阶段用鲸鱼图标，不再用 emoji）
  const stageEmoji = document.getElementById('nt-stage-emoji');
  if (stageEmoji) {
    stageEmoji.textContent = '';
    stageEmoji.innerHTML = '<img src="./assets/icon-512.png" alt="鲸鱼娘" style="width:100%;height:100%;object-fit:cover;border-radius:10px">';
  }
  const stageName = document.getElementById('nt-stage-name');
  if (stageName) stageName.textContent = snap.stageName || '鲸鱼宝宝';
  const stageDesc = document.getElementById('nt-stage-desc');
  if (stageDesc) stageDesc.textContent = STAGE_DESC[e] || '';

  setStat('nt-satiety', snap.satiety);
  setStat('nt-affection', snap.affection);
  setStat('nt-growth', (snap.stageProgress || 0) * 100);

  const feeds = document.getElementById('nt-feeds');
  const pats = document.getElementById('nt-pats');
  const work = document.getElementById('nt-work');
  if (feeds) feeds.textContent = snap.totalFeeds || 0;
  if (pats) pats.textContent = snap.totalPats || 0;
  if (work) work.textContent = snap.totalWorkSessions || 0;

  // 养成需求角标
  const badge = document.getElementById('nav-nurture-badge');
  if (badge) {
    const needs = (snap.needs || []).length || (snap.hungry || snap.sleepy ? 1 : 0);
    badge.classList.toggle('show', needs > 0);
    badge.textContent = needs > 0 ? '!' : '';
  }
}

function setStat(baseId, value) {
  const bar = document.getElementById(baseId);
  const num = document.getElementById(baseId + '-v');
  const pct = Math.max(0, Math.min(100, value));
  if (bar) bar.style.width = pct + '%';
  if (num) num.textContent = Math.round(value);
}

// ── 素材预设渲染 ──
let currentPreset = 'default';
const PRESET_STATES = [
  { key: 'idle', label: '待机' },
  { key: 'thinking', label: '思考' },
  { key: 'coding', label: '干活' },
  { key: 'success', label: '完成' },
  { key: 'error', label: '报错' }
];
// 把预设里的图文件名转成可显示的 URL（内置./assets/，自定义 petfile://）
function presetFileUrl(file) {
  if (!file) return '';
  if (file.indexOf('preset-files/') === 0) {
    return 'petfile://' + file.slice('preset-files/'.length);
  }
  return './assets/' + file;
}
async function renderPresets() {
  const list = await window.panelAPI.presetList();
  const grid = document.getElementById('preset-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'preset-card' + (p.id === currentPreset ? ' active' : '');
    const preview = p.files.idle ? presetFileUrl(p.files.idle) : '';
    card.innerHTML = `
      <img class="preset-preview" src="${preview}" alt="${p.name}" onerror="this.style.visibility='hidden'">
      <div class="preset-name">${p.name}</div>
      <div class="preset-builtin">${p.builtin ? '内置默认' : '自定义'}</div>
      ${p.builtin ? '' : '<button class="preset-del" data-id="' + p.id + '">删除</button>'}`;
    card.addEventListener('click', async (e) => {
      if (e.target.classList.contains('preset-del')) return;
      await window.panelAPI.presetActivate(p.id);
      currentPreset = p.id;
      grid.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      renderPresetEditor(p);
    });
    const del = card.querySelector('.preset-del');
    if (del) del.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await window.panelAPI.confirm('删除预设「' + p.name + '」？');
      if (!ok) return;
      await window.panelAPI.presetRemove(p.id);
      if (currentPreset === p.id) {
        await window.panelAPI.presetActivate('default');
        currentPreset = 'default';
      }
      renderPresets();
    });
    grid.appendChild(card);
  }
  // 渲染当前选中预设的编辑器
  const active = list.find((p) => p.id === currentPreset) || list[0];
  if (active) renderPresetEditor(active);

  // 新建按钮（Electron 不支持 window.prompt，直接建默认名）
  const addBtn = document.getElementById('btn-preset-add');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', async () => {
      const p = await window.panelAPI.presetAdd('新预设');
      await window.panelAPI.presetActivate(p.id);
      currentPreset = p.id;
      renderPresets();
    });
  }
}

function renderPresetEditor(preset) {
  const editor = document.getElementById('preset-editor');
  const states = document.getElementById('preset-states');
  if (!editor || !states) return;
  if (!preset || preset.builtin) {
    // 内置预设：提示用默认图，不提供换图
    editor.style.display = 'none';
    return;
  }
  editor.style.display = '';
  const titleEl = document.getElementById('preset-editor-title');
  titleEl.textContent = preset.name;
  titleEl.contentEditable = 'true';
  titleEl.title = '点击修改预设名称';
  titleEl.style.outline = 'none';
  titleEl.addEventListener('blur', async () => {
    const newName = (titleEl.textContent || '').trim() || '未命名预设';
    titleEl.textContent = newName;
    await window.panelAPI.presetUpdate(preset.id, { name: newName });
    renderPresets();
  });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
  });
  states.innerHTML = '';
  for (const s of PRESET_STATES) {
    const file = (preset.files && preset.files[s.key]) || '';
    const cell = document.createElement('div');
    cell.className = 'state-config';
    cell.innerHTML = `
      <img class="state-img" src="${presetFileUrl(file)}" onerror="this.style.visibility='hidden'">
      <div class="state-label">${s.label}</div>
      <div class="state-actions">
        <button class="btn-mini" data-state="${s.key}">换图</button>
        ${file ? '<button class="btn-mini reset" data-state="' + s.key + '">默认</button>' : ''}
      </div>`;
    cell.querySelector('[data-state="' + s.key + '"]').addEventListener('click', async () => {
      const picked = await window.panelAPI.pickImage();
      if (!picked) return;
      const up = await window.panelAPI.presetUploadImage(preset.id, picked.path, picked.name);
      if (!up || !up.ok) {
        await window.panelAPI.confirm('上传失败：' + ((up && up.error) || '未知'));
        return;
      }
      const files = Object.assign({}, preset.files, { [s.key]: up.file });
      await window.panelAPI.presetUpdate(preset.id, { files });
      renderPresets();
    });
    const resetBtn = cell.querySelector('.btn-mini.reset');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      const files = Object.assign({}, preset.files);
      delete files[s.key];
      await window.panelAPI.presetUpdate(preset.id, { files });
      renderPresets();
    });
    states.appendChild(cell);
  }
}

// ── 主题渲染 ──
function renderThemes() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const activeMapped = mapTheme(currentTheme);
  for (const t of THEMES) {
    const card = document.createElement('div');
    card.className = 'theme-card' + (t.id === activeMapped ? ' active' : '');
    card.innerHTML = `<div class="swatch" style="background:${t.color}"></div><div class="tname">${t.label}</div>`;
    card.addEventListener('click', async () => {
      await window.panelAPI.setAppearance({ theme: t.id });
      currentTheme = t.id;
      applyPanelTheme(t.id);
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
  const balanceEl = document.getElementById('ug-balance');
  const availableEl = document.getElementById('ug-available');
  const note = document.getElementById('ug-balance-note');
  if (balanceEl) balanceEl.textContent = ok ? (b.totalBalance || '0') + ' ' + (b.currency || '') : '--';
  if (availableEl) availableEl.textContent = ok ? (b.isAvailable ? '可用' : '不可用') : '--';
  if (note) {
    if (ok) {
      note.textContent = `余额：${b.totalBalance} ${b.currency}（赠送 ${b.grantedBalance} · 充值 ${b.toppedUpBalance}）${b.stale ? ' · 缓存数据' : ''}`;
    } else {
      note.textContent = b.error || '未配置 DeepSeek API Key，请在设置里填写后刷新。';
    }
  }
}
function renderUsage(snap) {
  if (!snap) return;
  renderBalance(snap.balance);
  const sessionCost = document.getElementById('ug-session-cost');
  const sessionTokens = document.getElementById('ug-session-tokens');
  const totalCost = document.getElementById('ug-total-cost');
  const totalTokens = document.getElementById('ug-total-tokens');
  const turns = document.getElementById('ug-turns');
  if (sessionCost) sessionCost.textContent = fmtMoney(snap.sessionCost);
  if (sessionTokens) sessionTokens.textContent = snap.sessionTokens || 0;
  if (totalCost) totalCost.textContent = fmtMoney(snap.totalCost);
  if (totalTokens) totalTokens.textContent = snap.totalTokens || 0;
  if (turns) turns.textContent = snap.turns || 0;

  const hist = document.getElementById('ug-history');
  const list = snap.history || [];
  if (!hist) return;
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
  if (!box) return null;
  const row = document.createElement('div');
  row.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (role === 'user') {
    const im = document.createElement('img');
    im.src = './assets/user-avatar.png';
    im.alt = '用户';
    avatar.appendChild(im);
  } else {
    const im = document.createElement('img');
    im.src = './assets/whale-avatar.png';
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
  const typingBubble = appendMsg('bot', '正在想… 💭');
  if (typingBubble) typingBubble.classList.add('typing');
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
  const box = document.getElementById('chat-box');
  if (box) box.scrollTop = box.scrollHeight;
}

// 加载本地聊天记录（重开面板恢复）
async function loadChatHistory() {
  try {
    const saved = await window.panelAPI.getChatHistory();
    if (!Array.isArray(saved) || !saved.length) return;
    chatHistory.length = 0;
    const box = document.getElementById('chat-box');
    if (!box) return;
    box.innerHTML = '';
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
  if (send) send.addEventListener('click', sendChat);
  if (input) input.addEventListener('keydown', (e) => {
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
    const source = document.getElementById('set-state-source');
    const baseUrl = document.getElementById('set-base-url');
    const apiKey = document.getElementById('set-api-key');
    const autoStart = document.getElementById('set-auto-start');
    if (source) source.value = cfg.stateSource === 'hooks' ? 'hooks' : 'dsh';
    if (baseUrl) baseUrl.value = cfg.baseUrl || 'http://127.0.0.1:3080';
    if (apiKey) apiKey.value = cfg.deepseekApiKey || '';
    if (autoStart) autoStart.checked = !!cfg.openAtLogin;
  } catch (e) { /* 忽略 */ }
}

function initSettings() {
  const save = document.getElementById('btn-settings-save');
  const status = document.getElementById('settings-status');
  if (!save) return;
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
    const apiKeyInput = document.getElementById('set-api-key');
    if (apiKeyInput) apiKeyInput.value = '';
    setTimeout(() => { status.textContent = ''; }, 2500);
    return saved;
  });
}

// ── 日志 ──
function appendLog(entry) {
  const box = document.getElementById('log-box');
  if (!box) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  const time = (entry.t || '').slice(11, 19);
  line.innerHTML = `<span class="time">${time}</span><span class="lvl">[${entry.level}]</span> ${entry.msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

init();
