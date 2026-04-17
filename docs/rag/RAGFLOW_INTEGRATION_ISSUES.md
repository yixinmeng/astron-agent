# RAGFlow 集成问题清单与审核请求

> **状态**：待 Codex 独立审核
> **作者**：yixinmeng
> **最后更新**：2026-04-17
> **目的**：在向 iflytek/astron-agent 上游提交修复 PR 之前，请 Codex 对本清单的准确性、完整性、优先级和修复可行性进行独立审核。

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

## 2. 问题清单（17 项待修）

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
- **改动面**：纯 RAGFlow 沙箱
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "RAGFLOW_DEFAULT_GROUP\|get_default_dataset_name\|ensure_dataset" \
    core/knowledge/service/impl/ragflow_strategy.py \
    core/knowledge/infra/ragflow/ragflow_utils.py
  ```

---

#### RF-02 删除 Repo 不级联清理 RAGFlow

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
- **改动面**：公共代码加 1 行 Spring 事件发布 + 新增 RAGFlow listener 类
- **PR 友好度**：⭐⭐（推荐用 `@EventListener` 解耦，其他 strategy 无感）
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

- **描述**：前端设置的 lengthRange / separator / overlap / cutOff / titleSplit 等分块参数，在 RAGFlow 链路中未完整透传到 RAGFlow API。
- **证据**：
  - `console/backend/toolkit/src/main/java/.../KnowledgeV2ServiceCallHandler.java:65-70`
    > 仅透传 `lengthRange` 和 `separator`，缺失 `overlap` / `cutOff` / `titleSplit`
  - `core/knowledge/service/impl/ragflow_strategy.py:193-287` 的 `split` 方法
    > 接收了 `overlap`、`cutOff`、`titleSplit` 参数，但**未写入** `ragflow_client.upload_document_to_dataset` 调用的 `chunk_config` 或 `parser_config`
- **行为**：前端改了分块配置，RAGFlow 侧仍走默认切分策略。
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

- **描述**：RAGFlow retrieval API 原生支持 rerank / keyword 混合检索 / GraphRAG / highlight / question_history 等参数，但 astron-agent 未暴露。
- **证据**：
  - `core/knowledge/service/impl/ragflow_strategy.py:70-76` 构造 `ragflow_request`
    > 仅包含 `question / dataset_ids / top_k / similarity_threshold / vector_similarity_weight`，**缺** `rerank_id`、`keyword`、`use_kg`、`highlight`、`question_history`、`document_ids_for_reranking` 等
  - `core/knowledge/domain/entity/chunk_dto.py:136-151` `ChunkQueryReq`
    > schema 无对应字段
- **行为**：即使后端 RAGFlow 实例开启了 rerank 模型或 GraphRAG，前端/API 也无法触发。
- **影响**：RAGFlow 最大卖点（混合检索、GraphRAG、rerank）完全被抽象层屏蔽。
- **改动面**：新增 `RagflowQueryExt` DTO，`ChunkQueryReq` 加 `Optional[RagflowQueryExt] ragflow_ext`
- **PR 友好度**：⭐⭐⭐
- **验证命令**：
  ```bash
  grep -n "rerank\|keyword\|use_kg\|highlight\|question_history" core/knowledge/service/impl/ragflow_strategy.py core/knowledge/domain/entity/chunk_dto.py
  ```

---

#### RF-09 `vector_similarity_weight` 硬编码 0.2

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

- **描述**：RAGFlow 提供 12 种切片策略（naive / book / table / paper / manual / qa / laws / presentation / picture / one / resume / knowledge_graph / email），astron-agent 仅用 `naive`。
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
- **改动面**：纯 RAGFlow 内部重构；SDK 缺的能力向 RAGFlow 官方提 PR
- **PR 友好度**：⭐⭐⭐
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

## 3. 修复路线建议（3 个候选）

### 路线 A：政治友好（建立信任）

**顺序**：RF-06 → RF-11 → RF-17 → RF-16 → RF-01 → RF-14 → RF-15 → RF-08+RF-09
**理由**：前 4 个全是 ⭐⭐⭐ 零侵入，快速建立讯飞对 PR 质量的信任。
**估期**：2-3 周，每周 1-2 个 PR

### 路线 B：用户痛点（业务价值优先）

**顺序**：RF-01 → RF-04 → RF-08+RF-09+RF-10 → RF-06 → RF-02 → RF-03
**理由**：RF-01 + RF-04 修完，企业用户立刻能用多知识库 + 分块调优。
**估期**：4-6 周（含 RF-02/RF-03 的架构协商时间）

### 路线 C：改动面最小（仅沙箱内）

**只做 ⭐⭐⭐ 的 9 项**：RF-01、RF-06、RF-08、RF-09、RF-11、RF-14、RF-15、RF-16、RF-17
**理由**：全部局限在 `core/knowledge/service/impl/ragflow_strategy.py` 和 `core/knowledge/infra/ragflow/*` 沙箱内，讯飞几乎无理由拒绝。
**估期**：2-3 周

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
