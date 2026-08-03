# Progress · 无压多项目管理

个人多项目管理：左侧项目隔离 + 收件箱捕捉 + Now / Next / Later 路线图。  
淡化硬性截止日期，适合 3D Infra / AI 漫剧 / AI 选品等探索型工作。

## 启动

```bash
npm install
npm run dev
```

本机访问：`http://localhost:3432`  
局域网访问：`http://<电脑IP>:3432`（`dev` / `start` 已监听 `0.0.0.0`）

快捷键：`C` 打开收件箱快速捕捉。

## Agent API

在 `.env` 中配置 `API_KEY`（默认 `dev-local-key`）。

```bash
# 推送到收件箱
curl -X POST http://localhost:3432/api/v1/inbox/tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-local-key" \
  -d '{"title":"候选品 A","attributes":{"source":"scraper"}}'

# 更新任务状态
curl -X PATCH http://localhost:3432/api/v1/tasks/<TASK_ID> \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-local-key" \
  -d '{"lane":"done"}'
```

数据文件：`data/progress.db`（SQLite，首次启动自动建库并播种示例项目）。
