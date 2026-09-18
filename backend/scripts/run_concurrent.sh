#!/usr/bin/env bash
# Concurrent local API server — handles many Flutter/web requests in parallel.
# Usage (from backend/):
#   export db=local
#   ./scripts/run_concurrent.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.development}"
WORKERS="${GUNICORN_WORKERS:-2}"
THREADS="${GUNICORN_THREADS:-8}"
PORT="${PORT:-8000}"
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WORKERS}" \
  --threads "${THREADS}" \
  --timeout 120 \
  --access-logfile - \
  --error-logfile - \
  --reload
