# Progress · 无压多项目管理

个人多项目管理：左侧项目隔离 + 收件箱捕捉 + Now / Next / Later 路线图。  
淡化硬性截止日期，适合 3D Infra / AI 漫剧 / AI 选品等探索型工作。

## 启动

```bash
npm install
npm run dev
```

本机访问：`http://localhost:1314`  
局域网访问：`http://<电脑IP>:1314`（`dev` / `start` 已监听 `0.0.0.0`）

快捷键：`C` 打开收件箱快速捕捉。


## Progress Agent（独立 Codex Home）

项目顾问和总管通过本机 `codex app-server` 提供只读代码问答。它固定使用独立的 Codex Home：`~/.progress/codex`，不会读取 IDE 的 `~/.codex`。可用 `PROGRESS_CODEX_HOME` 指定其他目录。

首次使用需要在这个独立 Home 下完成登录或配置模型。模型、自定义 provider、账号凭据和 MCP 配置都只从该目录读取，不写入项目仓库。配置弹窗可以为每个项目绑定只读代码目录并选择该 Home 中可用的模型。

平台会话状态与服务通信令牌位于 `~/.local/state/progress-codex/`。Agent 不能修改代码、运行终端、构建或测试，只能读取绑定目录并进行对话。

本地检查命令：`node --test scripts/codex-service.test.mjs`、`npx tsc --noEmit`。

## Deep Radar（内置）

工具箱中的 Deep Radar 会在新标签页打开 `/deep-radar/research`。它与 Progress 使用同一个 Next.js 应用和 Codex 执行服务，不需要另行启动 3433 端口。

Deep Radar 工作区只包含：

- 设置：研究模型、最大轮次和信息源；主题跟随 Progress 全局设置
- Deep Research：研究会话、追问、纲要、搜索循环和报告
- 知识库：读取项目根目录下的 `knowledge_base/`

研究历史保存在 `data/deep-radar.db`，与项目管理数据 `data/progress.db` 分开，但由同一个应用进程直接访问。Deep Radar 使用 `~/.progress/codex` 的共享模型配置，不读取 Progress 的技能库或规则库。

## Hot Radar（内置）

工具箱中的 Hot Radar 会在新标签页打开 `/hot-radar/reddit/hot`。Reddit 周榜拉取、正文提取和每周自动更新均在 Progress 的 Next.js 进程内运行，不需要另行启动 1315 端口，也不提供手动刷新入口。

历史榜单保存在独立的 `data/hot-radar.sqlite`，可从热点页的“历史”按钮打开右侧栏，按日期和板块查看。Hot Radar 复用 Progress 全局主题；如果本机不能直接访问 Reddit，可在 `.env.local` 设置 `REDDIT_PROXY`。

验证命令：`npm test`、`node --test scripts/codex-service.test.mjs`、`npx tsc --noEmit`、`npm run build`。
