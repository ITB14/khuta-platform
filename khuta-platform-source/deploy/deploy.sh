#!/usr/bin/env bash
# يُشغَّل على الخادم، من داخل مجلد deploy، بعد تعبئة .env
#
# ما يفعله: يبني الصورة، يُقلع قاعدة البيانات والتطبيق على شبكة Traefik
# القائمة، ثم يتحقّق أن الخدمة ترد. لا يلمس أي حاوية أخرى على الخادم.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "✗ لا يوجد ملف .env — انسخ .env.example واملأه"; exit 1; }
set -a; . ./.env; set +a

for v in KHUTA_HOST POSTGRES_PASSWORD APP_DB_PASSWORD KHUTA_SECRET KHUTA_MFA_KEY; do
  [ -n "${!v:-}" ] || { echo "✗ القيمة $v فارغة في .env"; exit 1; }
done

NET="${TRAEFIK_NETWORK:-traefik}"
docker network inspect "$NET" >/dev/null 2>&1 || {
  echo "✗ شبكة Traefik باسم '$NET' غير موجودة."
  echo "  اعرض الشبكات بـ: docker network ls"
  echo "  ثم اضبط TRAEFIK_NETWORK في .env على اسمها الصحيح."
  exit 1
}

echo "→ بناء الصورة"
docker compose build

echo "→ إقلاع الخدمات"
docker compose up -d

echo "→ انتظار قاعدة البيانات"
for i in $(seq 1 60); do
  docker compose exec -T db pg_isready -U khuta -d khuta >/dev/null 2>&1 && break
  sleep 2
done

echo "→ فحص القواعد على قاعدة حيّة"
docker compose exec -T db psql -U khuta -d khuta -q -f /dev/stdin < ../db/003_verify.sql \
  | grep -E 'PASS|FAIL' || true

echo "→ انتظار التطبيق"
for i in $(seq 1 60); do
  docker compose exec -T app node -e "fetch('http://127.0.0.1:3100/signin').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1 && break
  sleep 2
done

cat <<MSG

✓ الخدمة تعمل داخليًا.

الخطوة الأخيرة خارج الخادم: سجلّ A باسم khuta في نطاق b14facilities.com
يشير إلى عنوان هذا الخادم. سجلّ واحد فقط، بلا wildcard وبلا مساس بأي سجلّ
قائم. بعد انتشاره يُصدر Traefik الشهادة تلقائيًا عند أول زيارة إلى:

  https://${KHUTA_HOST}

لإنشاء متعلّم للعرض:  docker compose exec app node scripts/seed_demo_user.js
لرفع ملفات الدروس:    docker compose cp ../media/. app:/app/media/
MSG
