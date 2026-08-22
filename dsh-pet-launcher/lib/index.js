/**
 * dsh-pet-launcher — DSH 宿主插件
 *
 * DSH 启动时自动拉起桌面桌宠（鲸鱼娘 Electron 应用），
 * DSH 退出（插件 dispose）时自动关闭桌宠。
 *
 * 桌宠进程路径解析顺序（可用环境变量 DSH_PET_PATH 覆盖）：
 *   1. $DSH_PET_PATH            —— 显式指定桌宠 exe 或 electron 源码目录
 *   2. profile 的 .pet-launcher-path —— install 脚本写入的路径
 * 找不到桌宠时插件静默跳过，不影响 DSH 启动。
 *
 * 注意：apply 里同步启动桌宠（DSH 的 apply 环境不执行延迟 setTimeout 回调）。
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const name = 'pet-launcher';
const inject = [];

function apply(ctx) {
  let child = null;
  let spawned = false;

  // 解析桌宠启动命令。返回 { cmd, args, cwd } 或 null
  function resolvePet() {
    // 1) 显式环境变量（指向桌宠 exe 或 electron 源码目录）
    if (process.env.DSH_PET_PATH && fs.existsSync(process.env.DSH_PET_PATH)) {
      return buildLaunch(process.env.DSH_PET_PATH);
    }
    // 2) profile 里的 .pet-launcher-path 配置文件（install 脚本写入）
    // 插件位于 profiles/web/node_modules/dsh-pet-launcher/lib
    const cfgFile = path.join(__dirname, '..', '..', '..', '.pet-launcher-path');
    if (fs.existsSync(cfgFile)) {
      const p = fs.readFileSync(cfgFile, 'utf8').trim();
      if (p && fs.existsSync(p)) return buildLaunch(p);
    }
    return null;
  }

  // 根据路径类型构造启动：目录（electron 源码）→ electron.exe .；文件（exe）→ 直接运行
  function buildLaunch(p) {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      // electron 源码目录：electron.exe <dir>
      const exe = path.join(p, 'node_modules', 'electron', 'dist', 'electron.exe');
      if (fs.existsSync(exe)) return { cmd: exe, args: ['.'], cwd: p };
      // 也可能是别的项目结构，跳过
      return null;
    }
    // 单个 exe（发布态桌宠）
    return { cmd: p, args: [], cwd: path.dirname(p) };
  }

  function startPet() {
    if (spawned) return;
    const pet = resolvePet();
    if (!pet) {
      ctx.logger.warn('[pet-launcher] 未找到桌宠可执行文件（可用 DSH_PET_PATH 或 .pet-launcher-path 指定），跳过启动');
      return;
    }
    try {
      // detached: 让桌宠独立于 DSH 进程树，DSH 异常退出也不连带（但 dispose 时显式关闭）
      child = spawn(pet.cmd, pet.args, { cwd: pet.cwd, detached: true, stdio: 'ignore' });
      child.unref();
      spawned = true;
      ctx.logger.info('[pet-launcher] 已启动桌宠: ' + pet.cmd);
    } catch (e) {
      ctx.logger.warn('[pet-launcher] 启动桌宠失败: ' + (e && e.message));
    }
  }

  function stopPet() {
    if (child && child.pid) {
      try {
        // Windows 下杀掉进程树
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).unref();
      } catch (e) { /* ignore */ }
      child = null;
    }
    spawned = false;
  }

  // 延迟一点启动，等 DSH 就绪
  const startTimer = setTimeout(startPet, 1500);

  // 直接同步启动桌宠（不依赖 setTimeout，DSH 可能不执行延迟回调）
  startPet();

  // dispose 时关闭桌宠
  ctx.effect(() => {
    stopPet();
  }, 'pet-launcher: stop desktop pet');

  ctx.logger.info('[pet-launcher] 鲸鱼娘桌宠启动器已加载（DSH 退出时将自动关闭桌宠）');
}

module.exports = { apply, inject, name };
