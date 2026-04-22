---
title: "feat: RAG Agent Evaluation Framework"
type: feat
status: active
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-eval-framework-brainstorm.md
---

# RAG Agent Evaluation Framework

## Overview

Build a systematic, black-box evaluation framework for SparkFlow's RAG Agent using **Langfuse v3 (self-hosted)** for tracing/observability and **Ragas** for RAG-specific metrics. The framework enables quantitative comparison of answer quality across different models (GPT-5.2, Gemini-2.5-flash), prompt versions, and retrieval backends (RagFlow, future LangChain Retriever, PageIndex).

Evaluation is end-to-end: given a query and knowledge base, assess whether the agent's final answer is complete, faithful, and relevant — regardless of internal skill/tool routing.

## Problem Statement / Motivation

Currently SparkFlow has:
- **Zero observability** — only `print()` and `logger.error()` (see `.planning/codebase/CONCERNS.md`)
- **Zero test infrastructure** — no pytest, no eval datasets (see `.planning/codebase/TESTING.md`)
- **No way to compare** models (GPT-5.2 vs Gemini) or evaluate query optimizer effectiveness
- **No data-driven basis** for deciding to replace RagFlow with alternatives (LangChain Retriever, PageIndex)

Without evaluation, all quality judgments are subjective. This blocks confident iteration on the RAG pipeline.

## Proposed Solution

A CLI-driven evaluation harness that:
1. Loads a golden dataset of annotated queries
2. Runs each query through the RAG Agent **in-process** (importing the LangGraph graph directly)
3. Collects retrieved contexts via tool instrumentation
4. Computes Ragas metrics + custom Completeness metric
5. Writes all traces and scores to self-hosted Langfuse
6. Outputs results locally as JSON for offline analysis

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLI: python -m eval.run                                    │
│  --backend ragflow --model openai:gpt-5.2                   │
│  --dataset eval/datasets/golden.json                        │
│  --dataset-ids <ragflow-uuid> --disable-optimizer           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  EvalRunner                                                 │
│  - Loads golden dataset                                     │
│  - Iterates queries sequentially                            │
│  - Handles errors (skip & continue)                         │
│  - Generates unique eval_run_id                             │
└────────┬──────────────────────────┬─────────────────────────┘
         │                          │
         ▼                          ▼
┌──────────────────────┐  ┌────────────────────────────────┐
│  Backend: RagFlow    │  │  Backend: (future) PageIndex   │
│  run_eval() impl     │  │  run_eval() impl               │
│  - Imports agent     │  │  - Different agent/pipeline    │
│  - Injects callbacks │  │  - Same interface contract     │
│  - Context collector │  │                                │
└────────┬─────────────┘  └────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Context Collector (wraps RAGFlow tools)                    │
│  - Intercepts search() / probe() / get_first_chunk()        │
│  - Accumulates all retrieved chunks per query               │
│  - Passes through to original tool unchanged                │
└────────┬────────────────────────────────────────────────────┘
         │
         ├──→ Langfuse (traces via CallbackHandler)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Metrics Engine                                             │
│  - Ragas: Faithfulness, Answer Relevancy, Context Recall    │
│  - Custom: Completeness (expected_facts LLM-as-judge)       │
│  - Fixed evaluator model: gpt-4o (independent of target)    │
└────────┬────────────────────────────────────────────────────┘
         │
         ├──→ Langfuse (scores via create_score())
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Output                                                     │
│  - Console: summary table with per-query and aggregate      │
│  - Local: eval/results/YYYY-MM-DD-<run_id>.json             │
│  - Langfuse: traces + scores, filterable by metadata        │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

(see brainstorm: `docs/brainstorms/2026-03-12-eval-framework-brainstorm.md`)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent invocation | **In-process** (import graph directly) | Langfuse CallbackHandler is a Python-level LangChain callback; HTTP invocation cannot inject it |
| Context extraction | **Tool instrumentation** (wrapper around search/probe) | Most reliable; parsing Langfuse traces is fragile; parsing message history loses chunk boundaries |
| Query optimizer | **Configurable, default OFF** | Non-deterministic LLM rewriting hurts reproducibility; can enable explicitly to evaluate full pipeline |
| Ragas evaluator model | **Fixed gpt-4o** | Independent of target model ensures consistent scoring baseline |
| Error handling | **Skip & continue** | One RAGFlow timeout should not abort a 30-query run; errors logged, null scores recorded |
| Langfuse infra | **Separate docker-compose** | Isolation from production DB; independent lifecycle; clean teardown |
| Local output | **JSON alongside Langfuse** | Langfuse outage should not lose results; enables offline analysis |
| Model CLI format | **`provider:name`** (e.g., `openai:gpt-5.2`) | Matches agent's internal `_agent_cache` key format |
| LLM temperature | **0 for agent, 0 for Ragas** | Maximize reproducibility |
| Eval idempotency | **New traces per run** with unique `eval_run_id` | Enables time-series comparison; no overwrite risk |

### Implementation Phases

#### Phase 1: Infrastructure (Langfuse Self-Hosted)

**Goal**: Langfuse running locally, accessible at `http://localhost:3100`

**Tasks:**

- [ ] Create `docker-compose.langfuse.yml` in project root with 6 services
- [ ] Port assignments (avoiding conflicts with existing stack):

| Service | Internal Port | External Port | Notes |
|---------|--------------|---------------|-------|
| langfuse-web | 3000 | **3100** | Avoids conflict with Next.js (3001) |
| langfuse-worker | 3030 | none (internal) | Background jobs |
| langfuse-postgres | 5432 | **5434** | Separate from SparkFlow PG (5433) |
| langfuse-clickhouse | 8123, 9000 | **8124**, **9010** | 9000 conflicts with Crawl4AI |
| langfuse-redis | 6379 | **6380** | Separate from any existing Redis |
| langfuse-minio | 9000 | **9006** | Separate from SparkFlow MinIO (9004) |

- [ ] Headless initialization via env vars (auto-create org, project, API keys)
- [ ] Add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` to `apps/agent/.env.example`
- [ ] Verify Langfuse web UI loads at `http://localhost:3100`
- [ ] Document startup/shutdown in README section

**Files:**

```
docker-compose.langfuse.yml          # NEW - Langfuse services
.env.langfuse                        # NEW - Langfuse-specific env vars
apps/agent/.env.example              # MODIFY - add Langfuse vars
```

#### Phase 2: Core Eval Harness

**Goal**: `python -m eval.run --backend ragflow --model openai:gpt-5.2` runs a single query end-to-end

**Tasks:**

- [ ] Create eval package structure under `apps/agent/eval/`
- [ ] Define `EvalConfig` and `EvalResult` dataclasses

```python
# eval/config.py
@dataclass
class EvalConfig:
    retrieval_backend: str          # "ragflow" | future backends
    model: str                      # "openai:gpt-5.2" | "google:gemini-2.5-flash"
    dataset_ids: list[str]          # RagFlow dataset UUIDs
    prompt_version: str = "default"
    disable_optimizer: bool = True  # default OFF for reproducibility
    temperature: float = 0.0       # deterministic
    eval_run_id: str = ""           # auto-generated if empty

@dataclass
class EvalResult:
    query_id: str
    query: str
    answer: str
    retrieved_contexts: list[str]   # all chunks from search/probe/get_first_chunk
    trace_id: str                   # Langfuse trace ID
    tokens_used: int
    latency_ms: float
    error: str | None = None        # populated if query failed
    metadata: dict = field(default_factory=dict)
```

- [ ] Implement `ContextCollector` — a wrapper that intercepts RAGFlow tool outputs

```python
# eval/context_collector.py
class ContextCollector:
    """Wraps RAGFlow tools to intercept and accumulate retrieved contexts."""
    def __init__(self):
        self.contexts: list[str] = []

    def wrap_tools(self, tools: list) -> list:
        """Return new tool list with collection wrappers."""
        ...

    def reset(self):
        self.contexts = []
```

- [ ] Implement RagFlow backend `run_eval()`

```python
# eval/backends/ragflow.py
async def run_eval(query: str, config: EvalConfig) -> EvalResult:
    """
    1. Build AgentContext from config (dataset_ids, model_provider, model_name)
    2. Create Langfuse CallbackHandler with metadata tags
    3. Attach ContextCollector to tools
    4. Override ENABLE_PROMPT_OPTIMIZER based on config
    5. Invoke agent.ainvoke() with callbacks
    6. Extract answer from final message
    7. Return EvalResult with collected contexts and trace_id
    """
    ...
```

- [ ] Implement CLI entry point

```python
# eval/run.py (or eval/__main__.py)
# Usage: python -m eval.run \
#   --backend ragflow \
#   --model openai:gpt-5.2 \
#   --dataset eval/datasets/golden.json \
#   --dataset-ids <uuid1> <uuid2> \
#   --disable-optimizer \
#   --query eval_001  # optional: run single query for debugging
```

- [ ] Implement `EvalRunner` orchestrator

```python
# eval/runner.py
class EvalRunner:
    """
    1. Load golden dataset
    2. Iterate queries sequentially
    3. Call backend.run_eval() per query
    4. Handle errors (skip & continue, log error)
    5. Return list of EvalResults
    """
    ...
```

**Files:**

```
apps/agent/eval/__init__.py          # NEW
apps/agent/eval/__main__.py          # NEW - CLI entry point
apps/agent/eval/config.py            # NEW - EvalConfig, EvalResult
apps/agent/eval/runner.py            # NEW - EvalRunner orchestrator
apps/agent/eval/context_collector.py # NEW - tool instrumentation
apps/agent/eval/backends/__init__.py # NEW
apps/agent/eval/backends/ragflow.py  # NEW - RagFlow run_eval implementation
apps/agent/eval/datasets/            # NEW - directory for golden datasets
```

#### Phase 3: Golden Dataset

**Goal**: Initial golden dataset with 20-30 queries ready for evaluation

**Tasks:**

- [ ] Define JSON schema for golden dataset

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "version": { "type": "string" },
        "description": { "type": "string" },
        "ragflow_dataset_ids": { "type": "array", "items": { "type": "string" } },
        "created_at": { "type": "string" },
        "knowledge_base_snapshot": { "type": "string" }
      }
    },
    "queries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "query", "expected_facts"],
        "properties": {
          "id": { "type": "string" },
          "query": { "type": "string" },
          "expected_facts": { "type": "array", "items": { "type": "string" } },
          "relevant_documents": { "type": "array", "items": { "type": "string" } },
          "reference_answer": { "type": "string" },
          "category": { "type": "string", "enum": ["retrieval", "exploration", "summarization"] }
        }
      }
    }
  }
}
```

- [ ] Create initial golden dataset (`eval/datasets/golden.json`) with 5-10 seed queries
- [ ] Document dataset curation guidelines in `eval/datasets/README.md`

**Key design for `relevant_documents`**: Use document **names** as they appear in RagFlow (e.g., `"paper_x.pdf"`), not chunk IDs. Chunk IDs are unstable across re-indexing. Document names are human-readable and stable.

**Knowledge base coupling**: The dataset `metadata.knowledge_base_snapshot` field documents which version of the knowledge base the dataset was created against. If the KB changes significantly, the dataset should be re-validated.

**Files:**

```
apps/agent/eval/datasets/golden.json     # NEW - seed dataset
apps/agent/eval/datasets/schema.json     # NEW - JSON schema
apps/agent/eval/datasets/README.md       # NEW - curation guidelines
```

#### Phase 4: Metrics Engine

**Goal**: Ragas metrics + custom Completeness metric computed and written to Langfuse

**Tasks:**

- [ ] Add Python dependencies: `ragas`, `langfuse`, `datasets` (HuggingFace)

```toml
# In pyproject.toml [project.optional-dependencies]
eval = [
    "langfuse>=3.0.0",
    "ragas>=0.2.0",
    "datasets>=2.0.0",
]
```

- [ ] Implement Ragas metric computation

```python
# eval/metrics.py
async def compute_ragas_metrics(
    query: str,
    answer: str,
    contexts: list[str],
    reference_answer: str | None = None,
) -> dict[str, float]:
    """
    Compute:
    - faithfulness (requires: query, answer, contexts)
    - answer_relevancy (requires: query, answer)
    - context_precision (requires: query, contexts, answer — no reference needed)

    If reference_answer provided:
    - context_recall (requires: query, contexts, reference_answer)

    Uses fixed gpt-4o as evaluator model (temperature=0).
    Returns dict of metric_name -> score (0.0-1.0).
    """
    ...
```

- [ ] Implement custom Completeness metric (LLM-as-judge)

```python
# eval/metrics.py
async def compute_completeness(
    answer: str,
    expected_facts: list[str],
) -> tuple[float, list[dict]]:
    """
    Uses gpt-4o to check whether each expected fact is covered in the answer.

    Returns:
    - coverage_rate: float (0.0-1.0), fraction of facts covered
    - fact_results: list of {"fact": str, "covered": bool, "evidence": str}
    """
    ...
```

- [ ] Implement Langfuse score writer

```python
# eval/scoring.py
def write_scores_to_langfuse(
    trace_id: str,
    ragas_scores: dict[str, float],
    completeness_score: float,
    completeness_details: list[dict],
    eval_config: EvalConfig,
):
    """
    Write all scores to Langfuse trace with consistent naming:
    - "ragas_faithfulness" (NUMERIC, 0-1)
    - "ragas_answer_relevancy" (NUMERIC, 0-1)
    - "ragas_context_precision" (NUMERIC, 0-1)
    - "ragas_context_recall" (NUMERIC, 0-1, only if reference provided)
    - "completeness" (NUMERIC, 0-1)

    Trace metadata:
    - retrieval_backend, model, prompt_version, eval_run_id,
      dataset_version, git_commit, disable_optimizer
    """
    ...
```

**Score naming convention**: Prefix Ragas scores with `ragas_` to distinguish from custom metrics. All scores NUMERIC, range 0.0-1.0.

**Files:**

```
apps/agent/eval/metrics.py           # NEW - Ragas + Completeness computation
apps/agent/eval/scoring.py           # NEW - Langfuse score writer
apps/agent/pyproject.toml            # MODIFY - add eval dependencies
```

#### Phase 5: Output & Reporting

**Goal**: Console summary + local JSON output after each eval run

**Tasks:**

- [ ] Console output: summary table after run

```
═══════════════════════════════════════════════════════
 Eval Run: 2026-03-12-abc123
 Backend: ragflow | Model: openai:gpt-5.2
 Queries: 28/30 passed | 2 errors
═══════════════════════════════════════════════════════
 Metric              Avg     Min     Max     Std
───────────────────────────────────────────────────────
 completeness        0.85    0.60    1.00    0.12
 ragas_faithfulness  0.91    0.72    1.00    0.08
 ragas_relevancy     0.88    0.65    1.00    0.10
 ragas_ctx_precision 0.79    0.50    1.00    0.15
───────────────────────────────────────────────────────
 Avg latency: 3.2s | Avg tokens: 1,847 | Est. cost: $0.42
═══════════════════════════════════════════════════════
 Langfuse: http://localhost:3100/project/xxx/traces?tag=abc123
 Results: eval/results/2026-03-12-abc123.json
```

- [ ] Local JSON output with full details

```python
# eval/output.py
def save_results(
    eval_run_id: str,
    config: EvalConfig,
    results: list[EvalResult],
    scores: dict[str, dict[str, float]],
    environment: dict,  # git commit, python version, dep versions
):
    """Save to eval/results/YYYY-MM-DD-<run_id>.json"""
    ...
```

- [ ] Environment snapshot in output

```json
{
  "environment": {
    "git_commit": "abc1234",
    "python_version": "3.12.0",
    "ragas_version": "0.2.1",
    "langfuse_version": "3.1.0",
    "ragflow_dataset_ids": ["uuid1"],
    "disable_optimizer": true,
    "temperature": 0.0
  }
}
```

**Files:**

```
apps/agent/eval/output.py            # NEW - console + JSON output
apps/agent/eval/results/.gitkeep     # NEW - results directory (gitignored except .gitkeep)
apps/agent/.gitignore                # MODIFY - ignore eval/results/*.json
```

### File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `docker-compose.langfuse.yml` | NEW | Langfuse v3 self-hosted (6 services) |
| `.env.langfuse` | NEW | Langfuse env vars with headless init |
| `apps/agent/.env.example` | MODIFY | Add LANGFUSE_* vars |
| `apps/agent/pyproject.toml` | MODIFY | Add `[eval]` optional deps |
| `apps/agent/.gitignore` | MODIFY | Ignore eval results |
| `apps/agent/eval/__init__.py` | NEW | Package init |
| `apps/agent/eval/__main__.py` | NEW | CLI entry point |
| `apps/agent/eval/config.py` | NEW | EvalConfig, EvalResult dataclasses |
| `apps/agent/eval/runner.py` | NEW | EvalRunner orchestrator |
| `apps/agent/eval/context_collector.py` | NEW | Tool output interceptor |
| `apps/agent/eval/metrics.py` | NEW | Ragas + Completeness metrics |
| `apps/agent/eval/scoring.py` | NEW | Langfuse score writer |
| `apps/agent/eval/output.py` | NEW | Console + JSON output |
| `apps/agent/eval/backends/__init__.py` | NEW | Backend registry |
| `apps/agent/eval/backends/ragflow.py` | NEW | RagFlow run_eval impl |
| `apps/agent/eval/datasets/golden.json` | NEW | Seed golden dataset |
| `apps/agent/eval/datasets/schema.json` | NEW | Dataset JSON schema |
| `apps/agent/eval/datasets/README.md` | NEW | Dataset curation guide |
| `apps/agent/eval/results/.gitkeep` | NEW | Results directory placeholder |

**Total: 3 modified files, 16 new files**

## System-Wide Impact

### Interaction Graph

Eval harness → imports `agent` from `graphs/rag_agent.py` → triggers middleware (query_optimizer, sources_context) → calls RAGFlow tools (search, probe, get_first_chunk) → RAGFlow API.

ContextCollector wraps tools transparently — no changes to agent code. Langfuse CallbackHandler injected via LangGraph config, no agent modifications needed.

### Error Propagation

- RAGFlow unreachable → tool returns error string → agent produces degraded answer → eval records error, null scores, continues
- Model API rate limit → agent invoke fails → `run_eval` catches exception → logs error, returns EvalResult with error field, continues
- Langfuse unreachable → score write fails → logged as warning, local JSON still saved → eval does not abort
- Ragas metric fails → individual metric returns None → other metrics still computed → partial scores recorded

### State Lifecycle Risks

- No persistent state mutations — eval is read-only against the agent/RAGFlow
- Langfuse traces are append-only — no risk of corrupting existing data
- Local JSON output is new file per run — no overwrite risk
- RagFlow knowledge base is not modified — eval only reads via search/probe

### API Surface Parity

No new APIs exposed. Eval is a CLI-only developer tool. No frontend changes.

## Acceptance Criteria

### Functional Requirements

- [ ] `docker compose -f docker-compose.langfuse.yml up -d` starts Langfuse at `http://localhost:3100`
- [ ] `python -m eval.run --backend ragflow --model openai:gpt-5.2 --dataset eval/datasets/golden.json --dataset-ids <uuid>` runs successfully
- [ ] Each query produces a Langfuse trace with metadata tags (backend, model, run_id)
- [ ] Ragas metrics (faithfulness, answer_relevancy, context_precision) computed and written as Langfuse scores
- [ ] Custom Completeness metric computed and written as Langfuse score
- [ ] Console prints summary table with aggregate metrics
- [ ] Local JSON result file saved to `eval/results/`
- [ ] `--query eval_001` runs a single query for debugging
- [ ] `--disable-optimizer` / `--enable-optimizer` controls query optimizer
- [ ] Failed queries are skipped with error logged, other queries continue

### Non-Functional Requirements

- [ ] Single query eval completes in < 30 seconds (excluding RAGFlow latency)
- [ ] Full 30-query eval completes in < 15 minutes
- [ ] Langfuse Docker stack uses < 2GB RAM
- [ ] No modifications to existing agent source code (only new files + dependency additions)

## Success Metrics

1. **Can answer**: "Is GPT-5.2 better than Gemini-2.5-flash for our RAG use case?" with data
2. **Can answer**: "Does the query optimizer actually improve answer quality?" with before/after metrics
3. **Can baseline**: Current RagFlow retrieval quality, enabling future comparison with alternatives
4. **Completeness score** on golden dataset ≥ 0.7 (target, not blocker)

## Dependencies & Prerequisites

- Running RAGFlow instance with indexed documents
- Valid OpenAI API key (for agent + Ragas evaluator)
- Docker and Docker Compose installed
- At least one RagFlow dataset UUID for `--dataset-ids`

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `deepagents` framework doesn't propagate LangChain callbacks | Medium | High | Test early in Phase 2; fallback: manual Langfuse span creation around agent invoke |
| Ragas metrics misleading for agentic RAG (multi-step retrieval) | Medium | Medium | Aggregate all retrieved contexts regardless of step; validate with manual spot-checks |
| ContextCollector misses some retrieval paths | Low | High | Audit all tool functions; add integration test that verifies context capture |
| Langfuse self-hosted too resource-heavy | Low | Medium | Start with minimal config; ClickHouse can use lower memory settings |
| Golden dataset doesn't represent real usage | Medium | Medium | Seed from actual user queries; iterate after first eval run |

## Future Considerations

- **Hub Agent evaluation**: Separate dataset with SQL ground truth, different metrics (SQL correctness)
- **CI integration**: Run eval on PRs touching agent code, threshold-based gating
- **Regression detection**: Automated comparison against baseline scores
- **Parallel execution**: asyncio.gather for concurrent query evaluation
- **Additional backends**: `eval/backends/pageindex.py`, `eval/backends/langchain_retriever.py`
- **Production trace scoring**: Sample and score production Langfuse traces (not just golden dataset)

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-12-eval-framework-brainstorm.md](docs/brainstorms/2026-03-12-eval-framework-brainstorm.md) — Key decisions: black-box evaluation, Langfuse+Ragas chosen over LangSmith/DeepEval, unified run_eval interface for backend comparison, manual CLI trigger

### Internal References

- Agent entry point: `apps/agent/graphs/rag_agent.py:80-85`
- Agent context schema: `apps/agent/config/rag_agent.py:17-28`
- RAGFlow tools: `apps/agent/tools/ragflow.py:130-322`
- Query optimizer: `apps/agent/middleware/query_optimizer.py`
- Docker Compose: `apps/web/docker-compose.yml`
- Testing gap analysis: `.planning/codebase/TESTING.md`
- Observability gap: `.planning/codebase/CONCERNS.md`

### External References

- Langfuse self-hosted setup: https://langfuse.com/docs/deployment/self-host
- Langfuse LangGraph integration: https://langfuse.com/docs/integrations/langchain/tracing
- Langfuse scoring API: https://langfuse.com/docs/scores/custom
- Ragas metrics: https://docs.ragas.io/en/latest/concepts/metrics/
- Ragas + Langfuse cookbook: https://langfuse.com/docs/scores/model-based-evals/ragas
