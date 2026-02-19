#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "usage: $0 <tag>"
  exit 1
fi

COMPOSE_FILE_PATH="${COMPOSE_FILE_PATH:-docker-compose.yml}"
BACKEND_IMAGE_REPO="${BACKEND_IMAGE_REPO:-beeetfarmer/dropss-backend}"
FRONTEND_IMAGE_REPO="${FRONTEND_IMAGE_REPO:-beeetfarmer/dropss-frontend}"

export BACKEND_IMAGE="${BACKEND_IMAGE_REPO}:${TAG}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${TAG}"

docker compose -f "${COMPOSE_FILE_PATH}" pull backend frontend
docker compose -f "${COMPOSE_FILE_PATH}" up -d db
docker compose -f "${COMPOSE_FILE_PATH}" run --rm -e RUN_DB_MIGRATIONS=0 backend alembic upgrade head
docker compose -f "${COMPOSE_FILE_PATH}" up -d --remove-orphans backend frontend
docker compose -f "${COMPOSE_FILE_PATH}" ps
