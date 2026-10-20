#!/usr/bin/env bash
# Rebuild the database from migrations. Destroys and recreates — development only.
set -euo pipefail
H=${PGHOST:-/tmp}; P=${PGPORT:-5433}; O=${PGOWNER:-khuta}
# The application server holds a pooled connection; a rebuild has to evict it.
psql -h "$H" -p "$P" -U "$O" -d postgres -qc \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname='khuta' and pid<>pg_backend_pid();" >/dev/null
psql -h "$H" -p "$P" -U "$O" -d postgres -qc "DROP DATABASE IF EXISTS khuta;" -c "CREATE DATABASE khuta;"
for f in db/001_init.sql db/002_seed_copilot.sql db/004_tenant_resolve.sql \
         db/005_playback.sql db/006_split_media.sql db/007_webm.sql db/008_assessment.sql; do
  echo "→ $f"; psql -h "$H" -p "$P" -U "$O" -d khuta -q -v ON_ERROR_STOP=1 -f "$f"
done
# Rendition byte counts come from the files themselves, not from a guess.
for f in media/*; do
  psql -h "$H" -p "$P" -U "$O" -d khuta -qc \
    "update media_rendition set bytes=$(stat -c%s "$f") where storage_key='$(basename "$f")';"
done
echo "✓ database rebuilt"
