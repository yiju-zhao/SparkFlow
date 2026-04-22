# Hermes Harness Refactor Design

> **分支**：`refactor/hermes-agent`
> **日期**：2026-04-22
> **Supersedes 部分**：`docs/superpowers/specs/2026-04-21-daily-digest-design.md` 的 §4（架构）、§7（pipeline）、§10（semops 细节）—— 本 spec §11 对 digest 编排层做明确 relocation
> **关联参考**：
> - `cclank/Hermes-Wiki`（架构概念梳理，本 spec 采纳其 ToolRegistry / PromptBuilder / Memory / Skills 分层）
> - `NousResearch/hermes-agent`（上游 harness 源码，**仅借鉴设计思路**；代码不复用——upstream 明确声明单用户单并发）
> - `docs/superpowers/specs/2026-04-21-daily-digest-design.md`（semops rename 驱动者）
> - `docs/reference/langchain-streaming.md` / `langchain-memory.md` / `langchain-context-engineering.md`（仓内参考资料）

## 1. 目标（Goals）

把 `apps/agent/` 内部三个 LangGraph graph 各写一套 system prompt / 工具绑定 / 模型初始化的局面收敛成 **共享基建 + 可参数化 surface**：

1. **代码统一** — 一个中心化 `ToolRegistry`、一个分层 `PromptBuilder`、一个通用参数化 `graphs/surface.py` 取代三套独立 graph。
2. **能力升级** — Prisma 落地"用户级 / notebook 级"Memory 表 + `~/.sparkflow/skills/` Markdown 技能索引，注入到 system prompt 并支持工具读写。
3. **生态对齐** — 采纳 Hermes-Wiki 的核心抽象（SOUL / tool registry / prompt layers / skills 渐进披露 / memory 冻结）；文件格式尽量与 `~/.hermes/` 同形，便于复用社区 skill。
4. **workflow 层重组** — 确定性 LLM 编排（search / matcher / daily_digest）全部住 Python `apps/agent/workflows/`，统一消费 `apps/semops` 的语义算子。
5. **deep research 独立 surface** — 现 `search_agent` 的 `web` 分支升级为独立 agent surface，与 notebook / hub 共用 harness。

**明确保留（相对上一版 spec 的重大变化）**：LangGraph runtime、LangGraph checkpointer（`CHECKPOINT_DB_URL`）、CopilotKit 生成式 UI、`langgraph dev` / `langgraph up` 部署链路——这三样是多用户 / 多 session / 中断恢复 / 流式 / 观测性的"免费实现"，自建成本远大于收益（见 §12）。

## 2. 非目标（Non-goals）

- **不**自建 agent loop / SSE 协议 / 模型 router / 凭证池 —— 继续依赖 LangGraph + `init_chat_model` + 现有 `lib/services/api-key-resolver.ts`
- **不**移除 CopilotKit —— `frontend=True` 只是 registry 元数据，前端继续用 `makeAssistantToolUI`
- **不**实现 Hermes 上游的 cron 调度、多平台 gateway（Telegram / Discord / WhatsApp / 飞书）、trajectory export、技能自生成
- **不**重构 `apps/mcp-server`、`apps/toolbox` 两个附属服务
- **不**动 `apps/semops` 的对外 `/api/operators/*` 契约；**仅**把 `lotus_matcher.py` / `job_runner.py` / `excel_processor.py` 这块 matcher-专属编排迁出
- **不**迁移 `apps/web/lib/services/wiki-ingest.ts`（notebook 上传时的知识图谱抽取）—— 那是强耦合于上传流程的 per-source ingest，未来单独评估
- 本 spec 的 digest relocation **只迁移编排层**；UI、API 读路由、数据 schema 保持原 2026-04-21 spec

## 3. 现状摘要

### 3.1 `apps/agent/langgraph.json` 当前三个 graph

| graph | 入口 | 形状 |
|---|---|---|
| `agent` | `graphs/rag_agent.py:agent` | `llm_call ↔ tool_node` 循环；注入 wiki；多 provider；BYOK；tools = `wiki_tools` |
| `hub` | `graphs/hub_agent.py:agent` | `call_model ↔ tool_node` 循环；backend tools + frontend tools（CopilotKit）分流 |
| `search` | `graphs/search_agent.py:agent` | 双模：`web` 路径 Tavily 迭代；`wechat`/`publication` 路径 pgvector + title_triage + body_judge 确定性流水线 |

### 3.2 重复代码的"热点"

- 三个 graph 各自 `init_chat_model(f"{provider}:{name}")`、各自维护 `_model_cache`
- 三套 system prompt 写死在 `prompts/{rag_agent,hub_agent,search_agent}.py`
- 三套 tool 列表各自 `.bind_tools(...)` —— 没有中心 registry；`wiki_tools.py` 使用进程全局 `set_notebook_id()` hack
- 无 memory 概念；`ChatSession` / `ChatMessage` 表虽已存在但未被用于 agent 记忆

### 3.3 `apps/semops`（2026-04-22 merge #67）

当前包含两种不同归属的代码：
- **算子层**（要留）：`services/semantic_operators.py`、`api/routes/operators.py`、公共 LM 配置
- **matcher 编排层**（要迁出）：`services/lotus_matcher.py`、`services/job_runner.py`、`services/query_optimizer.py`、`services/excel_processor.py`、`api/routes/jobs.py`、`tools/job_store.py`

## 4. 目标架构

### 4.1 分层图

```
┌────────────────────────────────────────────────────────────────────┐
│  Operators —— apps/semops                                           │
│  Pure SemanticOperators lib + 薄 FastAPI RPC shell                  │
│  (sem_rank, sem_filter, sem_map, sem_agg, ...)                      │
└────────────────────────────────────────────────────────────────────┘
       ▲                     ▲                      ▲
       │                     │                      │
┌──────┴───────────┐  ┌──────┴────────────┐  ┌─────┴─────────────┐
│  Agent 层         │  │  Workflow 层      │  │  Ingest (Node)    │
│  apps/agent/      │  │  apps/agent/      │  │  apps/web/lib/    │
│  surfaces/        │  │  workflows/       │  │  services/        │
│                   │  │                   │  │  wiki-ingest.ts   │
│  • notebook       │  │  • search         │  │  (不动，后续评估) │
│  • hub (研究助理) │  │  • matcher        │  └───────────────────┘
│  • deep_research  │  │  • daily_digest   │
│                   │  └───────────────────┘
│  共享 harness：    │           ▲
│  registry         │           │
│  prompt_builder   │  ┌────────┴─────────────┐
│  memory (Prisma)  │  │  Jobs —— cron / CI   │
│  skills           │  │  apps/agent/jobs/    │
└───────────────────┘  │  纯 ETL，无 LLM       │
                       │  • backfill_wechat_  │
                       │    embeddings        │
                       │  • backfill_         │
                       │    publication_      │
                       │    embeddings        │
                       │  • run_daily_digest  │
                       │    (可选 cron 触发器) │
                       └──────────────────────┘
```

### 4.2 关键规则

1. **Agent = LangGraph loop + harness primitives**（registry / prompt_builder / memory / skills 的 consumer）
2. **Workflow = deterministic composition of semops operators**；**全部 Python**，住 `apps/agent/workflows/`（见 §7 论证）
3. **Operator = pure semantic primitive**；`apps/semops` 只维护定义 + RPC，**不做 workflow 编排**
4. **Job = 无 LLM 的数据管道 / cron 触发器**；`apps/agent/jobs/`

### 4.3 目录结构

```
apps/agent/
├── hermes/                      # ↘ 与 LangGraph 解耦的可组合原语（核心产物）
│   ├── __init__.py
│   ├── registry.py              #   ToolEntry + ToolRegistry 单例 + auto-discover
│   ├── prompt_builder.py        #   分层 system prompt（base → enforcement → model_hints →
│   │                            #   surface → memory → skills → context refs → session meta）
│   │                            #   + 会话级 _cached_system_prompt
│   ├── context/
│   │   └── references.py        #   ContextRef 抽象：WikiContentRef / NotebookSourcesRef /
│   │                            #   PageContextRef / WebSearchContextRef ...
│   ├── memory/
│   │   ├── store.py             #   Prisma UserMemory / NotebookMemory 读写封装
│   │   └── tools.py             #   memory_read / memory_write / memory_forget 工具
│   │                            #   （LangChain StructuredTool；registry 中自注册）
│   └── skills/
│       ├── loader.py            #   扫 ~/.sparkflow/skills/*.md，frontmatter 解析
│       └── index.py             #   两级缓存（内存 LRU + 磁盘 snapshot）
├── graphs/
│   ├── __init__.py
│   ├── common.py                #   llm_call / tool_node 工厂（被参数化 surface graph 调用）
│   └── surface.py               #   一个参数化 StateGraph，构造时吃 SurfaceConfig
├── surfaces/                    # ↘ 三个 agent 配置（只是 dataclass + module-level 常量）
│   ├── __init__.py
│   ├── notebook.py              #   NOTEBOOK = SurfaceConfig(...)
│   ├── hub.py                   #   HUB = SurfaceConfig(...)
│   └── deep_research.py         #   DEEP_RESEARCH = SurfaceConfig(...)
├── workflows/                   # ↘ Python 确定性 LLM 编排（一律消费 semops）
│   ├── __init__.py
│   ├── search.py                #   pgvector prefilter → sem_rank
│   ├── matcher.py               #   从 apps/semops 迁来
│   └── daily_digest.py          #   从 apps/web/lib/services/digest/ 迁来（见 §11）
├── jobs/                        # ↘ cron-driven，无 LLM
│   ├── backfill_wechat_embeddings.py       # 从 scripts/ 搬
│   ├── backfill_publication_embeddings.py  # 从 scripts/ 搬
│   └── run_daily_digest.py                 # 可选：cron 触发 workflow HTTP 的薄 wrapper
├── tools/                       # ↘ 全部在模块顶层 registry.register(...)
│   ├── __init__.py
│   ├── wiki.py                  #   wiki_search / wiki_navigate / source_read / source_list
│   ├── notebook.py              #   note_create / note_update
│   ├── hub.py                   #   search_conferences / search_sessions / ...
│   ├── wechat.py                #   wechat_search / wechat_article_detail
│   ├── navigation.py            #   navigate_to
│   ├── web.py                   #   tavily_search / url_fetch（给 deep_research 用）
│   └── ui/                      #   frontend=True
│       ├── show_table.py
│       ├── show_chart.py
│       └── show_card.py
├── prompts/                     # ↘ Markdown 片段（被 PromptBuilder 拼接）
│   ├── base_identity.md
│   ├── tool_use_enforcement.md
│   ├── model_hints/
│   │   ├── openai.md
│   │   ├── gemini.md
│   │   ├── deepseek.md
│   │   └── (gem_hints)...
│   ├── surfaces/
│   │   ├── notebook.md
│   │   ├── hub.md
│   │   └── deep_research.md
│   └── workflows/
│       ├── search_title_triage.md
│       ├── search_body_judge.md
│       ├── digest_rank.md
│       └── matcher_rank.md
├── config/
│   └── surfaces.py              #   SurfaceConfig dataclass 定义
├── embeddings/                  #   不动
├── scripts/                     #   保留给一次性诊断脚本（跟 jobs/ 区分）
├── langgraph.json               #   精简：只注册 graphs/surface.py 一个 graph，按 surface 参数激活
├── pyproject.toml               #   清理（见 §13 依赖变更）
└── README.md                    #   更新
```

## 5. Harness 核心模块契约

### 5.1 `hermes/registry.py`

```python
from dataclasses import dataclass
from collections.abc import Callable, Awaitable
from typing import Any

@dataclass(slots=True)
class ToolEntry:
    name: str
    toolset: str                                   # 分组标签：notebook / hub / web / memory / ui / ...
    tool: Any                                      # LangChain BaseTool 实例（StructuredTool / @tool）
    check_fn: Callable[[], bool] | None = None     # 环境可用性
    requires_env: tuple[str, ...] = ()
    frontend: bool = False                         # True = hub 生成式 UI，LLM 吐 call 前端直渲
    requires_approval: bool = False                # 预留，MVP 不启用
    description: str = ""

class ToolRegistry:
    """进程启动时填满，请求期间只读。多用户并发安全。"""
    _tools: dict[str, ToolEntry]

    def register(self, *, name, toolset, tool, **opts) -> None: ...
    def get_tools(self, toolset: set[str]) -> list[Any]:
        """返回通过 check_fn 的 LangChain tool 列表，可直接 .bind_tools(...) 给 ChatModel"""
    def get_entry(self, name: str) -> ToolEntry: ...
    def is_frontend(self, name: str) -> bool: ...

registry = ToolRegistry()

def discover_builtin_tools(tools_dir: Path | None = None) -> list[str]:
    """AST 级扫描 tools/*.py，只 import 模块顶层调用了 registry.register(...) 的文件"""
```

**与 LangGraph 的接口**：surface 的 `llm_call` 节点里
```python
tools = registry.get_tools(toolset=config.toolset)
model_with_tools = model.bind_tools(tools)
```
——注册表只负责**选集 + 元数据**，执行仍由 LangGraph `ToolNode` 完成。`frontend=True` 的工具在 tool 本体里把 `return_direct` / CopilotKit metadata 设好，语义由前端处理。

### 5.2 `hermes/prompt_builder.py`

```python
class PromptBuilder:
    def build(
        self,
        *,
        surface: str,
        surface_prompt_path: str,             # 例 "surfaces/notebook.md"
        model_provider: str,
        model_name: str,
        user_id: str,
        session_id: str,
        notebook_id: str | None = None,
        context_refs: list[ContextRef] = (),
        skip_memory: bool = False,
        skip_skills: bool = False,
        extra_caller_system: str | None = None,   # 运行时注入的额外 system（如 page_context）
    ) -> str:
        """按固定顺序拼接、返回完整 system prompt"""

    def build_minimal(
        self,
        *,
        surface_prompt_path: str,
        model_provider: str,
        model_name: str,
    ) -> str:
        """workflow 专用——跳过 memory / skills / context refs"""
```

**拼装顺序**（与 Hermes-Wiki `agent-loop-and-prompt-assembly.md` 同构）：

1. `base_identity.md`（SparkFlow 的 SOUL）
2. `tool_use_enforcement.md`（按模型族过滤：openai/gpt/codex/gemini/deepseek 启用）
3. `model_hints/{provider}.md`
4. `extra_caller_system`（若传入，通常是 page_context 或 session 临时约束）
5. Memory usage guide + MEMORY 快照（`skip_memory=False` 时）
6. Skills 索引（`skip_skills=False` 时）
7. `surfaces/{surface}.md`
8. 由 `context_refs` 解析出的片段（wiki content、notebook sources、web search hint 等）
9. Session metadata（timestamp、model、session_id、surface）

**缓存**：会话内 `_cached_system_prompt`，仅在上下文压缩后重建。Memory / Skills 索引在 build 时取快照，**不**随后续写入刷新（保护 LLM prefix cache）。

### 5.3 `hermes/memory/`

Prisma 新增：

```prisma
model UserMemory {
  id        String   @id @default(cuid())
  userId    String
  category  String   // "profile" | "preference" | "fact" | "feedback"
  content   String   @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, category])
}

model NotebookMemory {
  id         String   @id @default(cuid())
  notebookId String
  category   String
  content    String   @db.Text
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  notebook   Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  @@index([notebookId, category])
}
```

**Memory 工具**（`hermes/memory/tools.py`，在 registry 自注册）：

- `memory_read(scope, category=None)` → list[MemoryEntry]
- `memory_write(scope, category, content)` → ok/err
- `memory_forget(scope, id)` → ok/err

`scope ∈ {"user", "notebook"}`。每个 surface 的 `SurfaceConfig.memory_scope` 决定可见范围：
- notebook → `("user", "notebook")`
- hub / deep_research → `("user",)` 只有用户级

Python 侧读写直走 **psycopg**（复用 `backfill_wechat_embeddings.py` 的模式），**不**抽 Python Prisma 客户端，避免 schema 重复维护。

### 5.4 `hermes/skills/`

- 目录：`~/.sparkflow/skills/<skill-name>.md`（模仿 `~/.hermes/skills/`）
- 格式：YAML frontmatter + Markdown body
  ```yaml
  ---
  name: notebook-literature-summary
  description: When the user asks to summarize cited sources in a notebook
  applies_to: [notebook]
  tools_required: [wiki_search, source_read]
  ---
  # Body（渐进披露：system prompt 里只塞 name + description；LLM 要全文调 skill_read）
  ```
- `index.py` 两级缓存：
  - Layer 1：内存 `OrderedDict`（cap=8），key = `(skills_dir_mtime, surface, toolset)`
  - Layer 2：`~/.sparkflow/skills/.skills_index_snapshot.json`，校验 mtime + size manifest
- 注入 system prompt 的是**索引**（每条 ≈ name + 一句话 + applies_to + tools_required），不是全文
- `skill_read(name)` 工具按需返回全文

## 6. Surfaces（agent 层）

### 6.1 `config/surfaces.py`

```python
from dataclasses import dataclass, field

@dataclass(slots=True)
class SurfaceConfig:
    name: str                                   # "notebook" | "hub" | "deep_research"
    surface_prompt_path: str                    # "surfaces/notebook.md"
    toolset: set[str]                           # registry 过滤标签
    context_refs: list[type]                    # ContextRef 工厂类型（请求时实例化）
    memory_scope: tuple[str, ...]
    max_iterations: int = 30
```

### 6.2 三个 surface 的配置

```python
# surfaces/notebook.py
NOTEBOOK = SurfaceConfig(
    name="notebook",
    surface_prompt_path="surfaces/notebook.md",
    toolset={"wiki", "notebook", "memory"},
    context_refs=[WikiContentRef, NotebookSourcesRef],
    memory_scope=("user", "notebook"),
    max_iterations=30,
)

# surfaces/hub.py
HUB = SurfaceConfig(
    name="hub",
    surface_prompt_path="surfaces/hub.md",
    toolset={"hub", "wechat", "navigation", "ui", "memory"},
    context_refs=[PageContextRef],
    memory_scope=("user",),
    max_iterations=20,
)

# surfaces/deep_research.py
DEEP_RESEARCH = SurfaceConfig(
    name="deep_research",
    surface_prompt_path="surfaces/deep_research.md",
    toolset={"web", "wiki", "memory"},
    context_refs=[WebSearchContextRef],   # 引用站点白名单、已爬取结果等
    memory_scope=("user",),
    max_iterations=40,                     # 多轮深挖允许更多 iteration
)
```

### 6.3 `graphs/surface.py`（参数化 graph）

```python
def build_graph(config: SurfaceConfig) -> CompiledStateGraph:
    """为每个 SurfaceConfig 构造一个 LangGraph StateGraph。
    三个 surface 共享实现，差异全部由 config 驱动。"""
    graph = StateGraph(MessagesState)
    graph.add_node("llm_call", make_llm_call(config))
    graph.add_node("tools", make_tool_node(config))
    graph.add_edge(START, "llm_call")
    graph.add_conditional_edges("llm_call", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "llm_call")
    return graph.compile(checkpointer=get_pg_checkpointer())
```

`make_llm_call` 内部：

```python
def make_llm_call(config: SurfaceConfig):
    async def llm_call(state: MessagesState, runtime: Runtime[SurfaceContext]):
        system_prompt = prompt_builder.build(
            surface=config.name,
            surface_prompt_path=config.surface_prompt_path,
            model_provider=runtime.context.model_provider,
            model_name=runtime.context.model_name,
            user_id=runtime.context.user_id,
            session_id=runtime.context.session_id,
            notebook_id=runtime.context.notebook_id,
            context_refs=[cls(runtime.context) for cls in config.context_refs],
            extra_caller_system=runtime.context.extra_caller_system,
        )
        model = init_chat_model(f"{runtime.context.model_provider}:{runtime.context.model_name}",
                                 api_key=runtime.context.api_key)
        tools = registry.get_tools(toolset=config.toolset)
        response = await model.bind_tools(tools).ainvoke(
            [SystemMessage(content=system_prompt), *state["messages"]]
        )
        return {"messages": [response]}
    return llm_call
```

### 6.4 `langgraph.json` 新形态

```json
{
  "dependencies": ["."],
  "graphs": {
    "notebook": "./graphs/surface.py:notebook_graph",
    "hub": "./graphs/surface.py:hub_graph",
    "deep_research": "./graphs/surface.py:deep_research_graph"
  },
  "env": ".env"
}
```

`graphs/surface.py` 顶层：
```python
from config.surfaces import NOTEBOOK, HUB, DEEP_RESEARCH
notebook_graph = build_graph(NOTEBOOK)
hub_graph = build_graph(HUB)
deep_research_graph = build_graph(DEEP_RESEARCH)
```

### 6.5 前端影响

- CopilotKit 继续使用；`NEXT_PUBLIC_LANGGRAPH_API_URL` 不变
- `app/api/copilotkit/[action]/route.ts` 根据请求的 surface 路由到对应 graph（`notebook` / `hub` / `deep_research`）
- 现 `/explore` 页面里"web research"/"deep research"入口改调 `deep_research` graph（取代 `search_agent` 的 web 分支）
- 现"内部内容搜索"入口改调 `workflows/search` endpoint（HTTP JSON，见 §7）

## 7. Workflows（Python 编排层）

**核心规则**：所有 workflow 住 `apps/agent/workflows/`，一律 Python。Node 侧保留"UI + 读查询 + 薄触发/回调"三类路由。

### 7.1 论证（为什么不放 Node）

| 维度 | Python 方（`apps/agent/workflows/`） | Node 方（`apps/web/lib/services/`） |
|---|---|---|
| 与 semops 共处同语言 | ✅ | ✅（都走 HTTP） |
| 复用 harness primitives（prompt_builder / model_router） | ✅ | ❌ 要重写 |
| 结构化 LLM 输出（pydantic + batch） | ✅ ergonomic | ⚠️ zod + 手写并发 |
| Prisma 直接访问 | ❌ 需 psycopg 或 HTTP 回 Node | ✅ |
| 与 agent surface 统一 tracing / usage 记账 | ✅ | ❌ |
| 未来新 workflow 增量成本 | 低 | 每个都要重造 prompt/模型层 |

**结论**：Python 侧 2 个 RPC hop 的税（prefilter / persistence 回调 Node）< Node 侧并行维护一套 harness 的长期代价。

### 7.2 Workflow HTTP 端点

**统一前缀**：`POST /v1/workflows/<name>`（由 `graphs/surface.py` 同一个 FastAPI / LangGraph server 提供，或独立 FastAPI——见 §13 实现选择）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/v1/workflows/search` | POST | 内部内容搜索（wechat / publication / notebook sources） |
| `/v1/workflows/matcher` | POST | 会议 matcher 任务（从 apps/semops 迁来） |
| `/v1/workflows/daily_digest/generate` | POST | 生成指定日期 digest 的某 source section |
| `/v1/workflows/daily_digest/status/{sectionId}` | GET | poll section 状态 |

### 7.3 `workflows/search.py`

```python
async def run(req: SearchRequest) -> SearchResponse:
    # 1. pgvector prefilter — HTTP 回 Next.js
    candidates = await http.post(
        f"{SPARKFLOW_API_URL}/api/explore/search/{req.source_type}/prefilter",
        json={"query": req.query, "limit": PREFILTER_LIMIT},
    )
    # 2. sem_rank — HTTP 调 semops
    ranked = await http.post(
        f"{SEMOPS_API_URL}/api/operators/rank",
        json={
            "candidates": candidates,
            "text_field": "text",
            "query": req.query,
            "top_k": FINAL_TOP_K,
            "include_reasons": True,
            "model_config": req.model_config,
        },
    )
    return SearchResponse(items=ranked["ranked"], reasons=ranked["reasons"])
```

原 `search_agent.py` 里的 `title_triage` 和 `body_judge` 两步 LLM judgment **合并为一次 sem_rank 调用**（semops 内部用 sem_topk + sem_map）。这是原 search 流水线的自然升级——之前因为没有 sem_rank 抽象所以手写；现在 semops 提供了就复用。

### 7.4 `workflows/matcher.py`（从 semops 迁）

- 源：`apps/semops/services/{lotus_matcher, job_runner, query_optimizer, excel_processor}.py`、`apps/semops/api/routes/jobs.py`、`apps/semops/tools/job_store.py`
- 目标：`apps/agent/workflows/matcher.py` + 同目录新增 `matcher/{jobs_store.py, excel.py, pipeline.py}`
- 对外 API 迁到 `POST /v1/workflows/matcher/jobs` 等（需同步更新 Next.js `/api/matcher/*` 路由的 upstream URL；详见 §10）

### 7.5 `workflows/daily_digest.py`（从 Node 迁，见 §11）

### 7.6 Workflow 的 system prompt

所有 workflow 只用 `prompt_builder.build_minimal(...)`（跳过 memory / skills / context refs），注入 `prompts/workflows/<name>.md`。

### 7.7 Workflow 不使用 registry 查工具

Workflow 是确定性流水线，**不**让 LLM 选工具。LLM 调用只通过 semops `/operators/*` 或 `init_chat_model(...).ainvoke(...)` 结构化输出（pydantic schema）。registry 是 agent 专属基建。

## 8. `apps/semops` 的边界

### 8.1 保留

- `services/semantic_operators.py`
- `api/routes/operators.py`
- `api/main.py`（FastAPI 入口）
- `api/types.py`（公共类型）
- `tests/test_semantic_operators.py`、`tests/test_operators_route.py`

### 8.2 迁出（→ `apps/agent/workflows/matcher/`）

- `services/lotus_matcher.py`
- `services/job_runner.py`
- `services/query_optimizer.py`
- `services/excel_processor.py`
- `api/routes/jobs.py`
- `tools/job_store.py`
- `tests/test_jobs_route.py`（对应迁）

### 8.3 迁移后 `apps/semops` 角色

纯 semantic operator library + 薄 RPC 壳。对外契约 `/api/operators/*` 不变。port 2025 保留，作为所有 workflow / ingest 的"算子后端"。

## 9. Jobs 层（非 LLM）

`apps/agent/jobs/`：

| 文件 | 来源 | 触发 |
|---|---|---|
| `backfill_wechat_embeddings.py` | `scripts/backfill_wechat_embeddings.py` 迁移 | cron（`python -m apps.agent.jobs.backfill_wechat_embeddings`） + admin HTTP（`/api/admin/wechat-embeddings/backfill`，已存在） |
| `backfill_publication_embeddings.py` | `scripts/backfill_publication_embeddings.py` 迁移 | cron |
| `run_daily_digest.py`（可选） | 新增 | cron，薄 curl wrapper；也可直接 cron 配 `curl -X POST {agent_url}/v1/workflows/daily_digest/...` |

`scripts/` 保留给一次性诊断 / dev 工具。

## 10. 分阶段迁移（P1 – P6）

每阶段独立可回滚，先小后大。**S1–S3 期间 LangGraph 仍跑在 `:2024`，`langgraph dev` 用法不变**。

### P1 · harness primitives 骨架（1 周）

- 新增 `hermes/{registry,prompt_builder}.py` + 测试
- 新增 `tools/_echo.py`（单测用；不注册到任何 surface）
- `prompts/base_identity.md` + `prompts/tool_use_enforcement.md` + `prompts/model_hints/{openai,gemini}.md`
- **不**碰现有 graph；现有 rag_agent / hub_agent / search_agent 依旧跑
- 验收：`pytest apps/agent/tests/test_registry.py tests/test_prompt_builder.py` 全绿

### P2 · surface 收敛（1 周）

- `config/surfaces.py` + `surfaces/{notebook,hub}.py`（先不碰 search / deep_research）
- `graphs/common.py` + `graphs/surface.py`
- `prompts/surfaces/{notebook,hub}.md`（从 `prompts/{rag_agent,hub_agent}.py` 提取 + 去重）
- 所有 `tools/*.py` 增加 `registry.register(...)` 自注册
- `langgraph.json` 新增 `notebook` / `hub` 两个 graph 入口；保留旧 `agent` / `hub` 别名一段时间（前端双写过渡）
- 前端 `app/api/copilotkit/*` 切换到新 graph 名（一次 Next.js deploy）
- **验收**：deepdive 聊天、hub 生成式 UI 行为不变；`graphs/rag_agent.py` 和 `graphs/hub_agent.py` 被删除或标记为 deprecated

### P3 · memory + skills（1 周）

- Prisma migration：新增 `UserMemory` / `NotebookMemory` 表
- `hermes/memory/{store,tools}.py`
- `hermes/skills/{loader,index}.py`
- 注册 `memory_{read,write,forget}` 工具；surface config 的 `toolset` 加入 `"memory"`
- `~/.sparkflow/skills/` 目录约定 + 初始 3–5 个 skill（`notebook-literature-summary`, `conference-recommendation`, ...）
- **验收**：notebook agent 能读写个人偏好（demo 脚本）；skills 索引注入 system prompt（通过 prompt snapshot 测试）

### P4 · search 拆 + deep_research 上线（1 周）

- `workflows/search.py` + 对应 `POST /v1/workflows/search` 路由
- `surfaces/deep_research.py` + `prompts/surfaces/deep_research.md` + `tools/web.py`（Tavily + url_fetch）
- `langgraph.json` 新增 `deep_research` graph
- 前端：`/explore` 内部搜索切到 `workflows/search` endpoint；"深度研究"按钮切到 `deep_research` graph
- **删除**：`graphs/search_agent.py`、`prompts/search_agent.py`、`config/search_agent.py`
- **验收**：内部搜索延迟 / 结果质量不劣化；deep research 能多轮 Tavily 调用 + 引用

### P5 · matcher 迁出 semops（1 周）

- `apps/agent/workflows/matcher/` 目录，从 `apps/semops` 搬 6 个文件
- 新增 `POST /v1/workflows/matcher/jobs` 等路由（与原 `apps/semops/api/routes/jobs.py` 契约一致）
- `apps/web/lib/matcher/client.ts` 的 base URL 从 `NEXT_PUBLIC_MATCHER_API_URL`（现指 semops）改为 `NEXT_PUBLIC_AGENT_API_URL` 或新增 `NEXT_PUBLIC_WORKFLOWS_API_URL`
- `apps/semops/` 瘦身：删 matcher 相关代码与测试
- 环境变量过渡：双写 2 周然后 remove
- **验收**：`/explore/toolbox/matcher` 功能一致；semops 测试套件仅剩 operators 相关

### P6 · digest 编排迁 Python（2 周）

详见 §11。

## 11. Digest orchestrator relocation（amendment to 2026-04-21 spec）

本节**仅取代** `docs/superpowers/specs/2026-04-21-daily-digest-design.md` 的 §4.1（架构图）、§7（pipeline）、§10（semops refactor 中 LOTUS per-request scoping 以外的部分）。其余所有章节（§3 用户流、§5 数据 model、§6.1 digest API、§8 UI、§9 BYOK、§12 schema migration、§14 known tensions）**保持原 spec**。

### 11.1 目标形态

```
Browser ──► Next.js /api/digest/generate  ──► POST Python /v1/workflows/daily_digest/generate
                  │                                             │
                  │                                             ├─ HTTP: Next.js /api/explore/search/wechat/prefilter
                  │                                             ├─ HTTP: semops /api/operators/rank
                  │                                             └─ HTTP: Next.js /api/digest/sections/{id}/complete
                  │                                                        │
                  │                                                        ▼
                  └─── Browser polls ─── Next.js /api/digest/:id/sections/:id/status
```

### 11.2 Node 侧保留

- `app/api/digest/generate/route.ts` —— 验证、创建 `DailyDigest` + `DigestSection` 行（GENERATING 状态）、触发 Python workflow HTTP（fire-and-forget）、返回 202
- `app/api/digest/[digestId]/sections/[sectionId]/status/route.ts` —— poll 返回 `DigestSection.status`
- `app/api/digest/sections/[sectionId]/complete/route.ts` —— **新增**，Python 回写时调用；写 items / modelUsed / completedAt / status
- `app/api/digest?date=...` —— 读路由，直接 Prisma
- `lib/services/digest/` —— **几乎清空**，只留 Node 侧 DB 读写工具函数（给 `/api/digest/*` route 用）

### 11.3 Python 侧新增

`apps/agent/workflows/daily_digest.py`：

```python
async def generate_section(req: DigestGenerateRequest) -> None:
    """
    req 携带：user_id, digest_id, section_id, source_type, digest_date,
              digest_config (queries + source config), model_config (BYOK)
    """
    # 1. 建候选池：对每个 enabled query 调 Next.js prefilter
    candidates = await build_wechat_pool(
        queries=req.queries,
        subscribed_sources=req.subscribed_source_ids,
        digest_date=req.digest_date,
    )

    # 2. 空池 → 回调 complete with status=EMPTY
    if not candidates:
        await complete_section(req.section_id, status="EMPTY", items=[])
        return

    # 3. 构造 text_field + joint query
    candidates = assemble_text(candidates)

    # 4. semops sem_rank
    ranked = await semops_rank(
        candidates=candidates,
        text_field="text",
        query=joint_query(req.queries),
        top_k=req.top_n,
        include_reasons=True,
        model_config=req.model_config,
    )

    # 5. 组装 DigestItem[] + 回调 complete
    items = transform_to_digest_items(ranked, candidates)
    await complete_section(req.section_id, status="COMPLETED", items=items,
                            model_used=f"{req.model_config.provider}/{req.model_config.model}")
```

### 11.4 触发入口统一

`POST /v1/workflows/daily_digest/generate` 收到请求后用 `asyncio.create_task(...)` 并发处理每个 section，立即返回 202。status 查询继续由 Node 端提供（从 Prisma 读）。

### 11.5 原 spec 兼容性

- 原 spec §5 数据 model（`DailyDigest` / `DigestSection` / `digestConfig`）**完全保留**
- 原 spec §6.1 digest API 端点**完全保留**（生成 / regenerate / status / read）——只是 `generate` 内部实现从"Node 编排"变成"Node 薄 proxy + Python workflow"
- 原 spec §12 schema migration **保留**
- 原 spec §10.3 LOTUS model config scoping 风险依旧 —— Python workflow 也是吃这道风险（Option α 信号量退路不变）

## 12. 多用户 / 并发模型

### 12.1 共享只读状态

| 状态 | 写入时机 | 并发读安全 |
|---|---|---|
| `ToolRegistry` | 进程启动 `discover_builtin_tools()` | ✅ dict 查询 |
| Skills 索引（内存 LRU） | 启动冷加载 / TTL 刷新 | ✅ 读多写少 |
| `httpx.AsyncClient` 池 | 启动 | ✅ 连接池线程安全 |
| `_cached_system_prompt` | **每个 graph 执行态内**（由 LangGraph checkpointer 隔离） | ✅ |

### 12.2 外化的会话状态

| 状态 | 存储 | Key |
|---|---|---|
| 对话历史 / checkpoint | Postgres（LangGraph `CHECKPOINT_DB_URL`） | `thread_id` |
| UserMemory | Prisma | `user_id` |
| NotebookMemory | Prisma | `notebook_id` |
| ChatSession / ChatMessage（展示给前端） | Prisma（现有） | `session_id` |
| DailyDigest / DigestSection | Prisma（新） | `(user_id, digest_date)` / `section_id` |
| Matcher jobs | Postgres（现 tools/job_store.py 表，P5 迁到 apps/agent 管理） | `job_id` |

### 12.3 硬性禁令

- **不**使用 `os.environ[...] = ...` 跨请求传状态（Hermes 上游的 `TERMINAL_CWD` / `HERMES_SESSION_KEY` 是其单用户设计的副作用，我们不抄）
- **不**在 `tools/*.py` 里维护模块级可变全局（取代 `wiki_tools.py:set_notebook_id` 的 hack；改由 LangGraph `runtime.context.notebook_id` 注入）
- **不**在 `PromptBuilder` 外部缓存 `_cached_system_prompt`

### 12.4 LangGraph 继承的能力

- `thread_id` 多 session 隔离 —— 免费
- `interrupt()` human-in-the-loop —— 免费（取代需要自建跨 worker 通知的方案）
- 客户端 disconnect 时的 cancel —— LangGraph 已处理
- LangSmith tracing —— `LANGSMITH_API_KEY` 设置即启用
- 多 worker 部署 —— `langgraph up` 或标准 uvicorn workers

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Python Prisma schema 维护 | 不抽 Python Prisma 客户端；读写走 psycopg 原生 SQL，schema 变更靠手工同步（digest 场景字段少，low frequency） |
| LOTUS 模块级单例 `lotus.settings` 不支持 per-request scoping | 沿用 2026-04-21 spec §10.3 的 Option α（全局 + 信号量 max 4） |
| harness primitives 与现有 `copilotkit` adapter 不兼容 | `copilotkit` 只消费 LangGraph `StateGraph` + tool schema，不关心 system prompt 来源；registry 返回的 LangChain tool 同形，兼容 |
| matcher 迁移期双端点共存 | 2 周双写过渡：Next.js 先读 `NEXT_PUBLIC_WORKFLOWS_API_URL`，失败回落 `NEXT_PUBLIC_MATCHER_API_URL` |
| Prompt prefix cache 失效 | 严格遵守 memory 冻结 / skills 索引冻结；session 内 `_cached_system_prompt` 只在 checkpointer 压缩时重建 |
| 迁移期 `graphs/rag_agent.py` / `graphs/hub_agent.py` 与新 `graphs/surface.py` 并存的路由冲突 | `langgraph.json` 同时声明新旧 graph 名；前端一次 deploy 切换；新旧共存期 ≤ 1 周 |

## 14. 依赖变更

### 14.1 `apps/agent/requirements.txt` / `pyproject.toml`

- **移除**：`copilotkit`（Python 侧未使用，是现 `graphs/hub_agent.py` 未用的 deadweight）、`deepagents`（废弃）
- **保留**：`langgraph`、`langchain`、`langchain-openai`、`langchain-core`、`langchain-community`、`langgraph-cli[inmem]`、`langchain-mcp-adapters`、`langgraph-checkpoint-postgres`、`psycopg[binary]`、`openai`、`pydantic`、`python-dotenv`、`httpx`、`tavily-python`、`FlagEmbedding`
- **新增**：`langchain-google-genai`（若 gemini adapter 确定走该包）、`PyYAML`（skills frontmatter）

### 14.2 `apps/web/package.json`

- 无变化。CopilotKit 保留。

### 14.3 环境变量

- **新增**：`SPARKFLOW_API_URL`（P4+ workflows 回调 Next.js 的 base URL；实际 `search_agent.py` 已在用，继续复用）、`SEMOPS_API_URL`（workflows 调 semops 的 base URL）、`WORKFLOWS_API_URL`（Next.js 调 workflows 的 base URL）
- **保持**：`CHECKPOINT_DB_URL`、`DATABASE_URL`、`NEXT_PUBLIC_LANGGRAPH_API_URL`、`NEXT_PUBLIC_MATCHER_API_URL`（P5 后 2 周内移除）

## 15. 验收清单

- [ ] `apps/agent/graphs/{rag_agent,hub_agent,search_agent}.py` 全部删除
- [ ] `apps/agent/langgraph.json` 只注册 `notebook` / `hub` / `deep_research` 三个 graph（均由 `graphs/surface.py` 产出）
- [ ] 所有 `tools/*.py` 通过 `registry.register(...)` 自注册；`discover_builtin_tools()` 扫描全绿
- [ ] `ToolRegistry.get_tools(toolset=...)` 返回 LangChain tool list，可直接 `.bind_tools(...)`
- [ ] `prompt_builder.build(...)` 单元测试覆盖所有分层 + memory 冻结 + skills 索引注入
- [ ] Prisma `UserMemory` / `NotebookMemory` 表生效；`memory_read` / `memory_write` / `memory_forget` 工具走通
- [ ] `~/.sparkflow/skills/` loader 在冷启 / snapshot 命中 两种路径下都能正确注入 system prompt
- [ ] `apps/agent/workflows/search.py` 调用成功，内部搜索 e2e 延迟不劣于旧 `search_agent.py` 的 wechat/publication 分支
- [ ] `apps/agent/surfaces/deep_research.py` 可完成"搜索 → 读文 → 再搜索"多轮研究，带引用
- [ ] `apps/semops` 瘦身后 `/api/operators/*` 契约不变；`tests/test_semantic_operators.py` 全绿
- [ ] `apps/agent/workflows/matcher/*` 取代原 `apps/semops` matcher；`/explore/toolbox/matcher` e2e 通过
- [ ] `apps/agent/workflows/daily_digest.py` 走通 e2e；`/digest` 页面生成行为与原 2026-04-21 spec 一致
- [ ] `apps/agent/jobs/backfill_*_embeddings.py` cron 调度不受影响（原 `scripts/` 搬来后路径变化仅需更新 cron 配置）

## 16. 术语表

| 术语 | 含义 |
|---|---|
| **harness** | Hermes 风格的 agent 基建：registry + prompt_builder + memory + skills。**不包含** agent loop 本身（由 LangGraph 负责） |
| **surface** | 用户可见的 agent 配置（notebook / hub / deep_research）。技术上是 `SurfaceConfig` dataclass；由同一个 `graphs/surface.py` 参数化生成 |
| **workflow** | 非-agent 的确定性 LLM 编排，消费 `apps/semops` 语义算子。全部 Python，住 `apps/agent/workflows/` |
| **operator** | `apps/semops` 里的 semantic 原语（sem_rank / sem_filter / sem_map / sem_agg）。纯函数式 |
| **job** | 无 LLM 的 cron / batch 触发器（embedding backfill 等）。`apps/agent/jobs/` |
| **SOUL** | Agent 身份 prompt，对应 `prompts/base_identity.md`（Hermes 术语） |
| **frontend tool** | `registry.register(frontend=True)` 的工具：LLM 吐 tool call 后由 CopilotKit 直接渲染成 React 组件，不回灌 LLM |
| **context ref** | `PromptBuilder` 注入第三方内容（wiki / page context / web search context）的抽象 |
| **memory freeze** | 会话内 system prompt 中的 memory 是会话开始时的 snapshot；新写入不反映到当前会话（保护 prefix cache） |
| **progressive disclosure** | Skills 索引只放标题 + 描述；LLM 需要全文时调 `skill_read(name)` |
