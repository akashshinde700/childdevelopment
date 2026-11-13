#!/usr/bin/env python3
"""Check settled key text boxes, nominal contrast, and hold-time at 1280x720.
Not a pixel-level or accessibility certification; illustrative UI text excluded."""
import render


def luminance(rgb):
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126*c[0] + .7152*c[1] + .0722*c[2]


def contrast(a, b):
    a, b = sorted((luminance(a), luminance(b)))
    return (b + .05) / (a + .05)


issues = []
checked = 0
for scene in render.SCENES:
    dur = scene['end'] - scene['start']
    for e in render.scene_elements(scene['id'], 1280, 720, 'final'):
        if e['kind'] != 'text' or e['role'] != 'readable':
            continue
        checked += 1
        lines, _, width, height, size = render.prepare_text(e, 'final')
        if width > e['w'] + 1 or height > e['h'] + 1:
            issues.append(f"{e['id']}: text larger than box")
        if e['x'] < 0 or e['y'] < 0 or e['x'] + e['w'] > 1280 or e['y'] + e['h'] > 720:
            issues.append(f"{e['id']}: box outside frame")
        ratio = contrast(render.el_color(e, 'final'), e['bg'])
        # large bold text (rough WCAG 18.66px or 24px) uses a 3:1 threshold
        threshold = 3 if size >= 24 or (size >= 19 and e['weight'] in ('i700', 'i800', 'p700', 'p800')) else 4.5
        if ratio < threshold:
            issues.append(f"{e['id']}: nominal contrast {ratio:.2f} < {threshold}")
        settle = e['delay'] + (e.get('type_dur', 0) if e['anim'] == 'type' else render.ENTRANCE)
        remaining = dur - render.EXIT_DIP - settle
        minimum = max(.8, .3 * len(e['text'].split()))
        if remaining < minimum:
            issues.append(f"{e['id']}: hold {remaining:.2f}s < {minimum:.2f}s")
print(f"key text elements checked: {checked}; issues: {len(issues)}")
for issue in issues:
    print(' -', issue)
raise SystemExit(bool(issues))
