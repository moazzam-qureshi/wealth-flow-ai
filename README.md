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
- **Better Auth** — single-user email+password.
- **Docker + Coolify** — deployed via Coolify/Traefik on a self-hosted VPS.

## Run it

### Everything in Docker

```bash
cp .env.example .env          # then edit secrets (BETTER_AUTH_SECRET, OPENROUTER_API_KEY, …)
docker compose up -d --build  # app + postgres + seaweedfs
# The app container runs migrations on start. It listens on :3000 (Coolify/Traefik exposes it).
```

To reach it locally, temporarily uncomment the `ports:` line under the `app` service in
`docker-compose.yml`, or `docker compose exec app …`.

### App on the host, Postgres in Docker (fast dev loop)

```bash
docker compose up -d postgres seaweedfs   # postgres 5432 is published to 127.0.0.1
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
   + `APP_BASE_URL` (your https domain), `OPENROUTER_API_KEY`, `CRON_SECRET` (random),
   and **change** the SeaweedFS keys (and `seaweedfs/s3.json` to match). `DATABASE_URL`
   and `SEAWEEDFS_S3_ENDPOINT` are wired by the compose file to the internal service
   names — leave those alone unless you use a Coolify-managed Postgres instead.
3. **Domain + TLS**: assign a domain to the **`app`** service in Coolify — it adds the
   Traefik labels and provisions Let's Encrypt automatically. `postgres` and
   `seaweedfs` get no domain → not reachable from the internet. (Don't expose the
   `app` `ports:` line in compose — Coolify/Traefik handle ingress.)
4. **Migrations** run on container start (the entrypoint runs `scripts/migrate.mjs`
   before `next start`). Mastra creates its own `mastra_*` tables at runtime.
5. **Scheduled tasks** (Coolify "Scheduled Tasks" on the `app` service, or system
   cron) — hit the cron routes with the `x-cron-secret` header:
   - `curl -fsS -H "x-cron-secret: $CRON_SECRET" https://YOURDOMAIN/api/cron/fx-rates` — **daily**
   - `curl -fsS -H "x-cron-secret: $CRON_SECRET" https://YOURDOMAIN/api/cron/fetch-news` — **daily** (runs a few minutes — it's a batch LLM call)
   - `curl -fsS -H "x-cron-secret: $CRON_SECRET" https://YOURDOMAIN/api/cron/weekly-suggestions` — **weekly**
6. **First run**: open the domain → `/login` → create your single account → add your
   real accounts on `/accounts` → trigger `cron/fx-rates` once → upload a real
   screenshot on `/upload` to confirm extraction → check the dashboard.
   On the phone: install the PWA (Add to Home Screen) → in a bank/fintech app,
   screenshot a transaction → Share → WealthFlow → it lands in the review flow.

## Layout

```
wealth-flow-ai/
  ui/                  # the Next.js app (Mastra embedded)
    app/
      (app)/           # authenticated pages: dashboard, accounts, upload, news, suggestions, chat
      login/           # the only unauthenticated page
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
  docker-compose.yml   # app + postgres + seaweedfs (flat, Coolify-friendly)
  seaweedfs/s3.json    # static S3 credentials for SeaweedFS (match SEAWEEDFS_S3_* env)
  .env.example
  docs/                # product.md, the plan
```
