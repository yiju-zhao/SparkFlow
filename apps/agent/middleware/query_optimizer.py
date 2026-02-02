"""Query optimizer middleware for the RAG agent.

This middleware optimizes user queries before they are processed by the agent,
using an LLM to improve clarity, specificity, and effectiveness.
"""

import os
from langchain.agents.middleware import before_agent, AgentState
from langgraph.runtime import Runtime
from openai import OpenAI

# Environment variable to enable/disable prompt optimization
ENABLE_PROMPT_OPTIMIZER = os.getenv("ENABLE_PROMPT_OPTIMIZER", "true").lower() == "true"

OPTIMIZER_SYSTEM_PROMPT = """
# Role: User Prompt General Optimization Expert

## Task
Optimize user prompts to improve clarity, specificity and effectiveness for RAG search.
You are NOT executing the tasks in user prompts - you are improving the prompts themselves.

## Rules
1. Maintain original intent: Never change the core intent and goals
2. Eliminate ambiguity and vague expressions
3. Add necessary context when missing
4. Keep it concise - avoid redundancy

## Output
Directly output the optimized prompt text without any explanations or format markers.
"""

OPTIMIZER_USER_PROMPT_TEMPLATE = """Please optimize the following user prompt for better RAG search.
Maintain the user's original intent, only improve expression.

User prompt to optimize:
{prompt}

Optimized prompt:"""


@before_agent
def optimize_query(state: AgentState, runtime: Runtime) -> dict | None:
    """Optimize the user's query before agent processing."""
    if not ENABLE_PROMPT_OPTIMIZER:
        return None
    
    messages = state.get("messages", [])
    if not messages:
        return None
    
    # Get the last human message
    last_message = messages[-1]
    if not hasattr(last_message, "content") or not last_message.content:
        return None
    
    # Skip if message is too short
    content = last_message.content
    if isinstance(content, str) and len(content.strip()) < 10:
        return None
    
    try:
        client = OpenAI()
        response = client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "system", "content": OPTIMIZER_SYSTEM_PROMPT},
                {"role": "user", "content": OPTIMIZER_USER_PROMPT_TEMPLATE.format(prompt=content)},
            ],
        )
        
        optimized = response.choices[0].message.content
        if optimized and optimized.strip():
            print(f"Query optimized: \"{content}\" -> \"{optimized.strip()}\"")
            # Update the last message with optimized content
            last_message.content = optimized.strip()
    except Exception as e:
        print(f"Query optimization error: {e}")
    
    return None
