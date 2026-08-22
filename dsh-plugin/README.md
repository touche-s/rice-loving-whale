# 🐳 dsh-maid-whale-pet

蓝色女仆鲸鱼娘 —— **DeepSeek Harness 网页内桌宠插件**（client plugin）。

跟随 Agent 状态实时变化：思考 🤔 → 干活 💻 → 完成 🎉 → 报错 💢，实时显示 AI 思考心声，审批/提问时举手 ✋ 提醒。

## 安装

```bash
dsh plugin add dsh-maid-whale-pet --profile web
```

或手动加入 profile：

```bash
cd ~/.dsh/profiles/web
npm/pnpm add dsh-maid-whale-pet
```

重启 DSH Web 后，右下角出现鲸鱼娘浮层。

## 功能

- **Agent 状态驱动**：thinking / working / completed / error / idle 五状态切换表情
- **💬 心声气泡**：AI 实时输出的文字（最近 20 字，两行）显示在浮层上方
- **⚠️ 审批提醒**：AI 请求执行敏感操作时举手提示"需要确认"
- **❓ 提问提醒**：AI 问你问题时举手提示
- **🖱 可拖拽**：拖动鲸鱼娘可改变位置（pointer-events 默认关闭，悬停浮层后开启）

## 事件来源

通过注入的 `connection` 服务开一条**独立 mux 订阅**（`connection.api.events.mux`），与桌面版状态桥同一套状态机逻辑：

```
DSH mux 流（同源 WS）→ connection.api.events.mux → PetStateMachine → 浮层
```

浏览器内同源，无 Origin/426 问题；mux 流允许多个订阅者，不与 client-runtime 冲突。

## 开发

```bash
# 本地模拟验证（无需 DSH）
node .preflight/plugin-sim.js
```

打包发布：`npm publish` 后用户即可 `dsh plugin add`。

## 状态机

与 `electron/dsh-status-bridge.js` 同源逻辑（结构化字段分类 + 1.5s 防抖 + 8s idle 超时），纯前端零依赖，内联于单文件 client bundle。

## 与桌面版的区别

| | 网页版（本插件） | 桌面版（electron/） |
|---|---|---|
| 形态 | DSH Web UI 内右下角浮动 | 真·桌面悬浮窗（置顶全屏） |
| 安装 | `dsh plugin add` | 下载 exe / npm start |
| 事件 | cordis 官方 connection 订阅 | 手写 WS 桥 |
| 生态 | 进 awesome-dsh-plugin | 独立项目 |

## License

MIT
