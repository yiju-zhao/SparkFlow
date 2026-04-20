#!/usr/bin/env bash
set -euo pipefail

# Deploy loop for the sparkflow-web process on a server.
# Run from any cwd — resolves its own location.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WEB_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$WEB_DIR/../.." && pwd)

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

cd "$REPO_ROOT"
echo -e "${YELLOW}› git pull${NC}"
git pull

cd "$WEB_DIR"
echo -e "${YELLOW}› npm ci${NC}"
npm ci

echo -e "${YELLOW}› prisma generate${NC}"
npx prisma generate

echo -e "${YELLOW}› prisma migrate deploy${NC}"
npx prisma migrate deploy

echo -e "${YELLOW}› next build${NC}"
npm run build

if pm2 describe sparkflow-web >/dev/null 2>&1; then
  echo -e "${YELLOW}› pm2 restart sparkflow-web${NC}"
  pm2 restart sparkflow-web --update-env
else
  echo -e "${YELLOW}› pm2 start ecosystem.config.js${NC}"
  pm2 start ecosystem.config.js
  pm2 save
fi

echo -e "${GREEN}✓ deploy complete${NC}"
pm2 status sparkflow-web
