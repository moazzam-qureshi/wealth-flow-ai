#!/bin/sh
# Run DB migrations, then start the Next.js standalone server.
# Migrations are idempotent; failing here aborts startup on purpose.
set -e

echo "[entrypoint] running migrations…"
node /app/scripts/migrate.mjs

echo "[entrypoint] starting Next.js…"
exec node /app/server.js
