# AGENTS.md

## 项目概览

Astron Agent 是一个企业级 Agentic Workflow 开发平台，包含控制台前后端、多个核心微服务、插件系统以及部署与基础设施配置。仓库采用多语言多模块结构，主要语言包括 TypeScript、Java、Python 和 Go。

## 仓库结构

### 控制台

- `console/frontend`
  - React 18 + TypeScript + Vite 前端应用
  - 负责控制台 UI、Agent 创建、聊天界面、工作流可视化、模型管理、插件商店等功能
- `console/backend`
  - Java Spring Boot 后端
  - 负责控制台 REST API、SSE、鉴权、管理能力和业务聚合
  - 主要子模块：
    - `hub`
    - `toolkit`
    - `commons`

### 核心微服务

- `core/agent`
  - Python FastAPI 服务
  - 负责 Agent 执行引擎、Chat/CoT/CoT Process Agent、插件调用、会话上下文处理
- `core/workflow`
  - Python FastAPI 服务
  - 负责工作流编排、执行、调试、版本与事件处理
- `core/knowledge`
  - Python FastAPI 服务
  - 负责知识库、文档处理、向量化、检索、RAG 集成
- `core/memory`
  - Python 模块
  - 负责对话历史、短期/长期记忆、会话持久化
- `core/tenant`
  - Go 服务
  - 负责多租户、空间隔离、组织与资源配额管理
- `core/plugin`
  - 插件能力目录
  - 包含 `aitools`、`rpa`、`link` 等插件服务
- `core/common`
  - Python 公共能力模块
  - 负责认证、日志、观测、数据库/缓存/消息队列/对象存储等基础设施抽象

### 其他目录

- `docs`
  - 项目说明、部署、配置、模块说明
  - 架构理解优先参考 `docs/PROJECT_MODULES_zh.md`
- `docker`
  - Docker Compose 及相关基础设施配置
- `helm`
  - Helm Chart 与 Kubernetes 部署配置

## 架构理解

建议按以下路径理解系统：

1. `console/frontend` 负责用户交互入口。
2. `console/backend` 负责控制台 API 聚合和管理逻辑。
3. `core/*` 承担实际智能体、工作流、知识库、租户、插件等核心能力。
4. `core/common` 为 Python 微服务提供统一基础设施支持。
5. 底层依赖 MySQL、Redis、Kafka、MinIO 等基础设施。

典型通信关系：

- Frontend -> Console Backend：HTTP/REST、SSE
- Console Backend -> Core Services：HTTP/REST
- Core Services -> Core Services：Kafka 事件驱动

## 技术栈

- 前端：React 18、TypeScript 5、Vite 5、Ant Design 5、Tailwind CSS
- 控制台后端：Java 21、Spring Boot 3.5.x、MyBatis Plus、Spring Security、OAuth2
- 核心服务：Python 3.11+、FastAPI、SQLAlchemy / SQLModel、Pydantic、OpenTelemetry
- 租户服务：Go 1.23、Gin
- 基础设施：MySQL、Redis、Kafka、MinIO

## 开发约定

### 通用

- 优先做最小必要改动，避免跨模块无关重构。
- 改动前先确认模块边界，避免把控制台逻辑误放到核心服务，或把领域逻辑误放到 API 层。
- 优先沿用现有工程风格、目录组织和命名习惯。
- 如果变更涉及多个服务，明确调用链和依赖方向。
- 优先复用现有接口。

### Python 模块

- 重点目录：`core/agent`、`core/workflow`、`core/knowledge`、`core/common`
- 优先保持清晰分层，避免把业务逻辑堆进路由层。
- 测试使用 `pytest`

### Java 模块

- 重点目录：`console/backend/*`
- 遵守 Spring Boot 分层结构
- DTO、Service、Controller、Mapper 各司其职
- 测试通常使用 JUnit

### TypeScript 前端

- 重点目录：`console/frontend/src`
- 优先复用已有状态管理、工具函数和样式体系

### Go 模块

- 重点目录：`core/tenant`
- 保持接口、服务、存储职责清晰
- 遵循 `go fmt` 和现有项目结构

## 修改建议

- 改前先定位目标模块，不要在不了解调用链时直接改公共层。
- 涉及接口字段变更时，同时检查：
  - 前端调用
  - 控制台后端 DTO / Controller / Service
  - 下游核心服务 schema 或接口定义
- 涉及 Kafka、Redis、MinIO 或鉴权时，优先评估对其他服务的联动影响。

## 重要注意事项

- 进行实现前，优先确认目标模块、上下游依赖和验证方式。
- 优先使用官方的SDK进行代码编写。
- 请确保生成的代码符合ci检查的规范，提高代码质量。
- 如果是修复一个bug，不用写单元测试和集成测试；如果是一个完整的需求，请务必写单元测试，条件允许的情况下，也需要写集成测试。
- 如果是一个完整的需求和复杂的bug，请尽量在关键的地方记录下日志，以便排查错误，但是日志不要太多；

## 重点关注流程

1. 如果涉及到单元测试和集成测试，请将测试功能点和测试代码交给一个新的subagent来进行测试，subagent将测试结果同步给主agent，如果测试有问题，主agent修复完毕后再次交给subagent进行测试，此循环最多进行5轮，如果5轮后测试还没通过，请告知用户；另外如果测试过程中有任何本地环境问题，请询问用户需不需要安装本地环境，用户同意后，自动帮用户安装本地环境再进行测试。
2. 主agent在完成所有需求实现和所有功能测试后，如果涉及到代码文件的更改，必须创建并使用 `.codex/agents/ci-fix-subagent.md` 这个subagent，对本次新增或修改的代码文件进行CI检查，CI检查范围仅限本次修改的代码文件，不要对全量代码进行检查；如果不涉及代码文件的新增和更改，请不要创建这个subagent。
3. 所有实现，测试和ci检查步骤完成后，询问用户是否需要重新部署项目，如果用户确认需要重新部署，则启动新的subagent来执行 `.codex/skills/astron-agent-server-deploy` 这个skill。

