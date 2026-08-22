// 安装 dsh-pet-launcher 到 DSH web profile
// 用法: node install-launcher.js [桌宠exe或electron路径]
'use strict';
const fs = require('fs');
const path = require('path');

const DSH_HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.dsh');
const WEB_PROFILE = path.join(DSH_HOME, 'profiles', 'web');
const SRC = path.join(__dirname, '..', 'dsh-pet-launcher');
const DST = path.join(WEB_PROFILE, 'dsh-pet-launcher');
const PET_PATH = process.argv[2] || '';

function log(m) { console.log(m); }

// 1. 复制插件到 profile
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

try {
  // 2. 更新 package.json：dependencies + bundles
  const pkgPath = path.join(WEB_PROFILE, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies['dsh-pet-launcher'] = 'file:./dsh-pet-launcher';
  pkg.dsh = pkg.dsh || {};
  pkg.dsh.profile = pkg.dsh.profile || {};
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];
  if (!pkg.dsh.profile.bundles.includes('dsh-pet-launcher')) {
    pkg.dsh.profile.bundles.push('dsh-pet-launcher');
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  log('已更新 ' + pkgPath);

  // 3. 写桌宠路径配置文件
  if (PET_PATH) {
    const cfg = path.join(DST, '..', '.pet-launcher-path');
    fs.writeFileSync(cfg, PET_PATH, 'utf8');
    log('桌宠路径已写: ' + cfg + ' -> ' + PET_PATH);
  }

  log('✅ 已复制插件到 ' + DST);
  log('提示: 需在 web profile 执行 `pnpm install` 让 file: 依赖生效，然后重启 dsh web。');
  log('      桌宠路径通过环境变量 DSH_PET_PATH 或 .pet-launcher-path 指定。');
} catch (e) {
  log('❌ 安装失败: ' + e.message);
  process.exit(1);
}
