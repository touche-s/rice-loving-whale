/**
 * config.js — 鲸鱼娘桌宠配置读写
 *
 * 配置文件位置：app.getPath('userData')/config.json
 * （Electron 中默认 %APPDATA%/maid-whale-desktop-pet/config.json）
 * 配置项：
 *   baseUrl        DSH 地址，默认 http://127.0.0.1:3080
 *   openAtLogin    是否开机自启（布尔）
 *   stateSource    状态源：'dsh'（DSH 事件流）| 'hooks'（通用 Hooks 端口）
 *   hooksPort      通用状态端点监听端口，默认 8765
 *   skin           当前皮肤 id（'default' = assets 平铺文件）
 *   theme          主题：light | dark | blue | pink
 *   deepseekApiKey DeepSeek API key（查询余额/用量，可选）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  baseUrl: 'http://127.0.0.1:3080',
  openAtLogin: false,
  stateSource: 'dsh',
  hooksPort: 8765,
  skin: 'default',
  theme: 'light',
  deepseekApiKey: '',
  petName: '鲸鱼娘'
};

// userData 目录由 main.js 注入（app ready 后可取）
let userDataDir = null;
function setUserDataDir(dir) {
  userDataDir = dir;
}
function configDir() {
  return userDataDir || path.join(process.env.APPDATA || process.cwd(), 'maid-whale-desktop-pet');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_CONFIG, parsed);
  } catch (e) {
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

function save(config) {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { DEFAULT_CONFIG, load, save, configPath, setUserDataDir };
