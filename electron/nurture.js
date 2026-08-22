/**
 * nurture.js — 养成系统（主进程）
 *
 * 三项数值：
 *   satiety  饱腹度 0-100（喂食 +20；每 10 分钟 -2；≤20 提示饿了）
 *   affection 好感度 0-100（摸头/互动 +2；陪伴 AI 干活 +1；≥60 冒爱心）
 *   growth   成长值 0-∞（每陪 AI 完成一轮工作 +1；决定成长阶段）
 *
 * 成长阶段（自动切换皮肤形象，皮肤 id 约定）：
 *   baby     鲸鱼宝宝（成长值 0-9）    → 皮肤 "baby"
 *   teen     小鲸娘（成长值 10-29）    → 皮肤 "teen"
 *   adult    大鲸娘（成长值 30+）      → 皮肤 "adult"
 *
 * 数据持久化：%APPDATA%/maid-whale-desktop-pet/save.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STAGE_RULES = [
  { id: 'baby', name: '鲸鱼宝宝', min: 0 },
  { id: 'teen', name: '小鲸娘', min: 10 },
  { id: 'adult', name: '大鲸娘', min: 30 }
];

const DEFAULTS = {
  satiety: 60,
  affection: 10,
  growth: 0,
  totalFeeds: 0,
  totalPats: 0,
  totalWorkSessions: 0,
  lastInteractionAt: 0,  // 时间戳
  createdAt: 0
};

let savePath = null;
let state = null;

function setSaveDir(dir) {
  savePath = path.join(dir, 'save.json');
}

function load() {
  if (state) return state;
  try {
    const raw = fs.readFileSync(savePath, 'utf8');
    state = Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (e) {
    state = Object.assign({}, DEFAULTS, { createdAt: Date.now(), lastInteractionAt: Date.now() });
    save();
  }
  return state;
}

function save() {
  if (!savePath || !state) return;
  try {
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) { /* 保存失败不致命 */ }
}

/** 当前成长阶段 */
function stage() {
  let s = STAGE_RULES[0];
  for (const rule of STAGE_RULES) {
    if (state.growth >= rule.min) s = rule;
  }
  return s;
}

/** 下一阶段进度（0-1，已达满级返回 1） */
function stageProgress() {
  const s = stage();
  const idx = STAGE_RULES.indexOf(s);
  if (idx >= STAGE_RULES.length - 1) return 1;
  const next = STAGE_RULES[idx + 1];
  return Math.min(1, (state.growth - s.min) / (next.min - s.min));
}

/** 喂食 */
function feed() {
  const s = load();
  s.satiety = Math.min(100, s.satiety + 20);
  s.affection = Math.min(100, s.affection + 2);
  s.totalFeeds += 1;
  s.lastInteractionAt = Date.now();
  save();
  return snapshot();
}

/** 摸头 */
function pat() {
  const s = load();
  s.affection = Math.min(100, s.affection + 2);
  s.totalPats += 1;
  s.lastInteractionAt = Date.now();
  save();
  return snapshot();
}

/** 陪伴 AI 完成一轮工作 */
function workCompleted() {
  const s = load();
  s.growth += 1;
  s.affection = Math.min(100, s.affection + 1);
  s.totalWorkSessions += 1;
  s.lastInteractionAt = Date.now();
  save();
  return snapshot();
}

/** 时间流逝：饱腹下降 + 计算打盹（长期无陪伴） */
function tick(minutes) {
  const s = load();
  // 每 10 分钟 -2 饱腹
  const delta = Math.floor(minutes / 10) * 2;
  if (delta > 0) {
    s.satiety = Math.max(0, s.satiety - delta);
    save();
  }
  return snapshot();
}

/** 当前是否需要提示（饿了/想睡觉） */
function needs() {
  const s = load();
  const out = [];
  if (s.satiety <= 20) out.push('hungry');
  const idleMin = (Date.now() - s.lastInteractionAt) / 60000;
  if (idleMin > 60) out.push('sleepy');
  return out;
}

/** 完整快照（面板显示用） */
function snapshot() {
  const s = load();
  const st = stage();
  return {
    satiety: s.satiety,
    affection: s.affection,
    growth: s.growth,
    stageId: st.id,
    stageName: st.name,
    stageProgress: stageProgress(),
    totalFeeds: s.totalFeeds,
    totalPats: s.totalPats,
    totalWorkSessions: s.totalWorkSessions,
    needs: needs(),
    hungry: s.satiety <= 20,
    sleepy: (Date.now() - s.lastInteractionAt) / 60000 > 60
  };
}

module.exports = { load, save, feed, pat, workCompleted, tick, snapshot, needs, stage, stageProgress, STAGE_RULES, setSaveDir };
