#!/usr/bin/env bash
#
# Composable primitives for applying a pull's follow-up actions to the dev stack.
#
# This script is a TOOL — it does only what you tell it to. The intelligence
# (looking at the diff and deciding which primitives to call) lives in the
# caller (you, or an agent reading `git diff --name-only`).
#
# Operations are run IN ORDER, so you can chain them in one invocation:
#   pull → prisma-migrate → prisma-generate → rebuild → recreate → restart-*
#
# Service names match docker-compose:
#   web  migrate  workflows-api  ingest-worker  digest-worker  semops
#
# Flags:
#   --pull                          git pull --ff-only
#   --prisma-migrate                cd apps/web && npx prisma migrate deploy
#   --prisma-generate               cd apps/web && npx prisma generate
#   --rebuild <svc>[,<svc>...]      docker compose build + up -d --no-deps --no-build
#   --recreate <svc>[,<svc>...]     docker compose up -d --no-deps --no-build
#                                   (use after pulling a pre-built image; no build)
#   --restart-web                   kill `npm run dev` (port 3001), restart it
#   --restart-langgraph             kill uvicorn (port 2027), restart with --reload
#   --dry-run                       print every step; execute nothing
#   -h, --help                      this message
#
# Why --no-deps: bringing up only the named services without dragging postgres,
# redis, semops, etc. into a recreate cascade. They stay running across updates.
#
# Examples (typical pull scenarios — agent decides which one fits):
#   # web TS/TSX only — Turbopack HMR + uvicorn --reload picks it up:
#   #   (nothing to run)
#
#   # New prisma migration:
#   scripts/dev-update.sh --prisma-migrate
#
#   # Schema change + new migration:
#   scripts/dev-update.sh --prisma-migrate --prisma-generate --restart-web
#
#   # apps/web/lib/ change while ingest-worker runs in docker:
#   scripts/dev-update.sh --rebuild ingest-worker
#
#   # apps/langgraph/workflows changed (digest-worker docker, workflows-api local):
#   scripts/dev-update.sh --rebuild digest-worker
#   # workflows-api auto-reloads via uvicorn --reload, no action needed
#
#   # Big pull: schema + migration + many docker images:
#   scripts/dev-update.sh --pull --prisma-migrate --prisma-generate \
#       --rebuild ingest-worker,digest-worker --restart-web

set -eu

# ---- color helpers ----
if [ -t 1 ]; then
  C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[1;33m'; C_RED=$'\033[0;31m'; C_RESET=$'\033[0m'
else
  C_DIM=''; C_BOLD=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
say()  { printf '%s%s%s\n' "$C_BOLD"   "==> $*" "$C_RESET"; }
ok()   { printf '%s%s%s\n' "$C_GREEN"  "    $*" "$C_RESET"; }
warn() { printf '%s%s%s\n' "$C_YELLOW" "    $*" "$C_RESET"; }
err()  { printf '%s%s%s\n' "$C_RED"    "    $*" "$C_RESET" >&2; }

DRY_RUN=0
run() {
  printf '%s+ %s%s\n' "$C_DIM" "$*" "$C_RESET"
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

usage() {
  sed -n '2,/^set -/p' "$0" | sed 's/^# \{0,1\}//' | sed '$d'
}

# ---- arg parsing — pre-pass to capture --dry-run only ----
# (operations execute in argv order; --dry-run is a global modifier)
for arg in "$@"; do
  [ "$arg" = "--dry-run" ] && DRY_RUN=1
done

# ---- per-operation helpers ----
op_pull() {
  say "git pull --ff-only"
  run git pull --ff-only --quiet
}

op_prisma_migrate() {
  say "prisma migrate deploy"
  run bash -c 'cd "$(git rev-parse --show-toplevel)/apps/web" && npx prisma migrate deploy'
}

op_prisma_generate() {
  say "prisma generate"
  run bash -c 'cd "$(git rev-parse --show-toplevel)/apps/web" && npx prisma generate'
}

# Comma-separated svc list → space-separated, validated.
KNOWN_SERVICES="web migrate workflows-api ingest-worker digest-worker semops"
expand_services() {
  raw=$(printf '%s' "$1" | tr ',' ' ')
  out=""
  for svc in $raw; do
    found=0
    for known in $KNOWN_SERVICES; do
      [ "$svc" = "$known" ] && found=1 && break
    done
    if [ $found -eq 0 ]; then
      err "unknown service: '$svc' (known: $KNOWN_SERVICES)"
      exit 1
    fi
    out="$out${out:+ }$svc"
  done
  printf '%s' "$out"
}

op_rebuild() {
  svcs=$(expand_services "$1")
  say "rebuild + recreate (--no-deps): $svcs"
  # shellcheck disable=SC2086
  run docker compose build $svcs
  # shellcheck disable=SC2086
  run docker compose up -d --no-build --no-deps $svcs
}

op_recreate() {
  svcs=$(expand_services "$1")
  say "recreate (--no-deps, no build): $svcs"
  # shellcheck disable=SC2086
  run docker compose up -d --no-build --no-deps $svcs
}

# Find PID listening on a TCP port (returns empty if none).
pid_on_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1
}

# Walk up to the npm parent of a node `next dev` process so we kill the whole tree.
parent_chain() {
  pid=$1
  while [ -n "$pid" ] && [ "$pid" != "1" ]; do
    printf '%s\n' "$pid"
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
  done
}

op_restart_web() {
  say "restart local web dev server (port 3001)"
  port_pid=$(pid_on_port 3001 || true)
  if [ -n "$port_pid" ]; then
    npm_pid=""
    for p in $(parent_chain "$port_pid"); do
      cmd=$(ps -o command= -p "$p" 2>/dev/null || true)
      case "$cmd" in
        *"npm run dev"*|*"npm exec"*) npm_pid=$p; break;;
      esac
    done
    target=${npm_pid:-$port_pid}
    ok "killing pid $target (chain head)"
    run kill "$target" 2>/dev/null || true
    # wait for port to free
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      sleep 1
      [ -z "$(pid_on_port 3001 || true)" ] && break
    done
  else
    ok "no process on :3001 — starting fresh"
  fi

  log=/tmp/sparkflow-web-dev.log
  ok "starting npm run dev → $log"
  if [ "$DRY_RUN" -eq 0 ]; then
    ( cd "$(git rev-parse --show-toplevel)/apps/web" && \
      nohup npm run dev > "$log" 2>&1 & disown ) || true
    # wait for ready
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      sleep 1
      grep -qE "Ready in|Local:" "$log" 2>/dev/null && { ok "ready"; return; }
      grep -qE "EADDRINUSE|Error:" "$log" 2>/dev/null && { err "startup error — see $log"; return 1; }
    done
    warn "did not see 'Ready in' within 15s — check $log"
  fi
}

op_restart_langgraph() {
  say "restart local workflows-api uvicorn (port 2027)"
  port_pid=$(pid_on_port 2027 || true)
  if [ -n "$port_pid" ]; then
    # uvicorn --reload spawns a reloader + worker; killing the parent of the
    # listener (the reloader) handles both.
    parent=$(ps -o ppid= -p "$port_pid" 2>/dev/null | tr -d ' ' || true)
    target=${parent:-$port_pid}
    ok "killing pid $target"
    run kill "$target" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      sleep 1
      [ -z "$(pid_on_port 2027 || true)" ] && break
    done
  else
    ok "no process on :2027 — starting fresh"
  fi

  log=/tmp/sparkflow-workflows-api.log
  ok "starting uvicorn → $log"
  if [ "$DRY_RUN" -eq 0 ]; then
    ( cd "$(git rev-parse --show-toplevel)/apps/langgraph" && \
      nohup .venv/bin/uvicorn server.app:app --host 0.0.0.0 --port 2027 --reload > "$log" 2>&1 & disown ) || true
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      sleep 1
      grep -q "Application startup complete" "$log" 2>/dev/null && { ok "ready"; return; }
      grep -qE "Address already in use|Traceback" "$log" 2>/dev/null && { err "startup error — see $log"; return 1; }
    done
    warn "did not see startup complete within 15s — check $log"
  fi
}

# ---- main loop: walk argv in order, dispatch ----
if [ $# -eq 0 ]; then
  usage
  exit 0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --pull)              op_pull;             shift;;
    --prisma-migrate)    op_prisma_migrate;   shift;;
    --prisma-generate)   op_prisma_generate;  shift;;
    --rebuild)           op_rebuild "$2";     shift 2;;
    --recreate)          op_recreate "$2";    shift 2;;
    --restart-web)       op_restart_web;      shift;;
    --restart-langgraph) op_restart_langgraph; shift;;
    --dry-run)           shift;;
    -h|--help)           usage; exit 0;;
    *) err "unknown arg: $1"; exit 1;;
  esac
done

echo
ok "done"
