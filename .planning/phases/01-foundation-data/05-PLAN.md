---
phase: 01-foundation-data
plan: 05
type: execute
wave: 4
depends_on:
  - 04
files_modified:
  - apps/agent/graphs/hub_agent.py
  - apps/agent/langgraph.json
  - apps/web/.env.example
autonomous: true
requirements:
  - INFRA-04
  - INFRA-05
must_haves:
  truths:
    - "Research Hub agent can be imported and invoked"
    - "Agent uses PostgresSaver for state persistence"
    - "Agent is registered in langgraph.json as 'hub'"
    - "Environment variables are documented for configuration"
  artifacts:
    - path: "apps/agent/graphs/hub_agent.py"
      provides: "Research Hub agent entry point"
      exports: ["hub_agent"]
    - path: "apps/agent/langgraph.json"
      provides: "Agent registration"
      contains: "hub"
    - path: "apps/web/.env.example"
      provides: "Environment variable documentation"
      contains: "HUB_AGENT_"
  key_links:
    - from: "hub_agent.py"
      to: "hub_queries.py tools"
      via: "tools parameter"
      pattern: "tools=\\[list_venues"
    - from: "hub_agent.py"
      to: "PostgresSaver"
      via: "checkpointer parameter"
      pattern: "PostgresSaver|checkpointer"
    - from: "langgraph.json"
      to: "hub_agent.py"
      via: "graphs configuration"
      pattern: "hub.*graphs/hub_agent"
---

<objective>
Assemble Research Hub agent with PostgresSaver and register in LangGraph.

Purpose: Create the working agent that connects query tools with state persistence.
Output: Runnable Research Hub agent accessible at /runs/stream/hub endpoint.

Architecture:
- Imports configuration, prompt, and tools from Plan 04
- Uses Deep Agents library (same as RAG agent) OR standard LangGraph
- Configures PostgresSaver for state persistence (INFRA-05)
- Registers in langgraph.json as "hub" agent
- Documents required environment variables
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation-data/01-CONTEXT.md
@.planning/phases/01-foundation-data/04-PLAN.md

<interfaces>
<!-- Components created in Plan 04 -->

From apps/agent/config/hub_agent.py:
```python
HUB_AGENT_CONFIG  # Has model_provider, model_name, database_url
```

From apps/agent/prompts/hub_agent.py:
```python
HUB_AGENT_SYSTEM_PROMPT  # System prompt string
```

From apps/agent/tools/hub_queries.py:
```python
list_venues, list_instances, list_sessions, search_sessions  # Query tools
```

<!-- Existing agent pattern from apps/agent/graphs/rag_agent.py -->

```python
from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe, get_first_chunk
from middleware.sources_context import inject_sources_context

model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

agent = create_deep_agent(
    model=model,
    backend=FilesystemBackend(root_dir="."),
    skills=["./skills/"],
    tools=[explore, search, probe, get_first_chunk],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_sources_context],
)
```

<!-- langgraph.json structure -->
```json
{
    "dependencies": ["."],
    "graphs": {
        "agent": "./graphs/rag_agent.py:agent"
    },
    "env": ".env",
    "image_distro": "wolfi"
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Research Hub agent with PostgresSaver</name>
  <files>apps/agent/graphs/hub_agent.py</files>
  <action>
    Create the Hub agent at apps/agent/graphs/hub_agent.py.

    This agent:
    - Uses Deep Agents library (same as RAG agent) OR standard LangGraph
    - Has PostgresSaver for state persistence (INFRA-05)
    - Uses the hub query tools from Plan 04

    Structure with PostgresSaver:
    ```python
    from langgraph.checkpoint.postgres import PostgresSaver
    from deepagents import create_deep_agent

    from config.hub_agent import HUB_AGENT_CONFIG
    from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT
    from tools.hub_queries import list_venues, list_instances, list_sessions, search_sessions

    model = f"{HUB_AGENT_CONFIG.model_provider}:{HUB_AGENT_CONFIG.model_name}"

    # PostgresSaver for state persistence
    def get_checkpointer():
        from psycopg_pool import ConnectionPool
        pool = ConnectionPool(HUB_AGENT_CONFIG.database_url)
        return PostgresSaver(pool)

    hub_agent = create_deep_agent(
        model=model,
        tools=[list_venues, list_instances, list_sessions, search_sessions],
        system_prompt=HUB_AGENT_SYSTEM_PROMPT,
        checkpointer=get_checkpointer(),
    )
    ```

    Note: PostgresSaver requires langgraph-checkpoint-postgres package.
    Note: MCP Apps middleware for dynamic component rendering should be configured here if using that feature.
  </action>
  <verify>
    <automated>cd apps/agent && python -c "from graphs.hub_agent import hub_agent; print(type(hub_agent))" 2>&1</automated>
  </verify>
  <done>Research Hub agent created with PostgresSaver</done>
</task>

<task type="auto">
  <name>Task 2: Register Hub agent in langgraph.json</name>
  <files>apps/agent/langgraph.json</files>
  <action>
    Update apps/agent/langgraph.json to register the new Hub agent alongside the existing RAG agent.

    Read current langgraph.json first, then add the hub agent:
    ```json
    {
        "dependencies": ["."],
        "graphs": {
            "agent": "./graphs/rag_agent.py:agent",
            "hub": "./graphs/hub_agent.py:hub_agent"
        },
        "env": ".env",
        "image_distro": "wolfi"
    }
    ```

    This allows the LangGraph server to serve both agents:
    - /runs/stream/agent - RAG agent (existing)
    - /runs/stream/hub - Research Hub agent (new)
  </action>
  <verify>
    <automated>cd apps/agent && python -c "import json; d=json.load(open('langgraph.json')); print('hub' in d['graphs'])" 2>&1</automated>
  </verify>
  <done>Hub agent registered in langgraph.json</done>
</task>

<task type="auto">
  <name>Task 3: Update .env.example with Hub agent variables</name>
  <files>apps/web/.env.example</files>
  <action>
    Add Hub agent environment variables to apps/web/.env.example (and ensure apps/agent/.env has them too).

    Add:
    ```
    # Hub Agent Configuration
    HUB_AGENT_MODEL_PROVIDER=openai
    HUB_AGENT_MODEL_NAME=gpt-4o-mini
    ```

    Note: DATABASE_URL should already exist for the web app's Prisma connection.
    The Hub agent will reuse the same DATABASE_URL for PostgresSaver.
  </action>
  <verify>
    <automated>grep -E "HUB_AGENT" apps/web/.env.example 2>&1 | head -5</automated>
  </verify>
  <done>Hub agent environment variables documented</done>
</task>

</tasks>

<verification>
- Hub agent module imports without errors
- PostgresSaver is configured for state persistence
- Agent registered in langgraph.json as "hub"
- Environment variables documented
</verification>

<success_criteria>
- [ ] INFRA-04 satisfied: Research agent connects to conference/session data via query tools
- [ ] INFRA-05 satisfied: Agent state persists via PostgresSaver
- [ ] Hub agent accessible at /runs/stream/hub endpoint
- [ ] All Python modules import without errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-data/05-SUMMARY.md`
</output>
