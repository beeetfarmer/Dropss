#!/usr/bin/env sh
set -e

RUN_DB_MIGRATIONS="${RUN_DB_MIGRATIONS:-1}"

if [ -n "$DATABASE_URL" ]; then
  python - <<'PY'
import os
import time
from sqlalchemy import create_engine, text

database_url = os.environ.get("DATABASE_URL", "")
engine = create_engine(database_url, pool_pre_ping=True)

for _ in range(60):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit("database not reachable")
PY
fi

if [ "$RUN_DB_MIGRATIONS" = "1" ]; then
  alembic upgrade head
fi
exec "$@"
