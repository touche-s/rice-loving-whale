# 鲸鱼娘桌宠 × DeepSeek Harness 适配方案

> 目标：让蓝色女仆鲸鱼娘桌宠实时感知 DeepSeek Harness (DSH) 的 AI 运行过程，
> 根据「思考中 / 正在干活 / 完成任务 / 遇到报错 / 待机」切换动作。
> 参考 whale-girl（MIT）的状态桥协议，独立实现，开源到 GitHub。

## 一、结论：能不能感知 AI 运行过程？

**能。** DeepSeek Harness 本地运行在 `http://127.0.0.1:3080`，提供状态接口和 SSE 事件流。
桌宠作为外部 HTTP 消费者即可实时感知，无需侵入 DSH 本体。

| 感知通道 | 说明 | 用途 |
|---|---|---|
| `GET /state`（轮询 3s） | 返回当前活动状态快照 | 兜底状态刷新 |
| `GET /events`（SSE） | 事件流，事件到达立即刷新状态 | 即时响应（毫秒级） |
| `POST /presence`（心跳 15s） | 宣告桌宠在线 | 避免与网页端双宠物 |

## 二、状态映射

DSH / whale-girl 的活动状态 → 鲸鱼娘 5 状态图：

| DSH 活动 | 鲸鱼娘状态 | 动画 | 图片 |
|---|---|---|---|
| `idle` / `sleep` / `wake` | 待机中 | 浮动 | `maid-whale-idle.jpg` |
| `think` / `working` | 思考中 | 歪头 | `maid-whale-thinking.jpg` |
| `working`（工具调用） | 正在干活 | 敲击 | `maid-whale-coding.jpg` |
| `celebrate` / 回合完成 | 完成任务 | 弹跳 | `maid-whale-success.jpg` |
| `error` / `disappointed` | 遇到报错 | 抖动 | `maid-whale-error.jpg` |
| `wait`（等待审批） | 思考中 | 歪头 | `maid-whale-thinking.jpg` |

## 三、技术栈对比

| 方案 | 体积 | 状态感知 | 推荐 |
|---|---|---|---|
| Electron 桌宠 | ~277MB | HTTP 轮询 + SSE | 当前方案（生态成熟） |
| Tauri 桌宠 | ~12MB | 同上 | 后续优化方向 |

## 四、架构

```
DeepSeek Harness (dsh web, :3080)
        │  /state 轮询 3s
        │  /events SSE 即时
        │  /presence 心跳 15s
        ▼
鲸鱼娘桌宠 (Electron)
   ├─ 状态引擎：activity → 5 状态映射
   ├─ 透明悬浮窗：置顶、可拖拽、角标
   ├─ 气泡：状态文案 + 会话提示
   └─ 托盘：显隐 / 手动切状态 / 退出
```

## 五、里程碑

1. [x] 安装 DSH（`npx @deepseek-ai/dsh web`）
2. [x] 参考 whale-girl 协议（`/state` `/events` `/presence`）
3. [ ] 桌宠接入 DSH 状态引擎（轮询 + SSE）
4. [ ] 状态图切换 + 动画（已完成渲染层，待接线）
5. [ ] 打包 + GitHub 开源（README / LICENSE / Release）

## 六、参考项目

- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness（MIT）
- whale-girl（DSH 鲸鱼娘桌宠，15 态状态机）：https://github.com/vlln/whale-girl（MIT）
- Copiwaifu（hook 注入方案）：https://github.com/Panzer-Jack/Copiwaifu
- daidai-live2d-pet（状态桥协议）：https://github.com/Rosa134/daidai-live2d-pet

## 七、风险与对策

| 风险 | 对策 |
|---|---|
| SSE 断线 | 3s 轮询兜底 + SSE 自动重连（retry:3000） |
| 双宠物（网页端 + 桌面端） | `/presence` 心跳契约，网页端自动隐藏 |
| DSH 版本迭代破坏接口 | 接口封装独立模块，跟随 DSH Release 更新 |
| 沙箱限制无法全局安装 | DSH 装在项目目录 `dsh/`，命令局部可用 |
