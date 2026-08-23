/**
 * hooks-server.js — 通用状态端点（零依赖，Node http）
 *
 * 让任何 AI 工具（Claude Code / Codex / OpenCode / 自定义脚本）通过
 * hooks 一行命令推送状态驱动鲸鱼娘。状态归一化到：
 *   thinking / working / completed / error / idle
 *
 * 端点：
 *   GET  /state?state=thinking&text=正在思考...    （query 传状态）
 *   POST /state  {"state":"working","text":"干活中"}（JSON body）
 *   GET  /alert?kind=approval&text=需要确认...     （审批/提问提醒，query 传）
 *   POST /alert {"kind":"question","text":"问你个问题"}(JSON body)
 *   GET  /health                                 （存活探测）
 *
 * 用法（以 Claude Code hooks 为例，settings.json 里）：
 *   {"hooks": {"Stop": [{"hooks": [{"type":"command","command":"curl -s http://127.0.0.1:8765/state?state=completed"}]}]}}
 *   权限确认：{"hooks": {"PreToolUse": [{"hooks": [{"type":"command","command":"curl -s http://127.0.0.1:8765/alert?kind=approval&text=AI 想执行操作"}]}]}}
 *
 * 归一化映射（宽松接受各种叫法）：
 *   thinking|reasoning|planning → thinking
 *   working|running|tool|coding|typing → working
 *   completed|done|success|finish|ok → completed
 *   error|failed|failure|aborted → error
 *   idle|sleep|waiting|stopped → idle
 */
'use strict';
const http = require('http');

const VALID_STATES = ['thinking', 'working', 'completed', 'error', 'idle'];
const ALERT_KINDS = ['approval', 'question'];
const STATE_ALIASES = {
  thinking: ['thinking', 'reasoning', 'planning', 'analyzing', 'think'],
  working: ['working', 'running', 'tool', 'coding', 'typing', 'work', 'executing', 'doing'],
  completed: ['completed', 'done', 'success', 'finish', 'finished', 'complete', 'ok', 'result'],
  error: ['error', 'failed', 'failure', 'fail', 'aborted', 'exception'],
  idle: ['idle', 'sleep', 'waiting', 'stopped', 'standby', 'ready']
};

function normalizeState(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (VALID_STATES.includes(s)) return s;
  for (const [canonical, aliases] of Object.entries(STATE_ALIASES)) {
    if (aliases.includes(s)) return canonical;
  }
  return null;
}

// 宽松接受审批/提问的各种叫法
function normalizeKind(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (ALERT_KINDS.includes(s)) return s;
  if (['permission', 'permission_request', 'confirm', 'approve', 'grant', 'need_confirm'].includes(s)) return 'approval';
  if (['ask', 'asking', 'query', 'inquiry', 'need_ask'].includes(s)) return 'question';
  return null;
}

/**
 * 启动状态端点服务器
 * @param {object} options
 * @param {number} options.port - 监听端口（默认 8765）
 * @param {(state: string, text: string) => void} options.onState - 状态回调
 * @param {(kind: string, text: string) => void} options.onAlert - 审批/提问提醒回调
 * @param {(msg: string) => void} options.log - 日志回调
 * @returns {{ close(): Promise<void>, port: number }}
 */
function startHooksServer(options = {}) {
  const port = options.port || 8765;
  const onState = options.onState || (() => {});
  const onAlert = options.onAlert || (() => {});
  const log = options.log || (() => {});

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;
    const respond = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
    };

    if (path === '/health') {
      respond(200, { ok: true, service: 'maid-whale-pet', port });
      return;
    }

    if (path === '/state') {
      // GET：query 传状态
      const qState = url.searchParams.get('state');
      const qText = url.searchParams.get('text') || '';
      if (qState) {
        const state = normalizeState(qState);
        if (!state) {
          respond(400, { accepted: false, reason: `unknown state "${qState}"`, valid: VALID_STATES });
          return;
        }
        onState(state, qText);
        respond(200, { accepted: true, state, text: qText });
        return;
      }
      // POST：JSON body（异步读取）
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const state = normalizeState(data.state);
          if (!state) {
            respond(400, { accepted: false, reason: 'missing or unknown "state"', valid: VALID_STATES });
            return;
          }
          onState(state, typeof data.text === 'string' ? data.text : '');
          respond(200, { accepted: true, state, text: data.text || '' });
        } catch (e) {
          respond(400, { accepted: false, reason: 'invalid JSON body' });
        }
      });
      return;
    }

    if (path === '/alert') {
      // GET：query 传 kind（approval / question）
      const qKind = url.searchParams.get('kind');
      const qText = url.searchParams.get('text') || '';
      if (qKind) {
        const kind = normalizeKind(qKind);
        if (!kind) {
          respond(400, { accepted: false, reason: `unknown kind "${qKind}"`, valid: ALERT_KINDS });
          return;
        }
        onAlert(kind, qText);
        respond(200, { accepted: true, kind, text: qText });
        return;
      }
      // POST：JSON body（异步读取）
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const kind = normalizeKind(data.kind);
          if (!kind) {
            respond(400, { accepted: false, reason: 'missing or unknown "kind"', valid: ALERT_KINDS });
            return;
          }
          onAlert(kind, typeof data.text === 'string' ? data.text : '');
          respond(200, { accepted: true, kind, text: data.text || '' });
        } catch (e) {
          respond(400, { accepted: false, reason: 'invalid JSON body' });
        }
      });
      return;
    }

    respond(404, { error: 'not found', hint: 'use GET/POST /state or /alert, or GET /health' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      log(`✅ Hooks 状态端点已启动 http://127.0.0.1:${port}/state`);
      resolve({
        port: server.address().port,
        close: () => new Promise((res) => server.close(() => res()))
      });
    });
  });
}

module.exports = { startHooksServer, normalizeState, VALID_STATES };
