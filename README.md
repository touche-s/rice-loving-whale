# 🐳 蓝色女仆鲸鱼娘桌宠

一个实时感知 **DeepSeek Harness（DSH）** AI 状态的桌面宠物。当你让 AI 干活时，她会跟随 AI 的状态变化：思考 → 歪头呼吸，干活 → 打字，完成 → 弹跳，报错 → 发抖，还会把 AI 正在思考的文字实时显示在气泡里。

![待机](./assets/maid-whale-idle.jpg) ![思考](./assets/maid-whale-thinking.jpg) ![写代码](./assets/maid-whale-coding.jpg) ![完成](./assets/maid-whale-success.jpg) ![报错](./assets/maid-whale-error.jpg)

> 角色设定：蓝色女仆装的 Q 版鲸鱼娘，会在云朵上打盹、歪头思考、噼里啪啦写代码、干饭、躲猫猫。

---

## ✨ 功能

- **AI 状态实时驱动**：监听 DSH 原生事件流（mux 细粒度 + host 兜底双流），自动切换 5 种状态动画
  - `thinking` 思考 → 歪头呼吸
  - `working` 干活 → 打字
  - `completed` 完成 → 弹跳
  - `error` 报错 → 发抖
  - `idle` 待机 → 云朵漂浮
- **💬 心声气泡**：AI 正在思考/输出的文字实时显示在鲸鱼娘头顶（text-delta 流）
- **⚠️ 审批提醒**：AI 请求执行敏感操作时，鲸鱼娘举起手弹醒目提示（红色警告条）
- **❓ 提问提醒**：AI 想问你问题时，鲸鱼娘蹦出来提醒你回话（蓝色提示条）
- **🔔 完成通知**：AI 完成一轮工作时，系统通知"搞定啦"
- **💰 余额与用量**：填 DeepSeek API Key 后在面板查看账户余额、本轮/累计 Token 与估算费用、每轮结算历史
- **互动**：单击喂饭/摸头（随机）、双击躲猫猫、拖拽移动
- **托盘菜单**：显示/隐藏、手动切状态、设置、开机自启、退出
- **DSH 地址可配置**：支持非本机/非默认端口的 DSH 部署
- **断线重连**：指数退避自动重连，坏帧跳过不崩溃
- **零运行时依赖**：状态桥只用 Node 内置能力（fetch/WebSocket/TextDecoder），手写 RFC 6455 客户端

## 📦 安装

### 方式零：DSH 插件（生态原生）⭐

`dsh-plugin/` 是一个 **DSH client 插件**（网页内桌宠）：在 DSH Web UI 右下角浮动鲸鱼娘，随 Agent 状态切换表情 + 心声气泡 + 审批/提问提醒。

```bash
# 发布后：
dsh plugin add dsh-maid-whale-pet --profile web
# 本地开发测试：
install-plugin.bat   # 或手动复制 dsh-plugin → ~/.dsh/profiles/web 并 pnpm add
```

### 方式一：直接下载（推荐）

从 [Releases](https://github.com/your-username/deepseek-maid-whale-desktop-pet/releases) 下载：

- `鲸鱼娘桌宠 Setup x.x.x.exe` — 安装版（自动创建桌面快捷方式，可设置开机自启）
- `鲸鱼娘桌宠 x.x.x.exe` — 便携版（解压即用，单文件）

### 方式二：源码运行

需要 Node.js ≥ 18：

```bash
cd electron
npm install
npm start
```

## 🚀 使用

1. 先启动 DeepSeek Harness Web（默认 `http://127.0.0.1:3080`）
2. 启动桌宠，托盘出现鲸鱼娘图标，窗口底部状态徽章变绿 = 已连接
3. 在 DSH 网页发起对话/工具调用，鲸鱼娘会跟随 AI 状态切换动画

### 交互

| 操作 | 效果 |
|---|---|
| 单击 | 随机喂饭 / 摸头 |
| 双击 | 躲猫猫（隐藏到托盘，点托盘图标回来） |
| 拖拽 | 移动窗口 |
| 托盘右键 | 显示/隐藏、切状态、设置、自启、退出 |

## ⚙️ 配置

右键托盘图标 → 打开**面板** → **设置**页（或在面板左侧点 ⚙️ 设置）：

- **状态源**：
  - **DeepSeek Harness（DSH 事件流）**：监听 DSH 原生事件流实时驱动（默认）
  - **通用 Hooks 端口**：任意 AI 工具通过 curl 推送状态驱动（`http://127.0.0.1:8765/state`）
- **DSH 地址**：DSH Web 服务地址（默认 `http://127.0.0.1:3080`；局域网部署可填 `http://192.168.x.x:3080`）
- **DeepSeek API Key**：可选。填了才能查余额（`/user/balance`）和对话；会用 Windows 加密（DPAPI）存本机，明文不落盘，不会上传
- **开机自启**：登录 Windows 时自动启动

配置文件保存在 `%APPDATA%/maid-whale-desktop-pet/config.json`，也可手动编辑。

> 仓库提供了 `config.example.json` 模板（不含任何敏感信息），字段说明见文件内 `_comment`。真实配置运行时自动生成到 `%APPDATA%`，**不要**把含 Key 的 `config.json` 提交进仓库。

### 其他功能

- **🐳 和鲸鱼娘聊天**：面板 → 对话页，用你配的 API Key（deepseek-chat）。可在宠物页 ✏️ 给鲸鱼娘起名字，名字会自动带入人设。
- **💰 用量/余额**：面板 → 用量页，展示余额、本轮/累计 token 与估算费用、每轮结算历史。
- **🌱 养成**：面板 → 养成页，喂食/摸头提升饱腹与好感，陪 AI 干活积累成长。

### 通用 Hooks 端口（任意 AI 工具驱动鲸鱼娘）

桌宠内置状态端点 `http://127.0.0.1:8765/state`，任何工具/脚本一行命令即可驱动：

```bash
# GET：查询参数
curl "http://127.0.0.1:8765/state?state=thinking&text=正在思考"
# POST：JSON
curl -X POST http://127.0.0.1:8765/state -H "content-type: application/json" \
  -d '{"state":"working","text":"正在写代码"}'
```

支持的状态：`thinking` / `working` / `completed` / `error` / `idle`（含别名：done→completed、failed→error 等）。

**Claude Code 示例**（`~/.claude/settings.json` 的 hooks 配置）：

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "curl -s \"http://127.0.0.1:8765/state?state=completed\"" }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s \"http://127.0.0.1:8765/state?state=working\"" }] }]
  }
}
```

## 🔌 独立运行状态桥（开发/调试）

项目根提供独立模式，验证 DSH 事件流链路：

```bash
node dsh-status-bridge.js
# 参数：--base http://127.0.0.1:3080  --transport auto|websocket|sse  --debug
```

应看到 `✅ SSE CONNECTED`（mux + host 双流）和状态切换日志。

## 🧠 技术说明

```
DSH (dsh web) ──ws──▶ ws-client.js（手写 RFC6455，免 Origin）──▶ dsh-status-bridge.js
                                                                      │ 双流 mux/host、防抖、idle 超时
                                                                      ▼
                                                    Electron 主进程 ──IPC──▶ 渲染进程动画 + 心声气泡
```

- **为什么手写 WebSocket**：DSH 的 `client-connection` 对 `GET /api/events.*` 硬编码返回 426，且 WS 握手有 Origin 同源校验（`file://` 页面会被 403）。桥在主进程用不带 Origin 的裸握手连接，兼容 Electron 28（Node 18，无全局 WebSocket）。
- **状态防抖**：1.5s（同状态事件不重置窗口），8s 无事件自动回 idle。
- 帧格式：`{"type":"server-request","rpcId":"…","method":"<payload.type>","payload":{…}}`

## ❓ 常见问题

**Q：桌宠窗口没出现？**
A：窗口是透明无边框且不占任务栏，可能在屏幕右下角或托盘附近；确认 DSH 已启动、托盘图标存在（右键可"显示鲸鱼娘"）。

**Q：状态徽章一直是灰色/无边框？**
A：未连上 DSH。检查：DSH Web 是否在跑、设置里的地址是否正确、端口是否被占用。

**Q：AI 干活时桌宠不动？**
A：先跑 `node dsh-status-bridge.js` 看日志是否打印 `✅ SSE CONNECTED` 和状态切换；若 `426`/`403`，确认 DSH 版本（需支持 `dsh web` 模式的浏览器传输）。

**Q：心声气泡不显示？**
A：心声来自 `assistant/chunk` 的 text-delta 流，仅在 thinking 状态显示；有些模型只输出 reasoning 块时可能较少。

## 🛠 开发

```bash
cd electron
npm install
npm run check   # 语法检查
npm start       # 运行
npm run build   # 打包便携版
npm run build-installer  # 打包安装版
```

发布新版本：打 tag 推 GitHub，[workflow](./.github/workflows/build-release.yml) 自动构建 Release。

## 📁 项目结构

```
├── dsh-status-bridge.js      # 状态桥（项目根入口，独立运行验证）
├── dsh-plugin/               # DSH client 插件（网页内桌宠，生态原生）
│   ├── package.json          # dsh.client 声明 + ./client exports
│   └── lib/client.js         # 单文件 bundle：状态机 + 浮层 UI
├── electron/
│   ├── main.js               # 主进程：窗口/托盘/设置/桥
│   ├── ws-client.js          # 零依赖 WebSocket 客户端（RFC 6455）
│   ├── dsh-status-bridge.js  # 状态桥实现（双流/防抖/idle/心声）
│   ├── config.js             # 配置读写
│   ├── usage.js              # 余额查询 + 用量/费用统计（usage.json）
│   ├── renderer.js           # 渲染进程：动画/互动/心声气泡
│   ├── settings.html/js      # 设置窗口
│   └── assets/               # 立绘（idle/thinking/coding/success/error + 表情变体）
├── extension/                # （可选）VS Code 扩展雏形
└── assets/                   # 设计稿/预览图
```

## 🙏 致谢

- 角色形象为原创 Q 版女仆鲸鱼娘
- 参考开源生态：[vscode-pets](https://github.com/tonybaloney/vscode-pets)、[duzexu/desktop-pet](https://github.com/duzexu/desktop-pet)、[dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)

## 📄 License

MIT
