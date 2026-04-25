# syntax=docker/dockerfile:1.7
FROM python:3.13-slim

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install requirements first for layer caching, with a BuildKit cache mount
# so re-builds reuse already-downloaded wheels (saves minutes on rebuild).
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Copy application code last so source edits don't bust the deps layer.
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 2024

# Run the LangGraph dev server
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "2024"]
