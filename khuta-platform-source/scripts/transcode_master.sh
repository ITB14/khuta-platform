#!/usr/bin/env bash
# ترميز الفيديو الأصلي إلى مقاطع الدروس التي تتوقّعها المنصّة.
#
#   bash transcode_master.sh /path/to/"copilot final 1.mp4" [out_dir]
#
# يُنتج لكل درس نسختين — H.264/MP4 لأوسع مدى من الأجهزة، و VP9/WebM للمتصفّحات
# التي تُبنى دون الترميز المحتكَر — ويستخرج مسارًا صوتيًا واحدًا صغيرًا للتفريغ،
# ثم يكتب ملف SQL يحدّث سجلّات الوسائط بالأحجام الحقيقية.
#
# المتغيّرات: MP4_ONLY=1 لتخطّي WebM (أسرع كثيرًا)، CRF و VP9_CRF للجودة.
set -euo pipefail

SRC="${1:?الاستخدام: transcode_master.sh <الملف الأصلي> [مجلد الإخراج]}"
OUT="${2:-$(dirname "$0")/../media}"
[ -f "$SRC" ] || { echo "✗ لا يوجد ملف: $SRC"; exit 1; }
mkdir -p "$OUT"

CRF="${CRF:-23}"; VP9_CRF="${VP9_CRF:-33}"; CPU="${VP9_CPU:-4}"

# حدود الدروس الثمانية مستخرَجة من نقاط الانتقال في تفريغ الفيديو، لا من تقسيم
# متساوٍ. التفريغ نفسه لا يُحفظ هنا لأنه محتوى الجهة، لا شيفرة.
# صُحّحت في 2026-10-20 بعد مقابلتها بالتفريغ سطرًا سطرًا: الحدّ 1037 كان يضع
# أوّل ٦٤ ثانية من قسم PowerPoint في ذيل درس Excel، وثلاثة حدود أخرى تقطع في
# منتصف جملة منطوقة. يجب أن تبقى مطابقة لـ db/010_lesson_boundaries.sql.
NO=(1 2 3 4 5 6 7 8)
START=(0   165 311 550  812  973  1255 1514)
END=(  165 311 550 812  973  1255 1514 1662)

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | cut -d. -f1)
echo "المدّة الفعلية: ${DUR}ث · المفترَضة في قاعدة البيانات: ${END[7]}ث"
if [ "$DUR" -lt "${END[7]}" ]; then
  echo "⚠ الفيديو أقصر من الحدود المفترَضة — آخر درس سيُقتطع. راجع الحدود قبل الاعتماد."
fi
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate \
        -of default=nw=1 "$SRC" | sed 's/^/  /'
echo

# مقياس إلى ارتفاع 720 بحدّ أقصى، دون تكبير مصدر أصغر، وبأبعاد زوجية
SCALE="scale='if(gt(ih,720),-2,iw)':'min(ih,720)'"

for i in "${!NO[@]}"; do
  n=${NO[$i]}; ss=${START[$i]}; to=$(( ${END[$i]} - ${START[$i]} ))
  mp4="$OUT/lesson-$n-720p.mp4"
  if [ ! -f "$mp4" ]; then
    echo "→ الدرس $n · MP4 · من ${ss}ث لمدّة ${to}ث"
    ffmpeg -nostdin -y -loglevel error -ss "$ss" -i "$SRC" -t "$to" \
      -vf "$SCALE" -c:v libx264 -preset medium -crf "$CRF" \
      -profile:v high -level 4.0 -pix_fmt yuv420p -g 48 \
      -c:a aac -b:a 96k -ac 2 -movflags +faststart "$mp4"
    echo "   $(du -h "$mp4" | cut -f1)"
  fi

  [ "${MP4_ONLY:-0}" = "1" ] && continue
  webm="$OUT/lesson-$n-720p.webm"
  if [ ! -f "$webm" ]; then
    echo "→ الدرس $n · WebM (أبطأ)"
    ffmpeg -nostdin -y -loglevel error -i "$mp4" \
      -c:v libvpx-vp9 -crf "$VP9_CRF" -b:v 0 -deadline good -cpu-used "$CPU" -row-mt 1 \
      -c:a libopus -b:a 64k "$webm"
    echo "   $(du -h "$webm" | cut -f1)"
  fi
done

# مسار صوتي واحد للفيديو كاملًا، بحجم يسمح بنقله للتفريغ
AUD="$OUT/master-audio.opus"
if [ ! -f "$AUD" ]; then
  echo "→ الصوت الكامل للتفريغ"
  ffmpeg -nostdin -y -loglevel error -i "$SRC" -vn -ac 1 -ar 16000 \
    -c:a libopus -b:a 24k "$AUD"
  echo "   $(du -h "$AUD" | cut -f1)"
fi

MAN="$OUT/media_manifest.sql"
{
  echo "-- يُولَّد بـ transcode_master.sh — يُطبَّق بعد رفع الملفات"
  echo "do \$\$ begin perform set_config('khuta.tenant_id',"
  echo "  (select id::text from tenant where slug = 'alain'), false); end \$\$;"
  for f in "$OUT"/lesson-*.mp4 "$OUT"/lesson-*.webm; do
    [ -f "$f" ] || continue
    echo "update media_rendition set bytes = $(stat -c%s "$f") where storage_key = '$(basename "$f")';"
  done
} > "$MAN"

echo
echo "✓ تمّ. الملفات في $OUT"
echo "  الصوت للتفريغ: $AUD"
echo "  بيان الأحجام: $MAN"
