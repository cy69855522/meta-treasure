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
