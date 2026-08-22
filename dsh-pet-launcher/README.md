# 🐳 dsh-pet-launcher — 让鲸鱼娘桌宠跟随 DSH 启动/退出

一个 **DSH 宿主插件**：启动 `dsh web` 时自动拉起桌面鲸鱼娘桌宠，退出 DSH 时自动关闭桌宠。

> 核心价值：不用每次手动启动桌宠。只要 DSH 活着，桌宠就在；DSH 关了，桌宠也自动关。

---

## 它是怎么工作的

```
dsh web 启动
   └─▶ DSH 加载 web profile 的 plugins
         └─▶ 加载本插件 (apply)
               └─▶ 读取桌宠路径 → spawn 桌宠进程 (electron.exe .)
dsh web 退出
   └─▶ 插件 dispose
         └─▶ taskkill 杀掉桌宠进程
```

- **apply**：DSH 启动时同步启动桌宠（注意：DSH 的 apply 环境不执行延迟的 `setTimeout` 回调，所以必须同步启动）。
- **dispose**：DSH 退出时通过 `ctx.effect` 清理，杀掉桌宠进程。

---

## 安装（在你本机）

### 前提
- 已安装 DSH（`dsh` 命令可用）
- 桌宠已就绪：可以是打包好的 `鲸鱼娘桌宠.exe`，也可以是 electron 源码目录

### 步骤 1：跑安装脚本

```bash
# 从项目根目录
node dsh-pet-launcher/install-launcher.js "<桌宠路径>"
```

`<桌宠路径>` 可以是：
- **打包好的 exe**：`C:\path\to\鲸鱼娘桌宠.exe`
- **electron 源码目录**：`C:\path\to\electron`（指向含 `node_modules/electron` 的目录）

脚本会：
1. 把插件复制到 `~/.dsh/profiles/web/dsh-pet-launcher`
2. 更新 `~/.dsh/profiles/web/package.json`（加依赖 + bundles）
3. 把桌宠路径写入 `~/.dsh/profiles/web/.pet-launcher-path`

### 步骤 2：安装依赖（pnpm）

```bash
cd ~/.dsh/profiles/web
corepack pnpm install   # 若 pnpm 在 PATH 直接 `pnpm install`
```

> 这一步让 `file:./dsh-pet-launcher` 依赖生效，在 `node_modules` 里建好链接。

### 步骤 3：重启 dsh web

```bash
# Ctrl+C 停掉当前 dsh web，再
dsh web
```

启动后桌宠应自动拉起；退出 DSH 桌宠自动关闭。

---

## 桌宠路径配置

插件按以下顺序解析桌宠路径：

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1 | 环境变量 `DSH_PET_PATH` | 显式指定，最优先 |
| 2 | `~/.dsh/profiles/web/.pet-launcher-path` | install 脚本自动写入 |

路径可以是：
- **单个 exe 文件**（发布态）：插件直接运行它
- **一个目录**（electron 源码）：插件跑 `electron.exe <目录>`

---

## 常见问题

**Q：桌宠没跟着 DSH 启动？**
A：先看 DSH 终端有没有 `[pet-launcher]` 日志：
- `已启动桌宠: ...` → 插件启动成功
- `未找到桌宠可执行文件` → 路径没配对，检查 `.pet-launcher-path` 或 `DSH_PET_PATH`
- 完全没有 `[pet-launcher]` 日志 → 插件没加载，检查 `package.json` 的 bundles 是否含 `dsh-pet-launcher`，并确认 `node_modules` 里有插件

**Q：改了插件代码没生效？**
A：DSH 加载的是 `~/.dsh/profiles/web/node_modules/dsh-pet-launcher/lib/index.js`（file: 链接的副本）。改仓库里的代码后，需要同步到 profile 的 node_modules 副本，再重启 dsh web。

**Q：桌宠路径改了怎么更新？**
A：直接改 `~/.dsh/profiles/web/.pet-launcher-path` 内容（写新路径），或设置环境变量 `DSH_PET_PATH`，重启 dsh web。

**Q：为什么不用 setTimeout 延迟启动？**
A：实测 DSH 的 apply 环境不执行延迟的 `setTimeout` 回调，导致桌宠不起。所以插件在 apply 里同步直接启动。

---

## 文件说明

```
dsh-pet-launcher/
├── package.json          # 插件声明（name/bundle.patch/peerDeps）
├── cordis.patch.yml      # 挂载到 profile entry 树
├── lib/index.js          # 插件逻辑（apply 启动桌宠，dispose 关闭）
└── install-launcher.js   # 安装辅助脚本
```

## 发布为 npm 包（可选）

要一键安装，可发布到 npm 后执行：

```bash
dsh plugin --profile web add dsh-pet-launcher
```

发布前确保 `package.json` 的 `files` 包含 `lib` 和 `cordis.patch.yml`（当前已配置）。
