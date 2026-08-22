/**
 * usage.js — DeepSeek 余额与用量统计（主进程）
 *
 * 余额：GET https://api.deepseek.com/user/balance（Authorization: Bearer <API key>）
 *   返回 { is_available, balance_infos:[{ currency, total_balance, granted_balance, topped_up_balance }] }
 * 消耗：监听桥 onUsage 的 token 用量，累计当前会话 + 估算费用
 *
 * 估算价格（DeepSeek 官方，元/百万 token，按需可配置）：
 *   deepseek-chat：  输入 2 / 输出 8（缓存命中输入 0.5）
 *   deepseek-reasoner：输入 4 / 输出 16（缓存命中输入 1）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BALANCE_URL = 'https://api.deepseek.com/user/balance';
const PRICES = {
  default: { input: 2, output: 8, cacheInput: 0.5 },
  'deepseek-reasoner': { input: 4, output: 16, cacheInput: 1 }
};

let apiKey = '';
let savePath = null;
let state = null; // 会话用量累计
let balanceCache = null; // { data, at }
// 当前轮最近一次 assistant/message 的 usage（DSH 的 usage 是整轮累积值，
// 每次事件携带从本轮开始累计的 token，所以"最新一次"就是本轮真实总量）
let turnUsage = null;

function init(key, dir) {
  apiKey = key || '';
  savePath = path.join(dir, 'usage.json');
  try { state = JSON.parse(fs.readFileSync(savePath, 'utf8')); }
  catch (e) {
    state = { totalTokens: 0, totalCost: 0, sessionTokens: 0, sessionCost: 0, turns: 0, history: [] };
  }
  if (!state.history) state.history = [];
}

function save() {
  try { fs.mkdirSync(path.dirname(savePath), { recursive: true }); fs.writeFileSync(savePath, JSON.stringify(state, null, 2), 'utf8'); } catch (e) {}
}

/**
 * 记录一次用量（assistant/message 的 usage）。
 * DSH 的 usage 是整轮累积值：每次 assistant/message 携带从本轮开始累计的
 * token。因此这里只"覆盖"为最新一次，不做累加——turn/end 结算时取它即本轮总量。
 */
function recordUsage(usage) {
  if (!usage || typeof usage !== 'object') return;
  turnUsage = {
    inputTokens: usage.inputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    cacheReadTokens: usage.cacheReadTokens || 0,
    reasoningTokens: usage.reasoningTokens || 0,
    model: usage.model
  };
  return { tokens: 0, cost: 0, usage }; // 结算在 endTurn 统一做
}

/**
 * 结算一轮（turn/end）：用本轮最近一次 usage（累积值 = 本轮总量）计算本轮
 * token 与费用，归档进历史。
 */
function endTurn() {
  state.turns += 1;
  let turnTokens = 0;
  let turnCost = 0;
  if (turnUsage) {
    const u = turnUsage;
    turnTokens = u.inputTokens + u.outputTokens + u.cacheReadTokens + u.reasoningTokens;
    turnCost = estimateCost(u, u.model);
    // 重置 turnUsage，下一轮重新累计
    turnUsage = null;
  }
  // 归档本轮
  state.history.unshift({ ts: Date.now(), tokens: turnTokens, cost: turnCost });
  if (state.history.length > 50) state.history.pop();
  // 累计总额
  state.totalTokens += turnTokens;
  state.totalCost += turnCost;
  save();
  return { tokens: turnTokens, cost: turnCost };
}

/** 估算费用（元） */
function estimateCost(u, model) {
  const p = PRICES[model] || PRICES.default;
  const input = (u.inputTokens || 0) * p.input / 1e6;
  const cache = (u.cacheReadTokens || 0) * p.cacheInput / 1e6;
  const output = (u.outputTokens || 0) * p.output / 1e6;
  return input + cache + output;
}

/** 查询余额（返回带状态的对象，不抛错） */
async function fetchBalance() {
  if (!apiKey) return { ok: false, error: '未配置 DEEPSEEK_API_KEY' };
  // 缓存 25 秒
  if (balanceCache && Date.now() - balanceCache.at < 25000) return { ok: true, ...balanceCache.data, cached: true };
  try {
    const res = await fetch(BALANCE_URL, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const json = await res.json();
    const data = parseBalance(json);
    balanceCache = { data, at: Date.now() };
    return { ok: true, ...data };
  } catch (e) {
    // 瞬时失败回退缓存
    if (balanceCache) return { ok: true, ...balanceCache.data, stale: true };
    return { ok: false, error: e && e.message || String(e) };
  }
}

function parseBalance(json) {
  const infos = (json && json.balance_infos) || [];
  // 优先 CNY 且余额>0，其次任意非零，再回退 CNY，最后第一项
  const pick = infos.find((i) => i.currency === 'CNY' && Number(i.total_balance) > 0)
    || infos.find((i) => Number(i.total_balance) > 0)
    || infos.find((i) => i.currency === 'CNY')
    || infos[0];
  return {
    isAvailable: !!json.is_available,
    currency: pick ? pick.currency : 'CNY',
    totalBalance: pick ? pick.total_balance : '0.00',
    grantedBalance: pick ? pick.granted_balance : '0.00',
    toppedUpBalance: pick ? pick.topped_up_balance : '0.00'
  };
}

function snapshot() {
  // 当前进行中轮次的实时 token/费用（用本轮最近一次 usage 累积值）
  let sessionTokens = 0;
  let sessionCost = 0;
  if (turnUsage) {
    const u = turnUsage;
    sessionTokens = u.inputTokens + u.outputTokens + u.cacheReadTokens + u.reasoningTokens;
    sessionCost = estimateCost(u, u.model);
  }
  return {
    // 缓存余额补上 ok 标记，让面板用同一个判断（b.ok === true）正确显示
    balance: balanceCache ? Object.assign({ ok: true, cached: true }, balanceCache.data) : null,
    sessionTokens,
    sessionCost,
    totalTokens: state ? state.totalTokens : 0,
    totalCost: state ? state.totalCost : 0,
    turns: state ? state.turns : 0,
    history: state ? state.history.slice(0, 10) : []
  };
}

module.exports = { init, recordUsage, endTurn, fetchBalance, snapshot, estimateCost };
