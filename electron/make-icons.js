/**
 * make-icons.js — 生成鲸鱼娘桌宠全套图标
 *   icon.ico     exe/桌面/窗口图标（圆角方形，白底，多尺寸 256→16）
 *   icon-512.png GitHub / 展示用 512px 图标
 *   tray.png     托盘图标（圆形裁剪，圆外透明，32px）
 * 用法：node make-icons.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const sharp = require(path.join('C:/Users/tjj20/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/sharp'));

const SRC = path.join(__dirname, 'assets', 'maid-whale-idle.jpg');
const OUT_DIR = path.join(__dirname, 'assets');

/** 圆角矩形 alpha 通道（512 画布，radiusRatio 为边长比例） */
async function roundedAlpha(size, radiusRatio) {
  const radius = Math.round(size * radiusRatio);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 255;
      const dx = x < radius ? radius - x : (x > size - radius - 1 ? x - (size - radius - 1) : 0);
      const dy = y < radius ? radius - y : (y > size - radius - 1 ? y - (size - radius - 1) : 0);
      if (dx > 0 && dy > 0) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) a = 0;
        else if (d > radius - 1) a = Math.round((radius - d) * 255);
      }
      const i = (y * size + x) * 4;
      buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = a;
    }
  }
  return await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).extractChannel(3).png().toBuffer();
}

/** 圆形 alpha 通道（圆外透明，托盘用） */
async function circleAlpha(size) {
  const buf = Buffer.alloc(size * size * 4);
  const r = size / 2;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 255;
      if (d > r) a = 0;
      else if (d > r - 1) a = Math.round((r - d) * 255);
      const i = (y * size + x) * 4;
      buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = a;
    }
  }
  return await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).extractChannel(3).png().toBuffer();
}

/**
 * 生成一张带遮罩的图标：立绘 cover 到 target，遮罩 alpha 缩放到 target 后并入
 */
async function maskedIcon(targetSize, alphaBuf, alphaSize) {
  const base = await sharp(SRC)
    .resize(targetSize, targetSize, { fit: 'cover' })
    .png()
    .toBuffer();
  const alpha = await sharp(alphaBuf)
    .resize(targetSize, targetSize)
    .png()
    .toBuffer();
  return await sharp(base).joinChannel(alpha).png().toBuffer();
}

/** ICO 容器：header + 目录项 + PNG 数据 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [], datas = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    datas.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

(async () => {
  try {
    // 1. 512px 圆角图标（GitHub / 展示）
    const alpha512 = await roundedAlpha(512, 0.22);
    const icon512 = await maskedIcon(512, alpha512, 512);
    fs.writeFileSync(path.join(OUT_DIR, 'icon-512.png'), icon512);
    console.log('✅ icon-512.png');

    // 2. 多尺寸圆角图标 → icon.ico
    const sizes = [256, 128, 64, 48, 32, 16];
    const pngs = [];
    for (const size of sizes) {
      const buf = await maskedIcon(size, alpha512, 512);
      pngs.push({ size, buf });
    }
    fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buildIco(pngs));
    console.log(`✅ icon.ico (${sizes.join('/')}px)`);

    // 3. 圆形托盘图标 32px
    const alphaTray = await circleAlpha(64);
    const tray32 = await maskedIcon(32, alphaTray, 64);
    fs.writeFileSync(path.join(OUT_DIR, 'tray.png'), tray32);
    console.log('✅ tray.png (32px 圆形)');
  } catch (e) {
    console.error('❌ 生成失败:', e.message);
    process.exit(1);
  }
})();
