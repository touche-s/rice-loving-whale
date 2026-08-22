// 设置窗口渲染逻辑
const sourceSelect = document.getElementById('state-source');
const sourceHint = document.getElementById('source-hint');
const urlInput = document.getElementById('base-url');
const keyInput = document.getElementById('deepseek-key');
const autoStartCheck = document.getElementById('auto-start');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');
const statusEl = document.getElementById('status');

const HINTS = {
  dsh: 'DSH：监听事件流实时驱动（需填下方 DSH 地址）',
  hooks: 'Hooks：任意 AI 工具通过 curl 推送状态 → http://127.0.0.1:8765/state'
};

// 切换状态源时更新提示 + 是否显示 DSH 地址
function updateSourceHint() {
  const v = sourceSelect.value;
  sourceHint.textContent = HINTS[v] || '';
  // DSH 地址输入只在 dsh 源时显示（保持简单，始终显示亦可，这里淡化）
}

async function init() {
  const cfg = await window.settingsAPI.getConfig();
  sourceSelect.value = cfg.stateSource === 'hooks' ? 'hooks' : 'dsh';
  urlInput.value = cfg.baseUrl || 'http://127.0.0.1:3080';
  keyInput.value = cfg.deepseekApiKey || '';
  autoStartCheck.checked = !!cfg.openAtLogin;
  updateSourceHint();
}

sourceSelect.addEventListener('change', updateSourceHint);

saveBtn.addEventListener('click', async () => {
  const stateSource = sourceSelect.value === 'hooks' ? 'hooks' : 'dsh';
  const baseUrl = urlInput.value.trim();
  if (stateSource === 'dsh' && !baseUrl) {
    statusEl.textContent = '请输入 DSH 地址';
    statusEl.style.color = '#dc2626';
    return;
  }
  const saved = await window.settingsAPI.saveConfig({
    stateSource,
    baseUrl: baseUrl || 'http://127.0.0.1:3080',
    deepseekApiKey: keyInput.value.trim(),
    openAtLogin: autoStartCheck.checked
  });
  statusEl.textContent = '已保存 ✓';
  statusEl.style.color = '#059669';
  setTimeout(() => window.close(), 600);
});

cancelBtn.addEventListener('click', () => window.close());

init();
