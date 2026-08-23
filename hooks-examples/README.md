# hooks-examples — 让任意 AI 工具驱动鲸鱼娘

桌面宠物内置了一个通用状态端点 `http://127.0.0.1:8765/state`（见 `electron/hooks-server.js`）。任何能在生命周期事件里执行命令的 AI 工具，都可以通过这里推送状态驱动鲸鱼娘切换动画。

本目录提供两个东西：

- `hook-notify.js` — 统一通知脚本（跨平台、零依赖、自动 URL 编码）
- 主流工具的接入配置示例

## 工作原理

```
Claude Code / Codex / Cline ...
        │  事件发生（会话开始 / 回合结束 / 出错）
        ▼
  hook-notify.js  （一行命令，自动编码）
        │  POST /state?state=working&text=...
        ▼
鲸鱼娘桌宠 127.0.0.1:8765  →  切换对应动画
```

与 DSH 直连（`127.0.0.1:3080` 事件流）的区别：DSH 是桌宠主动拉取、深度状态（心声 / 审批 / 用量）；hooks 是工具主动推送、当前支持状态 + 文字，胜在适配面广。

## 快速测试

先启动桌宠（状态徽章变绿），然后：

```bash
node hook-notify.js working "正在写代码"
node hook-notify.js completed "搞定啦"
node hook-notify.js error
```

桌宠没启动时脚本静默退出（退出码 0），不会打断工具的 hooks 流程。

## 接入配置

| 工具 | 配置文件位置 | 示例文件 | 说明 |
|---|---|---|---|
| Claude Code | `~/.claude/settings.json` 或项目 `.claude/settings.json` | `claude-code.settings.json` | 复制后替换 `C:/path/to/` 为 `hook-notify.js` 实际路径 |
| Codex CLI | `~/.codex/hooks.json` 或项目 `.codex/hooks.json` | `codex.hooks.json` | hooks 默认开启；首次运行需用 `/hooks` 审核信任 |
| Cline | 脚本文件放 `~/Documents/Cline/Hooks/`（全局）或项目 `.clinerules/hooks/` | `cline-hooks/` 目录 | 文件无扩展名、需 shebang；**不支持 Windows**，macOS/Linux 需 `chmod +x` |
| Cursor | 编辑器设置 | — | 事件参考：`sessionStart` / `stop` / `afterAgentResponse`，以官方文档为准 |
| Windsurf | 配置文件 | — | 事件参考：`pre_user_prompt` / `post_cascade_response`，以官方文档为准 |

### 路径写法注意

示例里的路径是占位符，务必改成 `hook-notify.js` 的真实绝对路径：

- Windows：`node C:/path/to/hook-notify.js completed`（JSON 里斜杠用正斜杠，避免 `\` 转义问题）
- macOS/Linux：`node /path/to/hook-notify.js completed`

### 常用事件到状态的映射建议

| 工具事件 | 推送状态 | 效果 |
|---|---|---|
| 会话开始 / 任务开始 | `working` | 鲸鱼娘进入干活动画 |
| 回合结束 / 任务完成 | `completed` | 吃大米饭动画 + 完成气泡 |
| 出错 / 失败 | `error` | 惊慌抱头 |
| 取消 / 空闲 | `idle` | 回待机 |

`hook-notify.js` 支持别名（`done`、`success`、`failed` 等都会自动归一化），详见脚本头部注释。

## 常见问题

- **桌宠没反应？** 确认桌宠已启动、状态徽章是绿色；先跑 `node hook-notify.js working` 手动验证端点是否通。
- **Codex 说 hooks 需要审核？** 在 Codex 会话里输入 `/hooks` 查看并信任 `hook-notify.js` 这条命令（内容变更后需重新信任）。
- **Cline 在 Windows 上不生效？** Cline 的 hooks 目前官方不支持 Windows，可改用其他工具或等官方支持。
- **端口不是 8765？** 通过环境变量 `MAID_WHALE_HOOK_PORT` 覆盖，或改 `electron/hooks-server.js` 的启动端口保持一致。
