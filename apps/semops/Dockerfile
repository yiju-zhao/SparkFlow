# syntax=docker/dockerfile:1.7
# SemOps service — LOTUS-backed semantic operators (sem_rank, sem_filter, ...)
# consumed by apps/langgraph/workflows/{matcher,daily_digest,search}.
#
# Heavy deps (lotus-ai pulls torch + transformers + faiss-cpu + sentence-transformers).
# First build is slow; layer caching keeps subsequent rebuilds fast.

# lotus-ai 1.1.x pins numpy==1.26.4 which has no wheel for Python 3.13
# and its sdist build (mesonpy) fails on 3.13. Pin to 3.12 until lotus-ai
# bumps its numpy floor.
FROM python:3.12-slim

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Optional corporate CA bundle. Same pattern as apps/langgraph/Dockerfile.*:
# injected via Compose's `additional_contexts: { certs: ./ }` so a single
# root cert serves every Dockerfile.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=certs ca-certificates.crt /tmp/corporate-ca.crt
RUN if [ -s /tmp/corporate-ca.crt ]; then \
      cp /tmp/corporate-ca.crt /usr/local/share/ca-certificates/corporate.crt && \
      update-ca-certificates; \
    fi && rm /tmp/corporate-ca.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# Install Python deps. requirements.txt pins minor floors; uv resolver
# is much faster than pip for the lotus-ai dep tree (torch + transformers
# resolution can take 5+ minutes on plain pip).
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/uv \
    pip install --no-cache-dir uv && \
    uv pip install --system -r requirements.txt

# Pre-download the HuggingFace embedding model so corp-network deploys
# (no public internet at runtime) warm up cleanly. Without this, the first
# rank request silently 404s when sentence-transformers tries to fetch from
# the Hub. Cache lives at HF_HOME so subsequent loads are offline.
#
# IMPORTANT: anything other than `intfloat/e5-base-v2` (e.g. via the
# SEMOPS_RM_MODEL env override at runtime) will FAIL in offline mode because
# only this model is baked into the image. Bake additional models here if
# you want to support overrides without internet.
ENV HF_HOME=/app/.hf_cache
RUN mkdir -p /app/.hf_cache && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/e5-base-v2')"

# Copy source
COPY api ./api
COPY services ./services
COPY main.py ./

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Force sentence-transformers / huggingface_hub into offline mode at runtime.
# The model was baked above; any code path that tries to reach the Hub now
# fails loud rather than hanging on corp-network DNS timeouts.
ENV TRANSFORMERS_OFFLINE=1 \
    HF_HUB_OFFLINE=1

EXPOSE 2025

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:2025/health', timeout=4)" || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "2025"]
