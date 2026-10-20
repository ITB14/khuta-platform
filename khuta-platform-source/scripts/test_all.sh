#!/usr/bin/env bash
# The whole suite, in the order the state requires. Each browser-level suite
# starts from a freshly seeded learner, because each one drives the journey to
# a different point and the next must not inherit it.
set -uo pipefail
cd "$(dirname "$0")/.."
fails=0
step () { echo; echo "════ $1"; shift; "$@" || fails=$((fails+1)); }

step "قاعدة البيانات من الصفر"        bash scripts/reset_db.sh
step "فحص القواعد على قاعدة حيّة"     bash -c "psql -h \${PGHOST:-/tmp} -p \${PGPORT:-5433} -U khuta -d khuta -q -f db/003_verify.sql 2>&1 | grep -E 'PASS|FAIL'"
step "RFC 6238"                        node test/totp.test.js
step "الهوية وكلمات المرور"            node test/identity.test.js
node scripts/seed_demo_user.js >/dev/null
step "الواجهة من طرف إلى طرف"          node test/e2e.test.js
node scripts/seed_demo_user.js >/dev/null
step "المشاهدة والتسلسل"               node test/playback.test.js
node scripts/seed_demo_user.js >/dev/null
step "دورة التقييم كاملة"              node test/assessment.test.js
node scripts/seed_demo_user.js >/dev/null
step "التصريح للمسارات الإدارية"       node test/admin.test.js

echo
echo "══════════════════════════════════════════════════════════"
[ "$fails" -eq 0 ] && echo "  كل المجموعات نجحت" || echo "  مجموعات فاشلة: $fails"
echo "══════════════════════════════════════════════════════════"
exit "$fails"
