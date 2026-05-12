#!/usr/bin/env bash
#
# Bootstrap the CA bundle with corporate intermediate + root certs needed to
# reach internal BYOK provider gateways (e.g. AI4News at ai4news.rnd.huawei.com).
#
# Why this script exists
# ----------------------
# semops (apps/semops) reaches BYOK gateways through the litellm/openai SDK,
# which strictly validates TLS against /etc/ssl/certs/ca-certificates.crt.
# That bundle is bind-mounted from ./ca-certificates.crt in this repo.
#
# Public CAs are in the python base image. Corp internal roots are NOT — e.g.
# AI4News's chain ends at "Huawei BPIT Root CA", which no public bundle ships.
# Without those roots, TLS handshake fails with
#   [SSL: CERTIFICATE_VERIFY_FAILED] unable to get issuer certificate
# which litellm wraps as
#   litellm.APIConnectionError: OpenAIException - Connection error.
# after a long timeout, making it look identical to a proxy failure.
#
# The chat path (apps/langgraph/chat_model.py) sidesteps this with verify=False;
# semops can't easily do the same because lotus.LM wraps litellm.completion at
# a layer that doesn't expose the httpx client. Fix the bundle instead.
#
# What it does
# ------------
# For each host in HOSTS:
#   1. Pulls the chain the server sends via `openssl s_client -showcerts`.
#   2. Drops the leaf cert (the server's own cert, not a CA).
#   3. Appends each remaining CA cert to ./ca-certificates.crt if not already
#      present (dedupes by SHA-256 fingerprint).
#
# Idempotent — safe to re-run.
# Tolerant — silently skips a host if unreachable, so public-network deploys
# where ai4news isn't relevant don't break.
#
# Usage
# -----
#   ./scripts/setup-corp-ca.sh
#   docker compose -f docker-compose.server.yml restart semops
#
# Source of truth for which providers need corp CAs:
#   apps/langgraph/chat_model.py::_OPENAI_COMPAT_BASE_URLS
# Add a HOST below whenever you add a corp BYOK provider there whose chain
# isn't anchored at a public root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="${BUNDLE:-$REPO_ROOT/ca-certificates.crt}"
TIMEOUT="${TIMEOUT:-10}"

HOSTS=(
  "ai4news.rnd.huawei.com:443"
)

log() { printf '[setup-corp-ca] %s\n' "$*" >&2; }

command -v openssl >/dev/null || { log "openssl not found in PATH"; exit 1; }

touch "$BUNDLE"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

fp() {
  openssl x509 -in "$1" -noout -fingerprint -sha256 2>/dev/null | sed 's/.*=//'
}

is_ca() {
  openssl x509 -in "$1" -noout -ext basicConstraints 2>/dev/null | grep -q "CA:TRUE"
}

subj() {
  openssl x509 -in "$1" -noout -subject 2>/dev/null | sed 's/^subject=//'
}

# Index existing certs in the bundle by SHA-256 fingerprint.
mkdir -p "$TMPDIR/existing"
awk -v d="$TMPDIR/existing" '/-----BEGIN CERTIFICATE-----/{n++} n>0{print > (d"/c"n".pem")}' "$BUNDLE"
existing_fps=""
for f in "$TMPDIR"/existing/c*.pem; do
  [ -s "$f" ] || continue
  existing_fps+="$(fp "$f")"$'\n'
done

appended=0
for hp in "${HOSTS[@]}"; do
  host="${hp%:*}"
  log "fetching chain from $hp"

  if ! chain="$(timeout "$TIMEOUT" sh -c "echo | openssl s_client -showcerts -connect '$hp' -servername '$host' 2>/dev/null")"; then
    log "  skip: unreachable (timeout ${TIMEOUT}s)"
    continue
  fi
  [ -n "$chain" ] || { log "  skip: empty chain"; continue; }

  mkdir -p "$TMPDIR/chain"
  rm -f "$TMPDIR"/chain/c*.pem 2>/dev/null || true
  printf '%s\n' "$chain" \
    | awk -v d="$TMPDIR/chain" '/-----BEGIN CERTIFICATE-----/{n++} n>0{print > (d"/c"n".pem")}'

  for f in "$TMPDIR"/chain/c*.pem; do
    [ -s "$f" ] || continue
    if ! is_ca "$f"; then
      log "  skip leaf: $(subj "$f")"
      continue
    fi
    cert_fp="$(fp "$f")"
    [ -n "$cert_fp" ] || continue
    if printf '%s' "$existing_fps" | grep -qF "$cert_fp"; then
      log "  already trusted: $(subj "$f")"
    else
      log "  appending: $(subj "$f")"
      cat "$f" >> "$BUNDLE"
      existing_fps+="$cert_fp"$'\n'
      appended=$((appended + 1))
    fi
  done
done

log "done: appended $appended new cert(s) to $BUNDLE"
if [ "$appended" -gt 0 ]; then
  log "restart semops to pick up new bundle:"
  log "  docker compose -f docker-compose.server.yml restart semops"
fi
