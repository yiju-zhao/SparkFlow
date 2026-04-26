# Base stage
FROM node:24 AS base
WORKDIR /app

# Builder stage
FROM base AS builder

# Skip SSL verification for npm/prisma during build
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
# prisma.config.ts eagerly reads DATABASE_URL on load. `prisma generate`
# doesn't actually need a live DB, but the config loader resolves env first.
# Real DATABASE_URL is supplied at runtime; this placeholder is build-only.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

# Optional corporate CA bundle. See Dockerfile.worker for details.
# File `apps/web/ca-certificates.crt` MUST exist (empty is fine).
COPY ca-certificates.crt /tmp/corporate-ca.crt
RUN if [ -s /tmp/corporate-ca.crt ]; then \
      cp /tmp/corporate-ca.crt /usr/local/share/ca-certificates/corporate.crt && \
      update-ca-certificates; \
    fi && rm /tmp/corporate-ca.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Use pnpm via corepack instead of `npm ci`. npm 11 (shipped with
# node:24) crashes mid-install with "Exit handler never called!" on
# this lockfile; pnpm's installer is a different code path and is also
# 3-5× faster on cold caches.
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --no-frozen-lockfile --ignore-scripts && pnpm exec prisma generate

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

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
