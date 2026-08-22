#!/usr/bin/env node
/**
 * dsh-status-bridge.js — 鲸鱼娘桌宠 ⇄ DSH 原生事件流 状态桥（项目根入口）
 *
 * 实际实现在 electron/dsh-status-bridge.js（随桌宠一起打包分发）。
 * 此文件仅为独立运行/开发调试入口转发：
 *   node dsh-status-bridge.js   → 直接连 DSH 打印状态日志（链路验证）
 *
 * 参数：--base http://127.0.0.1:3080  --transport auto|websocket|sse
 *       --debounce 1500  --idle 8000  --debug
 */
'use strict';
const api = require('./electron/dsh-status-bridge.js');
if (require.main === module && typeof api.runCli === 'function') {
  api.runCli();
}
module.exports = api;
