/**
 * ws-client.js — 零依赖 WebSocket 客户端（Electron 主进程 Node 18 用）
 *
 * 为什么需要它：Electron 28 主进程内置 Node 18.18，没有全局 WebSocket；
 * 而 DSH 的 events 端点要求 WS 握手不带 Origin 头（或与 Host 同源）——
 * 浏览器/渲染进程自动携带的 Origin（file:// 页面为 null）会被
 * client-connection 的 isTrustedApiRequest 拒绝（403）。本客户端用
 * node:net + node:crypto 手写 RFC 6455 客户端：握手时不发送 Origin，
 * 服务器放行；帧解析支持 text / ping / pong / close。
 *
 * 接口兼容浏览器 WebSocket 子集（桥代码用到）：
 *   new WebSocket(url) / .onopen .onmessage .onclose .onerror / .close() / .readyState
 */
'use strict';
const net = require('node:net');
const crypto = require('node:crypto');

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebSocketClient {
  constructor(url) {
    this.readyState = CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.url = url;
    this._sock = null;
    this._buffer = Buffer.alloc(0);
    this._closedByUs = false;
    this._connect();
  }

  _connect() {
    let u;
    try { u = new URL(this.url); } catch (e) { return this._fail(`invalid URL: ${this.url}`); }
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return this._fail(`unsupported protocol: ${u.protocol}`);
    const useTls = u.protocol === 'wss:';
    const port = Number(u.port) || (useTls ? 443 : 80);
    const key = crypto.randomBytes(16).toString('base64');

    const onConnect = () => {
      const req = [
        `GET ${u.pathname}${u.search} HTTP/1.1`,
        `Host: ${u.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '', ''
      ].join('\r\n');
      this._sock.write(req);
    };

    let socket;
    if (useTls) {
      const tls = require('node:tls');
      socket = tls.connect({ host: u.hostname, port }, onConnect);
    } else {
      socket = net.connect(port, u.hostname, onConnect);
    }
    this._sock = socket;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('error', (err) => this._fail(err && err.message ? err.message : String(err)));
    socket.on('close', () => this._onClose());
  }

  _onData(chunk) {
    this._buffer = this._buffer.length === 0 ? chunk : Buffer.concat([this._buffer, chunk]);
    if (this.readyState === CONNECTING) {
      const idx = this._buffer.indexOf('\r\n\r\n');
      if (idx === -1) return; // 头未收全
      const head = this._buffer.slice(0, idx).toString('utf8');
      this._buffer = this._buffer.slice(idx + 4);
      const lines = head.split('\r\n');
      const status = lines[0];
      if (!/^HTTP\/1\.1 101/.test(status)) {
        this._fail(`handshake rejected: ${status}`);
        return;
      }
      const headers = {};
      for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(/^([^:]+):\s*(.*)$/);
        if (m) headers[m[1].toLowerCase()] = m[2];
      }
      this.readyState = OPEN;
      if (this.onopen) { try { this.onopen(); } catch (e) {} }
    }
    // 逐帧解析（服务端→客户端不掩码）
    while (this.readyState === OPEN || this.readyState === CLOSING) {
      const frame = this._parseFrame();
      if (!frame) break;
      this._handleFrame(frame);
    }
  }

  /** 尝试从 buffer 解析一帧；数据不足返回 null */
  _parseFrame() {
    const b = this._buffer;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < 4) return null;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return null;
      len = Number(b.readBigUInt64BE(2));
      off = 10;
    }
    let maskKey = null;
    if (masked) {
      if (b.length < off + 4) return null;
      maskKey = b.slice(off, off + 4);
      off += 4;
    }
    if (b.length < off + len) return null;
    let payload = b.slice(off, off + len);
    if (maskKey) {
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
      payload = out;
    }
    this._buffer = b.slice(off + len);
    return { fin, opcode, payload };
  }

  _handleFrame(frame) {
    switch (frame.opcode) {
      case 0x1: { // text
        const text = frame.payload.toString('utf8');
        if (this.onmessage) { try { this.onmessage({ data: text }); } catch (e) {} }
        break;
      }
      case 0x8: { // close
        this._sendRaw(Buffer.from([0x88, 0])); // 回 close
        this._closeSocket();
        break;
      }
      case 0x9: { // ping → pong
        this._sendRaw(Buffer.concat([Buffer.from([0x8a, frame.payload.length]), frame.payload]));
        break;
      }
      case 0xa: // pong，忽略
      default:
        break;
    }
  }

  /** 发送二进制帧（客户端必须掩码） */
  _sendRaw(payload) {
    if (!this._sock || this._sock.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
    this._sock.write(Buffer.concat([header, mask, masked]));
  }

  close(code, reason) {
    if (this.readyState === CLOSED) return;
    this._closedByUs = true;
    this.readyState = CLOSING;
    try {
      this._sendRaw(Buffer.from([0x88, 0]));
    } catch (e) { /* ignore */ }
    this._closeSocket();
  }

  _closeSocket() {
    if (this._sock) { try { this._sock.destroy(); } catch (e) {} this._sock = null; }
  }

  _fail(message) {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    if (this.onerror) { try { this.onerror(new Error(message)); } catch (e) {} }
    this._closeSocket();
    if (this.onclose) { try { this.onclose({ code: 1006, reason: message }); } catch (e) {} }
  }

  _onClose() {
    const wasOpen = this.readyState === OPEN || this.readyState === CLOSING;
    this.readyState = CLOSED;
    if (this.onclose && wasOpen) {
      try { this.onclose({ code: this._closedByUs ? 1000 : 1006, reason: '' }); } catch (e) {}
    }
  }
}

module.exports = WebSocketClient;
