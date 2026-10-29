# -*- coding: utf-8 -*-
"""晨风村 1:1 地形层(2026-10-29 用户:按鸟瞰图 1:1 还原,现在偏卡通):
鸟瞰原型 overview_ref.png(2000×967)切 5×4 块(每块 480×320、相邻重叠约 20%),逐块让 Codex 重画成 1536×1024 高清「纯地形」
(去建筑 / 村内零散树 / 小物件 / 文字;保留路网、河流瀑布、悬崖台地、台阶、木桥、外围密林),
已画好的左邻 / 上邻一起喂进去对齐接缝。按行优先顺序跑,已有的跳过(可断点续跑)。
用法:python tools/qa/village_terrain_gen.py [--only r_c ...]
产物:周报截图/2026-10-29_新手村设计/terrain_1to1/tiles/t_<r>_<c>.png
"""
import argparse
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, '周报截图', '2026-10-29_新手村设计', 'terrain_1to1')
TILES = os.path.join(D, 'tiles')
COLS, ROWS, TW, TH = 5, 4, 480, 320


def grid(ref_w: int, ref_h: int):
    sx = (ref_w - TW) / (COLS - 1)
    sy = (ref_h - TH) / (ROWS - 1)
    for r in range(ROWS):
        for c in range(COLS):
            yield r, c, round(c * sx), round(r * sy)


PROMPT = """Image 1 is one region of a fantasy village map seen from a high 3/4 bird's-eye view. Repaint THIS region as a HIGH-RESOLUTION TERRAIN-ONLY ground layer for a 2D game map.

Composition (most important): keep the terrain 1:1 with image 1 — same framing, same scale, same camera angle, nothing shifted, zoomed or re-composed. Every dirt path keeps its exact curve, width and junctions; the river, its banks, waterfalls, ponds, rock cliffs, raised grassy terraces, stone steps/stairs, stone retaining walls, wooden bridges and wheat/vegetable field plots stay exactly where they are and keep their shape.

REMOVE: every building and house (incl. windmill, water mill, chapel, smithy, market stalls, sheds), towers, the round teleport circle/fountain structures, isolated trees and bushes inside the village, fences, lamp posts, banners, flags, signposts, crates, barrels, hay, carts, scarecrows, people, and ALL text labels and "?" marks. Where they stood, paint the natural ground that would be underneath (grass, dirt yard, flagstone yard, or the path continuing) so the spot is ready to have a building placed on top.
KEEP painted: wooden bridges, stone steps, the dense forest canopy / cliffs / mist that form the OUTER border of the map.

Style: match image 1's look — realistic painterly fantasy, warm morning sunlight, natural slightly muted colours, fine detail and crisp at full resolution. NOT cartoon, NOT flat saturated green, NOT noisy: grass is soft natural meadow with gentle large colour variation, dirt paths are worn earth with soft edges and a few pebbles, rocks are detailed mossy grey stone, water is clear blue with white foam at the falls.
No vignette, no UI, no frame, no text.
{neighbors}
Output landscape 1536x1024."""


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', default=[])
    args = ap.parse_args()
    os.makedirs(TILES, exist_ok=True)
    ref = Image.open(os.path.join(D, 'overview_ref.png')).convert('RGB')
    gen = os.path.join(ROOT, 'tools', 'qa', 'gen_proto.py')
    ox = round(TW - (ref.width - TW) / (COLS - 1))
    oy = round(TH - (ref.height - TH) / (ROWS - 1))
    for r, c, x, y in grid(ref.width, ref.height):
        key = f'{r}_{c}'
        if args.only and key not in args.only:
            continue
        out = os.path.join(TILES, f't_{key}.png')
        if os.path.exists(out):
            continue
        crop = os.path.join(TILES, f'src_{key}.png')
        ref.crop((x, y, x + TW, y + TH)).save(crop)
        refs = [crop]
        notes = []
        left = os.path.join(TILES, f't_{r}_{c - 1}.png')
        up = os.path.join(TILES, f't_{r - 1}_{c}.png')
        if c > 0 and os.path.exists(left):
            refs.append(left)
            notes.append(f'Image {len(refs)} is the already-painted tile directly to the LEFT of this one: its rightmost {round(ox / TW * 100)}% shows the same ground as this tile\'s leftmost {round(ox / TW * 100)}%. Paint that overlapping strip so it continues seamlessly (same path positions, same river edge, same colours and lighting).')
        if r > 0 and os.path.exists(up):
            refs.append(up)
            notes.append(f'Image {len(refs)} is the already-painted tile directly ABOVE this one: its bottom {round(oy / TH * 100)}% shows the same ground as this tile\'s top {round(oy / TH * 100)}%. Paint that overlapping strip so it continues seamlessly.')
        prompt = os.path.join(TILES, f'p_{key}.txt')
        with open(prompt, 'w', encoding='utf-8') as f:
            f.write(PROMPT.format(neighbors=('\n' + '\n'.join(notes) + '\n') if notes else ''))
        print('gen', key, len(refs), flush=True)
        res = subprocess.run([sys.executable, gen, '--prompt', prompt, '--out', out, '--ref', *refs], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
        print((res.stdout or res.stderr).strip().splitlines()[-1][:80] if (res.stdout or res.stderr) else 'no output', flush=True)


if __name__ == '__main__':
    main()
