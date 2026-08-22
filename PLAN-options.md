# 鲸鱼娘桌宠：形态方案与发布路线（决策记录）

> 状态：已定稿并实施（2026-08-22）
> 路线：**Electron 桌面桌宠（现有方案完善）+ 开源发布到 GitHub**

---

## 已选路线（对比见本文件下节）

- ✅ 形态：**Electron 独立桌宠**（桌面悬浮窗）——而非 VS Code 扩展 / Tauri 重写
- ✅ 发布：**GitHub 开源 + Release 分发**（安装版 + 便携版）
- ✅ 卖点：**心声气泡**（AI 实时思考文字）+ 互动（喂饭/摸头/躲猫猫）

## 已实施内容（2026-08-22）

1. **DSH 地址配置化**：设置窗口（`settings.html/js`）+ 托盘"设置…"，配置存 `%APPDATA%/maid-whale-desktop-pet/config.json`
2. **开机自启**：设置窗口开关 + `app.setLoginItemSettings`
3. **心声气泡**：桥提取 `assistant/chunk` text-delta → `onThought` 回调 → IPC `dsh-thought` → 气泡实时显示（thinking 状态）
4. **互动**：单击喂饭/摸头（随机）、双击躲猫猫（隐藏到托盘）、拖拽移动
5. **打包就绪**：`electron/package.json` files 补全（preload/ws-client/bridge/config/settings）、`icon.ico`（多尺寸，sharp 生成）、author 字段
6. **GitHub Actions**：`.github/workflows/build-release.yml`（tag 自动构建 Windows 安装版+便携版并发 Release）
7. **README 重写**：安装/使用/配置/FAQ/技术说明/开发
8. **代码整理**：桥移入 `electron/`（打包需要），项目根 `dsh-status-bridge.js` 改为转发入口（独立运行保留）；删除旧 `dsh-bridge.js`/`probe-ws.js`

## 待办（用户侧）

- [ ] `git init && git add && git commit`，推 GitHub 建仓库
- [ ] 改 README 中 Release 链接占位（your-username 仓库）
- [ ] 打 tag `v1.0.0` 触发 Actions 自动构建（本地打包亦可：`cd electron && npm run build`）
- [ ] 可选：补充心声/互动的演示动图到 README

---

## 方案对比（调研存档）

| 维度 | A. VS Code 扩展 | B. Electron 独立桌宠（已选） | C. Tauri |
|---|---|---|---|
| 运行形态 | IDE 内嵌 | 桌面悬浮窗 | 桌面悬浮窗 |
| 动画上限 | Canvas 2D | CSS/Canvas | Canvas/WebGPU |
| 分发 | .vsix 市场 | exe 安装包 | 5-10MB 安装包 |
| 跨平台 | 全支持 | Win 为主 | 全支持 |
| 与"AI 干活"贴合 | 编辑器内 | 全局可见 | 全局可见 |
| 工作量 | 中 | 中（已完成） | 高（重写） |

**为什么选 B 而不是 A（VS Code 扩展）**：用户最初想做插件，但现有 `extension/` 雏形未接 DSH 流；而 Electron 版状态桥已完整跑通（双流/防抖/idle/心声），发布为独立桌宠对"陪用户用 DSH"的体验最直接。`extension/` 目录保留作后续可选扩展。

## 开源参考

- [dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)（Windows DSH 桌宠，已发布 Releases）
- [dafeiyu-pet](https://github.com/1190fasheqi/dafeiyu-pet)（三视图行走/拖拽/喂食/思维链心声）
- [dsh-desk-pet](https://github.com/anneheartrecord/dsh-desk-pet)（macOS 六状态 + 皮肤生成）
- [vscode-pets](https://github.com/tonybaloney/vscode-pets)（Canvas 逐帧动画参考）
- [duzexu/desktop-pet](https://github.com/duzexu/desktop-pet)（跨平台桌面宠物）
