# Base stage — shared CA bundle so every derived stage (builder, dev,
# runner) trusts a corporate proxy's certificate at both build and run
# time. The file `apps/web/ca-certificates.crt` MUST exist (gitignored,
# empty is fine on open networks).
FROM node:24 AS base
WORKDIR /app
COPY --from=certs ca-certificates.crt /tmp/corporate-ca.crt
RUN if [ -s /tmp/corporate-ca.crt ]; then \
      cp /tmp/corporate-ca.crt /usr/local/share/ca-certificates/corporate.crt && \
      update-ca-certificates; \
    fi && rm /tmp/corporate-ca.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Builder stage
FROM base AS builder

# prisma.config.ts eagerly reads DATABASE_URL on load. `prisma generate`
# doesn't actually need a live DB, but the config loader resolves env first.
# Real DATABASE_URL is supplied at runtime; this placeholder is build-only.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

# Corp networks frequently kill long npm fetches with ECONNRESET. Bump
# retry count + timeouts so transient drops auto-recover instead of
# failing the whole `docker compose build`. Also cap concurrent
# connections — corp proxies sometimes reset-bomb when too many
# parallel package fetches hit them at once.
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000
ENV NPM_CONFIG_FETCH_TIMEOUT=600000
ENV NPM_CONFIG_MAXSOCKETS=3

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# NODE_TLS_REJECT_UNAUTHORIZED=0 scoped to prisma generate only — Prisma
# downloads its engine binaries from binaries.prisma.sh, which on TLS-
# intercepting corporate networks fails the cert chain even with
# NODE_EXTRA_CA_CERTS set. Disable verification just for this one fetch;
# all subsequent stages run with normal cert validation.
#
# `npm install --no-save @next/swc-linux-${arch}-gnu` is a workaround for
# corp-network builds: if the lockfile was generated on macOS the linux
# SWC binary isn't pinned, and `next build` falls back to fetching it
# directly from Cloudflare (104.16.x.x), which most corp firewalls block.
# Pulling it explicitly via the configured npm registry (the same one
# `npm ci` just used) guarantees the binary is in node_modules before
# `next build` looks for it. `--no-save` keeps package.json clean.
# Arch-aware: TARGETARCH is provided by buildx, so arm64 hosts get the
# right SWC instead of amd64-only.
#
# `--mount=type=cache,target=/root/.npm` persists npm's package cache
# across builds (mirrors what semops/workflows-api do for uv). On a
# flaky corp network the first build still has to pull packages, but
# any subsequent build/retry reuses what's cached locally — turns a
# 200-package fetch into a near-noop.
ARG TARGETARCH
RUN --mount=type=cache,target=/root/.npm \
    npm ci && \
    if [ "$TARGETARCH" = "arm64" ]; then SWC=arm64; else SWC=x64; fi && \
    npm install --no-save --no-audit "@next/swc-linux-${SWC}-gnu" && \
    NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate

COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Development stage - keeps full node_modules for hot reload
FROM base AS dev
ENV NODE_ENV=development

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "dev"]

# Production stage - standalone output only
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files and CLI for migrations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Writable storage for matcher result Excel cache (path.join(process.cwd(), "data")
# in app/api/matcher/jobs/[jobId]/route.ts). /app is owned by root, so without
# this the `nextjs` user gets EACCES when persisting the result file.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
