#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dev}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8619}"

cd "$(dirname "$0")"

alembic upgrade head

if [ "$MODE" = "prod" ]; then
  exec uvicorn app.main:app --host "$HOST" --port "$PORT"
fi

exec uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
