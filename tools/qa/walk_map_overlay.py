# -*- coding: utf-8 -*-
"""野外地图可走区总览(11-03 用户「只要地图可见范围内的应该都能走」):
把 LobbyWorldMaps 的地图定义用 Creator 自带 tsc 转成 JS 导出,按素材拼出整张地图,再把不可走的地方涂红。
不可走判定照抄 LobbyTownRenderer.walkable(地图边界 / 走廊 / 建筑 footprint 或 walkMask / blocks / 立物 block)。
用法:python tools/qa/walk_map_overlay.py [VILLAGE WOODS ...] [--scale 0.25] [--step 24]
输出:%TEMP%/lootchain-qa/walk/<地图>.png(左 = 原图,右 = 涂红)
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TSC = r'D:/office app/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js'
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'walk')
ACTOR_RADIUS = 26  # LobbyTownRenderer ACTOR_RADIUS


def dump_maps():
    work = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'mapdump')
    lobby = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby')
    subprocess.run(['node', TSC, '--outDir', work, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck',
                    '--rootDir', os.path.join(ROOT, 'assets', 'scripts'), os.path.join(lobby, 'LobbyWorldMaps.ts')], check=True)
    js = os.path.join(work, 'scenes', 'lobby', 'LobbyWorldMaps.js').replace('\\', '/')
    out = subprocess.run(['node', '-e', f"process.stdout.write(JSON.stringify(require('{js}').WORLD_MAPS))"], capture_output=True, check=True)
    return json.loads(out.stdout.decode('utf-8'))


def asset_img(path, cache={}):
    if path in cache:
        return cache[path]
    base = os.path.join(ROOT, 'assets', 'resources', path.replace('/spriteFrame', ''))
    im = None
    for ext in ('.png', '.jpg', '.jpeg', '.webp'):
        if os.path.exists(base + ext):
            im = Image.open(base + ext).convert('RGBA')
            break
    cache[path] = im
    return im


def point_in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def dist_to_lines(x, y, lines):
    best = 1e18
    for line in lines:
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            dx, dy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / max(1, dx * dx + dy * dy)))
            best = min(best, ((x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2) ** 0.5)
    return best


def walkable(d, x, y):
    w = d['walk']
    if x < w['left'] or x > w['right'] or y < w['bottom'] or y > w['top']:
        return False
    c = None if d.get('openWalk') else d.get('corridors')
    if c and dist_to_lines(x, y, c['lines']) > c['half'] and not any(((x - a['x']) / a['rx']) ** 2 + ((y - a['y']) / a['ry']) ** 2 <= 1 for a in c['areas']):
        return False
    for b in d['buildings']:
        m = b.get('walkMask')
        if m:
            rx, ry = x - b['x'], y - b['y']
            if point_in_poly(rx, ry, m['outline']) and (not point_in_poly(rx, ry, m['floor']) or any(point_in_poly(rx, ry, h) for h in m.get('holes', []))):
                return False
            continue
        hw = b['footprint']['w'] / 2 + ACTOR_RADIUS * 0.6
        if b['x'] - hw < x < b['x'] + hw and b['y'] - ACTOR_RADIUS * 0.3 < y < b['y'] + b['footprint']['d']:
            return False
    for k in d.get('blocks') or []:
        hw = k['w'] / 2 + ACTOR_RADIUS * 0.4
        if k['x'] - hw < x < k['x'] + hw and k['y'] - ACTOR_RADIUS * 0.3 < y < k['y'] + k['d']:
            return False
    for p in d['props']:
        k = p.get('block')
        if not k:
            continue
        hw = k['w'] / 2 + ACTOR_RADIUS * 0.4
        if p['x'] - hw < x < p['x'] + hw and p['y'] - ACTOR_RADIUS * 0.3 < y < p['y'] + k['d']:
            return False
    return True


def render(d, scale):
    W, H = int(d['width'] * scale), int(d['height'] * scale)
    canvas = Image.new('RGBA', (W, H), (70, 96, 54, 255))
    to_px = lambda x, y: ((x + d['width'] / 2) * scale, (d['height'] / 2 - y) * scale)
    ground = asset_img(d['ground']) if d.get('ground') else None
    if ground:
        tile = int((d.get('groundTile') or 1000) * scale)
        g = ground.resize((tile, tile))
        for ty in range(0, H, tile):
            for tx in range(0, W, tile):
                canvas.alpha_composite(g, (tx, ty))

    def paste(asset, x, y, width, center, tilt=1.0, angle=0, flip=False):
        im = asset_img(asset)
        if im is None:
            return
        w = max(1, int(width * scale))
        h = max(1, int(width * im.height / im.width * tilt * scale))
        im = im.resize((w, h))
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if angle:
            im = im.rotate(angle, expand=True)
        px, py = to_px(x, y)
        if center:
            canvas.alpha_composite(im, (int(px - im.width / 2), int(py - im.height / 2)))
        else:
            canvas.alpha_composite(im, (int(px - im.width / 2), int(py - im.height)))

    for p in d['props']:
        if p.get('flat'):
            paste(p['asset'], p['x'], p['y'], p['width'], True, p.get('tilt') or 1, p.get('angle') or 0, p.get('flipX'))
    for b in d['buildings']:
        if b.get('flat'):
            paste(b['asset'], b['x'], b['y'], b['width'], False)
    stand = [(p['y'], 'p', p) for p in d['props'] if not p.get('flat')] + [(b['y'], 'b', b) for b in d['buildings'] if not b.get('flat')]
    for _, kind, it in sorted(stand, key=lambda t: -t[0]):
        paste(it['asset'], it['x'], it['y'], it['width'], False, flip=bool(it.get('flipX')))
    return canvas


def main():
    args = sys.argv[1:]
    scale = float(args[args.index('--scale') + 1]) if '--scale' in args else 0.25
    step = int(args[args.index('--step') + 1]) if '--step' in args else 24
    codes = [a for a in args if a.isupper()] or ['VILLAGE', 'WOODS']
    maps = dump_maps()
    os.makedirs(OUT, exist_ok=True)
    for code in codes:
        d = maps[code]
        base = render(d, scale)
        red = Image.new('RGBA', base.size, (0, 0, 0, 0))
        dr = ImageDraw.Draw(red)
        half = d['width'] / 2
        for y in np.arange(-d['height'] / 2, d['height'] / 2, step):
            for x in np.arange(-half, half, step):
                if not walkable(d, x + step / 2, y + step / 2):
                    px, py = (x + half) * scale, (d['height'] / 2 - y - step) * scale
                    dr.rectangle([px, py, px + step * scale, py + step * scale], fill=(255, 0, 0, 95))
        over = base.copy()
        over.alpha_composite(red)
        sheet = Image.new('RGB', (base.width, base.height * 2))
        sheet.paste(base.convert('RGB'), (0, 0))
        sheet.paste(over.convert('RGB'), (0, base.height))
        path = os.path.join(OUT, code + '.png')
        sheet.save(path)
        print(code, path, base.size)


if __name__ == '__main__':
    main()
