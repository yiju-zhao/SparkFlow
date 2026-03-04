---
phase: 01-foundation-data
plan: 04
type: execute
wave: 3
depends_on:
  - 03
files_modified:
  - apps/agent/config/hub_agent.py
  - apps/agent/prompts/hub_agent.py
  - apps/agent/tools/hub_queries.py
autonomous: true
requirements:
  - INFRA-04
must_haves:
  truths:
    - "Hub agent configuration module exists with model settings"
    - "Hub agent system prompt defines the assistant's role"
    - "Query tools can list venues, instances, and sessions from database"
    - "Query tools can search sessions by keyword"
  artifacts:
    - path: "apps/agent/config/hub_agent.py"
      provides: "Hub agent configuration"
      exports: ["HUB_AGENT_CONFIG"]
    - path: "apps/agent/prompts/hub_agent.py"
      provides: "Hub agent system prompt"
      exports: ["HUB_AGENT_SYSTEM_PROMPT"]
    - path: "apps/agent/tools/hub_queries.py"
      provides: "Conference/session query tools"
      exports: ["list_venues", "list_instances", "list_sessions", "search_sessions"]
  key_links:
    - from: "hub_queries.py"
      to: "PostgreSQL database"
      via: "DATABASE_URL environment variable"
      pattern: "psycopg2.connect|DATABASE_URL"
---

<objective>
Create Research Hub agent configuration, system prompt, and query tools.

Purpose: Prepare all dependencies needed by the Research Hub agent.
Output: Configuration module, system prompt, and database query tools.

Architecture:
- Configuration: apps/agent/config/hub_agent.py
- System prompt: apps/agent/prompts/hub_agent.py
- Query tools: apps/agent/tools/hub_queries.py
- Agent assembly and registration happens in Plan 05

This plan creates the building blocks. Plan 05 assembles them into a working agent.
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

<interfaces>
<!-- Existing agent patterns from apps/agent -->

From apps/agent/config/rag_agent.py (configuration pattern):
```python
from pydantic_settings import BaseSettings

class RagAgentConfig(BaseSettings):
    model_provider: str = "openai"
    model_name: str = "gpt-4o"

    class Config:
        env_prefix = "RAG_AGENT_"
        env_file = ".env"

RAG_AGENT_CONFIG = RagAgentConfig()
```

From apps/agent/tools/ragflow.py (tool pattern):
```python
from langchain.tools import tool

@tool
def explore(query: str) -> str:
    """Explore the knowledge base..."""
    # Implementation
```

From apps/agent/prompts/rag_agent.py (prompt pattern):
```python
RAG_AGENT_SYSTEM_PROMPT = """
You are a research assistant...
"""
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Hub agent configuration</name>
  <files>apps/agent/config/hub_agent.py</files>
  <action>
    Create configuration file at apps/agent/config/hub_agent.py following the pattern from config/rag_agent.py.

    Configuration should include:
    - Model provider (e.g., "openai")
    - Model name (e.g., "gpt-4o-mini" for faster responses)
    - Database URL for PostgresSaver (from environment)

    Structure:
    ```python
    from pydantic_settings import BaseSettings

    class HubAgentConfig(BaseSettings):
        model_provider: str = "openai"
        model_name: str = "gpt-4o-mini"
        database_url: str  # For PostgresSaver

        class Config:
            env_prefix = "HUB_AGENT_"
            env_file = ".env"

    HUB_AGENT_CONFIG = HubAgentConfig()
    ```

    This allows configuration via HUB_AGENT_MODEL_PROVIDER, HUB_AGENT_MODEL_NAME environment variables.
  </action>
  <verify>
    <automated>cd apps/agent && python -c "from config.hub_agent import HUB_AGENT_CONFIG; print('OK')" 2>&1</automated>
  </verify>
  <done>Hub agent configuration module created</done>
</task>

<task type="auto">
  <name>Task 2: Create Hub agent system prompt</name>
  <files>apps/agent/prompts/hub_agent.py</files>
  <action>
    Create system prompt at apps/agent/prompts/hub_agent.py.

    The prompt should:
    - Define the agent's role as a conference/session research assistant
    - Explain available tools (list_venues, list_instances, list_sessions, search_sessions)
    - Describe how to respond with structured state updates for AG-UI
    - Be concise and focused on the Hub domain

    Example structure:
    ```python
    HUB_AGENT_SYSTEM_PROMPT = """
    You are the Research Hub assistant. You help users discover and explore conference sessions and publications.

    Available tools:
    - list_venues: Get all conference venues (e.g., CVPR, NeurIPS)
    - list_instances: Get conference instances for a venue (e.g., CVPR 2024)
    - list_sessions: Get sessions for a conference instance
    - search_sessions: Search sessions by keyword, speaker, or topic

    When users ask about conferences, use these tools to find relevant information.
    Provide structured responses that can be rendered as tables or charts when appropriate.
    """
    ```
  </action>
  <verify>
    <automated>cd apps/agent && python -c "from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT; print(len(HUB_AGENT_SYSTEM_PROMPT))" 2>&1</automated>
  </verify>
  <done>Hub agent system prompt created</done>
</task>

<task type="auto">
  <name>Task 3: Create Hub query tools</name>
  <files>apps/agent/tools/hub_queries.py</files>
  <action>
    Create query tools at apps/agent/tools/hub_queries.py.

    These tools query the PostgreSQL database directly (not RagFlow - that's for the RAG agent).

    Required tools:
    1. list_venues() - Returns all venues with instance counts
    2. list_instances(venue_id?: str) - Returns instances, optionally filtered by venue
    3. list_sessions(instance_id: str, filters?: {...}) - Returns sessions for an instance with optional filters
    4. search_sessions(query: str) - Full-text search across session titles, abstracts, speakers

    Use psycopg2 or asyncpg for database queries. The DATABASE_URL is available from environment.

    Pattern (using langchain tools):
    ```python
    from langchain.tools import tool
    import psycopg2
    import os

    @tool
    def list_venues() -> str:
        \"\"\"List all conference venues with instance counts.\"\"\"
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        # Query venues with instance counts
        # Return formatted string
    ```

    Handle connection management properly (close connections after use).
  </action>
  <verify>
    <automated>cd apps/agent && python -c "from tools.hub_queries import list_venues, list_instances, list_sessions, search_sessions; print('OK')" 2>&1</automated>
  </verify>
  <done>Hub query tools created with all four functions</done>
</task>

</tasks>

<verification>
- Configuration module imports without errors
- System prompt is non-empty string
- All four query tools are importable and decorated with @tool
- Tools can connect to database (basic connectivity test)
</verification>

<success_criteria>
- [ ] INFRA-04 partially satisfied: Query tools created (agent assembly in Plan 05)
- [ ] Configuration module created
- [ ] System prompt created
- [ ] All four query tools importable
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-data/04-SUMMARY.md`
</output>
