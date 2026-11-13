#!/usr/bin/env bash
# Build the 22s soundtrack from /brag's bundled CC BY 4.0 music + CC0 SFX.
# Every cut lands on the 120.19 BPM grid (0.4992s / beat).
set -euo pipefail
FF=/home/user/.venv-brag/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2
A=/home/user/_reference/brag/skills/brag/assets
OUT=/home/user/childdevelopment/brag-output/work/soundtrack.wav
M="$A/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3"
S="$A/sfx"

"$FF" -y -loglevel error \
  -i "$M" \
  -i "$S/impact/impactSoft_medium_000.ogg" \
  -i "$S/impact/impactSoft_medium_001.ogg" \
  -i "$S/impact/impactSoft_medium_002.ogg" \
  -i "$S/impact/impactSoft_medium_003.ogg" \
  -i "$S/impact/impactSoft_medium_004.ogg" \
  -i "$S/interface/click_001.ogg" \
  -i "$S/impact/impactBell_heavy_000.ogg" \
  -i "$S/keyboard/keypress-001.wav" \
  -i "$S/keyboard/keypress-004.wav" \
  -i "$S/keyboard/keypress-009.wav" \
  -filter_complex "
[0:a]atrim=0:22,asetpts=PTS-STARTPTS,
aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,
volume=0.20,afade=t=in:st=0:d=0.5,afade=t=out:st=21:d=1[m];
[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=3500:all=1,volume=0.30[s1];
[2:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=7000:all=1,volume=0.30[s2];
[3:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=11000:all=1,volume=0.30[s3];
[4:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=14500:all=1,volume=0.30[s4];
[5:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=18000:all=1,volume=0.30[s5];
[6:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=9250:all=1,volume=0.26[s6];
[7:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=18300:all=1,volume=0.20[s7];
[8:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=350:all=1,volume=0.10[s8];
[9:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=600:all=1,volume=0.10[s9];
[10:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=850:all=1,volume=0.10[s10];
[m][s1][s2][s3][s4][s5][s6][s7][s8][s9][s10]
amix=inputs=11:duration=first:normalize=0,alimiter=limit=0.95[a]" \
  -map "[a]" -t 22 -ac 2 -ar 48000 -c:a pcm_s16le "$OUT"
echo "wrote $OUT"
