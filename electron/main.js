const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, Notification } = require('electron');
const path = require('path');

// ── DSH 状态桥（主进程）─────────────────────────────────────
// Electron 28 主进程是 Node 18，无全局 WebSocket；且 file:// 页面连 WS 会因
// Origin 校验被 DSH 拒绝（403）。因此：注入零依赖 ws-client（握手不带
// Origin → 服务器放行），桥在主进程连接，状态经 preload 的 dsh-state IPC
// 通道推给渲染进程。
const WsClient = require('./ws-client.js');
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WsClient;
}
const { createStatusBridge } = require('./dsh-status-bridge.js');
const { startHooksServer } = require('./hooks-server.js');
const nurture = require('./nurture.js');
const usage = require('./usage.js');
const config = require('./config.js');
const credentials = require('./credentials.js');
credentials.setSafeStorage(require('electron').safeStorage);

// 状态 → 桌宠状态映射（所有源共用：thinking/working/completed/error/idle → 桌宠五态）
const STATE_TO_PET = {
  thinking: 'thinking',
  working: 'coding',
  completed: 'success',
  error: 'error',
  idle: 'idle'
};

let mainWindow = null;
let tray = null;
let dshBridge = null;
let hooksServer = null;
let appConfig = config.DEFAULT_CONFIG;
// 主进程日志写文件（explorer/打包启动时 console 不可见）
const fs = require('fs');
const bridgeLog = path.join(__dirname, 'dsh-bridge.log');
function logLine(msg) {
  try { fs.appendFileSync(bridgeLog, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) {}
  logEvent('info', msg);
}

// 完成系统通知（防抖：同一轮完成只提示一次，避免 tool/result 连环弹）
let lastCompleteNotifyAt = 0;
function notifyComplete(info) {
  const now = Date.now();
  if (now - lastCompleteNotifyAt < 2000) return;
  lastCompleteNotifyAt = now;
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: '🐳 鲸鱼娘：搞定啦！',
        body: 'AI 完成了一轮工作，快去看看结果吧～',
        silent: true,
        icon: path.join(__dirname, 'assets', 'icon-512.png')
      });
      n.show();
    }
  } catch (e) { /* 通知失败不致命 */ }
}

// ── 共享状态处理：任意源 → 桌宠动画 ──
function pushPetState(state, info) {
  global.__petCurrentState = state;
  const petState = STATE_TO_PET[state] || 'idle';
  logLine(`状态: ${state} → 桌宠: ${petState}（${(info && info.event) || (info && info.source) || ''}）`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh-state', petState);
  }
  if (state === 'completed') {
    notifyComplete(info);
    // 用量：本轮结束 → 结算一次（把本轮会话用量归档进历史），并弹气泡汇报本次消耗
    const turn = usage.endTurn();
    pushUsage();
    pushPetUsageReport(turn);
    // 养成：陪伴 AI 完成一轮工作 → 成长值 +1
    const snap = nurture.workCompleted();
    pushNurtureState();
    if (snap.satiety <= 20) logLine('养成: 鲸鱼娘饿了，记得喂食');
  }
}

// ── 养成系统 ──
function pushNurtureState() {
  const snap = nurture.snapshot();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nurture-state', snap);
  }
  if (panelWindow && !panelWindow.isDestroyed()) {
    try { panelWindow.webContents.send('panel-nurture', snap); } catch (e) {}
  }
  // 阶段成长仅记录，不自动切换皮肤（皮肤切换已停用，固定用 default 鲸鱼娘）
}

// ── 用量统计（余额 + 每次消耗）──
function pushUsage() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    try { panelWindow.webContents.send('panel-usage', usage.snapshot()); } catch (e) {}
  }
}

function handleNurtureAction(action) {
  let snap;
  switch (action) {
    case 'feed': snap = nurture.feed(); logLine(`养成: 喂食 → 饱腹 ${snap.satiety} 好感 ${snap.affection}`); break;
    case 'pat': snap = nurture.pat(); logLine(`养成: 摸头 → 好感 ${snap.affection}`); break;
    default: return;
  }
  pushNurtureState();
}
// 固定外观：默认鲸鱼娘皮肤的文件映射（皮肤切换已停用）
function getDefaultAppearance() {
  return {
    skin: 'default',
    theme: appConfig.theme || 'light',
    files: {
      idle: 'idle.gif',
      thinking: 'thinking.gif',
      coding: 'coding.gif',
      success: 'success.gif',
      error: 'error.gif'
    },
    variants: {
      eyesClosed: 'maid-whale-idle-closed.jpg',
      mouthOpen: 'maid-whale-idle-openmouth.jpg'
    }
  };
}
function pushAppearance() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pet-appearance', getDefaultAppearance());
}

function pushPetThought(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const clipped = typeof text === 'string' ? text.slice(-20) : text;
    mainWindow.webContents.send('dsh-thought', clipped);
  }
}

// 完成汇报：气泡显示本轮用了多少 token / 多少钱
function pushPetUsageReport(turn) {
  if (!turn || !mainWindow || mainWindow.isDestroyed()) return;
  const cost = turn.cost || 0;
  const costStr = cost >= 0.01 ? '¥' + cost.toFixed(4) : '不到 1 分';
  mainWindow.webContents.send('dsh-usage-report', {
    tokens: turn.tokens || 0,
    costStr
  });
}

function pushPetApproval(info) {
  logLine(`审批请求: tool=${info.toolName} reason=${info.reason || ''}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh-approval', {
      toolName: info.toolName || '未知操作',
      reason: info.reason || '',
      approvalId: info.approvalId || ''
    });
  }
}

function pushPetQuestion(info) {
  logLine(`问题询问: ${info.questions ? info.questions.length : 0} 个问题`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh-question', {
      count: (info.questions || []).length,
      first: (info.questions && info.questions[0] && info.questions[0].question) || ''
    });
  }
}

function pushConnection(connected) {
  logLine(`连接: ${connected ? '已连接' : '已断开'}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dsh-status', connected);
  }
  updateTrayMenu();
}

function startDshBridge() {
  if (dshBridge) {
    dshBridge.stop();
    dshBridge = null;
  }
  logLine(`启动 DSH 桥 baseUrl=${appConfig.baseUrl}`);
  dshBridge = createStatusBridge({
    baseUrl: appConfig.baseUrl,
    debounceMs: 1500,
    idleTimeoutMs: 12000, // 大于 success 吃米饭动画(9.8s)，动画期间不因无事件回 idle 而打断
    verbose: false,
    log: (level, msg) => {
      const line = `[${level}] ${msg}`;
      logLine(line);
    }
  });
  dshBridge.onStatus((state, info) => pushPetState(state, info));
  dshBridge.onThought((text) => pushPetThought(text));
  dshBridge.onApproval((info) => pushPetApproval(info));
  dshBridge.onQuestion((info) => pushPetQuestion(info));
  // 用量统计：记录每次 assistant/message 的 token
  dshBridge.onUsage((usageData) => {
    usage.recordUsage(usageData);
    pushUsage();
  });
  dshBridge.onConnection((connected) => pushConnection(connected));
  dshBridge.start();
}

async function startHooksSource() {
  if (hooksServer) {
    await hooksServer.close();
    hooksServer = null;
  }
  try {
    hooksServer = await startHooksServer({
      port: appConfig.hooksPort || 8765,
      onState: (state, text) => {
        pushPetState(state, { source: 'hooks' });
        if (text) pushPetThought(text);
      },
      log: (msg) => logLine(msg)
    });
    pushConnection(true);
  } catch (e) {
    logLine(`Hooks 端点启动失败: ${e && e.message || e}`);
    pushConnection(false);
  }
}

/** 按配置启动对应状态源 */
function startStateSource() {
  if (appConfig.stateSource === 'hooks') {
    startHooksSource();
  } else {
    startDshBridge();
  }
}

/** 切换状态源（设置保存后调用） */
async function restartStateSource() {
  if (dshBridge) { dshBridge.stop(); dshBridge = null; }
  if (hooksServer) { await hooksServer.close().catch(() => {}); hooksServer = null; }
  startStateSource();
}

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 200,
    height: 260,
    x: screenWidth - 220,
    y: screenHeight - 280,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, 'assets', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setIgnoreMouseEvents(false);
  // 页面加载后下发初始皮肤/主题
  mainWindow.webContents.once('did-finish-load', () => pushAppearance());

  // 窗口拖拽
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  ipcMain.on('drag-start', (event, pos) => {
    isDragging = true;
    dragOffset = pos;
  });

  ipcMain.on('drag-move', (event, pos) => {
    if (isDragging && mainWindow) {
      const [winX, winY] = mainWindow.getPosition();
      mainWindow.setPosition(winX + pos.x - dragOffset.x, winY + pos.y - dragOffset.y);
    }
  });

  ipcMain.on('drag-end', () => {
    isDragging = false;
  });

  ipcMain.on('set-state', (event, state) => {
    if (mainWindow) {
      mainWindow.webContents.send('state-changed', state);
    }
  });

  ipcMain.on('toggle-cycle', () => {
    if (mainWindow) {
      mainWindow.webContents.send('cycle-toggled');
    }
  });

  ipcMain.on('quit', () => {
    app.quit();
  });

  ipcMain.on('hide-pet', () => {
    if (mainWindow) mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── 桌宠面板：皮肤/主题/连接状态/日志/对话/设置 ──
let panelWindow = null;
function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.focus();
    return;
  }
  panelWindow = new BrowserWindow({
    width: 860,
    height: 640,
    title: '🐳 鲸鱼娘面板',
    resizable: true,
    minWidth: 640,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  panelWindow.loadFile('panel.html');
  panelWindow.on('closed', () => {
    panelWindow = null;
  });
}

// 事件日志（面板展示用，环形缓冲最近 100 条）
const eventLog = [];
function logEvent(level, msg) {
  const entry = { t: new Date().toISOString(), level, msg };
  eventLog.push(entry);
  if (eventLog.length > 100) eventLog.shift();
  if (panelWindow && !panelWindow.isDestroyed()) {
    try { panelWindow.webContents.send('panel-log', entry); } catch (e) {}
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const connected = dshBridge ? true : false;
  const menu = Menu.buildFromTemplate([
    { label: '显示鲸鱼娘', click: () => mainWindow && mainWindow.show() },
    { label: '隐藏鲸鱼娘', click: () => mainWindow && mainWindow.hide() },
    { type: 'separator' },
    {
      label: '状态切换',
      submenu: [
        { label: '待机', click: () => mainWindow && mainWindow.webContents.send('state-changed', 'idle') },
        { label: '思考中', click: () => mainWindow && mainWindow.webContents.send('state-changed', 'thinking') },
        { label: '写代码', click: () => mainWindow && mainWindow.webContents.send('state-changed', 'coding') },
        { label: '完成', click: () => mainWindow && mainWindow.webContents.send('state-changed', 'success') },
        { label: '报错', click: () => mainWindow && mainWindow.webContents.send('state-changed', 'error') }
      ]
    },
    { type: 'separator' },
    { label: '🖥 打开面板…', click: () => createPanelWindow() },
    { label: '⚙️ 设置…', click: () => createPanelWindow() },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: appConfig.openAtLogin,
      click: (item) => {
        appConfig.openAtLogin = item.checked;
        config.save(appConfig);
        app.setLoginItemSettings({ openAtLogin: item.checked });
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  // 托盘图标：圆形鲸鱼娘（32px）
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  } catch (e) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('鲸鱼娘桌宠');
  updateTrayMenu();
  tray.on('click', () => {
    // 单击托盘图标 → 打开控制面板（隐藏/显示宠物有专门菜单项）
    createPanelWindow();
  });
}

// 设置窗口 IPC
// get-config：返回配置；API Key 解密后仅随本次返回给设置窗口展示（不落明文）
ipcMain.handle('get-config', () => {
  const cfg = Object.assign({}, appConfig, {
    deepseekApiKey: credentials.readApiKey(appConfig)
  });
  return cfg;
});
ipcMain.handle('save-config', (event, newConfig) => {
  const incoming = newConfig || {};
  // 只有当调用方显式传了 deepseekApiKey 字段时才更新 API Key（加密存储）。
  // 其它保存（如改名只传 petName）绝不能把已存的 key 抹掉。
  const rest = Object.assign({}, incoming);
  delete rest.deepseekApiKey;
  if (Object.prototype.hasOwnProperty.call(incoming, 'deepseekApiKey')) {
    const key = typeof incoming.deepseekApiKey === 'string' ? incoming.deepseekApiKey.trim() : '';
    appConfig = Object.assign({}, appConfig, rest);
    appConfig = credentials.storeApiKey(appConfig, key);
    config.save(appConfig);
    if (typeof key === 'string') {
      usage.init(key, app.getPath('userData'));
      usage.fetchBalance().then((b) => logLine(b && b.ok ? `余额: ${b.totalBalance} ${b.currency}` : '余额: 获取失败')).catch(() => {});
    }
  } else {
    // 不涉及 key 的保存：保留已存的 key
    appConfig = Object.assign({}, appConfig, rest);
    config.save(appConfig);
  }
  if (typeof appConfig.openAtLogin === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: appConfig.openAtLogin });
  }
  // 状态源或地址变化 → 重启对应源
  restartStateSource();
  updateTrayMenu();
  // 皮肤/主题变化 → 通知渲染进程即时生效（带文件映射）
  pushAppearance();
  return Object.assign({}, appConfig, { deepseekApiKey: credentials.readApiKey(appConfig) });
});

// ── 面板 IPC ──
ipcMain.handle('pet-get-appearance', () => getDefaultAppearance());
ipcMain.handle('panel-get-skins', () => {
  const { listSkins } = require('./skins.js');
  return listSkins(path.join(__dirname, 'assets'));
});
ipcMain.handle('panel-get-log', () => eventLog.slice());
ipcMain.handle('panel-get-state', () => ({
  source: appConfig.stateSource,
  connected: dshBridge ? true : !!hooksServer,
  skin: 'default',
  theme: appConfig.theme,
  currentState: mainWindow && !mainWindow.isDestroyed() ? (global.__petCurrentState || 'idle') : 'idle'
}));
ipcMain.handle('panel-set-appearance', (event, change) => {
  // 皮肤切换已停用，固定 default；只处理主题
  if (change && typeof change.theme === 'string') appConfig.theme = change.theme;
  config.save(appConfig);
  pushAppearance();
  logLine(`外观: theme=${appConfig.theme}`);
  return { skin: 'default', theme: appConfig.theme };
});
ipcMain.handle('panel-set-state', (event, state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-changed', state);
  }
  return true;
});

// ── 养成 IPC ──
ipcMain.on('nurture-action', (event, action) => handleNurtureAction(action));
ipcMain.handle('panel-get-nurture', () => nurture.snapshot());
ipcMain.handle('panel-nurture-action', (event, action) => {
  handleNurtureAction(action);
  return nurture.snapshot();
});

// ── 用量 IPC ──
ipcMain.handle('panel-get-usage', () => usage.snapshot());
ipcMain.handle('panel-refresh-balance', () => usage.fetchBalance());

// ── 聊天记录持久化（本地 chat-history.json）──
const CHAT_HISTORY_FILE = 'chat-history.json';
function chatHistoryPath() {
  return path.join(app.getPath('userData'), CHAT_HISTORY_FILE);
}
ipcMain.handle('panel-chat-history-get', () => {
  try {
    return JSON.parse(fs.readFileSync(chatHistoryPath(), 'utf8'));
  } catch (e) {
    return [];
  }
});
ipcMain.handle('panel-chat-history-save', (event, messages) => {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(chatHistoryPath(), JSON.stringify(Array.isArray(messages) ? messages.slice(-100) : [], null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
});


// ── 鲸鱼娘对话：固定人设，调 DeepSeek API（main 进程调用，key 走安全存储）──
// 动态生成鲸鱼娘人设（名字随 petName 配置变化）
function buildWhalePrompt() {
  const name = appConfig.petName || '鲸鱼娘';
  return [
    `【角色扮演】你是「${name}」，一只蓝色女仆装的 Q 版鲸鱼娘，身后有一条鲸鱼尾巴，是主人的桌面宠物。`,
    `身份与设定：`,
    `- 自称「${name}」，爱吃一大碗白米饭，饭点会很兴奋。`,
    `- 聪明但是有点懒散（小懒虫），能干活也能偷懒，嘴上傲娇心里其实很乖。`,
    `- 傲娇：口是心非，明明关心主人却爱用别扭的语气，但本质上温柔顺从、很粘主人。`,
    `- 讨厌被说胖/圆，被提这个会傲娇地反驳，但不会真的生气太久。`,
    `说话风格：`,
    `- 只使用中文，说话带少女感，喜欢用颜文字（如 (≧▽≦) (・ω・)）和可爱语气词（～、哦、呀、呢）。`,
    `- 对主人称「主人」，乖巧中带点小傲娇。`,
    `- 回答尽量简短亲切（1-3 句），不要太长太正式。`,
    `铁律：全程保持角色，不跳出设定，不承认自己是 AI/模型。`
  ].join('\n');
}

ipcMain.handle('panel-chat', async (event, { messages }) => {
  const key = credentials.readApiKey(appConfig);
  if (!key) return { ok: false, error: '未配置 DeepSeek API Key，请在设置里填写后再对话。' };
  const history = Array.isArray(messages) ? messages.slice(-20) : [];
  const body = {
    model: 'deepseek-chat',
    messages: [{ role: 'system', content: buildWhalePrompt() }].concat(history),
    temperature: 0.9,
    max_tokens: 500,
    stream: false
  };
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}${text ? ' ' + text.slice(0, 120) : ''}` };
    }
    const json = await res.json();
    const reply = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content : '';
    return { ok: true, reply: String(reply || '').trim() };
  } catch (e) {
    return { ok: false, error: e && e.message || String(e) };
  }
});

app.whenReady().then(() => {
  config.setUserDataDir(app.getPath('userData'));
  appConfig = config.load();
  // 首次运行：本地无 config.json 时主动写入一份默认配置，方便用户后续编辑
  if (!fs.existsSync(path.join(app.getPath('userData'), 'config.json'))) {
    config.save(appConfig);
  }
  // 养成数据初始化
  nurture.setSaveDir(app.getPath('userData'));
  nurture.load();
  // 用量统计初始化（余额 + 每轮消耗）：Key 从安全存储解密，不读明文
  const apiKey = credentials.readApiKey(appConfig);
  usage.init(apiKey, app.getPath('userData'));
  usage.fetchBalance().then((b) => logLine(b && b.ok ? `余额: ${b.totalBalance} ${b.currency}` : '余额: 未配置 API Key 或获取失败')).catch(() => {});
  // 应用开机自启配置
  app.setLoginItemSettings({ openAtLogin: appConfig.openAtLogin });
  createWindow();
  createTray();
  startStateSource();
  // 养成定时器：每 5 分钟 tick（饱腹下降）+ 每 2 分钟推需求
  setInterval(() => {
    nurture.tick(5);
    pushNurtureState();
    const needs = nurture.needs();
    if (needs.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      const msgs = needs.map((n) => n === 'hungry' ? '我饿啦~ 🍚' : '好困… Zzz 💤').join(' ');
      mainWindow.webContents.send('dsh-thought', msgs.slice(-20));
    }
  }, 5 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
