#!/usr/bin/env python3
"""Reassemble existing clips in learning order, then add Hindi subtitles and chapter markers."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import imageio_ffmpeg

B = Path(__file__).resolve().parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
CHAPTERS = [
 ('01-intro', 'Shuruat aur login'), ('02-setup', 'Clinic setup'),
 ('03-patients', 'Patients'), ('04-care', 'Appointments aur therapy'),
 ('10-journey', 'Ek poori patient journey'), ('11-corrections', 'Galti aur corrections'),
 ('05-billing', 'Billing aur expenses'), ('06-hr', 'Staff aur HR'),
 ('07-reports', 'Reports aur parent login'), ('09-extra', 'Aur modules'),
 ('12-parent', 'Parent portal'), ('13-roles', 'Role-wise kaam'),
 ('08-close', 'Daily checklist'),
]

def duration(path):
    text = subprocess.run([FF, '-i', str(path)], capture_output=True, text=True).stderr
    m = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', text)
    if not m: raise RuntimeError(f'Duration unavailable: {path}')
    return 3600 * int(m[1]) + 60 * int(m[2]) + float(m[3])

def ts(t):
    return f'{int(t//60):02}:{int(t%60):02}'

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    concat = tmp/'concat.txt'
    concat.write_text(''.join(f"file '{B/(key+'.mp4')}'\n" for key, _ in CHAPTERS))
    full = B/'clinic-full-training.mp4'
    subprocess.run([FF, '-y','-v','error','-f','concat','-safe','0','-i',str(concat),
                    '-c','copy','-movflags','+faststart',str(full)], check=True)
    # Writes the sidecar subtitles and adds a selectable subtitle stream.
    subprocess.run([sys.executable,str(B/'create_subtitles.py')],check=True)
    metadata = [';FFMETADATA1']
    lines = ['# Clinic training: chapter index', '',
             'Times are approximate. Select Hindi subtitles in your player if supported.', '']
    elapsed = 0.0
    for key,title in CHAPTERS:
        length = duration(B/(key+'.mp4'))
        lines.append(f'- {ts(elapsed)} — [{title}]({key}.mp4)')
        metadata.extend(['[CHAPTER]','TIMEBASE=1/1000',f'START={round(elapsed*1000)}',
                         f'END={round((elapsed+length)*1000)}',f'title={title}'])
        elapsed += length
    (B/'CHAPTERS.md').write_text('\n'.join(lines)+'\n')
    meta = tmp/'chapters.txt'
    meta.write_text('\n'.join(metadata)+'\n')
    with_chapters = tmp/'with-chapters.mp4'
    subprocess.run([FF,'-y','-v','error','-i',str(full),'-f','ffmetadata','-i',str(meta),
                    '-map','0','-map_metadata','0','-map_chapters','1','-c','copy',
                    '-movflags','+faststart',str(with_chapters)],check=True)
    with_chapters.replace(full)
print('Rebuilt full video in learning order; chapters and selectable subtitles added.')
