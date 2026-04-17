# RAGFlow 集成问题清单与审核请求

> **状态**：v1~v5 全部吸收 + **v6 Codex 最终 sign-off 已通过**（2026-04-17）
> **作者**：yixinmeng
> **最后更新**：2026-04-17（v6 终稿——修补 RF-18 主描述句的旧口径残留，Codex sign-off 通过）
> **目的**：向 iflytek/astron-agent 上游提交修复 PR 前的全景规划文档。
>
> **累积审核结论摘要**：
> - v1：3 处表述硬伤修正 + 4 项严重度调整 + 新增 RF-18~RF-21 + 路线 A/B/C→D + RF-01 改跨层
> - v2：3 处证据补强合并进原项（RF-08 删 `highlight`、RF-18 版本号 v0.23.1→v0.24.0、RF-19/RF-21 证据处数扩展）+ Java 缺口精确定位至 `KnowledgeService + KnowledgeV2ServiceCallHandler` + D1 阻塞范围精准化
> - v3：3 处自洽性清稿（元信息同步、RF-08 开头残留 `highlight`、§7.1 仍引用 v0.23.x）
> - **v4（自核，颠覆性结论）**：拉 RAGFlow Server 源码 + checkout `v0.20.5` / `v0.24.0` 实锤对比——**`highlight` 不是幻觉**（v2 误判，Server 层实际存在，SDK 未封装）；**v0.20.5 已支持 6 个高级字段**（use_kg / cross_languages / metadata_condition / highlight / rerank_id / keyword）。详见 §9。
> - **v5（Codex 审核修正 3 处）**：① RF-18 差异表修正——`highlight` 升级不仅是 bug 修，含 **behavior-breaking 默认值翻转**（v0.20.5 未传=True，v0.24.0 未传=False）；② 分页参数名事实错误——Server HTTP 两版都是 `page/page_size`，变化的是 SDK 签名；③ §3 路线已统一到 v4/v5 口径，废弃 v1/v2 "第一个 PR 做 D1" 建议，**首推 RF-08**。详见 §10。
> - **v6（Codex 最终 sign-off 条件）**：修补 RF-18 **主描述句**的旧口径残留——原写"差异极小仅 1 字段 + 1 bug 修"，v5 忘了 sweep 到章节头部；v6 改为"字段差异较小，但仍有 highlight 默认语义翻转这一处 behavior-breaking 变化"。教训：下游传导 sweep 必须覆盖同一章节内部所有粒度（标题/描述/表格/影响段）。Codex v6 **sign-off 已通过**。详见 §11。

---

## 1. 背景与约束

### 1.1 项目概况

- **仓库**：[iflytek/astron-agent](https://github.com/iflytek/astron-agent)
- **性质**：讯飞开源的企业级 Agentic Workflow 平台
- **RAG 相关模块**：
  - `core/knowledge/` —— Python FastAPI RAG 服务
  - `core/knowledge/service/impl/ragflow_strategy.py` —— RAGFlow 策略实现
  - `core/knowledge/infra/ragflow/` —— RAGFlow 客户端封装
  - `console/backend/toolkit/` —— Java Spring Boot 聚合层
  - `console/frontend/src/pages/resource-management/` —— 前端知识库页面

### 1.2 四条硬约束（影响所有修复方案的设计）

1. **RAGFlow 可作为 mandatory 依赖**（仅在 RAGFlow 分支内，不要求其他后端用户安装）
2. **不能弃用讯飞自家 RAG 后端**（AIUI-RAG2 / CBG-RAG / Spark-RAG 均为一等公民）
3. **修复不能影响讯飞自家 RAG 链路**（零侵入其他 strategy）
4. **目标是上游合并**（改动面可拆、可回滚、可审阅）

### 1.3 修复策略总原则

> **在 `RAGStrategy` 抽象层不变的前提下，让 RAGFlow strategy 做到 feature-complete，且绝不打扰其他 strategy**

优先把改动局限在：
- `core/knowledge/service/impl/ragflow_strategy.py`
- `core/knowledge/infra/ragflow/*`
- 新增 `core/knowledge/domain/entity/chunk_dto_ragflow.py`（RAGFlow-only DTO）

对公共文件（`chunk_dto.py`、`rag_strategy.py`、`api.py` 的通用端点）只加可选字段，不改语义。

### 1.4 已完成工作

| 编号 | 问题 | 修复来源 |
|------|------|---------|
| RF-00 | RAGFlow 重新切片产生重复文档 | PR #1181（`fix/ragflow-dedup-bug003`，blue-green upsert） |

---

## 2. 问题清单（21 项待修）

> 每项格式：
> - **描述**：一句话概述
> - **证据**：具体代码位置（file:line）与引用片段
> - **行为**：代码当前的实际表现
> - **影响**：用户/运维/维护者受到的后果
> - **改动面**：纯 RAGFlow 沙箱 / 公共代码（只加不改） / 新增表
> - **PR 友好度**：⭐⭐⭐ 零侵入；⭐⭐ 低争议；⭐ 需与讯飞沟通
> - **验证命令**：Codex 可独立跑的 grep / file read 命令

---

### 2.1 架构级缺陷（P0）

#### RF-01 多 Repo 共用单一 RAGFlow dataset

- **描述**：astron-agent 创建的所有 Ragflow-RAG 类型 Repo，最终都挤进 RAGFlow 的同一个 dataset（默认 `Stellar Knowledge Base`）。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:48`
    > 文档注释：`repo_ids: Ignore this parameter, use default dataset name from config`
  - `core/knowledge/service/impl/ragflow_strategy.py:60`
    > `dataset_name = RagflowUtils.get_default_dataset_name()`（硬编码读单一 `RAGFLOW_DEFAULT_GROUP`）
  - `core/knowledge/service/impl/ragflow_strategy.py:240`
    > `group = os.getenv("RAGFLOW_DEFAULT_GROUP", "Stellar Knowledge Base")`
- **行为**：
  - split 上传文件时，无论 Repo 是哪个，`ensure_dataset` 都指向同一个 dataset
  - query 时传入的 `match.repoId` 被忽略，仅按单一 dataset 检索
- **影响**：
  - 多知识库隔离能力 **完全失效**，企业用户无法按部门/场景建多个 Repo
  - `ChunkQueryReq.match.repoId` 在 Ragflow-RAG 分支下形同虚设
  - RAGFlow 的 multi-dataset 能力被废掉
- **关键语义澄清（Codex v2 补充）**：⚠️ `Repo.coreRepoId` **不是 RAGFlow dataset id**——它现在存的是**本地 repo 标识**（默认为随机 UUID / outerRepoId 镜像），Ragflow-RAG 的 Repo 建好后 `coreRepoId` 并未指向实际 RAGFlow dataset。因此本 PR 需要同时定义"`coreRepoId → ensure_dataset_for_repo(coreRepoId)` 按需建 dataset 并绑定"的语义，不能假设已有对应关系。
- **改动面（Codex v1 修正 + v2 精确化）**：⚠️ **不是纯 Python 沙箱**。当前 `/document/upload` 和 `/document/split` 都未接收 `repo_id` 参数，Java 侧也未透传。必须**跨层改动**：
  - Java 侧：**`KnowledgeService` + `KnowledgeV2ServiceCallHandler`**（Codex v2 精确定位，不是 FileInfoV2Service 单点）在切片/上传请求中透传 `coreRepoId`
  - Python API 层：`api.py` 的 `/document/upload` / `/document/split` 接收 `repo_id` Optional 参数
  - Python 策略层：`ragflow_strategy.py` 的 `split/query` 用 `repo_id` 路由到 per-repo dataset
  - `ragflow_utils.py` 新增 `ensure_dataset_for_repo(repo_id)` 薄封装，基于现有 `ensure_dataset()` 扩展（Codex v2 确认可行）
  - 保留 `RAGFLOW_LEGACY_SINGLE_DATASET` 环境变量做灰度兼容
- **PR 友好度**：⭐⭐（原估 ⭐⭐⭐，Codex v1 修正：跨层改动后降级）
- **验证命令**：
  ```bash
  grep -n "RAGFLOW_DEFAULT_GROUP\|get_default_dataset_name\|ensure_dataset" \
    core/knowledge/service/impl/ragflow_strategy.py \
    core/knowledge/infra/ragflow/ragflow_utils.py
  grep -n "repo_id\|coreRepoId" \
    core/knowledge/api/v1/api.py \
    console/backend/toolkit/src/main/java/com/iflytek/astron/console/toolkit/handler/KnowledgeV2ServiceCallHandler.java
  ```

---

#### RF-02 删除 Repo 不级联清理 RAGFlow

- **严重度（Codex v1 修正）**：P0 → **P1**（必须依赖 RF-01 前置，单独做意义有限）
- **描述**：删除 astron-agent 的 Repo 时只做 MySQL 软删，RAGFlow 侧的 dataset 和 documents 不被清理。
- **证据**：
  - `console/backend/toolkit/src/main/java/com/iflytek/astron/console/toolkit/service/repo/RepoService.java:903-935`
    > `@Transactional public Object deleteRepo(Long id, String tag, HttpServletRequest request)` 方法内仅：
    > 1. `repo.setDeleted(true)`（MySQL 软删）
    > 2. `fileCostRollback`（计量回滚）
    > 3. `updateRepoStatus`（状态更新）
    > 未调用任何 RAGFlow delete API
- **行为**：Repo 在 astron-agent 侧标记为删除，但 RAGFlow 内部 dataset 依然存在，documents 全部保留。
- **影响**：
  - 长时间运行后 RAGFlow 侧堆积大量孤儿 dataset / document，占用存储
  - 同名 dataset 重建时可能与历史冲突
- **架构依赖（Codex v1 补充）**：⚠️ **强依赖 RF-01 前置落地**。当前所有 Repo 共用单一 dataset（`Stellar Knowledge Base`），直接调用 RAGFlow `delete_dataset` 会**误删其他 Repo 的数据**。因此：
  - **RF-01 未落地时**：本项应降级为"仅删除该 Repo 关联的 documents"（调 `delete_documents` 而非 `delete_dataset`）
  - **RF-01 落地后**：本项才能做完整的 `delete_dataset` 级联清理
- **改动面**：公共代码加 1 行 Spring 事件发布 + 新增 RAGFlow listener 类（含"仅删 documents"和"删 dataset"两种模式切换）
- **PR 友好度**：⭐（Codex v1 修正：因依赖 RF-01 前置，降级）
- **验证命令**：
  ```bash
  grep -n "deleteRepo\|ragflow.*delete\|delete.*dataset" \
    console/backend/toolkit/src/main/java/com/iflytek/astron/console/toolkit/service/repo/RepoService.java
  ```

---

### 2.2 功能缺失（P0）

#### RF-03 features.md 承诺的"关联 RAGFlow 已上传文档"无实现

- **描述**：`faq/features.md:22` 明确写"直接在 RAGFlow 上传的文件需在 Agent 端进行关联操作才能使用"，但代码中**完全没有此功能**。
- **证据**：
  - `faq/features.md:22`
    > `2. RAGFlow 同步: 目前支持从 Agent 上传同步至 RAGFlow；直接在 RAGFlow 上传的文件需在 Agent 端进行关联操作才能使用。`
  - `core/knowledge/api/v1/api.py` 全部路由（仅 8 个）：
    > `/document/split`、`/document/upload`、`/chunks/save`、`/chunk/update`、`/chunk/delete`、`/chunk/query`、`/document/chunk`、`/document/name`
    > **无** `/document/list-external`、`/document/associate`、`/dataset/browse` 等入口
  - `console/backend/toolkit/src/main/java/.../controller/` 目录搜索 `ragflow/Ragflow` **零命中**
  - `console/frontend/src/` 搜索 `associate`、`import.*document`、`existing.*document`、`关联.*知识` **无对应页面**
- **行为**：用户在 RAGFlow 直接上传的文件，在 Agent 前端文件列表不可见、无法管理。但若 RF-01 未修（共用 dataset），检索时**可能顺带命中**这些外部文件的 chunk，返回的 docId 是 RAGFlow 原生 id，前端无法跳转。
- **影响**：文档与实现严重不一致；用户踩坑后无从自救。
- **改动面**：新增 API（`ragflow_client.list_documents_in_dataset` 已存在但未暴露） + 前端 Drawer + MySQL 关联记录
- **PR 友好度**：⭐⭐（工作量中等，但完全在 RAGFlow 分支内）
- **验证命令**：
  ```bash
  cat faq/features.md | grep -A2 -B2 "关联"
  grep -n "@rag_router" core/knowledge/api/v1/api.py
  find console/frontend/src -iname "*.tsx" | xargs grep -l "list-external\|associate\|关联.*知识" 2>/dev/null
  ```

---

### 2.3 链路污染（P1）

#### RF-04 前端分块参数在 Ragflow-RAG 分支不完整透传

- **描述（Codex v1 修正）**：前端**已暴露**的分块参数（`lengthRange`、`separator`）在 RAGFlow 链路中未下沉到 RAGFlow 的 `parser_config`；其余字段（`overlap` / `cutOff` / `titleSplit`）属于"能力缺口"而非"链路丢失"——前端本身就没针对 RAGFlow 完整暴露。
- **证据**：
  - `console/backend/toolkit/src/main/java/.../KnowledgeV2ServiceCallHandler.java:65-70`
    > 仅透传 `lengthRange` 和 `separator`
  - `core/knowledge/service/impl/ragflow_strategy.py:193-287` 的 `split` 方法
    > 接收了 `overlap`、`cutOff`、`titleSplit` 参数，但**未写入** `ragflow_client.upload_document_to_dataset` 调用的 `chunk_config` 或 `parser_config`
  - 前端分块表单：`console/frontend/src/pages/resource-management/upload-page/components/data-clean.tsx` 未完整暴露 `overlap` / `titleSplit` / `cutOff` 三项
- **行为**：前端改了 `lengthRange`/`separator`，RAGFlow 侧仍走默认切分策略；其余字段前端根本改不到。
- **影响**：UI 设置面板形同虚设；"分块预览"和"重新切片"体感差。
- **改动面**：公共 Java 侧加透传字段 + RAGFlow strategy 内接入 RAGFlow `parser_config`
- **PR 友好度**：⭐⭐
- **验证命令**：
  ```bash
  grep -n "overlap\|cutOff\|titleSplit\|parser_config" \
    core/knowledge/service/impl/ragflow_strategy.py \
    console/backend/toolkit/src/main/java/com/iflytek/astron/console/toolkit/handler/KnowledgeV2ServiceCallHandler.java
  ```

---

#### RF-05 `seperator`（错拼）与 `separator`（正确）字段全栈污染

- **严重度（Codex v1 修正）**：P1 → **P2**（维护性/一致性问题，非集成阻塞）
- **描述**：分隔符字段在前端、Java VO、DB 种子使用错拼 `seperator`；Java Service 转 core-knowledge 时改为正确 `separator`；core-knowledge Pydantic 使用正确 `separator`。
- **证据**：
  - 前端 13 文件 47 处错拼：
    - `console/frontend/src/types/resource.ts:500`
    - `console/frontend/src/pages/resource-management/upload-page/components/data-clean.tsx:230,236,322,325`
    - 其余 hooks 和 segmentation-page 组件
  - Java VO 错拼：
    - `console/backend/toolkit/src/main/java/.../FileInfoV2Service.java:498`
      > `List<String> separator = sliceFileVO.getSliceConfig().getSeperator();`
  - DB 种子错拼（10 条 migration 记录）：
    - `console/backend/hub/src/main/resources/db/migration/V1.13__insert_config_data.sql:15,16,4143-4148`
    - `console/backend/hub/src/main/resources/db/migration/V1.14__insert_config_data2.sql:33,34,6619-6624`
    > 例：`'{"type":0,"seperator":["\\n"],"lengthRange":[16,1024]}'`
  - Java→Python 透传正确拼写：
    - `console/backend/toolkit/src/main/java/.../KnowledgeV2ServiceCallHandler.java:69`
      > `params.put("separator", JSON.toJSONString(separator));`
  - core-knowledge 正确：
    - `core/knowledge/domain/entity/chunk_dto.py:33,47` 使用 `separator`
- **行为**：链路能跑通（Java 中转层做了翻译），但字段名锁死在前端请求契约和 DB 种子里。
- **影响**：新人维护需翻译两遍；IDE 重构/代码补全体验差；无法直接统一 schema。
- **改动面**：
  - Java VO 加 `@JsonAlias({"seperator"})` 兼容两种拼写（**只加不改**）
  - 前端 gradual migration 到正确拼写（可分多次）
  - DB 种子不动（避免破坏存量用户）
- **PR 友好度**：⭐（政治成本中等——可能讯飞不认为是 bug）
- **验证命令**：
  ```bash
  grep -rn "seperator\|getSeperator" console/backend console/frontend 2>/dev/null | grep -v target | head -30
  ```

---

#### RF-06 `ChunkQueryReq.topN` 硬编码 `le=5`

- **描述**：Pydantic schema 把 topN 上限卡在 5，阻断 RAGFlow 天然支持的大批量召回。
- **证据**：
  - `core/knowledge/domain/entity/chunk_dto.py:148`
    > `topN: int = Field(..., ge=1, le=5, description="Required, range 1~5")`
- **行为**：请求超过 topN=5 时 Pydantic 直接报 422。
- **影响**：聚合类查询（如"列出所有与 X 相关的文档"）不可用；RAGFlow top_k 能力白瞎。
- **改动面**：老字段 `topN` 不动（讯飞 RAG 继续用），RAGFlow 分支走新 Optional 字段 `ragflow_ext.top_k`（可 `le=200`）
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "topN\|top_k" core/knowledge/domain/entity/chunk_dto.py core/knowledge/service/impl/ragflow_strategy.py
  ```

---

#### RF-07 JSON `/document/split` 端点未支持 documentId 重切

- **描述**：PR #1181 修复"重新切片重复文档"只覆盖了 form-data 的 `/document/upload` 端点，JSON 的 `/document/split` 端点仍踩旧坑。
- **证据**：
  - `core/knowledge/api/v1/api.py:146` `/document/split` 端点
    > 使用 `FileSplitReq`，**无** `document_id` 字段
  - `core/knowledge/api/v1/api.py:219` `/document/upload` 端点
    > 新增了 `documentId: Optional[str] = Form(None, ...)`，走 `_upsert_document` 分支
  - `core/knowledge/domain/entity/chunk_dto.py:23-51` `FileSplitReq`
    > 无 `document_id` 字段
- **行为**：通过 JSON 端点触发重新切片的调用方，每次都创建新 RAGFlow 文档，产生重复。
- **影响**：非 form-data 客户端（自动化脚本、内部同步工具）仍会积累重复文档。
- **改动面**：`FileSplitReq` 加 `Optional[str] document_id`；`strategy.split` 已支持 `document_id` 参数（`ragflow_strategy.py:202,267`），改一两行透传。
- **PR 友好度**：⭐⭐
- **验证命令**：
  ```bash
  grep -n "document_id\|documentId" core/knowledge/api/v1/api.py core/knowledge/domain/entity/chunk_dto.py core/knowledge/service/impl/ragflow_strategy.py
  ```

---

### 2.4 能力阉割（P1）

#### RF-08 RAGFlow 高级检索参数 API 无入口

- **描述（v4 自核重写）**：RAGFlow Server HTTP `/retrieval` endpoint **在 v0.20.5 基线即支持 6 个高级字段**（use_kg / cross_languages / metadata_condition / highlight / rerank_id / keyword），astron-agent 均未暴露。**能力天花板不在 SDK 版本，而在 `ragflow_strategy.py` 自身**（它用手撸 aiohttp 直接调 HTTP，完全绕过 SDK）。
- **证据（代码侧）**：
  - `core/knowledge/service/impl/ragflow_strategy.py:70-76` 构造 `ragflow_request`
    > 仅包含 `question / dataset_ids / top_k / similarity_threshold / vector_similarity_weight`
  - `core/knowledge/domain/entity/chunk_dto.py:136-151` `ChunkQueryReq`
    > schema 无对应字段
- **证据（RAGFlow Server 侧，v4 已实地 checkout v0.20.5 / v0.24.0 两个 tag 对比）**：

  `/retrieval` endpoint 定义：`api/apps/sdk/doc.py`（v0.20.5 line 1307；v0.24.0 line 1556 起）

  | 字段 | v0.20.5 | v0.24.0 | SDK 0.13.0 | SDK 0.24.0 | 可开放性 |
  |------|:---:|:---:|:---:|:---:|----|
  | `use_kg`（GraphRAG） | ✅ | ✅ | ❌ | ✅ | **立刻可开放（不依赖版本）** |
  | `cross_languages` | ✅ | ✅ | ❌ | ✅ | **立刻可开放** |
  | `metadata_condition` | ✅ | ✅ | ❌ | ✅ | **立刻可开放（比 document_ids 更强）** |
  | `highlight` | ✅（字符串比较 bug，见下注） | ✅（规范化） | ❌ | ❌ | **立刻可开放（注意 v0.20.5 bug）** |
  | `rerank_id` | ✅ | ✅ | ✅ | ✅ | **立刻可开放** |
  | `keyword` | ✅（v0.20.5 line 1445 已实锤） | ✅ | ✅ | ✅ | **立刻可开放** |
  | `toc_enhance` | ❌ | ✅ | ❌ | ✅ | **仅 v0.24.0+** |
  | `tenant_rerank_id` | ❌ | ❌ | ❌ | ❌ | **Step B 实锤：release tag 零命中，仅 main 分支存在（属未发布特性，忽略）** |
  | `question_history` / `document_ids_for_reranking` | ❌ | ❌ | ❌ | ❌ | **v1 幻觉，确认不存在** |

  关键修正：
  - **`highlight` 是 v2 误判**：v2 仅下载 SDK 包，发现 SDK 0.13.0/0.24.0 均无 `highlight`，因而判定为幻觉。v4 拉 Server 源码后实锤：`api/apps/sdk/doc.py` 在 v0.20.5 和 v0.24.0 两个 tag 均有 `req.get("highlight")` 读取。**Server 层支持，SDK 未封装**——由于 astron-agent 是手撸 HTTP，`highlight` 可以直接开放。
- **v0.20.5 的 `highlight` 字符串比较 bug（需绕过）**：
  ```python
  # v0.20.5 api/apps/sdk/doc.py:1427
  if req.get("highlight") == "False" or req.get("highlight") == "false":
  ```
  传 Python `False`（boolean）**不会禁用高亮**，需传字符串 `"False"` / `"false"`。v0.24.0 已改为 `req.get("highlight", None)`，使用更规范。
- **行为**：即使后端 RAGFlow v0.20.5 就支持这些高级字段，前端/API 也无法触发。
- **影响**：RAGFlow 最大卖点（混合检索、GraphRAG、rerank、cross_languages、metadata_condition、highlight）完全被 astron-agent 抽象层屏蔽——**不是 RAGFlow 版本问题，是 astron-agent 自己的字段拼装太窄**。
- **改动面（v4 重估）**：
  - 新增 `RagflowQueryExt` DTO，`ChunkQueryReq` 加 `Optional[RagflowQueryExt] ragflow_ext`
  - `ragflow_strategy.py:70-76` 的 request body 拼装扩展 6 个字段
  - 针对 v0.20.5 `highlight` 字符串 bug：传值时用 `str(bool_value)`（或仅在 RAGFlow >= v0.24.0 时开放 `highlight`，通过 env flag 判定）
- **PR 友好度**：⭐⭐⭐（不依赖 RF-18 版本决策，v0.20.5 就可开放 6 字段）
- **验证命令**：
  ```bash
  grep -n "rerank\|keyword\|use_kg\|highlight\|cross_languages\|metadata_condition" core/knowledge/service/impl/ragflow_strategy.py core/knowledge/domain/entity/chunk_dto.py
  # 参考库实锤：
  grep -n "req.get" ~/workhome/ragflow-ref/server/api/apps/sdk/doc.py  # checkout 目标 tag 后
  ```

---

#### RF-09 `vector_similarity_weight` 硬编码 0.2

- **严重度（Codex v1 修正）**：P1 → **P2**（建议作为 RF-08 的子项同批修复）
- **描述**：向量/关键词权重被写死，用户无法调节。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:75`
    > `"vector_similarity_weight": 0.2,`
- **行为**：所有 RAGFlow 检索都使用 0.2 的向量权重（即 80% 关键词 + 20% 向量），不可改。
- **影响**：纯向量场景（长尾语义）和纯关键词场景（精确匹配）都无法调优。
- **改动面**：纳入 `RagflowQueryExt`（与 RF-08 同批次）
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "vector_similarity_weight" core/knowledge/service/impl/ragflow_strategy.py
  ```

---

#### RF-10 创建 Repo 时无法选择 RAGFlow 的 chunk_method

- **描述（Codex v1 修正）**：RAGFlow 提供多种 chunk_method（常见如 naive / book / table / paper / manual / qa 等；**具体集合以 RF-18 锁定的 SDK 版本为准**，原稿"12 种"数字未在仓库内实锤，已删除），astron-agent 仅使用 `naive`。
- **改动面建议（Codex v1 优化）**：走 Repo 表的 `extra_config` JSON 字段存储 `chunk_method`，而非新增表列——前者 PR 友好度更高，不动 schema。
- **证据**：
  - `core/knowledge/infra/ragflow/ragflow_utils.py`（创建 dataset 时）
    > 未接收 `chunk_method` 参数，默认即 naive
  - 前端 `console/frontend/src/pages/resource-management/knowledge-page/components/modal-component.tsx` 创建知识库弹窗
    > 无 chunk_method 选择项
- **行为**：所有 RAGFlow dataset 使用 naive 切片。
- **影响**：表格、论文、法律文档等结构化内容无法用对应的专用切法。
- **改动面**：
  - Repo 表加 `chunk_method` 字段（或放 extra config JSON）
  - 前端创建 Repo 时按 `ragType === 'Ragflow-RAG'` 渲染下拉
  - RAGFlow strategy 创建 dataset 时读取
- **PR 友好度**：⭐⭐
- **验证命令**：
  ```bash
  grep -n "chunk_method\|parser_id\|parser_config" core/knowledge/infra/ragflow/ragflow_utils.py core/knowledge/infra/ragflow/ragflow_client.py
  ```

---

### 2.5 实现质量（P2）

#### RF-11 官方 `ragflow-sdk` 与手写 aiohttp 双通道并存

- **描述**：`ragflow_client.py` 同时使用官方 SDK 和手写 aiohttp 调用 RAGFlow API，维护成本翻倍。
- **证据**：
  - `core/knowledge/infra/ragflow/ragflow_client.py:20`
    > `from ragflow_sdk import RAGFlow`（官方 SDK）
  - 同文件大量手写 aiohttp 调用：
    > `list_documents_in_dataset`、`get_document_info`、`delete_chunks`、`add_chunk`、`update_chunk`、`delete_documents`、`retrieval_with_dataset` 等
  - 仅少量方法用 SDK（`_rag_object` 仅初始化 dataset 管理相关）
- **行为**：两套代码并行，调 RAGFlow API 时混用。
- **影响**：RAGFlow 版本升级时需双份跟进；容易出现 SDK 已有官方方法但仓库仍手撸的情况。
- **⚠️ v4 重估警示**：由于 SDK 0.13.0/0.24.0 **均未封装 `highlight` 字段**（见 RF-08 v4 核实表），若本项 PR 把 retrieval 调用切到 SDK，**会丧失 `highlight` 能力**。重构方案需要：
  - 要么继续用手撸 HTTP 调 retrieval（仅重构其他方法）
  - 要么切 SDK 后向上游 RAGFlow 提 PR 补齐 `highlight` 封装
- **改动面**：纯 RAGFlow 内部重构；SDK 缺的能力向 RAGFlow 官方提 PR
- **PR 友好度**：⭐⭐（v4 降级：需先评估 SDK 覆盖面，避免能力倒退）
- **验证命令**：
  ```bash
  grep -n "ragflow_sdk\|aiohttp\|httpx" core/knowledge/infra/ragflow/ragflow_client.py | head -30
  ```

---

#### RF-12 文档解析 polling 粗糙

- **描述**：等待 RAGFlow 解析完成用固定 300 秒超时，无指数退避、无重试、无状态持久化。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:176`
    > `final_status = await RagflowUtils.wait_for_parsing(dataset_id, doc_id, max_wait_time=300)`
  - 超时分支：`final_status = "TIMEOUT"`，然后直接 `raise ValueError`
- **行为**：大文档或 RAGFlow 高峰期解析 > 5 分钟就直接失败；失败后需用户手动重试。
- **影响**：用户体验差；无法处理大文件。
- **改动面**：纯 RAGFlow 内部（加 backoff 策略；考虑状态持久化到 DB 或 Redis）
- **PR 友好度**：⭐⭐
- **验证命令**：
  ```bash
  grep -n "wait_for_parsing\|max_wait_time" core/knowledge/service/impl/ragflow_strategy.py core/knowledge/infra/ragflow/ragflow_utils.py
  ```

---

#### RF-13 `_upsert_document` 回滚是 best-effort

- **描述**：PR #1181 的 blue-green upsert 在 parse/fetch 失败时尝试删除 pending doc，但用 `log_only=True` 吞掉删除失败，可能留下孤儿文档。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:1046, 1055, 1063`
    > `await self._safe_delete_document(dataset_id, pending_doc_id, log_only=True)`
  - `core/knowledge/service/impl/ragflow_strategy.py:1072-1098` `_safe_delete_document`
    > `log_only=True` 分支仅记录 warning
- **行为**：upsert 失败时，新建的 pending doc 可能留在 RAGFlow，但 astron-agent 无补偿机制在下次检测并清理。
- **影响**：可能残留半成品文档。
- **改动面**：
  - 轻量方案：加一张 `ragflow_pending_cleanup` 表，失败时写入；后台 worker 定期清理
  - 重量方案：transactional outbox
- **PR 友好度**：⭐（需要新增表或 worker，需与讯飞沟通）
- **验证命令**：
  ```bash
  grep -n "_safe_delete_document\|log_only" core/knowledge/service/impl/ragflow_strategy.py
  ```

---

#### RF-14 `chunks_save` 批量操作不事务

- **描述**：逐个 chunk 调 `ragflow_client.add_chunk`，中途失败只记 `failed_chunks` 但不回滚已成功的。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:517-546` `_process_chunks_batch`
    > `for i, chunk in enumerate(chunks): ... saved_chunks.append(result) ... failed_chunks.append(...)`
    > 失败时直接跳过，不撤销已保存的 chunks
- **行为**：部分成功的请求返回混合状态。
- **影响**：astron-agent MySQL 的 Knowledge 记录与 RAGFlow 侧可能不一致。
- **改动面**：纯 RAGFlow；可先尝试用 RAGFlow 批量 add_chunks API（如果存在），或在失败时反向删除已成功的 chunk
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "_process_chunks_batch\|add_chunk\|failed_chunks" core/knowledge/service/impl/ragflow_strategy.py
  ```

---

#### RF-15 `query_doc` 分页拉取 OOM 风险

- **描述**：先查 1 条拿 total_count，再一次性把 `page_size=total_count` 全部拉进内存。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:920-940`
    > 第一次 `list_document_chunks(... page=1, page_size=1)` 拿 total
    > 第二次 `list_document_chunks(... page=1, page_size=total_count)` 拉全部
- **行为**：大文档（数千 chunks）一次性拉入内存。
- **影响**：OOM 风险；网络超时风险。
- **改动面**：纯 RAGFlow；改为流式分页（固定 page_size=100 之类，多次请求）
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "page_size\|total_count\|list_document_chunks" core/knowledge/service/impl/ragflow_strategy.py
  ```

---

### 2.6 观测稳健（P2）

#### RF-16 RAGFlow 异常吞成空结果

- **严重度（Codex v1 修正）**：P2 → **P1**（不只是观测问题，会把 RAGFlow 真实故障伪装成"0 结果"返回给用户，监控指标失真，线上排障成本高）
- **描述**：RAGFlow 调用异常时静默返回空列表或空字典，上游无法区分"真的没命中"和"RAGFlow 挂了"。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:102-104`
    > `except Exception as e: logger.error(...); return {"query": query, "count": 0, "results": []}`
  - `core/knowledge/service/impl/ragflow_strategy.py:972-974` query_doc 异常分支
    > `except Exception as e: logger.error(...); return []`
  - `core/knowledge/service/impl/ragflow_strategy.py:1017-1019` query_doc_name 异常分支
    > `except Exception as e: logger.error(...); return None`
- **行为**：RAGFlow 宕机时，上游看到的是"0 条结果"。
- **影响**：监控指标失真；用户投诉查不到内容，但后端日志显示"success count +1"。
- **改动面**：纯 RAGFlow；新增异常类型（`RAGFlowUnavailable` / `RAGFlowParseFailed` 等），让 `handle_rag_operation` 分类打点
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "except Exception" core/knowledge/service/impl/ragflow_strategy.py | head
  ```

---

#### RF-17 RAGFlow trace-id 未打通 OTel

- **描述**：RAGFlow 的 response header / request-id 未写入 astron-agent 的 OpenTelemetry span。
- **证据**：
  - `core/knowledge/infra/ragflow/ragflow_client.py` 所有 aiohttp 调用未调用 span.set_attribute
  - `core/knowledge/service/impl/ragflow_strategy.py` query/split 的 span 内无 RAGFlow 返回的 request-id
- **行为**：双端日志排查时无法用 request-id 关联。
- **影响**：线上排障时只能用时间戳 + dataset_id 拼，耗时。
- **改动面**：纯 RAGFlow；给 ragflow_client 加装饰器，把 RAGFlow response header 写入当前 span
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "x-request-id\|request_id\|trace_id\|span.set_attribute\|add_info_events" core/knowledge/infra/ragflow/
  ```

---

### 2.7 Codex 审核新增项（v1 遗漏修正）

Codex v1 审核发现以下 4 项在初稿中被完全遗漏，对 RF-01~RF-17 的落地有前置或兜底性影响。

---

#### RF-18 版本漂移风险（🟠 v4 后降级——能力开放已证明不依赖版本决策）

- **严重度（v4 下调）**：P0 → **P1**（不再阻塞所有能力开放 PR；仅 `toc_enhance` 一个字段依赖升级）
- **描述（v6 修正：与差异表对齐）**：仓库锁定的 RAGFlow server 镜像和 SDK 版本与官方最新版存在代差。v4/v5 实测证明**能力开放字段差异较小**（+1 字段 `toc_enhance`），**但仍存在 1 处 behavior-breaking 变化**——`highlight` 未传时的默认语义从 `True`（v0.20.5 高亮开启）翻转为 `False`（v0.24.0 高亮关闭），astron-agent 当前不传此字段，升级会直接改变返回 chunk 的高亮行为。详见下方差异表与影响分析。
- **证据**：
  - `docker/ragflow/.env:97`
    > 默认镜像 `infiniflow/ragflow:v0.20.5-slim`
  - `core/knowledge/pyproject.toml:37`
    > 锁定 SDK `ragflow-sdk==0.13.0`
  - 官方最新（Codex v2 独立核实）：
    - RAGFlow Server **v0.24.0**（发布于 **2026-02-10**，当前 latest）
    - 上一个 release：v0.23.1（2025-12-31）
    - `ragflow-sdk` **0.24.0**（发布于 2026-02-11，PyPI）
  - **已知 breaking change（v2/v4 核实）**：
    - 自 **v0.22.0 起**，官方 Docker 镜像**不再带 `-slim` 后缀**，只发布 slim edition
    - SDK 层：`retrieve()` 的分页参数 **`offset/limit`（0.13.0）→ `page/page_size`（0.24.0）**
- **行为**：仓库基线与官方主线存在 4 个 minor release 的代差。
- **v4 实测差异（checkout v0.20.5 vs v0.24.0 对比 `api/apps/sdk/doc.py`）**：

  | 维度 | v0.20.5 | v0.24.0 | 差异性质 |
  |------|---------|---------|------|
  | `/retrieval` 支持字段 | use_kg / cross_languages / metadata_condition / highlight / rerank_id / keyword / top_k / similarity_threshold / vector_similarity_weight（9 个） | 上述 + **toc_enhance**（10 个） | **+1 字段** |
  | `highlight` 默认语义 | **未传 → `True`**（高亮开启；line 1427-1430：只有显式传 `"False"/"false"` 才关闭） | **未传 → `False`**（高亮关闭；line 1580-1593：缺省 None 即 False） | ⚠️ **behavior-breaking** |
  | `highlight` 类型校验 | 仅识别字符串 `"False"/"false"`，其他任意值都走 True 分支 | 严格校验 bool/str，非法值直接返回 `error_data_result` | 校验强化 |
  | Server HTTP 分页字段名 | `page` / `page_size`（v0.20.5 `req.get("page")` + `req.get("page_size")`） | `page` / `page_size`（同） | **两版一致**（v4 原稿 `page/size` 是事实错误，v5 修正） |
  | SDK 层 `retrieve()` 签名 | SDK 0.13.0：`offset / limit` | SDK 0.24.0：`page / page_size` | SDK 签名 breaking（HTTP 层无变化） |

- **影响（v5 修正）**：
  - **RF-08 不再被 RF-18 阻塞**——v0.20.5 已经支持 6 个高级字段，立刻可开放（v4 结论保留）
  - **`highlight` 升级含 behavior-breaking 默认值翻转**（Codex v5 揪出）：astron-agent 当前 `ragflow_strategy.py:70-76` 不传 `highlight`，所以：
    - v0.20.5 生产环境：返回的 chunk **默认带 highlight markup**（用户可见）
    - 若升级到 v0.24.0 不改请求体：**highlight markup 消失**（用户可见行为改变）
    - 所以 RF-18 升级 **不只是 "+1 字段 + bug 修"，还含一处用户可感知的默认行为翻转**
  - RF-10 的 chunk_method 集合差异需要单独核实（见 RF-10 章节）
  - 能力开放 PR 基本可在当前基线 v0.20.5 上推进
- **改动面与决策建议（v5 修正）**：
  - **推荐保守锁 v0.20.5**（当前生产已验证）：
    - 升级收益：多 1 字段（`toc_enhance`）+ 校验强化
    - 升级代价：跨 4 个 minor release 的完整兼容性测试、镜像 tag 命名变化、SDK 升级的 breaking change、**`highlight` 默认值翻转需要同步修 `ragflow_strategy.py` 显式传 `highlight=True`** 以保持现有用户体验
  - **若开放 `highlight` 字段（RF-08 内）**：v0.20.5 只认字符串比较，传 Python `False` 不会关闭高亮；需传 `str(False)` 或通过 env flag 仅在 >= v0.24.0 时开放
  - **激进升级**（不推荐，除非有 `toc_enhance` 的强需求）：同步 `docker/ragflow/.env` + `pyproject.toml` + 完整回归 + `ragflow_strategy.py` 显式补 `highlight=True`
- **PR 友好度**：⭐⭐⭐（v4 升级：如果走"保守 + 不升级"路线，只是一个说明性文档 PR）
- **验证命令**：
  ```bash
  grep -n "ragflow:v\|ragflow-sdk" docker/ragflow/.env core/knowledge/pyproject.toml
  ```

---

#### RF-19 `page_size=1000` 截断导致误判

- **严重度**：P1
- **描述**：多处文档/chunk 存在性查询固定拉取前 1000 条，超出后直接误判"不存在"或"漏匹配"。
- **证据（Codex v2 核实：共 3 处，v1 遗漏 1 处）**：
  - `core/knowledge/service/impl/ragflow_strategy.py:331`
    > `_validate_document_exists` 中 `list_documents_in_dataset(..., page_size=1000)`
  - `core/knowledge/service/impl/ragflow_strategy.py:369`（**Codex v2 新发现**）
    > `_get_existing_chunks` 中 `list_document_chunks(..., page_size=1000)` ——大 chunk 文档的重切/保存链路会漏匹配 existing chunk
  - `core/knowledge/infra/ragflow/ragflow_client.py:614`
    > `get_document_info` 内部 `list_documents_in_dataset(..., page_size=1000)`
- **行为**：
  - 大 dataset（>1000 文档）：真实存在的文档被误判为"不存在"
  - 大文档（>1000 chunks，Codex v2 新增）：chunks_save 时已存在的 chunk 漏匹配，导致重复保存或覆盖失败
- **改动面**：纯 RAGFlow；改为按 id 直接查询（`get_document_info(dataset_id, doc_id)`）或分页遍历
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "page_size=1000\|page_size = 1000" core/knowledge/service/impl/ragflow_strategy.py core/knowledge/infra/ragflow/
  ```

---

#### RF-20 RAGFlow 集成测试覆盖严重不足

- **严重度**：P2（非功能缺陷，但阻塞所有高风险修复）
- **描述**：现有 `ragflow_strategy` 测试大量使用 mock，无真实 API 兼容性兜底。
- **证据（Codex v2 修正：废弃 `__init__.py:1` 的弱证据）**：
  - `core/knowledge/tests/service/impl/ragflow_strategy_test.py` 对 `mock/Mock/patch` 的使用达 **100 处**（Codex v2 `grep -En "mock\|Mock\|patch" \| wc -l` 实测）
  - `ragflow_strategy_upsert_test.py` 同样全 mock
  - 空 `__init__.py` 是 Python package marker 的正常形态，**不作为问题证据**（v1 证据表达偏弱，已删除）
- **行为**：RAGFlow 版本升级或 API 变更时，单元测试全部通过，但真实调用可能失败。
- **影响**：
  - RF-18 版本升级的回归风险高
  - 任何涉及 RAGFlow API 调用的 PR 缺少可靠的兼容性验证
- **改动面**：
  - 增加 integration test：用 testcontainers 起真 RAGFlow 实例做 E2E 测试
  - 或至少用 VCR 录制真实 HTTP 响应作为 fixture
- **PR 友好度**：⭐⭐
- **验证命令**：
  ```bash
  wc -l core/knowledge/tests/infra/ragflow/__init__.py
  grep -rn "mock\|Mock\|patch" core/knowledge/tests/service/impl/ragflow_strategy_test.py | wc -l
  ```

---

#### RF-21 `RAGFLOW_DEFAULT_GROUP` 配置行为不一致

- **严重度**：P2
- **描述**：同一个环境变量在不同代码路径的兜底行为不统一：仅 1 处 fallback 到 `"Stellar Knowledge Base"`，其余 3 处未配置时直接抛异常。
- **证据（Codex v2 核实：共 4 处，v1 仅列 2 处）**：
  - `core/knowledge/service/impl/ragflow_strategy.py:240`（有默认值）
    > `group = os.getenv("RAGFLOW_DEFAULT_GROUP", "Stellar Knowledge Base")`
  - `core/knowledge/service/impl/ragflow_strategy.py:310-315` `_validate_chunks_save_config`（无默认值，报错）
  - `core/knowledge/service/impl/ragflow_strategy.py:654`（**Codex v2 新发现**）`_validate_chunks_update_config`（无默认值，报错）
  - `core/knowledge/service/impl/ragflow_strategy.py:858`（**Codex v2 新发现**）`chunks_delete`（无默认值，报错）
- **行为**：未配置 `RAGFLOW_DEFAULT_GROUP` 时，`split` 能跑（用 fallback）；`chunks_save` / `chunks_update` / `chunks_delete` 三条路径全部报错。
- **影响**：部署时若漏配环境变量，只有 split 测试能过，三条 chunk 操作路径全部炸，且现象分散（save/update/delete 各自报错），排障成本极高。
- **改动面**：纯 RAGFlow；统一到单一 config loader（`RagflowUtils.get_default_group()` 或类似）
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "RAGFLOW_DEFAULT_GROUP" core/knowledge/service/impl/ragflow_strategy.py core/knowledge/infra/ragflow/ragflow_utils.py
  ```

---

## 3. 修复路线（v5 当前采用，历经 A/B/C → v1/v2 D → v4/v5 D' 演进）

### 3.1 路线演进记录

| 版本 | 路线 | 为什么废弃 |
|------|------|-----------|
| 初稿 | A/B/C | 未考虑版本基线（RF-18 一类） |
| v1/v2 | D 路线（D1 版本基线前置 + RF-08 在 D3） | v2 仅下载 SDK 包未实测 Server，导致把 RF-08 误判为依赖 RF-18 |
| **v4/v5（当前）** | **D' 路线** | 基于 Server 源码 + `checkout v0.20.5 / v0.24.0` 实测：RF-08 在 v0.20.5 已支持 6 字段，提到最前；RF-18 降级为说明性决策 |

### 3.2 D' 路线：五阶段（v5 权威版）

```
D0 (可并行，无任何依赖)   → RF-07 | RF-19 | RF-21
     ↓
D1 (基线决策，v5 推荐秒决) → RF-18：保守锁 v0.20.5（除非业务要 toc_enhance）
     ↓
D2 (能力开放，核心价值兑现) → RF-08 (+6 字段) + RF-09 (解硬编码)；v0.24.0 升级时 +RF-10
     ↓
D3 (可靠性与观测)          → RF-15 → RF-16 → RF-17 → RF-12 → RF-14 → RF-13
                             贯穿：RF-20（集成测试兜底）
     ↓
D4 (跨层大改)              → RF-01（跨层 repo_id） → RF-02（依赖 RF-01） → RF-03（独立大 PR）
     ↓
(支线，穿插推进)          → RF-04（分块参数透传） | RF-05（seperator 拼写） | RF-11（SDK 重构）
```

### 3.3 阶段说明

| 阶段 | 目标 | 包含项 | 依赖 | 估期 |
|------|------|--------|------|------|
| **D0** | 纯代码质量修复，**上游沟通暖身** | RF-07 / RF-19 / RF-21 任一 | 无 | 1-2 天 |
| **D1** | 锁版本基线（文档 PR） | RF-18 | 无（v4/v5 已有强默认） | 0.5 天 |
| **D2** | **企业用户核心价值兑现** | RF-08 + RF-09（+RF-10 若升级） | 仅 RF-18 决策（秒做） | 1-2 周 |
| **D3** | 可靠性与观测 | RF-15 / RF-16 / RF-17 / RF-12 / RF-14 / RF-13 | 互相独立 | 2-3 周 |
| **D4** | 跨层重构 + 新功能 | RF-01 / RF-02 / RF-03 | RF-01 在 RF-02/03 前 | 2-4 周 |
| 支线 | 维护性/补强 | RF-04 / RF-05 / RF-11 | 无 | 穿插 |
| 贯穿 | 测试兜底 | RF-20 | 跨 D2-D4 持续 | 持续 |

### 3.4 v5 第一个 PR 建议

**首推：RF-08 + RF-09（能力开放 +6 字段）**

理由：
- v4 Server 实测（`~/workhome/ragflow-ref/server/api/apps/sdk/doc.py` @ tag v0.20.5）证明 6 字段全部已存在
- 对企业用户立刻可感知（混合检索 / GraphRAG / rerank / 跨语言 / metadata_condition / highlight）
- 讯飞 reviewer 看到"v0.20.5 基线已支持"的实锤不会质疑版本依赖
- 对其他 strategy 零影响（新增 `Optional[RagflowQueryExt]` 字段）
- ⚠️ `highlight` 字段需处理 v0.20.5 字符串比较 bug（传 `str(bool_value)` 或 env flag）

**备选试水（更低风险，但用户可感知度低）**：
- **RF-07**：JSON `/document/split` 补全 `documentId` 重切去重
- **RF-19**：`page_size=1000` 截断 → 真分页
- **RF-21**：`RAGFLOW_DEFAULT_GROUP` fallback 统一

### 3.5 第二个 PR（D4）：RF-01 跨层改造

- **不是**纯 Python 修复
- **Java 缺口精确位置**：`KnowledgeService` + `KnowledgeV2ServiceCallHandler`
- 必须包含 Java 侧 `coreRepoId` 透传 + Python API 层接收 + strategy 层消费
- **必要前置语义**：`Repo.coreRepoId` 当前**不是** RAGFlow dataset id，PR 里需要定义"按需建 dataset 并绑定"的语义

---

## 4. 请 Codex 审核的重点

请针对以下 7 个维度做独立审核：

### 4.1 事实核验（最关键）

对每一项 RF-01 ~ RF-17，**用清单里提供的"验证命令"独立跑一遍**，确认：

- 文件路径和行号是否准确
- 代码片段引用是否忠实（没有被润色或夸大）
- "行为"描述是否与代码一致

**重点怀疑项**：
- RF-04：我说"overlap / cutOff / titleSplit 未写入 parser_config"。请核实 `ragflow_strategy.py` 的 `split` 方法内部，这些参数是否**真的没被用到**（只是接收但不传给 RAGFlow），而非通过其他途径传递。
- RF-13：`log_only=True` 的 3 处是否都真的在失败路径上（而非 success 路径）。
- RF-14：是否存在 RAGFlow 批量 add_chunks 的 SDK 方法但未被使用？

### 4.2 完整性检查

- 是否遗漏了 RAGFlow 相关的其他问题？建议全仓 grep `ragflow|Ragflow|RAGFlow`，对照清单看有无漏项。
- 建议额外关注：
  - `core/knowledge/tests/` 下的 RAGFlow 相关测试是否覆盖完整
  - `docker/ragflow/` 下的部署脚本是否有坑（端口、版本、network 等）
  - `helm/astron-agent/values.yaml` 中 RAGFlow 相关配置
  - `docker/astronAgent/.env.example` 中 RAGFlow 环境变量是否完整

### 4.3 严重度评估

对每项的优先级（P0 / P1 / P2）提出异议或确认。重点关注：

- RF-05（seperator 拼写）是否应该降到 P2？
- RF-13（upsert 回滚）是否应该升到 P1？它可能残留数据，风险被低估？

### 4.4 改动面评估

对每项"改动面"标注是否准确。重点关注：

- RF-02 用 Spring 事件的方案是否在 astron-agent 现有架构中可行？（是否已用 `ApplicationEventPublisher`？）
- RF-03 的"新增 API + 前端 Drawer"工作量估算是否合理？
- RF-13 是否必须新增表，能否用 Redis 替代？

### 4.5 PR 友好度评估

对每项的 ⭐ 评级提出异议。重点关注：

- 哪些 ⭐⭐⭐ 其实可能被讯飞拒（比如触及他们不愿开放的抽象层）？
- 哪些 ⭐ 其实可能被讯飞欢迎？

### 4.6 修复路线建议

三条路线哪条最合理？是否有第四条更优？

- 是否应该把 RF-03（功能缺失）单独作为一个大 PR（含 backend + frontend），而非放路线内？
- RF-05（seperator 拼写）是否应该单独作为一个独立的 cleanup PR，还是放弃？

### 4.7 潜在盲点

- 是否有"看似局部改动但实际会产生连锁影响"的项？
- 是否有因 RAGFlow 版本差异导致某些 API 不兼容的风险？（当前部署的 RAGFlow 版本是？）
- RAGFlow-sdk 最新版是否已包含我们手写的所有 API？

---

## 5. 审核结果请以下列格式返回

请 Codex 以 JSON 或 Markdown 表格形式返回每项审核结论：

```markdown
| 项目 | 事实准确性 | 严重度 | 改动面 | PR 友好度 | 备注 |
|------|-----------|--------|--------|-----------|------|
| RF-01 | ✅ 准确 / ⚠️ 有误 / ❌ 错误 | 同意 P0 / 建议改 Px | 同意 / 建议改 | 同意 / 建议改 | 具体建议 |
| ... | ... | ... | ... | ... | ... |
```

另外请回答：

1. **遗漏清单**：还有哪些 RAGFlow 问题没被本文档覆盖？
2. **误报清单**：本文档中哪些项其实不构成问题？
3. **最优路线**：你推荐哪条路线，或提出新路线？
4. **立即动手建议**：如果只改 1 个 PR，你建议改哪一项？

---

## 6. Codex v1 审核反馈摘要（2026-04-17 已吸收）

### 6.1 事实准确性修正

| 项目 | v1 反馈 | 处理 |
|------|---------|------|
| RF-04 | 表述放大（"overlap/titleSplit/cutOff 丢失"不准确，前端本就没完整暴露） | ✅ 描述已收缩为"lengthRange/separator 未下沉，其他是能力缺口非链路丢失" |
| RF-08 | 幻觉字段（`question_history`、`document_ids_for_reranking` 在仓库及 `ragflow-sdk==0.13.0` 中无直接证据） | ✅ 已删除幻觉字段，剩余字段标注"待 RF-18 版本基线核对" |
| RF-10 | "12 种 chunk_method"数字未在仓库实锤 | ✅ 已改为"多种（具体集合以 RF-18 为准）" |

### 6.2 严重度调整

| 项目 | 原 | 新 | 理由 |
|------|---|---|------|
| RF-02 | P0 | **P1** | 依赖 RF-01 前置，单独做会误删其他 Repo 数据 |
| RF-05 | P1 | **P2** | 维护性问题，非集成阻塞 |
| RF-09 | P1 | **P2** | 建议作为 RF-08 子项同批修复 |
| RF-16 | P2 | **P1** | 不只是观测，会把故障伪装成"0 结果" |

### 6.3 架构依赖修正

- **RF-01 不是纯 Python 沙箱**：`/document/upload` 和 `/document/split` 未接收 `repo_id`，Java 侧也未透传。必须跨层改动（Java + Python API + Python strategy）。
- **RF-02 依赖 RF-01 前置**：RF-01 未落地时不能调 `delete_dataset`（会误删其他 Repo），只能调 `delete_documents`。

### 6.4 新增项（Codex v1 发现的遗漏）

| 项目 | 概要 | 影响 |
|------|------|------|
| **RF-18** | 版本漂移（v0.20.5 vs v0.23.1；SDK 0.13.0 vs 0.24.0） | 阻塞 RF-08/RF-10 能力边界决策 |
| **RF-19** | `page_size=1000` 截断误判 | 大 dataset 时 "文档不存在" 误判 |
| **RF-20** | 集成测试覆盖严重不足 | 版本升级/API 变更无回归兜底 |
| **RF-21** | `RAGFLOW_DEFAULT_GROUP` 行为不一致 | 漏配环境变量时错误延迟到 chunk_save 才暴露 |

### 6.5 路线调整

- **废弃** A/B/C 路线（未考虑版本基线）
- **采纳** D 路线（D1 版本基线 → D2 架构前置 → D3 可感知正确性 → D4 可靠性 → D5 大功能）

### 6.6 立即动手建议调整

- **原建议**：RF-01 作为第一个 PR
- **Codex v1 建议并采纳**：**先做 D1（RF-18 版本基线核实）**，再动 RF-01 跨层改造

### 6.7 未采纳的分歧（如有）

- 暂无。v1 反馈全部采纳。

---

## 7. 下一步行动（锚定 D 路线）

### 7.1 阶段一（D1，v4 更新：已有强 default，决策可秒定）

**v4 结论（默认采纳）**：保守锁 v0.20.5。原因见 §9 与 RF-18 v4 重写部分。

- [x] ~~跑 SDK 版本确认~~（`ragflow-sdk==0.13.0`，v2 已核）
- [x] ~~核实镜像 tag~~（`v0.20.5-slim`，v2 已核）
- [x] ~~阅读 v0.20.5 → v0.24.0 差异~~（v4 已实地 checkout 对比，差异仅 `toc_enhance` + `highlight` bug 修）
- [ ] **决策确认**（老王 v4 强烈建议）：保守锁 v0.20.5，除非业务有 `toc_enhance` 强需求
- [ ] 把决策结论回写至 RF-18 章节

### 7.2 阶段二（D2，D1 决策后启动）

- [ ] RF-01 跨层实施（Java 透传 + Python API 接收 + strategy 消费）
- [ ] 保留 `RAGFLOW_LEGACY_SINGLE_DATASET` 灰度开关
- [ ] 在当前 `fix/ragflow-dataset-isolation` 分支推进

### 7.3 审核反馈循环

- 每完成 1 个阶段，请 Codex 做增量审核（对照上一轮结论看是否引入新问题）
- 审核结果以 `## X Codex vN 审核反馈摘要` 追加到本文档

---

## 8. Codex v2 审核反馈摘要（2026-04-17 已吸收）

Codex v2 基于 `git show 1a11c132:...` 做了独立核验，未修改文档，只给结论。v2 发现 v1 反馈**主体已落地，仍有尾差**；另独立给出 **3 个证据补强/幻觉修正**（已合并到原项，不新开编号 RF-22/23/24——见 §8.3）。

### 8.1 v1 反馈落地核验（v2 判定）

| v1 修正项 | 落地状态 | v2 备注 |
|-----------|---------|---------|
| RF-04 表述收缩 | ✅ | 已收缩为 "lengthRange/separator 未下沉；overlap/cutOff/titleSplit 能力缺口" |
| RF-08 删幻觉字段 | ⚠️ | `question_history` / `document_ids_for_reranking` 已删；但 `highlight` 仍被写成"有证据"，v2 下载 SDK 0.13.0/0.24.0 源码包**再次确认为幻觉** |
| RF-10 删"12 种" | ✅ | 已改为"多种，具体以 RF-18 为准" |
| RF-02/05/09/16 严重度调整 | ✅ | 全部落地 |
| RF-01 跨层方案 | ✅ | 主体落地；v2 精确定位 Java 缺口在 `KnowledgeService + KnowledgeV2ServiceCallHandler`（非 FileInfoV2Service 单点） |
| 路线 A/B/C → D | ✅ | 已完整写入 |
| 新增 RF-18~RF-21 | ⚠️ | 4 项都已新增；但 RF-18 版本号过时、RF-20 证据表达弱 |
| line 56 "17 项待修" → "21 项待修" | ✅（v2 已修复） | v1 漏同步 21 项总数；v2 吸收时已更正 |

### 8.2 RF-18~RF-21 证据核验（v2 独立跑验证命令）

| 项目 | 结论 | v2 实证 |
|------|------|---------|
| RF-18 | **部分属实** | 版本差异属实；但"官方最新 v0.23.1"已过时，当前 latest 是 **v0.24.0**（2026-02-10） |
| RF-19 | **证据属实且更强** | 不止 2 处，**共 3 处** `page_size=1000`；v1 漏了 `ragflow_strategy.py:369` `_get_existing_chunks` |
| RF-20 | **方向成立，证据弱** | `__init__.py:1` 空文件是正常 package marker，不能作证据；真正证据是 `ragflow_strategy_test.py` 有 **100 处 mock/patch** |
| RF-21 | **证据属实且更强** | 不止 2 处，**共 4 处**；v1 漏了 `chunks_update`（line 654）和 `chunks_delete`（line 858）两路径 |

### 8.3 v2 新发现的证据补强 / 幻觉修正

以下 v2 发现的 3 项**不作为新编号 RF-22/23/24**，而是**直接合并到原项**以避免编号膨胀：

| v2 发现 | 合并处 | 处理方式 |
|---------|--------|----------|
| `_get_existing_chunks` 也有 `page_size=1000`（line 369） | RF-19 | 证据从 2 处扩为 3 处，增加"chunks_save 漏匹配"影响 |
| 官方 latest 实际是 v0.24.0（v0.23.1 过时） | RF-18 | 版本号修正 + 补充 v0.22.0 `-slim` breaking change |
| `highlight` 在 SDK 0.13.0/0.24.0 源码中均无 | RF-08 | ⚠️ **v4 推翻 v2 此判定**：v2 未核实 Server 源码。实测 Server v0.20.5 和 v0.24.0 两个 tag 都支持 `highlight`，只是 SDK 未封装。由于 astron-agent 手撸 HTTP，`highlight` 可直接开放。详见 §9。 |

### 8.4 外部信息（Codex v2 独立核实）

- **RAGFlow Server 版本**：v0.24.0（2026-02-10，latest）；v0.23.1（2025-12-31）
- **ragflow-sdk 版本**：0.24.0（2026-02-11，PyPI）
- **已知 breaking change**：v0.22.0 起 Docker 镜像不再带 `-slim` 后缀，只发布 slim edition
- **ragflow-sdk 0.24.0 确认支持**：`rerank_id` / `keyword` / `use_kg`
- **ragflow-sdk 0.24.0 未见**：`highlight`（⚠️ **v4 已自核**：Server HTTP API 层 `/retrieval` 在 v0.20.5 和 v0.24.0 两个 tag 均支持 `highlight`，仅 SDK 未封装。无需再开 issue。详见 §9）

### 8.5 v2 对 D 路线的修正（⚠️ v4/v5 后已过时，保留作演进记录；权威路线以 §3 为准）

- ~~**D1 不阻塞所有 PR**：只阻塞**版本敏感的能力开放类 PR**（RF-08 / RF-10 等）~~
  → v4 实测推翻：RF-08 在 v0.20.5 已支持 6 字段，**完全不依赖 RF-18**；只有 RF-10 的 `toc_enhance` 依赖。
- **RF-07 / RF-19 / RF-21 可先行**：与版本基线无关，是纯代码质量问题（v5 保留此判定）
- ~~**RF-11 （SDK 重构）** 依赖 D1 决策——如果保守在 0.13.0，重构意义有限；如果升级 0.24.0，重构大幅增值~~
  → v4 补充：切 SDK 会**丢失 `highlight` 能力**（SDK 0.13.0 / 0.24.0 均未封装），重构收益需重新评估。
- **RF-03 时机**：v2 不建议提前到 RF-01 之前；最多提前到"RF-01 落地后立即做"（v5 保留此判定）
- ~~**第一个 PR 双档建议**：深度主线 D1 / 低风险 RF-07/19/21~~
  → v5 推翻：第一个 PR 首推 **RF-08 + RF-09**（能力开放最有感；RF-07/19/21 作为低风险备选）。详见 §3.4。

### 8.6 v2 确认的关键语义澄清（对 RF-01 实施至关重要）

**`Repo.coreRepoId` ≠ RAGFlow dataset id**：
- 现状：`coreRepoId` 存的是**本地 repo 标识**（默认随机 UUID / outerRepoId 镜像）
- 含义：Ragflow-RAG 的 Repo 建好后，`coreRepoId` 并没有指向任何实际 RAGFlow dataset
- RF-01 实施后：`ensure_dataset_for_repo(coreRepoId)` 是"按需建 dataset 并绑定"的语义，不是"查已有映射"
- `RagflowUtils.ensure_dataset()` 现状可以薄封装为 `ensure_dataset_for_repo(repo_id)`（v2 确认）

### 8.7 v2 审核结论

- v1 反馈 **主体已落地，仍有 3 处尾差 + 1 处文档自洽性残留**，本轮（v2 消化版）已全部处理
- RF-01 跨层改造方案 **可行且必要**，Java 缺口已精确定位
- D 路线骨架保留，关键表述已按 v2 精准化
- 文档现处于可支撑 **D1 决策** 或 **RF-07/19/21 低风险试水** 的状态

### 8.8 v2 审核采纳情况

v2 反馈 **全部采纳**，无争议项。

### 8.9 教训记录（给自己的，v4 升级）

**RF-08 的翻车轨迹**（三轮都是同一个字段 `highlight`）：
- v1：编造 `question_history` / `document_ids_for_reranking` / `highlight`
- v2：以"SDK 源码无 `highlight`"为由判为幻觉 ← **v2 本身也是错的，只下了 SDK 包没下 Server**
- v4 自核：拉 Server 源码 + `checkout v0.20.5` / `checkout v0.24.0` 实锤，`highlight` 在 Server 层一直存在

**v4 升级规则**（参考库位置 `~/workhome/ragflow-ref/`）：

1. **SDK 源码核实还不够**——必须同时拉 **Server 源码** 并 **精确 checkout 目标 tag**
2. **不能拿 main 分支当 release 版本用**——main 随时演进，字段可能提前/推后出现
3. **版本对比至少要看两端**（锁定基线 + 官方 latest），才能估出"升级 ROI"
4. **字段存在"多层暴露"**：Server HTTP API ⊇ SDK 封装 ⊇ astron-agent 使用。三层要分别核实

**规则总结**：声称外部系统某个能力"存在/缺失"之前，必须锁定：
- **哪个组件**（Server / SDK / 客户端封装）
- **哪个版本**（release tag，不是 main）
- **哪个文件**（具体代码位置，不是模糊印象）

---

## 9. v4 自核发现摘要（2026-04-17，老王拉 RAGFlow Server 源码实测）

### 9.1 为什么会有 v4

用户在 v3 清稿后追问："你拉的是最新版本吗，不同版本会有区别吗？"——这个追问暴露了 v1/v2/v3 三轮审核都没覆盖的盲区：**没有人基于真实的 Server 源码 + 精确 release tag 验证字段可用性**。

### 9.2 v4 参考库结构

```
~/workhome/ragflow-ref/
├── sdk-0.13.0/      ← pip download + unzip（仓库锁定版）
├── sdk-0.24.0/      ← pip download + unzip（官方最新）
└── server/          ← git clone + fetch tags
    ├── HEAD → main（commit 9410664）
    ├── tag v0.20.5  ← astron-agent 生产基线
    └── tag v0.24.0  ← 官方最新 release
```

关键实测文件：`api/apps/sdk/doc.py` 的 `/retrieval` endpoint
- v0.20.5 line 1307 起
- v0.24.0 line 1556 起
- main 当前位置约 line 1316（commit 9410664）

### 9.3 v4 核心发现

#### 发现 1：`highlight` 不是幻觉（v2 判定错）

v2 下了 SDK 包没下 Server 源码，判定为幻觉。v4 实测：
- v0.20.5：`api/apps/sdk/doc.py:1427` `req.get("highlight")` ← **支持**
- v0.24.0：`api/apps/sdk/doc.py:1582` `req.get("highlight", None)` ← **支持**（bug 修）
- SDK 0.13.0 / 0.24.0：**均未封装**

**影响**：由于 `ragflow_strategy.py` 是手撸 aiohttp 调 HTTP 而非走 SDK，`highlight` 可以**直接开放**，不需要等 SDK 升级。

#### 发现 2：v0.20.5 Server 已支持 6 个高级字段

实测 v0.20.5 `/retrieval` 支持：`use_kg` / `cross_languages` / `metadata_condition` / `highlight` / `rerank_id` / `keyword`——全部已有。

**影响**：RF-08 不依赖 RF-18 版本决策；v0.20.5 基线就能开放 6 个字段。

#### 发现 3：v0.20.5 → v0.24.0 实际差异极小

| 差异类型 | 内容 |
|---------|------|
| 新增字段 | `toc_enhance`（1 个） |
| Bug 修 | `highlight` 从字符串比较改为 None 检查 |

**影响**：D1 决策从"倾向升级"翻转为"倾向保守"。升级 ROI = 1 个字段 + 1 处 bug 修 vs 跨 4 个 minor release 的完整回归风险。

#### 发现 4：v0.20.5 有 `highlight` 字符串比较 bug

```python
# api/apps/sdk/doc.py:1427
if req.get("highlight") == "False" or req.get("highlight") == "false":
```

传 Python `False` 不能禁用高亮，必须传字符串。v0.24.0 已修正。

**影响**：在 v0.20.5 基线开放 `highlight` 时，客户端传值要特别处理（用 `str()` 序列化，或仅在 >= v0.24.0 时开放）。

#### 发现 5：Step B 核实结果（`keyword` / `tenant_rerank_id`）

- **`keyword` 在 v0.20.5 已实锤存在**：`api/apps/sdk/doc.py:1445` `if req.get("keyword", False)`，首轮 grep 漏命中是因为 v0.20.5 把 `keyword` 读取放在 rerank 条件分支内，不在主 req.get 清单位置。
- **`tenant_rerank_id` 不存在于任何 release tag**：
  - v0.20.5：`grep -n "tenant_rerank_id" api/apps/sdk/doc.py` 零命中
  - v0.24.0：同样零命中
  - main（commit 9410664）：存在，但是属于**未发布的开发版特性**（未来 v0.25+ 才会发布）
  - 结论：**不纳入 RF-08 可开放字段清单**，避免依赖未发布特性

### 9.4 对文档各章节的冲击

| 章节 | v4 冲击 | 是否已吸收 |
|------|---------|-----------|
| RF-08 | 可开放字段从 3-4 个扩到 6-7 个；`highlight` 推翻 v2 判定 | ✅ 已重写 |
| RF-18 | 严重度 P0 → P1；决策从升级倾向改保守倾向；差异表实测化 | ✅ 已重写 |
| RF-11 | 切 SDK 会丢 `highlight` 能力，改动面降 ⭐ | ✅ 已补充 |
| §7.1 D1 行动清单 | 前几步变 `[x]` 已完成，决策有默认建议 | ✅ 已更新 |
| §8.3 / §8.4 | `highlight` 相关判定翻转 | ✅ 已修正 |
| §8.9 教训记录 | 从"下 SDK 源码"升级为"下 SDK + Server + checkout tag" | ✅ 已升级 |

### 9.5 v4 给 D 路线的新建议（⚠️ v5 后已汇入 §3，本节保留作演进记录）

**推荐路线（v4 原稿，最终路线以 §3 为准）**：

```
(立刻可做，无依赖)
├─ RF-07 / RF-19 / RF-21 任选（低风险试水）
├─ RF-08 +6 字段（use_kg / cross_languages / metadata_condition / highlight / rerank_id / keyword）
│     ↑ v4 证明不依赖 RF-18，v0.20.5 已全支持
└─ RF-09（vector_similarity_weight 解硬编码，RF-08 子项）

(需锁版本决策，但默认保守)
└─ RF-18 决策文档 PR：保守锁 v0.20.5（除非业务明确要 toc_enhance）

(跨层大改)
└─ RF-01（RF-07/08 后，Java + Python 联动）
```

**第一个 PR 建议（v4 最强推）**：**RF-08 +6 字段开放**

理由：
- 立刻兑现企业用户最核心诉求（混合检索 / GraphRAG / rerank / 跨语言）
- 不需要等任何前置决策
- 改动面局限在 `ragflow_strategy.py:70-76` + 新增 DTO
- 讯飞 reviewer 看到"v0.20.5 就支持"的实锤，不会质疑版本依赖
- 对其他 strategy 零影响（Optional 字段）

### 9.6 v4 审核采纳情况

v4 是老王我自核，非外部审核。所有发现直接入文档。

**原"未处理项" Step B 已完成**：
- ✅ `keyword` 在 v0.20.5 Server 的精确位置：`api/apps/sdk/doc.py:1445`
- ✅ `tenant_rerank_id` 在 v0.20.5 / v0.24.0 均**不存在**，仅 main 分支有（属未发布特性，不纳入 RF-08）

**最终结论**：RF-08 可开放字段数锁定为 **6 个**（v0.20.5 基线）或 **7 个**（若升级到 v0.24.0，多 `toc_enhance`）。核心决策清晰，文档处于 **ready-to-code** 状态。

---

## 10. Codex v5 审核反馈摘要（2026-04-17 已吸收）

Codex v5 基于"当前文档 + 本地 server 源码（v0.20.5 / v0.24.0 tag）+ ragflow-sdk 0.13.0/0.24.0 wheel"三组证据独立核验。结论：v4 主结论基本认可，但发现 **3 处需要修正**（2 处 P1 + 1 处 P2）。全部吸收。

### 10.1 Codex v5 认可的 v4 结论

- ✅ `highlight` 不是幻觉，Server v0.20.5 和 v0.24.0 都支持，SDK 两版都没封装
- ✅ `use_kg / cross_languages / metadata_condition / rerank_id / keyword` 的确在 v0.20.5 Server 就已存在
- ✅ `tenant_rerank_id` 不该放进 release-based 的可开放字段清单

### 10.2 Codex v5 要求修正的 3 处

| # | 严重度 | 问题 | 位置 | 处理 |
|---|--------|------|------|------|
| 1 | P1 | 路线章节（§3）与 v4 结论（RF-18 / §9.5）自相矛盾——§3 仍写 "RF-08 依赖 RF-18" 且 "第一个 PR 做 D1" | 原 §3 全段 | ✅ 已整段重写为 D' 路线，首推 RF-08；§8.5 标注"v4/v5 后已过时"；§9.5 指向 §3 |
| 2 | P1 | RF-18 差异表把 `highlight` 升级描述为"纯 bug 修"，**实际是 behavior-breaking 默认值翻转**：v0.20.5 未传 highlight → True（高亮开启），v0.24.0 未传 → False（高亮关闭）。astron-agent 当前不传 highlight，所以升级会让 chunk 里的 highlight markup 默认消失，用户可见行为改变 | RF-18 差异表 line 517-519 | ✅ 差异表新增"`highlight` 默认语义"行，明确标注 ⚠️ behavior-breaking；"影响"和"改动面"段落补充升级时需同步在 `ragflow_strategy.py` 显式传 `highlight=True` |
| 3 | P2 | RF-18 差异表事实错误：原稿写 "v0.20.5 page/size → v0.24.0 page/page_size"，但 **Server HTTP 两版字段名都是 `page / page_size`**；变化的是 SDK 签名（0.13.0 `offset/limit` → 0.24.0 `page/page_size`）和 Python 本地变量名 | RF-18 差异表分页参数行 | ✅ 拆为两行：Server HTTP 层两版一致；SDK 层 0.13.0 → 0.24.0 签名 breaking |

### 10.3 v5 采纳情况

v5 反馈 **3/3 全部采纳**，无争议项。

### 10.4 v5 教训补充

**v4 的问题**：自核发现是正确的，但**没有把新发现的结论传导到所有下游章节**（§3 / §8.5 还停留在 v1/v2 的老口径）。

**v5 教训**：**每轮修订必须做"下游传导 sweep"**——任何对问题项（RF-XX）的认知变化，都要检查：
- §2 问题清单里该项的严重度 / 改动面 / PR 友好度 / 证据表
- §3 修复路线里该项的位置 / 依赖
- §7 行动清单里该项的优先级
- §8.X 反馈摘要里的老结论（要显式标注过时）

不做 sweep 的副作用：文档前后自相矛盾，外部 reviewer 无法确定哪个版本是真。

### 10.5 Codex v5 审核结论摘录

> "这版不是'退回重写'，而是'有 3 处关键文档问题要修完再算通过'。最重要的是先统一 §3/§7/§9 的路线口径，再修 RF-18 的差异表。"

v5 消化后文档状态：**ready-to-code 维持**，Codex 3 处修正全部落地。

---

## 11. Codex v6 审核反馈摘要（2026-04-17 已吸收，最终 sign-off）

Codex v6 基于 v5 提交的文档做最终核验。结论：v5 的 3 处 P1/P2 修正基本到位，但**发现 1 处 v5 自己忽略的下游传导残留**——恰好是 v5 教训里提到的"下游传导 sweep"必须覆盖到的场景。

### 11.1 v5 已修完的部分（v6 确认通过）

- ✅ §3 路线统一为 D' 路线、首推 RF-08，不再与 v4/v5 结论打架
- ✅ RF-18 分页参数名事实错误修正为"Server HTTP 两版一致，变化的是 SDK 签名"
- ✅ §10 v5 摘要把 3 个修正清晰落表

### 11.2 v6 要求修正的 1 处

| # | 严重度 | 问题 | 位置 | 处理 |
|---|--------|------|------|------|
| 1 | P2 | RF-18 **主描述句**仍停留在旧口径："能力开放层面的差异极小——仅 1 个字段 + 1 处 bug 修"。但同一节后面的差异表（line 519）已经明确 `highlight` 是 behavior-breaking，影响段（line 526）也已经补充了用户可见行为翻转。主描述句和差异表/影响段前后矛盾 | RF-18 line 500 主描述 | ✅ 改为"能力开放字段差异较小（+1 字段），但仍存在 1 处 behavior-breaking 变化——`highlight` 默认语义翻转" |

### 11.3 v6 教训印证

v5 在 §10.4 自己提了"**每轮修订必须做下游传导 sweep**"，但 v5 自己就漏了一处：**章节开头的概述句**（RF-18 "描述"字段）。

**v6 新增教训**：下游传导 sweep 不仅要覆盖跨章节（§3 / §7 / §8），也要覆盖**同一章节内部的所有粒度**（标题 / 主描述句 / 证据表 / 影响段 / 改动面 / PR 友好度）。任何一处残留旧口径，都会让 reviewer 质疑文档内部一致性。

### 11.4 v6 采纳情况

v6 反馈 **1/1 全部采纳**，无争议项。

### 11.5 Codex v6 sign-off 条件

> "把 RF-18 的描述改成类似'能力开放字段差异较小，但仍存在 highlight 默认语义翻转这一处 behavior-breaking 变化'之后，我就可以给最终 sign-off。"

v6 消化后文档状态：**Codex 最终 sign-off 条件已满足**，文档进入**已通过 / 可用于推 PR**阶段。
