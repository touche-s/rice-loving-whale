/**
 * presets.js — 多套素材预设管理（皮肤/素材方案）
 *
 * 每个预设是一套「各状态图文件映射」，像分类一样可保存多套：
 *   { id, name, files: {idle, thinking, coding, success, error}, variants }
 *
 * 数据存 userData/presets.json；激活的预设 id 存 config.json 的 activePreset。
 * 内置「默认鲸鱼娘」预设不可删除（内置 assets 图）。
 * 用户自定义预设的图复制到 userData/preset-files/<presetId>/。
 */
'use strict';
const fs = require('fs');
const path = require('path');

// 内置默认预设：直接引用 electron/assets 下的文件
const DEFAULT_PRESET = {
  id: 'default',
  name: '默认鲸鱼娘',
  builtin: true,
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

let saveDir = null; // userData

function setSaveDir(dir) {
  saveDir = dir;
}
function presetsPath() {
  return path.join(saveDir || (process.env.APPDATA || ''), 'presets.json');
}
function presetFilesDir(presetId) {
  return path.join(saveDir || (process.env.APPDATA || ''), 'preset-files', String(presetId));
}

// 读取所有预设（含内置默认）
function list() {
  const result = [DEFAULT_PRESET];
  try {
    const raw = JSON.parse(fs.readFileSync(presetsPath(), 'utf8'));
    if (Array.isArray(raw)) {
      for (const p of raw) {
        if (p && p.id && p.id !== 'default') result.push(p);
      }
    }
  } catch (e) { /* 无自定义预设 */ }
  return result;
}

function get(id) {
  return list().find((p) => p.id === id) || DEFAULT_PRESET;
}

function save(list) {
  try {
    const custom = list.filter((p) => p && p.id !== 'default');
    fs.mkdirSync(path.dirname(presetsPath()), { recursive: true });
    fs.writeFileSync(presetsPath(), JSON.stringify(custom, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/** 新增预设：返回完整预设对象 */
function add(name) {
  const id = 'preset-' + Date.now().toString(36);
  const preset = {
    id,
    name: name || '新预设',
    builtin: false,
    files: Object.assign({}, DEFAULT_PRESET.files),
    variants: Object.assign({}, DEFAULT_PRESET.variants)
  };
  const all = list();
  all.push(preset);
  save(all);
  return preset;
}

function remove(id) {
  if (id === 'default') return false;
  const all = list().filter((p) => p.id !== id);
  return save(all);
}

/** 更新预设的名称/files/variants */
function update(id, patch) {
  const all = list();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const cur = all[idx];
  all[idx] = Object.assign({}, cur, patch);
  save(all);
  return all[idx];
}

module.exports = { DEFAULT_PRESET, setSaveDir, list, get, add, remove, update, presetFilesDir };
