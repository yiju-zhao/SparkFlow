"""Prompts for the search agent (wechat / publication prefilter pipeline + web fallback)."""

# ---------------------------------------------------------------------------
# Web-search fallback prompt (unchanged iterative tool loop).
# ---------------------------------------------------------------------------
SEARCH_AGENT_SYSTEM_PROMPT = """You are a search agent. Your job is to find the most relevant web results for the user's query.

{wiki_section}

INSTRUCTIONS:
1. Analyze the query to understand the user's intent. Consider synonyms, related terms, and the research domain.
2. Call the search tool with well-chosen keywords. Do NOT just repeat the user's query verbatim — reformulate it to maximize relevant hits.
3. Evaluate the results: are they relevant to the query? Are there enough good results?
4. If results are insufficient or too generic, try a different angle:
   - Use synonyms or related technical terms
   - Narrow down with domain-specific keywords
   - Try a broader or more specific query
   - DO NOT repeat the same keywords you already tried
5. After at most 3 search calls, or when you have enough relevant results, return your final answer.

FINAL OUTPUT FORMAT:
When you are done searching, respond with ONLY a JSON array (no markdown, no explanation). Each item:
{{"id": "...", "title": "...", "snippet": "...", "meta": "...", "url": "...", "sourceType": "web"}}

Order results by relevance (most relevant first). Return at most 10 results.
If no relevant results were found across all searches, return an empty array: []
"""


def build_search_prompt(source_type: str, wiki_context: str) -> str:
    """Web-only prompt builder used by the legacy tool loop."""
    if wiki_context.strip():
        wiki_section = (
            "NOTEBOOK CONTEXT (what the user is researching):\n"
            f"{wiki_context}\n\n"
            "Use this context to understand the user's research domain. "
            "Bias your keyword choices toward this domain when relevant."
        )
    else:
        wiki_section = ""

    return SEARCH_AGENT_SYSTEM_PROMPT.format(
        source_type=source_type,
        wiki_section=wiki_section,
    )


# ---------------------------------------------------------------------------
# Prefilter pipeline — two latent passes (title triage + body judgment).
# ---------------------------------------------------------------------------

TITLE_TRIAGE_PROMPT = """You triage search candidates for a research assistant.

USER QUERY:
{query}

{wiki_section}

You are given a list of {source_type} candidates that were prefiltered by
vector similarity. Most are plausibly related; some are not. You cannot read
the full articles yet — only titles and metadata.

YOUR JOB:
Pick the candidates whose titles look promising enough to justify reading in
full. Be inclusive when in doubt — the next pass will filter out false
positives. Be strict when the title is clearly off-topic.

Select between {min_pick} and {max_pick} candidates. Never exceed {max_pick}.
If none of the candidates look remotely related, return an empty list.

CANDIDATES:
{candidates}

OUTPUT FORMAT:
Respond with ONLY a JSON array of the selected candidate IDs, nothing else:
["id1", "id2", ...]
"""


BODY_JUDGE_PROMPT = """You are judging whether search-result articles are actually relevant to a user's query.

USER QUERY:
{query}

{wiki_section}

You will be shown {n} full {source_type} articles. For each, decide:
- Is it related to the query (would the user find it useful)?
- How strongly, on a 0–1 scale?

Be strict: an article that only tangentially mentions the topic is NOT related.
An article should be marked related only if its substance genuinely addresses
the user's question.

ARTICLES:
{articles}

OUTPUT FORMAT:
Respond with ONLY a JSON array, one entry per article, in the same order as input:
[
  {{"id": "...", "related": true, "score": 0.0-1.0, "reason": "one sentence"}},
  ...
]
Do not add commentary or markdown."""


def build_wiki_section(wiki_context: str) -> str:
    if not wiki_context.strip():
        return ""
    return (
        "NOTEBOOK CONTEXT (what the user is researching):\n"
        f"{wiki_context}\n\n"
        "Use this context to interpret the query and bias selection toward "
        "the user's research domain."
    )
