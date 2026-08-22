/**
 * credentials.js — DeepSeek API Key 安全存储
 *
 * 用 Electron 内置 safeStorage（Windows = DPAPI 系统级加密，绑定当前 Windows
 * 用户），把 API Key 加密后以 base64 存入 config.json 的 deepseekApiKeyEnc 字段。
 * 明文 Key 不会落盘；仅在使用时于内存中解密。
 *
 * 必须在 app ready 之后调用（safeStorage 依赖）。
 */
'use strict';

// safeStorage 由 main.js 注入（避免在 config.js 顶层 require electron）
let safeStorage = null;
function setSafeStorage(ss) {
  safeStorage = ss;
}

// 读取配置里保存的加密 Key（base64），返回明文；没有或解密失败返回 ''
function readApiKey(config) {
  const enc = config && config.deepseekApiKeyEnc;
  if (!enc) return '';
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    // 加密不可用（极少见），只能放弃，不裸存
    return '';
  }
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch (e) {
    return '';
  }
}

/**
 * 把用户填写的 Key 存回 config：
 *  - 传空字符串 → 删除凭据
 *  - 传 Key → 加密后写入 deepseekApiKeyEnc，并删除旧明文 deepseekApiKey 字段
 * 返回更新后的 config 对象（未写盘，由调用方 save）。
 */
function storeApiKey(config, key) {
  const next = Object.assign({}, config);
  delete next.deepseekApiKey; // 清理旧明文，绝不保留
  if (!key) {
    delete next.deepseekApiKeyEnc;
    return next;
  }
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(key);
    next.deepseekApiKeyEnc = buf.toString('base64');
  } else {
    // 加密不可用：宁可存空，不裸存明文（隐私优先）
    delete next.deepseekApiKeyEnc;
  }
  return next;
}

module.exports = { setSafeStorage, readApiKey, storeApiKey };
