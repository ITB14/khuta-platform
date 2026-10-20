#!/bin/sh
# 001_init.sql creates khuta_app with a placeholder password on purpose, so the
# real one never appears in a file that is committed. It is set here, once, from
# the environment the container was started with.
set -e
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
alter role khuta_app with password '${APP_DB_PASSWORD}';
SQL
