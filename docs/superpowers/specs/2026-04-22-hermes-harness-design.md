# Hermes Harness Refactor Design

> **分支**：`refactor/hermes-agent`
> **日期**：2026-04-22
> **目标读者**：`apps/agent/` 的实现者与 reviewer
> **关联参考**：
> - `NousResearch/hermes-agent`（上游 harness 源码）
> - `cclank/Hermes-Wiki`（架构概念梳理）
> - `nesquena/hermes-webui`（SSE HTTP 壳层参照）

## 1. 目标（Goals）

把 `apps/agent/` 从 LangGraph + CopilotKit 的组合迁到**自建的 Hermes-style harness**，统一三个业务入口（notebook agent / hub agent / search workflow）的底层基建：

1. **代码统一** — 单一工具注册表、单一 prompt 组装器、单一模型/凭证路由取代当前三个 graph 各写一套。
2. **能力升级** — 引入 Hermes 的持久 Memory（用户级 / notebook 级）和 Skills 索引，落到 SparkFlow 的 Prisma 与文件系统。
3. **生态对齐** — 核心抽象（ToolEntry、PromptBuilder 层序、SOUL/skills/memory 文件约定）对齐上游 Hermes-Wiki 的描述，未来可直接复用社区 skill。
4. **运行时解耦** — 移除对 `langgraph dev` 与 `@copilotkit/*` 的依赖；harness 直接暴露 HTTP + SSE 接口。

## 2. 非目标（Non-goals）

- 不实现 Hermes 的 cron 调度、多平台 gateway（Telegram / Discord / WhatsApp 等）。
- 不实现上游 Nous 的凭证池 / 多 key 轮换 —— SparkFlow 已有 BYOK，每个用户自管 key。
- 不做 trajectory export、技能自生成（skill self-authoring）。
- 不重构 `apps/semops`（原 `apps/matcher`，2026-04-22 随 PR #67 重命名并新增 SemanticOperators）、`apps/mcp-server`、`apps/toolbox`，本 spec 只管 `apps/agent/` 和 `apps/web/` 调用 agent 的边界。
- `search` **不**作为 agent；作为 workflow 保持 pgvector → title_triage → body_judge 的确定性流水线（见 §7.3）。
- 本 spec 不迁移现有 `apps/web/lib/services/wiki-ingest.ts`、`graph-service.ts` 等 workflow 到 Python 侧；`workflows/` 目录为未来扩展预留，当前只放 `search.py`。

## 3. 现状摘要

`apps/agent/langgraph.json` 注册 3 个 LangGraph graph：

| graph | 入口 | 形状 |
|---|---|---|
| `agent` | `graphs/rag_agent.py:agent` | `llm_call ↔ tool_node` 循环；注入 wiki 内容；BYOK；多 provider |
| `hub` | `graphs/hub_agent.py:agent` | `call_model ↔ tool_node` 循环；后端工具（`hub_toolbox` / `hub_wechat` / `hub_nav`）在 server 执行后回灌；前端工具（`hub_ui_tools` 的 `show_table` / `show_chart` / `show_card`）通过 CopilotKit 直接渲染 |
| `search` | `graphs/search_agent.py:agent` | 确定性流水线：`web` 路径走 Tavily 循环；`wechat/publication` 路径走 pgvector prefilter → title_triage（单次 LLM） → body_judge（并行批 LLM） |

前端（`apps/web/`）通过 LangGraph SDK + CopilotKit Runtime 调用 `:2024` 上的 graph。hub 的生成式 UI 依赖 CopilotKit 的 `makeAssistantToolUI`。

关键共性：三个 graph 都各自 `init_chat_model(f"{provider}:{name}")`、各自拼 system prompt 字符串、各自维护 tool 列表。没有中心化的 ToolRegistry 或 PromptBuilder，重复代码散布。

## 4. 目标架构

### 4.1 顶层目录

```
apps/agent/
├── hermes/                     # ↘ harness 核心
│   ├── loop.py                 #   AIAgent 同步 loop
│   ├── registry.py             #   ToolEntry + ToolRegistry + discover_builtin_tools()
│   ├── prompt_builder.py       #   分层 system prompt 拼装 + 会话缓存
│   ├── memory/
│   │   ├── store.py            #   Prisma UserMemory / NotebookMemory 表
│   │   ├── manager.py          #   会话工作记忆
│   │   └── provider.py         #   预留外部 adapter，MVP 留空
│   ├── skills/
│   │   ├── loader.py           #   扫 ~/.sparkflow/skills/*.md + frontmatter
│   │   └── index.py            #   内存 LRU + 磁盘 snapshot 两级缓存
│   ├── models/
│   │   ├── router.py           #   provider+model → client；吃 BYOK
│   │   ├── adapters/           #   openai / gemini / deepseek / glm / minimax / kimi / custom
│   │   └── credentials.py      #   复用现有 apiKeys 加密解密
│   ├── streaming/
│   │   ├── events.py           #   SSE 事件 schema
│   │   └── sse.py              #   SSE writer
│   └── context/
│       ├── compressor.py       #   滑动窗口 + 摘要注入（MVP）
│       └── references.py       #   @file / @source / @wiki 解析
├── tools/                      # ↘ 所有工具自注册
│   ├── wiki.py
│   ├── notebook.py
│   ├── hub_toolbox.py
│   ├── hub_wechat.py
│   ├── hub_nav.py
│   └── ui/
│       ├── show_table.py       # frontend=True, handler 为空
│       ├── show_chart.py
│       └── show_card.py
├── surfaces/                   # ↘ agent 业务表面（有 loop）
│   ├── notebook.py             #   AIAgent + wiki/notebook 工具
│   └── hub.py                  #   AIAgent + hub 工具 + ui 工具
├── workflows/                  # ↘ 非-agent 的确定性 LLM 流水线
│   ├── search.py               #   pgvector → title_triage → body_judge
│   └── __init__.py             #   预留位：wiki_ingest / graph_clustering 未来可落这
├── server/                     # ↘ HTTP / SSE 层（取代 langgraph dev）
│   ├── app.py                  #   FastAPI on :2024
│   ├── routes/
│   │   ├── notebook.py         #   POST /v1/surfaces/notebook/stream (SSE)
│   │   ├── hub.py              #   POST /v1/surfaces/hub/stream (SSE)
│   │   ├── search.py           #   POST /v1/workflows/search (JSON)
│   │   └── approvals.py        #   POST /v1/approvals/{id}
│   └── persistence.py          #   ChatSession / ChatMessage（Prisma）读写
├── prompts/                    # ↘ 可组合的 markdown 片段
│   ├── base_identity.md        #   SparkFlow 的 SOUL
│   ├── tool_use_enforcement.md
│   ├── model_hints/
│   │   ├── openai.md
│   │   ├── gemini.md
│   │   └── deepseek.md
│   ├── surfaces/
│   │   ├── notebook.md
│   │   └── hub.md
│   └── search/
│       ├── title_triage.md
│       └── body_judge.md
├── config/
│   └── surfaces.py             #   surface → (toolset, prompts, context_refs, memory_scope)
└── scripts/
```

### 4.2 删除清单（S5 一刀到位）

- `graphs/` 整个目录
- `prompts/{rag_agent,hub_agent,search_agent}.py`（内容迁移到 `prompts/surfaces/*.md` 和 `prompts/search/*.md`）
- `config/{rag_agent,hub_agent,search_agent}.py` 的 `AgentContext` / `HubAgentContext` / `SearchAgentContext`（合并进 `config/surfaces.py`）
- `langgraph.json`
- `requirements.txt` 里的 `langgraph*` 和 `langchain-*`（保留 `langchain-google-genai` 如果 adapter 仍依赖，否则换成 `google-genai` 直连）
- 前端 `apps/web/` 的 `@copilotkit/react-core` / `@copilotkit/react-ui` / `@copilotkit/runtime` / `@copilotkit/*`
- 前端 `apps/web/app/api/copilotkit/` 路由

## 5. 核心模块契约

### 5.1 `hermes/registry.py`

```python
@dataclass(slots=True)
class ToolEntry:
    name: str
    toolset: str                          # 分组标签，用于 surface 按需选集
    schema: dict                          # OpenAI function schema
    handler: Callable                     # (args: dict, ctx: ToolContext) -> Any
    check_fn: Callable[[], bool] | None   # 可用性检查（e.g. 检查环境变量）
    requires_env: tuple[str, ...] = ()
    is_async: bool = False
    frontend: bool = False                # True: 不执行 handler，结果直传前端
    requires_approval: bool = False       # True: 执行前需 approval.request

class ToolRegistry:
    def register(self, **kwargs) -> None: ...
    def get_definitions(self, toolset: set[str]) -> list[dict]: ...
    async def dispatch(self, name: str, args: dict, ctx: ToolContext) -> ToolResult: ...
    def deregister(self, name: str) -> None: ...

# 单例
registry = ToolRegistry()

def discover_builtin_tools(tools_dir: Path | None = None) -> list[str]:
    """AST 级扫描 tools/*.py，只 import 模块顶层调用了 registry.register(...) 的文件"""
```

**`ToolContext`**：每次 dispatch 注入的请求作用域上下文，包含 `session_id`, `user_id`, `notebook_id`（如适用）, `model_router`（如工具需要子请求 LLM）, `db`（Prisma/SQL 句柄）等。工具 handler **不得**读进程全局（取代现在 `tools/wiki_tools.py` 的 `set_notebook_id` hack）。

**`ToolResult`**：
```python
@dataclass(slots=True)
class ToolResult:
    ok: bool
    content: str | dict   # 回灌 LLM 的内容（`frontend=True` 时为 None）
    display: dict | None  # 前端 tool card 展示用（可选）
    frontend: bool = False
```

### 5.2 `hermes/prompt_builder.py` 分层顺序

按固定顺序拼接 `"\n\n".join(parts)`，结果缓存在 `AIAgent._cached_system_prompt`，仅在上下文压缩后重建：

1. **Base identity** — `prompts/base_identity.md`（SparkFlow 身份、基调、引用/citation 规则）
2. **Tool-use enforcement** — 按模型族过滤（openai/gpt/codex/gemini/deepseek 启用；anthropic 略过）
3. **Model-specific hints** — `prompts/model_hints/{provider}.md`
4. **Surface prompt** — 调用方传入（`prompts/surfaces/{notebook,hub}.md`）
5. **Memory usage guide + MEMORY snapshot** — 若 `skip_memory=False`
6. **Skills index** — 扫描 `~/.sparkflow/skills/` 生成，两级缓存
7. **Context references** — 按 `context_refs` 列表解析（wiki 内容、page_context、notebook sources 等）
8. **Session metadata** — timestamp、model、session_id、surface

**Memory 冻结**：与 Hermes 一致——MEMORY snapshot 在会话开始时读一次，会话内工具新写的 memory 不回流到当前 system prompt（保护 prefix cache）。

### 5.3 `hermes/loop.py` 主循环

```python
class AIAgent:
    def __init__(
        self,
        *,
        surface: str,
        toolset: set[str],
        model_router: ModelRouter,
        session_id: str,
        user_id: str,
        surface_prompt: str,
        context_refs: list[ContextRef],
        memory_scope: tuple[str, ...],
        stream: SSEStream,
        max_iterations: int = 30,
        skip_memory: bool = False,
    ): ...

    async def run_conversation(
        self,
        user_message: str,
        history: list[Message],
        system_message: str | None = None,
    ) -> RunResult: ...
```

伪代码：

```python
messages = self._assemble(history, user_message, system_message)
self.stream.emit("session.started", {...})

for _ in range(self.max_iterations):
    tool_schemas = registry.get_definitions(self.toolset)
    async for chunk in self.model_router.chat_stream(messages, tool_schemas):
        if chunk.kind == "token":
            self.stream.emit("message.delta", {"token": chunk.token})
        elif chunk.kind == "final":
            final = chunk

    if not final.tool_calls:
        self.stream.emit("message.final", {"content": final.content, "citations": ...})
        self.stream.emit("session.done", {...})
        return RunResult(final_response=final.content, messages=messages)

    for tc in final.tool_calls:
        entry = registry._tools[tc.name]
        self.stream.emit("tool.call", {"call_id": tc.id, "name": tc.name,
                                        "args": tc.args, "frontend": entry.frontend})

        if entry.requires_approval:
            decision = await self._await_approval(tc)
            if decision.denied:
                messages.append(tool_denied_message(tc.id))
                continue
            tc.args = decision.edited_args or tc.args

        result = await registry.dispatch(tc.name, tc.args, ctx=self._ctx)

        if result.frontend:
            self.stream.emit("frontend.render", {"call_id": tc.id,
                                                  "name": tc.name, "args": tc.args})
            messages.append(tool_ok_placeholder(tc.id))
        else:
            self.stream.emit("tool.result", {"call_id": tc.id, "name": tc.name,
                                              "ok": result.ok, "result": result.content})
            messages.append(tool_result_message(tc.id, result.content))

    if self._needs_compression(messages):
        messages = await self.compressor.compress(messages)
        self.stream.emit("context.compressed", {...})

raise MaxIterationsReached(...)
```

### 5.4 `hermes/models/router.py`

```python
class ModelRouter:
    def __init__(self, credentials: CredentialStore): ...

    async def chat_stream(
        self,
        messages: list[dict],
        tools: list[dict],
        *,
        provider: str,
        model: str,
        api_key: str | None = None,
    ) -> AsyncIterator[ModelChunk]: ...
```

**Adapters**：
- `openai.py` — OpenAI + OpenAI-compatible（deepseek / glm / minimax / kimi / custom 全部走此 adapter，URL 不同）
- `gemini.py` — Google GenAI SDK 直连
- MVP 里这两个 adapter 覆盖 SparkFlow 全部 provider；anthropic 等不启用

**BYOK 优先级**（照搬现 `lib/services/api-key-resolver.ts`）：用户在 `UserSettings.apiKeys` 自填 > admin 自填 > 系统 env vars。该逻辑移到 Python 侧 `hermes/models/credentials.py`，前端把解密后的 key 通过 request body 传给 agent（仍经 Next.js API 代理，不直接暴露到浏览器）。

## 6. SSE 协议

### 6.1 Endpoint

- `POST /v1/surfaces/notebook/stream` — SSE（agent）
- `POST /v1/surfaces/hub/stream` — SSE（agent）
- `POST /v1/workflows/search` — 普通 JSON（确定性 workflow）
- `POST /v1/approvals/{approval_id}` — 普通 JSON（approve/deny）

**路由语义**：`/v1/surfaces/*` 表示有 agent loop（SSE 流）；`/v1/workflows/*` 表示确定性流水线（同步或异步 JSON）。未来新 workflow（wiki_ingest、graph_clustering 等）落 `/v1/workflows/*` 命名空间。

### 6.2 请求体

```json
{
  "session_id": "…",
  "user_message": "…",
  "history": [ { "role": "...", "content": "...", "tool_calls": [...] } ],
  "context": {
    "notebook_id": "…",
    "page_context": "…"
  },
  "model": { "provider": "…", "name": "…", "api_key": "…" }
}
```

### 6.3 SSE 事件

| event | data | 说明 |
|---|---|---|
| `session.started` | `{session_id, model, created_at}` | stream 第一条 |
| `message.delta` | `{token}` | token-level |
| `thinking.start` / `thinking.end` | `{}` | reasoning 阶段（adapter 暴露时） |
| `tool.call` | `{call_id, name, args, frontend}` | LLM 要调用工具 |
| `tool.result` | `{call_id, name, ok, result}` | server 端执行完 |
| `frontend.render` | `{call_id, name, args}` | `frontend=True` 工具直传前端 |
| `approval.request` | `{approval_id, tool, args, reason}` | 需人工批准 |
| `approval.required` | `{approval_id}` | loop 已暂停 |
| `context.compressed` | `{before_tokens, after_tokens}` | 上下文压缩 |
| `error` | `{code, message, recoverable}` | 可恢复错误不终止 |
| `message.final` | `{content, citations, messages_delta}` | 本轮最终答复 |
| `session.done` | `{session_id, usage}` | stream 结束 |

### 6.4 前端消费

- `apps/web/lib/agent/sse-client.ts` —— 新增，封装 EventSource/fetch-readable-stream，暴露 `useAgentStream(surface, payload)` hook。
- `apps/web/lib/agent/frontend-tools.ts` —— 新增 `registerFrontendTool(name, Component)`；`Component` 签名保持 `({args, callId, status}) => JSX` 与 CopilotKit `makeAssistantToolUI` 等价，让 `show_table` / `show_chart` / `show_card` 的组件代码**零改动**迁移。
- `apps/web/components/deepdive/chat/` 与 hub chat panel 的 `CopilotKit` Provider 替换为 `AgentStreamProvider`。

### 6.5 持久化

- 每条 stream 开始时：若 `session_id` 存在则从 Prisma `ChatSession` + `ChatMessage` 加载 history；若无则新建。
- 每条 stream 结束时：追加本轮 delta（user message + assistant final + tool calls / results）回 Prisma。
- 取代 `CHECKPOINT_DB_URL` / LangGraph checkpointer 的角色。

## 7. Surface / Workflow 的具体组装

**术语边界**：
- **Surface** = agent，有 `AIAgent` loop、SSE 流、工具注册表过滤、记忆上下文注入 → 当前为 `notebook`、`hub`
- **Workflow** = 确定性 LLM 流水线，无 loop、同步响应、只借用 `prompt_builder` + `model_router` → 当前为 `search`，未来可能增加 `wiki_ingest` / `graph_clustering` 等

### 7.1 notebook surface

```python
# config/surfaces.py
NOTEBOOK = SurfaceConfig(
    name="notebook",
    toolset={"wiki_search", "wiki_navigate", "source_read", "source_list",
             "note_create", "note_update"},
    surface_prompt="surfaces/notebook.md",
    context_refs=[
        ("wiki", lambda ctx: WikiContentRef(notebook_id=ctx.notebook_id)),
        ("sources", lambda ctx: NotebookSourcesRef(notebook_id=ctx.notebook_id)),
    ],
    memory_scope=("user", "notebook"),
    max_iterations=30,
)
```

现有 `tools/wiki_tools.py` 的 `set_notebook_id` 进程全局 hack 删除 —— notebook_id 从 `ctx` 进 handler。

### 7.2 hub surface

```python
HUB = SurfaceConfig(
    name="hub",
    toolset={
        # backend（原 hub_toolbox / hub_wechat / hub_nav）
        "search_conferences", "search_sessions", "search_publications",
        "search_wechat_articles", "wechat_article_detail",
        "navigate_to", ...,
        # frontend
        "show_table", "show_chart", "show_card",
    },
    surface_prompt="surfaces/hub.md",
    context_refs=[
        ("page", lambda ctx: PageContextRef(raw=ctx.page_context)),
    ],
    memory_scope=("user",),
    max_iterations=20,
)
```

`show_table` / `show_chart` / `show_card` 的注册：

```python
registry.register(
    name="show_table",
    toolset="hub_ui",
    schema=SHOW_TABLE_SCHEMA,
    handler=None,              # frontend 工具无 server handler
    frontend=True,
)
```

`registry.dispatch` 遇到 `frontend=True` 立即返回 `ToolResult(ok=True, frontend=True, content=None)`；loop 发 `frontend.render` 事件，LLM 端回灌 `{"role": "tool", "tool_call_id": ..., "content": "ok"}` 让对话可继续。

### 7.3 search workflow（非 loop）

```python
# workflows/search.py
async def run(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        # 保留现 Tavily 迭代式路径，但 LLM 调用走 model_router
        return await _web_search_loop(req)

    # 1. pgvector prefilter via SparkFlow Next.js API (unchanged)
    candidates = await prefilter(req.query, source_type=req.source_type,
                                  limit=PREFILTER_LIMIT)

    # 2. title triage：单次 LLM 调用 + JSON schema
    triage_sys = prompt_builder.build_minimal(
        base=["base_identity", f"model_hints/{req.provider}"],
        surface_prompt=load_prompt("search/title_triage.md"),
    )
    shortlist = await model_router.complete_structured(
        messages=[{"role": "system", "content": triage_sys}, ...],
        schema=TitleTriagePick,
        provider=req.provider, model=req.model, api_key=req.api_key,
    )

    # 3. body judge：并行批量
    judged = await asyncio.gather(*[
        model_router.complete_structured(
            messages=[{"role": "system", "content": body_sys},
                      {"role": "user", "content": render_batch(batch)}],
            schema=BodyJudgeBatch,
            provider=req.provider, model=req.model, api_key=req.api_key,
        )
        for batch in chunks(shortlist, BODY_JUDGE_BATCH)
    ])

    return rank_and_topk(judged, k=FINAL_TOP_K)
```

**共享**：prompt_builder（`build_minimal` 跳过 memory/skills/context refs，只拼 base + hints + surface_prompt）+ model_router。**不走**：AIAgent、loop、ToolRegistry、SSE。

## 8. Memory 与 Skills

### 8.1 Memory

Prisma 新增两张表：

```prisma
model UserMemory {
  id         String   @id @default(cuid())
  userId     String
  category   String   // "profile" | "preference" | "fact" | ...
  content    String   @db.Text
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
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

**Memory 工具**（注册为普通 tools）：
- `memory_read(scope, category?)` — 读
- `memory_write(scope, category, content)` — 写（仅影响下次会话的 snapshot）
- `memory_forget(scope, id)` — 删

`scope ∈ {"user", "notebook"}`，由 surface 的 `memory_scope` 决定可用范围。

### 8.2 Skills

- 目录：`~/.sparkflow/skills/<skill-name>.md`（与 Hermes 的 `~/.hermes/skills/` 对齐，便于复用社区 skills）
- 格式：YAML frontmatter + Markdown body
  ```yaml
  ---
  name: notebook-summary
  description: When the user asks to summarize a notebook
  applies_to: [notebook]        # 哪些 surface 可见
  tools_required: [wiki_search, source_read]
  ---
  # Body
  ```
- `hermes/skills/loader.py` 启动时扫描 + frontmatter 解析
- `hermes/skills/index.py` 两级缓存：
  - Layer 1：进程内 LRU（`OrderedDict`，cap=8），key = `(skills_dir, surface, toolset)`
  - Layer 2：磁盘 snapshot `.skills_index_snapshot.json`，校验 mtime + size manifest
- 系统 prompt 注入的是**索引**（name + description + applies_to），**不是**全文；LLM 想用时通过 `skill_read(name)` 工具拉取全文 —— 进步披露（progressive disclosure）

## 9. 迁移步骤（S1–S6）

每一步都应能独立 ship、独立回滚；S1–S4 期间 LangGraph 继续跑（在 `:2024/legacy` 或另起端口，由 Nginx/Next.js 路由区分）。

### S1 · harness 骨架
- 新增 `hermes/{registry,prompt_builder,models/router,loop,streaming}` 最小实现
- 一个 `echo` 测试工具（`tools/_echo.py`）
- `server/app.py` FastAPI 跑 `:2024`（暂时只绑 `/v1/healthz` + `/v1/surfaces/echo/stream`）
- **不**碰 `graphs/`
- 验收：`curl -N` 能看到 `message.delta` 流

### S2 · notebook surface 迁移
- `tools/wiki.py` 重写（从 `tools/wiki_tools.py` 搬，去掉 `set_notebook_id`）
- `tools/notebook.py`（source_read / source_list / notes）
- `prompts/surfaces/notebook.md`（从 `prompts/rag_agent.py` 的 `RAG_AGENT_SYSTEM_PROMPT` 提取）
- `surfaces/notebook.py` + `config/surfaces.py:NOTEBOOK`
- `server/routes/notebook.py`
- 前端 `apps/web/app/api/copilotkit/notebook/*` 改成代理到新端点；新增 `lib/agent/sse-client.ts`
- **验收**：deepdive 聊天、wiki 检索、citation 都正常；CopilotKit 依然保留在 hub，仅 notebook 走新通路

### S3 · hub surface 迁移
- `tools/hub_{toolbox,wechat,nav}.py` 加 `registry.register` 自注册
- `tools/ui/show_{table,chart,card}.py`（frontend=True）
- `prompts/surfaces/hub.md`
- `surfaces/hub.py` + `config/surfaces.py:HUB`
- `server/routes/hub.py`
- 前端：删 `@copilotkit/*`；新增 `lib/agent/frontend-tools.ts` `registerFrontendTool`；hub chat panel 换 `AgentStreamProvider`
- `makeAssistantToolUI(show_table, ...)` 对应的 React 组件**函数体不变**，只换注册入口
- **验收**：hub 对话、`show_table`/`show_chart`/`show_card` 组件正常渲染；搜索会议/微信文章结果正确

### S4 · search workflow 迁移
- `prompts/search/{title_triage,body_judge}.md`（从 `prompts/search_agent.py` 提取）
- `workflows/search.py`（pgvector prefilter + triage + judge，复用 prompt_builder + model_router）
- `server/routes/search.py` 暴露 `POST /v1/workflows/search`
- 前端 semops / toolbox 里现有 search 调用改到新端点（注意：`apps/semops` 自身不受影响，它是独立的语义算子服务，不依赖 LangGraph/harness）
- **验收**：现有 search 请求的延迟、top-k 质量指标对齐或优于旧实现

### S5 · 清理 LangGraph / CopilotKit
- 删 `graphs/`, `prompts/{rag_agent,hub_agent,search_agent}.py`, `config/{rag_agent,hub_agent,search_agent}.py`, `langgraph.json`
- `requirements.txt` 去 `langgraph*`, `langchain-*`
- 前端 `package.json` 去 `@copilotkit/*`
- `docker-compose` / env 清理 `CHECKPOINT_DB_URL` 如不再使用
- **前置条件**：S2、S3、S4 稳定 ≥ 1 周，生产无回滚记录

### S6 · Memory 与 Skills 落地
- Prisma 加 `UserMemory`、`NotebookMemory` 表（`npx prisma migrate dev --name add_memory_tables`）
- `hermes/memory/store.py`、`memory_read/write/forget` 工具注册
- `~/.sparkflow/skills/` 目录与 loader；打包几个初始 skill（如 `notebook-summary`、`conference-recommendation`）
- 把之前散在 system prompt 的样板话术迁成 skills 条目

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| BYOK 多 provider 流式兼容性 | MVP 只保证 openai-compatible + gemini 流式；其他 provider 非流式先上，后续补 |
| CopilotKit 组件迁移出错 | `registerFrontendTool` 保持 `({args, callId, status}) => JSX` 签名不变，组件函数体零改动 |
| 迁移期 LangGraph 与 harness 并存的路由冲突 | S1-S4 期间前端按 surface 选择路由（`notebook` 走新，`hub`/`search` 仍走旧），Next.js `rewrites` 做开关 |
| 系统 prompt prefix cache 失效 | 严格遵守 memory 冻结、skills 索引缓存；每会话 `_cached_system_prompt` 只在压缩后重建 |
| 审批 UI 无现有需求 | 保留协议，所有工具默认 `requires_approval=False`；未来某个写操作工具启用时前端再补 UI |
| 长上下文压缩 MVP 简陋 | 滑动窗口 + 摘要；用量超过 80% max context 才触发；后续吸收上游 `context_compressor.py` |

## 11. 验收清单（贯穿全 spec）

- [ ] `apps/agent/` 移除对 `langgraph*` 与 `langchain*` 的顶层依赖（仅允许 `langchain-google-genai` 或 `google-genai` 二选一保留）
- [ ] `apps/web/` 移除 `@copilotkit/*` 所有依赖
- [ ] 两个 surface（notebook / hub）走 `AIAgent`；search workflow 走 `prompt_builder.build_minimal()` + `model_router`；一处 `init_chat_model` 调用点都不残留
- [ ] 所有 `tools/*.py` 通过 `registry.register` 自注册；`discover_builtin_tools()` 全量加载无错
- [ ] system prompt 由 `prompt_builder.build()` / `build_minimal()` 统一生成；surface 注入各自的 `surface_prompt` 与 `context_refs`；workflow 只注入 `surface_prompt`
- [ ] BYOK：用户 key 优先于系统 env；解密仍在 `apps/web` 侧，通过 request body 传入 agent
- [ ] SSE 协议所有事件类型都有至少一条前后端集成测试覆盖
- [ ] notebook 聊天、hub 生成式 UI、search 流水线三条用户路径的端到端延迟与现状对齐或更优
- [ ] Prisma `UserMemory` / `NotebookMemory` 表生效；memory 工具可读写
- [ ] `~/.sparkflow/skills/` 的 loader 走过全量扫描 + snapshot 命中 两种路径

## 12. 术语表

| 术语 | 含义 |
|---|---|
| **harness** | Hermes 风格的 agent 运行外壳：loop + registry + prompt_builder + memory + skills |
| **surface** | agent 表面（notebook / hub），每个用不同工具集与 prompt，走 AIAgent loop |
| **workflow** | 非-agent 的确定性 LLM 流水线（search 等），只借用 prompt_builder + model_router |
| **toolset** | 工具分组标签；`registry.get_definitions(toolset=...)` 按需下发给 LLM |
| **SOUL** | Agent 的身份 prompt，对应 `prompts/base_identity.md` |
| **frontend tool** | `frontend=True` 的工具：LLM 吐 tool_call，server 不执行，直接 SSE 给前端渲染 |
| **progressive disclosure** | Skills 索引只放描述，全文按需经 `skill_read` 工具拉取 |
| **memory freeze** | 会话内 system prompt 中的 memory 是会话开始时的 snapshot，新写入不反映到当前会话 |
