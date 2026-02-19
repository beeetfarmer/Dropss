#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "usage: $0 <tag>"
  exit 1
fi

BACKEND_IMAGE_REPO="${BACKEND_IMAGE_REPO:-beeetfarmer/dropss-backend}"
FRONTEND_IMAGE_REPO="${FRONTEND_IMAGE_REPO:-beeetfarmer/dropss-frontend}"

docker build -t "${BACKEND_IMAGE_REPO}:${TAG}" -t "${BACKEND_IMAGE_REPO}:latest" backend
docker build -t "${FRONTEND_IMAGE_REPO}:${TAG}" -t "${FRONTEND_IMAGE_REPO}:latest" frontend

if [ "${PUSH_IMAGES:-0}" = "1" ]; then
  docker push "${BACKEND_IMAGE_REPO}:${TAG}"
  docker push "${BACKEND_IMAGE_REPO}:latest"
  docker push "${FRONTEND_IMAGE_REPO}:${TAG}"
  docker push "${FRONTEND_IMAGE_REPO}:latest"
fi

if [ "${COSIGN_SIGN:-0}" = "1" ]; then
  if ! command -v cosign >/dev/null 2>&1; then
    echo "cosign is required when COSIGN_SIGN=1"
    exit 1
  fi

  cosign sign --yes "${BACKEND_IMAGE_REPO}:${TAG}"
  cosign sign --yes "${BACKEND_IMAGE_REPO}:latest"
  cosign sign --yes "${FRONTEND_IMAGE_REPO}:${TAG}"
  cosign sign --yes "${FRONTEND_IMAGE_REPO}:latest"
fi

echo "BACKEND_IMAGE=${BACKEND_IMAGE_REPO}:${TAG}"
echo "FRONTEND_IMAGE=${FRONTEND_IMAGE_REPO}:${TAG}"
