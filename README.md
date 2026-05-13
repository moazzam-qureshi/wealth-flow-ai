# WealthFlow AI

An AI-powered financial-evolution tool for the realities of remote workers, freelancers, and
emerging-market / multi-currency earners — not a budgeting app. Maps the user's actual financial
infrastructure, ingests transactions from screenshots via a vision model, tracks cashflow + FX
exposure, watches macro news, and surfaces grounded, reasoned financial-leverage suggestions.

See `docs/product.md` for the full vision and the plan file for the v1 build.

## Stack

- **Next.js 16** (App Router, React 19, Tailwind 4) — the app, in `ui/`. Mastra runs *in-process*
  (no separate server) under `ui/src/mastra/`.
- **Postgres** — app tables + Mastra's `mastra_*` tables. Drizzle ORM (`ui/src/db/`).
- **SeaweedFS** (S3-compatible) — uploaded screenshots. (Local dev falls back to the filesystem.)
- **OpenRouter** — LLM provider: Qwen vision for screenshot extraction, Qwen text for the agents.
- **Better Auth** — email+password. Multi-user: every account gets its own isolated data (all rows scoped by `owner_id` → `user.id`).
- **Docker + Coolify** — deployed via Coolify/Traefik on a self-hosted VPS.

## Run it

### Everything in Docker

```bash
cp .env.example .env          # then edit secrets (BETTER_AUTH_SECRET, OPENROUTER_API_KEY, …)
docker compose up -d --build  # app + postgres + seaweedfs
# The app container runs migrations on start. It listens on :3000 (Coolify/Traefik exposes it).
```

To reach it locally, add the override file (it publishes the ports):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

### App on the host, Postgres in Docker (fast dev loop)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres seaweedfs   # postgres 5432 → 127.0.0.1
cd ui
cp .env.local.example .env.local          # edit as needed
npm install
npm run db:migrate                        # applies ui/src/db/migrations
npm run dev                               # http://localhost:3000
```

## Deploy on a VPS with Coolify

1. **New resource → Docker Compose**, point it at this repo. Coolify reads
   `docker-compose.yml` (3 services: `app`, `postgres`, `seaweedfs`).
2. **Env vars** (Coolify "Environment Variables"): set everything from `.env.example`
   — at minimum `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL`
   + `APP_BASE_URL` (your https domain), `OPENROUTER_API_KEY`.
   `DATABASE_URL` and `SEAWEEDFS_S3_ENDPOINT` are wired by the compose file to the
   internal service names — leave those alone unless you use a Coolify-managed
   Postgres instead. `SEAWEEDFS_S3_ACCESS_KEY` / `SEAWEEDFS_S3_SECRET_KEY` default
   to `wealthflow` / `wealthflowsecret`; the seaweedfs service generates its S3
   identity config from these at startup, so if you change them in Coolify the
   storage picks them up automatically. seaweedfs is never internet-facing.
3. **Domain + TLS**: assign a domain to the **`app`** service in Coolify — it adds the
   Traefik labels and provisions Let's Encrypt automatically. `postgres` and
   `seaweedfs` get no domain → not reachable from the internet. The committed
   `docker-compose.yml` publishes no host ports — Coolify/Traefik handle ingress
   (port publishing for local runs lives in `docker-compose.local.yml`).
4. **Migrations** run on container start (the entrypoint runs `scripts/migrate.mjs`
   before `next start`). Mastra creates its own `mastra_*` tables at runtime.
5. **Scheduled jobs run in-process** via `ui/src/lib/scheduler.ts` (registered at
   server startup by Next's `instrumentation.ts`):
   - `fx-rates` — every 6h
   - `fetch-news` — every 4h
   - `weekly-suggestions` — Mondays 09:00 (server TZ)

   Plus a catch-up tick: 15s after a cold start it runs `fx-rates` and `fetch-news`
   once, so a fresh deploy isn't empty. No Coolify Scheduled Task setup needed.

   The scheduler is **on by default in production** (when `NODE_ENV=production`)
   and **off by default in dev**, so `npm run dev` HMR restarts don't keep
   re-firing the catch-up tick (which would burn LLM calls on the news job). To
   force-enable it locally: `WEALTHFLOW_SCHEDULER=on`. To force-disable it in
   prod: `WEALTHFLOW_SCHEDULER=off`.

   To trigger a job manually, hit `/api/cron/<job>` while signed in — uses your
   session cookie; there is no `CRON_SECRET` anymore.
6. **First run**: open the domain → `/login` → **Create one** → add your real
   accounts on `/accounts` → upload a real screenshot on `/` (Add tab) to confirm
   extraction → check the dashboard. The scheduler will have fetched FX rates and
   news within 15s of the container coming up. Anyone can sign up; each account's
   data is isolated.
   On the phone: install the PWA (Add to Home Screen) → in a bank/fintech app,
   screenshot a transaction → Share → WealthFlow → it lands in the review flow.

## Layout

```
wealth-flow-ai/
  ui/                  # the Next.js app (Mastra embedded)
    app/
      (app)/           # authenticated pages: dashboard, accounts, upload, news, suggestions, chat
      login/           # the only unauthenticated page (sign in / sign up)
      api/             # accounts, uploads, transactions, metrics, recommendations, chat,
                       #   auth/[...all], share-target, cron/{fx-rates,fetch-news,weekly-suggestions}
      manifest.ts      # PWA manifest + Web Share Target
    proxy.ts           # auth gate (Next 16 "proxy", formerly middleware) — page requests only
    src/
      db/              # schema, migrations, index (lazy client), money, fx, cashflow,
                       #   profile, accounts, transactions, recommendations
      mastra/          # index (lazy getMastra), llm (OpenRouter/Qwen), agents/chat-agent,
                       #   tools/read-tools, extraction (Qwen vision)
      lib/             # env, blob (SeaweedFS + fs fallback), auth, session, api,
                       #   ingest, fx-fetch, news-fetch, suggestions, rss-feeds
    scripts/           # migrate.mjs, docker-entrypoint.sh
    Dockerfile
  docker-compose.yml       # app + postgres + seaweedfs (flat, Coolify-friendly, no published ports)
  docker-compose.local.yml # local-only override: publishes app :3000 and postgres :5432
  .env.example
  docs/                # product.md, the plan
```
