"""LangGraph search agent.

Two execution paths, chosen by `runtime.context.source_type`:

- `web` — iterative tool-calling loop over Tavily (unchanged legacy behavior).
- `wechat`, `publication` — deterministic pgvector prefilter followed by two
  latent passes:
    1. title_triage:  one LLM call inspects candidate titles and picks a shortlist.
    2. body_judge:    parallel batched LLM calls read the full bodies and decide
                      which of the shortlist are actually relevant.

Design goal: keep latent space focused on judgment (triage, relevance), push
retrieval + ranking into deterministic SQL. Prefilter is called through
SparkFlow's Next.js API so we reuse the existing connection pools and auth.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Annotated, Any

import httpx
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

from config.search_agent import SearchAgentContext
from prompts.search_agent import (
    BODY_JUDGE_PROMPT,
    TITLE_TRIAGE_PROMPT,
    build_search_prompt,
    build_wiki_section,
)
from tools.search_tools import SEARCH_TOOLS_BY_TYPE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tuning knobs
# ---------------------------------------------------------------------------
PREFILTER_LIMIT = 80  # vector ANN candidates
TRIAGE_MIN_PICK = 5
TRIAGE_MAX_PICK = 20
BODY_JUDGE_BATCH = 5  # articles per LLM call
FINAL_TOP_K = 10
WEB_MAX_ITERATIONS = 3

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")

_model_cache: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
class SearchState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    iteration: int
    # Routing
    source_type: str
    # Prefilter pipeline
    query: str
    candidates: list[dict]
    shortlist_ids: list[str]
    bodies: list[dict]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_model(provider: str, name: str):
    key = f"{provider}:{name}"
    if key not in _model_cache:
        if provider == "google":
            _model_cache[key] = ChatGoogleGenerativeAI(model=name)
        else:
            _model_cache[key] = init_chat_model(f"{provider}:{name}")
    return _model_cache[key]


def _extract_user_query(state: SearchState) -> str:
    """Pull the last human turn out of the message history."""
    for msg in reversed(state.get("messages", [])):
        if getattr(msg, "type", None) == "human" and isinstance(msg.content, str):
            return msg.content.strip()
        # Dict-shaped messages from the CopilotKit bridge
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, str):
                return content.strip()
    return ""


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def _post_json(path: str, payload: dict, timeout: float = 30.0) -> Any:
    url = f"{SPARKFLOW_API_URL}{path}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(url, json=payload)
        res.raise_for_status()
        return res.json()


# ---------------------------------------------------------------------------
# Router (copies runtime.context.source_type into state for branching)
# ---------------------------------------------------------------------------
async def route_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    query = _extract_user_query(state)
    return {
        "source_type": runtime.context.source_type,
        "query": query,
        "iteration": state.get("iteration", 0),
    }


def select_path(state: SearchState) -> str:
    return "web_agent" if state.get("source_type") == "web" else "prefilter"


# ---------------------------------------------------------------------------
# Web path (legacy iterative tool loop)
# ---------------------------------------------------------------------------
async def web_agent_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    source_type = runtime.context.source_type
    tools = SEARCH_TOOLS_BY_TYPE.get(source_type, [])

    provider = runtime.context.model_provider or os.getenv(
        "DEFAULT_MODEL_PROVIDER", "openai"
    )
    model_name = runtime.context.model_name or os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    model = _get_model(provider, model_name)

    if tools and state.get("iteration", 0) < WEB_MAX_ITERATIONS:
        bound_model = model.bind_tools(tools)
    else:
        bound_model = model

    system_prompt = build_search_prompt(
        source_type=source_type,
        wiki_context=runtime.context.wiki_context,
    )
    if source_type == "web" and runtime.context.domains:
        domain_list = ", ".join(runtime.context.domains)
        system_prompt += (
            f"\n\nDOMAIN FILTER: Restrict web search to these domains: {domain_list}"
        )

    response = await bound_model.ainvoke(
        [SystemMessage(content=system_prompt)] + list(state["messages"]),
    )

    new_iteration = state.get("iteration", 0)
    if isinstance(response, AIMessage) and response.tool_calls:
        new_iteration += 1
    return {"messages": [response], "iteration": new_iteration}


async def web_tool_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    source_type = runtime.context.source_type
    tools = SEARCH_TOOLS_BY_TYPE.get(source_type, [])
    tools_by_name = {t.name: t for t in tools}

    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        return {"messages": []}

    results: list[ToolMessage] = []
    for call in last_message.tool_calls:
        tool = tools_by_name.get(call["name"])
        if tool is None:
            results.append(
                ToolMessage(
                    content=json.dumps({"error": f"Unknown tool: {call['name']}"}),
                    tool_call_id=call["id"],
                )
            )
            continue
        try:
            args = dict(call.get("args", {}))
            if call["name"] == "search_web" and runtime.context.domains:
                args.setdefault("domains", runtime.context.domains)
            observation = await tool.ainvoke(args)
        except Exception as e:
            observation = json.dumps({"error": str(e)})
        results.append(ToolMessage(content=str(observation), tool_call_id=call["id"]))

    return {"messages": results}


def web_should_continue(state: SearchState) -> str:
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return END
    return "web_tools"


# ---------------------------------------------------------------------------
# Prefilter pipeline (wechat / publication)
# ---------------------------------------------------------------------------
async def prefilter_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    """Embed the query with BGE-M3 and fetch top-N candidates via pgvector."""
    # Import lazily — the module loads the model on first use.
    from embeddings.bge_m3 import embed_query

    query = state.get("query") or _extract_user_query(state)
    if not query:
        return {"candidates": []}

    vector = await embed_query(query)
    source_type = runtime.context.source_type

    if source_type == "wechat":
        path = "/api/explore/search/wechat/prefilter"
    elif source_type == "publication":
        path = "/api/explore/search/publications/prefilter"
    else:
        return {"candidates": []}

    try:
        candidates = await _post_json(
            path, {"embedding": vector, "limit": PREFILTER_LIMIT}
        )
    except Exception as exc:
        logger.exception("prefilter failed: %s", exc)
        candidates = []

    if not isinstance(candidates, list):
        candidates = []
    return {"candidates": candidates}


def _format_triage_candidates(source_type: str, candidates: list[dict]) -> str:
    lines: list[str] = []
    for c in candidates:
        if source_type == "wechat":
            meta = " · ".join(
                filter(None, [c.get("source_name"), c.get("author"), c.get("publish_time")])
            )
        else:
            meta = " · ".join(
                filter(None, [c.get("venue"), str(c.get("year") or "")])
            )
        title = c.get("title") or "(untitled)"
        lines.append(f'- id={c.get("id")}  |  {title}  |  {meta}')
    return "\n".join(lines) if lines else "(no candidates)"


async def triage_titles_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    """Single LLM call: pick which candidate titles deserve a full read."""
    candidates = state.get("candidates") or []
    if not candidates:
        return {"shortlist_ids": []}

    provider = runtime.context.model_provider or os.getenv(
        "DEFAULT_MODEL_PROVIDER", "openai"
    )
    model_name = runtime.context.model_name or os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    model = _get_model(provider, model_name)

    prompt = TITLE_TRIAGE_PROMPT.format(
        query=state.get("query", ""),
        wiki_section=build_wiki_section(runtime.context.wiki_context),
        source_type=runtime.context.source_type,
        min_pick=TRIAGE_MIN_PICK,
        max_pick=TRIAGE_MAX_PICK,
        candidates=_format_triage_candidates(runtime.context.source_type, candidates),
    )

    try:
        response = await model.ainvoke([SystemMessage(content=prompt)])
        content = response.content if hasattr(response, "content") else str(response)
        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        parsed = json.loads(_strip_json_fence(content or "[]"))
        picked = [str(x) for x in parsed if isinstance(x, (str, int))]
    except Exception as exc:
        logger.warning("title triage parse failed: %s", exc)
        picked = []

    # Intersect with candidate IDs to ignore hallucinated IDs, preserving order.
    candidate_ids = {str(c.get("id")) for c in candidates}
    shortlist = [pid for pid in picked if pid in candidate_ids][:TRIAGE_MAX_PICK]
    return {"shortlist_ids": shortlist}


async def fetch_bodies_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    ids = state.get("shortlist_ids") or []
    if not ids:
        return {"bodies": []}

    source_type = runtime.context.source_type
    if source_type == "wechat":
        path = "/api/explore/wechat/bodies"
        payload_ids: list[Any] = [int(i) for i in ids if str(i).isdigit()]
    elif source_type == "publication":
        path = "/api/explore/publications/bodies"
        payload_ids = list(ids)
    else:
        return {"bodies": []}

    try:
        bodies = await _post_json(path, {"ids": payload_ids})
    except Exception as exc:
        logger.exception("fetch_bodies failed: %s", exc)
        bodies = []

    if not isinstance(bodies, list):
        bodies = []
    return {"bodies": bodies}


def _format_batch_articles(source_type: str, batch: list[dict]) -> str:
    chunks: list[str] = []
    for b in batch:
        if source_type == "wechat":
            header = (
                f'ARTICLE id={b.get("id")}\n'
                f'Title: {b.get("title")}\n'
                f'Source: {b.get("source_name")}  |  Author: {b.get("author")}  |  '
                f'Date: {b.get("publish_time")}'
            )
            body = b.get("content_text", "")
        else:
            header = (
                f'ARTICLE id={b.get("id")}\n'
                f'Title: {b.get("title")}\n'
                f'Venue: {b.get("venue")}  |  Year: {b.get("year")}  |  '
                f'Authors: {", ".join(b.get("authors", [])[:5])}'
            )
            abstract = b.get("abstract") or ""
            summary = b.get("summary") or ""
            body = abstract + ("\n\n" + summary if summary else "")
        chunks.append(f"{header}\n---\n{body}\n===END===")
    return "\n\n".join(chunks)


async def _judge_one_batch(
    model, query: str, wiki_section: str, source_type: str, batch: list[dict]
) -> list[dict]:
    prompt = BODY_JUDGE_PROMPT.format(
        query=query,
        wiki_section=wiki_section,
        n=len(batch),
        source_type=source_type,
        articles=_format_batch_articles(source_type, batch),
    )
    try:
        response = await model.ainvoke([SystemMessage(content=prompt)])
        content = response.content if hasattr(response, "content") else str(response)
        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        parsed = json.loads(_strip_json_fence(content or "[]"))
        return parsed if isinstance(parsed, list) else []
    except Exception as exc:
        logger.warning("body judge batch failed: %s", exc)
        return []


def _to_search_result(source_type: str, body: dict, verdict: dict) -> dict:
    if source_type == "wechat":
        meta = " · ".join(
            filter(
                None,
                ["WeChat", body.get("source_name"), body.get("publish_time")],
            )
        )
        return {
            "id": str(body.get("id")),
            "title": body.get("title", ""),
            "snippet": (body.get("content_text") or "")[:300],
            "meta": meta,
            "url": body.get("original_url", ""),
            "sourceType": "wechat",
            "relevance": verdict.get("score", 0.0),
            "reason": verdict.get("reason", ""),
        }
    meta = " · ".join(filter(None, [body.get("venue"), str(body.get("year") or "")]))
    return {
        "id": str(body.get("id")),
        "title": body.get("title", ""),
        "snippet": (body.get("abstract") or "")[:300],
        "meta": meta,
        "url": body.get("pdfUrl", ""),
        "sourceType": "publication",
        "relevance": verdict.get("score", 0.0),
        "reason": verdict.get("reason", ""),
    }


async def judge_bodies_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    """Parallel batched LLM calls: judge relevance, emit final JSON AIMessage."""
    bodies = state.get("bodies") or []
    source_type = runtime.context.source_type
    query = state.get("query", "")

    if not bodies:
        return {"messages": [AIMessage(content="[]")]}

    provider = runtime.context.model_provider or os.getenv(
        "DEFAULT_MODEL_PROVIDER", "openai"
    )
    model_name = runtime.context.model_name or os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    model = _get_model(provider, model_name)
    wiki_section = build_wiki_section(runtime.context.wiki_context)

    # Chunk into batches and judge in parallel.
    batches = [
        bodies[i : i + BODY_JUDGE_BATCH] for i in range(0, len(bodies), BODY_JUDGE_BATCH)
    ]
    verdict_groups = await asyncio.gather(
        *[
            _judge_one_batch(model, query, wiki_section, source_type, batch)
            for batch in batches
        ]
    )

    verdict_by_id: dict[str, dict] = {}
    for group in verdict_groups:
        for v in group:
            if not isinstance(v, dict):
                continue
            vid = str(v.get("id", ""))
            if vid and v.get("related") is True:
                verdict_by_id[vid] = v

    # Build final result list: keep only related articles, sort by score desc.
    body_by_id = {str(b.get("id")): b for b in bodies}
    results: list[dict] = []
    for vid, verdict in verdict_by_id.items():
        body = body_by_id.get(vid)
        if body is None:
            continue
        results.append(_to_search_result(source_type, body, verdict))

    results.sort(key=lambda r: r.get("relevance", 0.0), reverse=True)
    results = results[:FINAL_TOP_K]

    final_message = AIMessage(content=json.dumps(results, ensure_ascii=False))
    return {"messages": [final_message]}


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------
builder = StateGraph(SearchState, context_schema=SearchAgentContext)
builder.add_node("route", route_node)
builder.add_node("web_agent", web_agent_node)
builder.add_node("web_tools", web_tool_node)
builder.add_node("prefilter", prefilter_node)
builder.add_node("triage_titles", triage_titles_node)
builder.add_node("fetch_bodies", fetch_bodies_node)
builder.add_node("judge_bodies", judge_bodies_node)

builder.add_edge(START, "route")
builder.add_conditional_edges(
    "route",
    select_path,
    {"web_agent": "web_agent", "prefilter": "prefilter"},
)

# Web path (loop)
builder.add_conditional_edges(
    "web_agent", web_should_continue, {"web_tools": "web_tools", END: END}
)
builder.add_edge("web_tools", "web_agent")

# Prefilter pipeline (linear)
builder.add_edge("prefilter", "triage_titles")
builder.add_edge("triage_titles", "fetch_bodies")
builder.add_edge("fetch_bodies", "judge_bodies")
builder.add_edge("judge_bodies", END)

agent = builder.compile()
