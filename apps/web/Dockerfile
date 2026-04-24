# Shared image for both the Next.js web server and the ingest worker.
# Built once, run with different commands.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client is emitted to node_modules/.prisma at build time.
RUN DATABASE_URL=postgresql://u:p@h:5432/d npx prisma generate
# web server uses `npm start`; worker overrides the command.
EXPOSE 3001
CMD ["npm", "start"]
