#!/usr/bin/env bash
# Rebuild the database from migrations. Destroys and recreates — development only.
set -euo pipefail
H=${PGHOST:-/tmp}; P=${PGPORT:-5433}; O=${PGOWNER:-khuta}
# The application server holds a pooled connection; a rebuild has to evict it.
psql -h "$H" -p "$P" -U "$O" -d postgres -qc \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname='khuta' and pid<>pg_backend_pid();" >/dev/null
psql -h "$H" -p "$P" -U "$O" -d postgres -qc "DROP DATABASE IF EXISTS khuta;" -c "CREATE DATABASE khuta;"
# الترحيلات تُكتشف لا تُسرد: القائمة اليدوية تنحرف عند أوّل ترحيل جديد يُنسى،
# وهو انحراف صامت — تُبنى قاعدة التطوير ناقصة ولا يشكو شيء. القاعدة هنا هي
# نفسها في scripts/migrate.js: كل db/NNN_*.sql ما عدا مجموعة الفحص.
shopt -s nullglob
for f in db/[0-9][0-9][0-9]_*.sql; do
  [ "$(basename "$f")" = "003_verify.sql" ] && continue
  echo "→ $f"; psql -h "$H" -p "$P" -U "$O" -d khuta -q -v ON_ERROR_STOP=1 -f "$f"
done
# أحجام النسخ من الملفات نفسها لا من تقدير. و nullglob أعلاه يجعل غياب
# مجلّد media تخطّيًا صامتًا بدل `stat: cannot statx 'media/*'` ثمّ SQL مشوّه.
for f in media/*; do
  psql -h "$H" -p "$P" -U "$O" -d khuta -qc \
    "update media_rendition set bytes=$(stat -c%s "$f") where storage_key='$(basename "$f")';"
done
echo "✓ database rebuilt"
