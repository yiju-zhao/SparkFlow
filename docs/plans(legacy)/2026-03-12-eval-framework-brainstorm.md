---
date: 2026-03-12
topic: agent-eval-framework
---

# Agent Evaluation Framework

## What We're Building

A systematic, black-box evaluation framework for SparkFlow's RAG Agent, using **Langfuse (self-hosted)** for tracing/observability and **Ragas** for RAG-specific evaluation metrics. The framework enables quantitative comparison across models, prompt versions, and retrieval backends (RagFlow, LangChain Retriever, PageIndex, etc.).

## Why This Approach

Three approaches were considered:

1. **Langfuse + Ragas (chosen)** — Self-hosted, open-source, fits existing Docker Compose infra, zero external API costs, strong RAG eval metrics via Ragas, retrieval backend comparison via tagging.
2. **LangSmith Cloud** — Fastest to start (2 env vars), but closed-source, data goes to cloud, $39+/user/month, vendor lock-in to LangChain ecosystem.
3. **Self-built + DeepEval** — Lightest dependencies, but poor trace exploration UX, visualization must be self-built.

Approach 1 was chosen for: data privacy, zero ongoing cost, Docker Compose compatibility, and Ragas' purpose-built RAG metrics.

## Scope

- **In scope (Phase 1):** RAG Agent end-to-end evaluation only
- **Out of scope (future):** Hub Agent (text-to-SQL) evaluation, CI integration

## Key Decisions

- **Evaluation philosophy**: Black-box, end-to-end only — evaluate final answer completeness, not internal skill/tool usage
- **Tracing platform**: Langfuse self-hosted (MIT license, all core features free)
- **Evaluation metrics**: Ragas (Faithfulness, Context Recall, Answer Relevancy) + custom Completeness metric
- **Retrieval backend comparison**: Fully decoupled — different backends may have entirely different agent architectures (tool-based vs LangChain Retriever vs PageIndex). Evaluation sits above all of them via a unified `run_eval()` interface, tagged with `metadata={"retrieval_backend": "ragflow|pageindex|langchain_xxx"}`
- **Golden dataset**: End-to-end annotated queries with expected facts and relevant documents (not chunk IDs)
- **Evaluation trigger**: Manual script execution (`python eval/run.py --backend ragflow`)
- **Evaluation mode**: Offline batch, scores written back to Langfuse traces

## Evaluation Dimensions

| Dimension | Metrics | Purpose |
|-----------|---------|---------|
| Completeness | Expected facts coverage rate | Did the agent extract ALL relevant content? (core metric) |
| Faithfulness | Ragas Faithfulness score | Is the answer grounded in source documents? |
| Retrieval Recall | Context Recall | Did retrieval layer find all relevant documents? |
| Answer Quality | Answer Relevancy | Is the answer relevant and well-formed? |
| Cost | Tokens/query, API cost/query | Model and config cost comparison |
| Performance | E2E latency, retrieval latency | Speed comparison across backends |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  eval/run.py (CLI entry point)                       │
│  --backend ragflow|pageindex|langchain_xxx           │
│  --model gpt-5.2|gemini-2.5-flash                    │
│  --dataset eval/datasets/golden.json                 │
└──────────────────┬───────────────────────────────────┘
                   │ calls
                   ▼
┌──────────────────────────────────────────────────────┐
│  run_eval(query, config) -> EvalResult               │
│  Unified interface — each backend implements this    │
│  Returns: answer, retrieved_contexts, tokens, latency│
└──────────────────┬───────────────────────────────────┘
                   │ traces (via Langfuse CallbackHandler)
                   ▼
┌──────────────────────────────────────────────────────┐
│  Langfuse (self-hosted Docker Compose)               │
│  PostgreSQL + ClickHouse + Redis + MinIO             │
│  - Trace storage & exploration                       │
│  - Cost tracking                                     │
│  - Filter by: retrieval_backend, model, prompt_ver   │
└──────────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  Ragas Metrics Computation                           │
│  - Faithfulness, Context Recall, Answer Relevancy    │
│  - Custom Completeness (expected_facts coverage)     │
│  - Scores written back to Langfuse via score()       │
└──────────────────────────────────────────────────────┘
```

## Golden Dataset Structure

```json
{
  "id": "eval_001",
  "query": "论文 X 中关于 attention mechanism 的改进方法是什么？",
  "expected_facts": [
    "提出了 multi-scale attention",
    "在 CIFAR-10 上提升了 2.3%",
    "计算复杂度从 O(n²) 降到 O(n log n)"
  ],
  "relevant_documents": ["paper_x.pdf"],
  "reference_answer": "论文 X 提出了 multi-scale attention 方法..."
}
```

- **Storage**: `apps/agent/eval/datasets/golden.json`
- **Size**: Start with 20-30 queries, grow organically
- **Versioning**: Checked into git alongside code

## Unified Eval Interface

```python
@dataclass
class EvalConfig:
    retrieval_backend: str   # "ragflow" | "pageindex" | "langchain_xxx"
    model: str               # "gpt-5.2" | "gemini-2.5-flash"
    prompt_version: str      # optional, for prompt A/B testing

@dataclass
class EvalResult:
    answer: str
    retrieved_contexts: list[str]
    tokens_used: int
    latency_ms: float
    metadata: dict           # additional backend-specific info

async def run_eval(query: str, config: EvalConfig) -> EvalResult:
    """Each retrieval backend implements this interface."""
    ...
```

- Backend-agnostic: RagFlow tool-based agent, LangChain Retriever pipeline, PageIndex — all implement `run_eval()`
- Langfuse tracing injected at this layer, not inside individual backends

## Implementation Modules

### 1. Langfuse Self-Hosted Deployment
- Add Langfuse services to Docker Compose (separate `docker-compose.eval.yml` or extend existing)
- Components: langfuse-server, ClickHouse, Redis (PostgreSQL + MinIO reuse existing)

### 2. Trace Collection
- RAG Agent: inject `langfuse_handler` into LangGraph config callbacks
- Attach metadata: `retrieval_backend`, `model`, `prompt_version`, `eval_run_id`
- All tracing happens inside `run_eval()` wrapper, not in agent code directly

### 3. Golden Dataset Curation
- Start with 20-30 queries based on real user interactions
- Annotate expected_facts (list of key points answer must cover)
- Annotate relevant_documents (for retrieval recall)
- Store as JSON in `apps/agent/eval/datasets/`

### 4. Ragas Evaluation Pipeline
- `eval/run.py`: CLI script, loads dataset, runs `run_eval()` per query, computes Ragas metrics
- Custom Completeness metric: check expected_facts coverage via LLM-as-judge
- All scores written back to Langfuse traces

### 5. Comparison & Analysis
- Langfuse dashboard: filter by `retrieval_backend` / `model` tags
- Compare metric distributions across configurations
- Export for deeper analysis if needed

## Next Steps

→ `/ce:plan` for detailed implementation plan with file-level changes
