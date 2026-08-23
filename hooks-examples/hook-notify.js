#!/usr/bin/env node
// hook-notify.js — 统一状态通知脚本（跨平台，零依赖，Node ≥ 18）
//
// 作用：把任何 AI 工具的生命周期事件转成一条状态推送，驱动鲸鱼娘桌宠。
// 相比在 hooks 配置里手写 curl，用脚本的好处是：
//   1. 自动处理 URL 编码（text 里有中文/空格也不会出错）
//   2. 跨平台一致（Windows/macOS/Linux 同一写法，无 JSON 转义地狱）
//   3. 桌宠没启动时静默失败，不打断工具流程
//
// 用法：
//   node hook-notify.js <state> [text...]
//   node hook-notify.js working
//   node hook-notify.js completed "搞定啦，吃大米饭！"
//
// state 支持别名（宽松接受各种叫法，与 hooks-server 保持一致）：
//   thinking|reasoning|planning → thinking
//   working|running|tool|coding|typing → working
//   completed|done|success|finish|ok → completed
//   error|failed|failure|aborted → error
//   idle|sleep|waiting|stopped → idle
//
// 桌宠状态端点默认 127.0.0.1:8765，可用环境变量 MAID_WHALE_HOOK_PORT 覆盖。
'use strict';
const http = require('http');

const STATE_ALIASES = {
  thinking: ['thinking', 'reasoning', 'planning', 'analyzing', 'think'],
  working: ['working', 'running', 'tool', 'coding', 'typing', 'work', 'executing', 'doing'],
  completed: ['completed', 'done', 'success', 'finish', 'finished', 'complete', 'ok', 'result'],
  error: ['error', 'failed', 'failure', 'fail', 'aborted', 'exception'],
  idle: ['idle', 'sleep', 'waiting', 'stopped', 'standby', 'ready']
};

function normalize(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(STATE_ALIASES)) {
    if (aliases.includes(s)) return canonical;
  }
  return null;
}

const state = normalize(process.argv[2]);
const text = process.argv.slice(3).join(' ') || '';
if (!state) {
  console.error('hook-notify: 未知状态 "' + (process.argv[2] || '') + '"（可用：thinking / working / completed / error / idle）');
  process.exit(1);
}

const port = Number(process.env.MAID_WHALE_HOOK_PORT) || 8765;
const url = `http://127.0.0.1:${port}/state?state=${encodeURIComponent(state)}&text=${encodeURIComponent(text)}`;

const req = http.get(url, (res) => {
  res.resume(); // 消费响应体，不阻塞 hooks
});
req.on('error', () => {
  // 桌宠未启动时静默退出（退出码 0），避免 hooks 流程被中断
});
