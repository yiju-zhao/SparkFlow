# syntax=docker/dockerfile:1.7
#
# Standalone Dockerfile for the agent. Not used by `langgraph build` /
# `langgraph up` (those generate their own Dockerfile from langgraph.json).
# Kept as an escape hatch for plain `docker build`/`docker run` deploys.

FROM python:3.13-slim

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install dependencies first using a small extractor script so that pure
# code edits don't bust the deps layer. BuildKit cache mount keeps wheels
# warm across rebuilds.
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/pip \
    python -c "import tomllib,sys; d=tomllib.loads(open('pyproject.toml','rb').read().decode())['project']['dependencies']; sys.stdout.write('\n'.join(d))" > /tmp/deps.txt && \
    pip install -r /tmp/deps.txt

# Copy source and install the project itself (no-deps because deps already in).
COPY . .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 2024

CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "2024"]
