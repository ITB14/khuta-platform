#!/usr/bin/env bash
# Local PostgreSQL for development. The cluster lives in the project so the
# whole environment can be rebuilt with two commands.
set -euo pipefail
BIN=/usr/lib/postgresql/16/bin
PGD="$(cd "$(dirname "$0")/.." && pwd)/.pgdata"
case "${1:-start}" in
  init)
    rm -rf "$PGD"; mkdir -p "$PGD"; chown -R postgres:postgres "$PGD"
    su postgres -c "$BIN/initdb -D $PGD -U khuta --auth=trust -E UTF8 --locale=C" >/dev/null
    ;;
  start)
    [ -d "$PGD" ] || "$0" init
    chown -R postgres:postgres "$PGD"
    su postgres -c "$BIN/pg_ctl -D $PGD -l $PGD/pglog -o '-p 5433 -k /tmp' -w start" >/dev/null 2>&1 || true
    for i in $(seq 1 20); do psql -h /tmp -p 5433 -U khuta -d postgres -tc 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
    psql -h /tmp -p 5433 -U khuta -d postgres -tc 'select 1' >/dev/null 2>&1 && echo "postgres up on 5433" || { echo "postgres failed"; tail -5 "$PGD/pglog"; exit 1; }
    ;;
  stop) su postgres -c "$BIN/pg_ctl -D $PGD -w stop" >/dev/null 2>&1 || true ;;
esac
