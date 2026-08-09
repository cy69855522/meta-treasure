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

## Project Agent（项目顾问）

每个项目有独立顾问：对话 + 长期笔记按项目隔离；看板每次现读；提示词只带最近 30 条消息。另会只读注入与总管家最近 3 轮对话，便于承接刚对齐的方向；与本项目看板/笔记冲突时仍以本项目为准。

可通过 function tools 提议增删改长期笔记与任务；对话里会先出现前后对比预览，你点「通过」后才会落库。

在 `.env` 配置 OpenAI 兼容网关：

```bash
BBOLUO_API_KEY=...
BBOLUO_BASE_URL=https://bboluo.com/v1
BBOLUO_MODEL=[L]gemini-2.5-flash
```

打开任意项目页 →「项目顾问」。

## 总管家（Steward）

侧边栏收件箱上方「总管家」：跨项目顾问。会读全部项目泳道与近期 Done、各项目长期笔记、收件箱，以及技能库/规则库目录（name / description）；有独立对话与长期笔记。

同样可用 tools 改总管家笔记、任意任务（含收件箱）、活跃项目排序、移入/移出项目储蓄罐，以及增删改技能库/规则库的目录与条目，并走同一套预览确认门。

侧边栏底部有「项目储蓄罐」：拖入项目可暂时隐藏；点击储蓄罐可把项目移回列表末尾。储蓄罐内项目不参与排序。

## 技能库

侧边栏「技能库」：用文件夹整理收集到的 Agent Skills（`name` / `description` + markdown 正文，对齐 Cursor SKILL.md）。

## 规则库

侧边栏「规则库」（技能库下方）：版面与技能库相同，用于收集持久规则（如前端开发规范）。对齐 Cursor Rules：Rule 是始终遵守的约束，Skill 是按需调用的流程。

## 配置项

侧边栏「配置项」：写入本地 `data/settings.json`。当前支持白天 / 夜晚 / 跟随系统主题切换。

## Agent API（外部自动化）

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
