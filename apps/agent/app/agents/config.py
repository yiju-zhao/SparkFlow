"""
Configuration for RAG agent.

Defines parameters for model selection, iteration limits,
and retrieval settings.
"""

from dataclasses import dataclass, field


@dataclass
class RAGAgentConfig:
    """
    Configuration for ReAct RAG agent execution.

    ReAct Pattern Configuration:
    - Reasoning: Agent thinks and generates queries (temperature 0.7 for exploration)
    - Acting: Execute retrieval with improved threshold (0.4) and larger candidate set (10)
    - Evaluating: LLM filters results (temperature 0.1 for precision)
    - Synthesizing: Generate final answer (temperature 0.3 for balance)

    Attributes:
        model_name: OpenAI model name (e.g., "gpt-4o-mini", "gpt-4-turbo")
        api_key: OpenAI API key
        temperature: Sampling temperature for reasoning (0.7 encourages exploration)
        eval_temperature: Temperature for evaluation phase (0.1 for precision)
        synthesis_temperature: Temperature for final answer (0.3 for balance)
        max_iterations: Maximum ReAct loop iterations (default 5)
        dataset_ids: List of RAGFlow dataset IDs to search
        similarity_threshold: Minimum similarity for retrieval (0.4, up from 0.2)
        top_k: Number of chunks to retrieve per query (10 for larger candidate set)
    """

    # Model configuration
    model_name: str = "gpt-4o"  # Large model for result synthesis
    nano_model_name: str = "gpt-4o-mini"  # Small model for grading/query generation
    api_key: str | None = None

    # Temperature settings for different phases
    temperature: float = 0.7  # Reasoning phase (encourage exploration)
    eval_temperature: float = 0.1  # Evaluation phase (precision)
    synthesis_temperature: float = 0.3  # Final answer (balance)

    # ReAct loop configuration
    max_iterations: int = 5

    # Retrieval configuration (improved thresholds)
    dataset_ids: list[str] = field(default_factory=list)
    document_ids: list[str] = field(
        default_factory=list
    )  # Optional specific document IDs
    similarity_threshold: float = 0.4  # Raised from 0.2 to filter weak matches
    top_k: int = 10  # Increased from 6 for larger candidate set

    # MCP Server configuration
    mcp_server_url: str = "http://localhost:9382/mcp/"  # RAGFlow MCP server URL

    def __post_init__(self):
        """Validate configuration after initialization."""
        # Validate temperature ranges
        for temp_name, temp_value in [
            ("temperature", self.temperature),
            ("eval_temperature", self.eval_temperature),
            ("synthesis_temperature", self.synthesis_temperature),
        ]:
            if temp_value < 0.0 or temp_value > 1.0:
                raise ValueError(f"{temp_name} must be between 0.0 and 1.0")

        if self.max_iterations < 1:
            raise ValueError("max_iterations must be at least 1")

        if self.similarity_threshold < 0.0 or self.similarity_threshold > 1.0:
            raise ValueError("similarity_threshold must be between 0.0 and 1.0")

        if self.top_k < 1:
            raise ValueError("top_k must be at least 1")

        # Warn if no datasets configured
        if not self.dataset_ids:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(
                "RAGAgentConfig: dataset_ids is empty. "
                "The agent will not be able to retrieve information from the knowledge base."
            )
