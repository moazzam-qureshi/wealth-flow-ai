# ─────────────────────────────────────────────────────────────────────────────
# WealthFlow AI — Next.js app (with Mastra embedded). Multi-stage standalone build.
# Built & run by Coolify; Coolify/Traefik handle ingress, TLS and the domain.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# ── deps: install all deps (incl. dev) for the build ──
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder: compile the Next.js standalone output ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner: lean production image ──
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Next.js standalone bundle (includes a traced node_modules/ and server.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migration runner + SQL files + entrypoint.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations
RUN chmod +x ./scripts/docker-entrypoint.sh

# scripts/migrate.mjs runs with Node's native ESM resolver (outside the bundler),
# and Next's standalone trace copies an incomplete drizzle-orm (no package.json /
# "exports" map). Overlay the full packages from the deps stage so resolution works.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
