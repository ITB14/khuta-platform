#!/usr/bin/env bash
# Placeholder renditions so the player, the heartbeats and R2 are exercised
# against real playback. Replaced by transcode_master.sh output once the master
# video reaches a machine with the file on it.
#
# Two renditions per lesson on purpose: H.264/MP4 reaches the widest set of
# devices, and VP9/WebM covers browsers built without the proprietary decoder.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p media

# Boundaries from the transcript, not from an even split.
DURS=(165 147 238 265 222 203 280 142)
FONT=/root/.fonts/IBMPlexSansArabic-Bold.ttf

for i in "${!DURS[@]}"; do
  n=$((i+1)); d=${DURS[$i]}
  mp4="media/lesson-$n-720p.mp4"
  if [ ! -f "$mp4" ]; then
    ffmpeg -y -loglevel error \
      -f lavfi -i "color=c=0x0B0B0B:s=1280x720:d=$d:r=12" \
      -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=22050" -shortest \
      -vf "drawtext=fontfile=$FONT:text='%{pts\\:hms}':fontcolor=0xB68A35:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2,\
drawbox=x=0:y=h-6:w=iw*t/$d:h=6:color=0xB68A35:t=fill" \
      -c:v libx264 -preset veryfast -crf 34 -pix_fmt yuv420p -g 24 \
      -c:a aac -b:a 24k -movflags +faststart "$mp4"
    echo "  lesson $n — ${d}s — $(du -h "$mp4" | cut -f1)"
  fi

  webm="media/lesson-$n-720p.webm"
  if [ ! -f "$webm" ]; then
    ffmpeg -y -loglevel error -i "$mp4" \
      -c:v libvpx-vp9 -b:v 300k -deadline realtime -cpu-used 8 -row-mt 1 \
      -c:a libopus -b:a 24k "$webm"
    echo "  lesson $n webm — $(du -h "$webm" | cut -f1)"
  fi
done
