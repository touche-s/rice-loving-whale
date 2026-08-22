/**
 * skins.js — 皮肤系统（主进程）
 *
 * 皮肤目录结构：
 *   electron/assets/                      → 默认皮肤（平铺文件）
 *   electron/assets/skins/<皮肤名>/        → 自定义皮肤，每个皮肤一套五态立绘
 *       idle.gif|idle.jpg / thinking.gif|thinking.jpg
 *       coding.jpg / success.jpg / error.jpg
 *       variants/eyesClosed.jpg、variants/mouthOpen.jpg（可选表情变体）
 *
 * 每个状态支持 gif 或 jpg（优先 gif），按文件名存在性自动检测。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STATE_FILES = ['idle', 'thinking', 'coding', 'success', 'error'];
const EXT_ORDER = ['gif', 'jpg', 'jpeg', 'png', 'webp'];

/** 默认皮肤（assets 平铺）的已知文件映射：全部用动图 */
const DEFAULT_FILES = {
  idle: 'idle.gif',
  thinking: 'thinking.gif',
  coding: 'coding.gif',
  success: 'success.gif',
  error: 'error.gif'
};
const DEFAULT_VARIANTS = {
  eyesClosed: 'maid-whale-idle-closed.jpg',
  mouthOpen: 'maid-whale-idle-openmouth.jpg'
};

/** 找某个状态的首个可用文件（gif 优先） */
function findStateFile(dir, state) {
  for (const ext of EXT_ORDER) {
    const f = path.join(dir, `${state}.${ext}`);
    if (fs.existsSync(f)) return `${state}.${ext}`;
  }
  return null;
}

/** 扫描一个皮肤目录，返回该皮肤的图片清单 */
function scanSkinDir(dir) {
  const files = {};
  for (const state of STATE_FILES) {
    const f = findStateFile(dir, state);
    if (f) files[state] = f;
  }
  // 表情变体
  const variantsDir = path.join(dir, 'variants');
  const variants = {};
  if (fs.existsSync(variantsDir)) {
    for (const v of ['eyesClosed', 'mouthOpen']) {
      for (const ext of EXT_ORDER) {
        const f = path.join(variantsDir, `${v}.${ext}`);
        if (fs.existsSync(f)) { variants[v] = `variants/${v}.${ext}`; break; }
      }
    }
  }
  return { files, variants };
}

/**
 * 列出全部皮肤
 * @param {string} assetsDir - electron/assets 目录绝对路径
 * @returns {Array<{ id: string, name: string, files: object, variants: object }>}
 */
function listSkins(assetsDir) {
  const skins = [];
  // 默认皮肤：assets/ 平铺文件（已知文件名映射，兼容旧命名）
  const defaultFiles = {};
  for (const state of STATE_FILES) {
    const f = path.join(assetsDir, DEFAULT_FILES[state]);
    if (fs.existsSync(f)) defaultFiles[state] = DEFAULT_FILES[state];
    else {
      const alt = findStateFile(assetsDir, state);
      if (alt) defaultFiles[state] = alt;
    }
  }
  if (Object.keys(defaultFiles).length >= 3) {
    skins.push({ id: 'default', name: '鲸鱼娘', files: defaultFiles, variants: { ...DEFAULT_VARIANTS } });
  }
  // 自定义皮肤：assets/skins/<dir>/
  const skinsDir = path.join(assetsDir, 'skins');
  if (fs.existsSync(skinsDir)) {
    for (const entry of fs.readdirSync(skinsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(skinsDir, entry.name);
      const scan = scanSkinDir(dir);
      if (Object.keys(scan.files).length >= 3) {
        skins.push({ id: entry.name, name: entry.name, ...scan });
      }
    }
  }
  return skins;
}

/**
 * 解析某皮肤某状态的相对 URL（相对 assets 目录）
 * @param {object} skin - listSkins 返回的皮肤项
 * @param {string} state - idle/thinking/coding/success/error
 * @returns {string|null} 相对路径，如 "idle.gif" 或 "skins/x/thinking.gif"
 */
function skinStateUrl(skin, state) {
  const f = skin.files[state];
  if (!f) return null;
  return skin.id === 'default' ? f : `skins/${skin.id}/${f}`;
}

/** 皮肤是否包含某状态 */
function skinHas(skin, state) {
  return !!skin.files[state];
}

module.exports = { listSkins, scanSkinDir, skinStateUrl, skinHas, STATE_FILES };
