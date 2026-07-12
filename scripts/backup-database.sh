#!/bin/bash
# Full pg_dump backup of the Trifecta Asset Tracker Postgres database (Neon).
# Custom format (-Fc) so it's restorable with pg_restore, including a
# straight-to-live-DB restore if that's ever actually needed:
#   pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" <file>
#
# This is the live production database for Waterman's/Chix/Shack — treat
# these dumps as containing real business data.
#
# Requires pg_dump on PATH — on macOS via Homebrew that's libpq, which is
# keg-only: /opt/homebrew/opt/libpq/bin/pg_dump (not symlinked by default).
#
# Run: npm run backup   (from the project root), or scripts/backup-database.sh directly.

set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set — check .env" >&2
  exit 1
fi

PG_DUMP="pg_dump"
if ! command -v pg_dump >/dev/null 2>&1; then
  if [ -x "/opt/homebrew/opt/libpq/bin/pg_dump" ]; then
    PG_DUMP="/opt/homebrew/opt/libpq/bin/pg_dump"
  else
    echo "pg_dump not found — install with: brew install libpq" >&2
    exit 1
  fi
fi

BACKUP_DIR="../Backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y-%m-%d_%H%M%S)
OUT="$BACKUP_DIR/trifecta_${STAMP}.dump"

"$PG_DUMP" "$DATABASE_URL" --format=custom --file="$OUT"
echo "Backed up to $OUT ($(du -h "$OUT" | cut -f1))"
