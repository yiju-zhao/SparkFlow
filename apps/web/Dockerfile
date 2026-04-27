# Base stage — shared CA bundle so every derived stage (builder, dev,
# runner) trusts a corporate proxy's certificate at both build and run
# time. The file `apps/web/ca-certificates.crt` MUST exist (gitignored,
# empty is fine on open networks).
FROM node:24 AS base
WORKDIR /app
COPY ca-certificates.crt /tmp/corporate-ca.crt
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

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# NODE_TLS_REJECT_UNAUTHORIZED=0 scoped to prisma generate only — Prisma
# downloads its engine binaries from binaries.prisma.sh, which on TLS-
# intercepting corporate networks fails the cert chain even with
# NODE_EXTRA_CA_CERTS set. Disable verification just for this one fetch;
# all subsequent stages run with normal cert validation.
RUN npm ci && NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate

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
