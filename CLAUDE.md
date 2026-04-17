# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Astron Agent 是企业级 Agentic Workflow 开发平台，整合 AI 工作流编排、模型管理、AI/MCP 工具、RPA 自动化与团队协作。仓库是多语言 monorepo，涵盖 TypeScript、Java、Python、Go。

## 技术栈

- **前端**：TypeScript 5 + React 18 + Vite 5 + Ant Design 5 + Tailwind（`console/frontend/`）
- **控制台后端**：Java 21 + Spring Boot 3.5.x + MyBatis Plus + Spring Security（`console/backend/`，子模块 `hub` / `toolkit` / `commons`）
- **核心微服务**：Python 3.11+ + FastAPI + SQLAlchemy + Pydantic（`core/agent`、`core/workflow`、`core/knowledge`、`core/memory`）
- **租户服务**：Go 1.23 + Gin（`core/tenant`）
- **公共基础库**：`core/common`（Python，认证/审计/OTel/DB/Redis/Kafka/OSS）
- **基础设施**：MySQL、Redis、Kafka、MinIO

## 架构要点（多文件阅读才能看懂的部分）

### 通信与分层

- Frontend → Console Backend：HTTP/REST + SSE
- Console Backend → Core Services：HTTP/REST
- Core Services ↔ Core Services：Kafka 事件驱动（主题：`workflow-events` / `knowledge-events` / `agent-events`）
- 数据：MySQL（关系） + Redis（缓存/会话） + MinIO（对象存储）

### Python 微服务 DDD 分层

所有 Python 服务统一分层：`api/`（FastAPI 路由）→ `service/`（业务）→ `domain/`（领域模型）→ `repository/`（数据访问）→ `main.py`。**路由层不得堆业务逻辑**。

### 模块间依赖（改动前必读）

- `core/common` 被所有 Python 服务依赖 —— 改它之前先确认下游兼容性
- `core/agent` 被 `core/workflow` 调用
- `core/knowledge` 为 agent、workflow 提供 RAG 能力
- `core/tenant` 为所有服务提供租户上下文
- 接口字段变更需同步检查：前端调用 → 控制台后端 DTO/Controller/Service → 下游 core 服务 schema
- 涉及 Kafka/Redis/MinIO/鉴权时，必须评估对其他服务的联动影响

## 常用开发命令

根目录 Makefile 做了多语言智能检测，会按当前目录自动挑对应语言的工具链。

```bash
make setup         # 一次性装工具 + git hooks + 分支策略
make check         # 质量检查（等价 lint，按 active project 自动分发）
make test          # 运行测试
make build         # 构建（Python 跳过，TS/Java/Go 各自构建）
make ci            # 完整 CI：check + test + build
make clean         # 清理构建产物
make status        # 查看当前检测到的 active projects
```

按语言跑单项：`make check-python` / `check-java` / `check-go` / `check-typescript`，以及 `test-python` / `test-java` / `test-go`。

### Pre-commit（推荐）

项目用 pre-commit 做格式化、lint、类型检查、secret 扫描、commit-msg 校验：

```bash
pre-commit install
pre-commit install --hook-type commit-msg
pre-commit run --all-files            # 全量检查
pre-commit run black --all-files      # 单独跑某个 hook
```

### 前端（`console/frontend/`）

```bash
npm run dev           # dev server，端口 3000
npm run build         # 生产构建（同 build:dev / build:test / build-demo）
npm run lint          # ESLint（:fix 自动修）
npm run type-check    # tsc 类型检查
npm run quality       # format + lint + type-check 一把梭
```

前端详细架构另见 [`console/frontend/CLAUDE.md`](console/frontend/CLAUDE.md)（多 Space 模型、Casdoor SSO、HTTP 拦截器、状态管理等）。

### 运行单个 Python 测试

各 Python 服务用 `pytest`。进入对应服务目录后：

```bash
cd core/agent && pytest tests/path/to/test_x.py::test_name -xvs
```

### Docker Compose 本地起服务

```bash
cd docker/astronAgent && cp .env.example .env && vim .env
docker compose -f docker-compose-with-auth.yaml up -d
# 前端 http://localhost/，Casdoor http://localhost:8000 (admin/123)
```

## 开发约定

### 分支策略（强制）

- **禁止直接推送 main / develop**，必须走分支 + PR
- 命名格式：`feature/<name>` / `bugfix/<name>` / `hotfix/<name>` / `doc/<name>`
- 可用 `make new-feature name=xxx` / `new-bugfix` / `new-hotfix` 创建

### Commit 消息

遵循 Conventional Commits：`<type>(<scope>): <desc>`，type ∈ {feat, fix, docs, style, refactor, test, chore}。pre-commit 的 commit-msg hook 会校验。

### 代码质量基线

| 语言 | 格式化 | 质量工具 | 约束 |
|------|--------|----------|------|
| Go | gofmt + goimports + gofumpt | golangci-lint + staticcheck | 圈复杂度 ≤10 |
| Java | Spotless (Google Java Format) | Checkstyle + PMD + SpotBugs | 圈复杂度 ≤10 |
| Python | black + isort | flake8 + mypy + pylint | PEP 8，圈复杂度 ≤10 |
| TypeScript | prettier | eslint + tsc | 严格类型，ESLint 规则 |

### 注释语言一致性

新增/修改代码的注释必须与所在文件既有注释语言保持一致（自动检测，别把英文注释塞到中文文件里，反之亦然）。

### 最小改动原则

优先最小必要改动，避免跨模块无关重构。修改前先定位目标模块，**不在不了解调用链时改公共层（`core/common`、`console/backend/commons`）**。

## 关键参考

- [AGENTS.md](AGENTS.md) —— 更细的模块职责与修改建议清单
- [docs/PROJECT_MODULES_zh.md](docs/PROJECT_MODULES_zh.md) —— 完整架构说明
- [docs/DEPLOYMENT_GUIDE_WITH_AUTH_zh.md](docs/DEPLOYMENT_GUIDE_WITH_AUTH_zh.md) —— 部署完整步骤
- [CONTRIBUTING.md](CONTRIBUTING.md) —— 贡献流程、PR 模板、质量检查清单
- [console/frontend/CLAUDE.md](console/frontend/CLAUDE.md) —— 前端专用指南
