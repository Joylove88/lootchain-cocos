# -*- coding: utf-8 -*-
"""战斗背景分层(11-10 用户:「远处的地方做了层次感,很立体」→ 选「战斗背景分层」,原型通过):
现有战斗背景只有「一面远景 + 一大片平地」两层,地面像一张平面。改成高俯角 + 多层纵深:
  近景战斗地面(低对比、细节只在两侧边缘)→ 中景抬高的石坎 / 台地 → 远景岩山 / 废墟(越远越淡越雾)→ 顶部一窄条天空。
只取通用构图特征,参考图只喂我们自己现有的战斗背景(同主题),不喂任何别家游戏截图。

11-10 用户「分层远处背景会动态吧」→ 真拆层:每张背景出两次图 ——
  <名>.png           整图(远景层直接用它)
  <名>_nearmask.png  同图把石坎后面全涂品红(只取遮罩,近景层像素仍取整图,静止时三层叠起来与整图一致)
入库 / 抠近景见 battle_bg_layer_install.py。

用法:python tools/qa/battle_bg_layer_gen.py [背景名...]     产物:%TEMP%/lootchain-qa/battle_layer/
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import city4_assets_gen as C  # noqa: E402  复用 codex_exe / GEN / other_codex_exec

ROOT = C.ROOT
OUT = os.path.join(tempfile.gettempdir(), 'lootchain-qa', 'battle_layer')
BG = os.path.join(ROOT, 'assets', 'resources', 'ui', 'battle')

LAYOUT = (
    'COMPOSITION (most important): landscape 16:9 game battle background, a HIGH camera looking down at about 50 degrees, so the '
    'walkable battle ground fills the lower 65% of the image. Clear depth in distinct layers from near to far: '
    '(1) the near battle ground at the bottom: wide, calm and fairly flat, LOW CONTRAST, only sparse cracks, the centre left open and '
    'uncluttered for characters, detail (rubble, broken stones, small props) pushed to the left and right edges; '
    '(2) around 30-38% from the top, a raised rocky ledge / terrace step running across the width with a few low broken steps, its '
    'front face catching light and casting a soft shadow onto the ground in front; '
    '(3) behind it, distant cliffs, rock spires and ruins that become progressively LIGHTER, HAZIER, cooler and less detailed with '
    'distance (strong atmospheric perspective, soft mist between the layers); '
    '(4) only a thin band of sky at the very top. The near ground is darker and richer, the far layers pale and soft. '
    'Painted, refined, high-quality fantasy game illustration, muted palette, soft light from the upper left, no characters, no '
    'creatures, no UI, no text, no frame, no mirrored or repeated patterns.'
)

SPECS = {
    # 灰岩荒原 / 枯木林野外战斗
    'battle_scene_field_wasteland': (
        'Image 1 is our current battle background for this area (a grey ruined wasteland with broken columns); keep its theme, '
        'materials and colour palette (cold grey stone, dry grass tufts, ruined columns and arches, overcast sky) but redraw it with '
        'the new composition. '),
    # 林地野外战斗
    'battle_scene_field_forest': (
        'Image 1 is our current battle background for this area (an old forest clearing with a dirt floor); keep its theme, materials '
        'and colour palette (mossy roots, packed earth, big old trees, misty hills) but redraw it with the new composition: the raised '
        'ledge is a mossy rocky bank with roots, the far layers are misty forest and hills. '),
    # 矿境掠夺 / 新手村野外(回退)
    'battle_scene_raid_mine': (
        'Image 1 is our current battle background (an underground mine cavern with timber supports, rails, carts and lanterns); keep '
        'its theme, materials and palette (dark slate rock floor, warm lantern light, cool blue shadows) but redraw it with the new '
        'composition, adapted to a huge cavern: the raised ledge is a rock shelf carrying mine rails, carts and timber frames; behind it '
        'the cavern opens into deeper and deeper tunnel galleries and rock pillars fading into cool blue haze and darkness; instead of '
        'sky, a dim cave ceiling band with faint light shafts at the very top. '),
    # 限时副本 熔火矿脉
    'battle_scene_guard_mine': (
        'Image 1 is our current battle background (a molten-lava mine with cracked black rock and glowing orange fissures); keep its '
        'theme and palette but redraw it with the new composition, adapted to a vast volcanic cavern: the near ground is dark cracked '
        'basalt with only a few thin glowing cracks near the edges (centre calm), the raised ledge is a basalt shelf with an old mine '
        'cart and timber frame, behind it lava falls, rock pillars and smoke fading into a hazy orange glow; a dark cavern ceiling band '
        'at the very top. '),
    # 限时副本 觉醒之门
    'battle_scene_daily_awaken': (
        'Image 1 is our current battle background (a pale marble plaza before a colossal golden gate in a holy cathedral city); keep '
        'its theme and palette (pale marble, soft gold, silver-grey stone, heavenly light) but redraw it with the new composition: the '
        'near ground is worn pale marble slabs with thin gold inlay only near the edges, the raised ledge is a wide marble dais with low '
        'steps, and behind it the giant golden gate and gothic towers stand far away, pale and hazy in light mist with soft god rays. '),
    # 限时副本 秘法圣殿
    'battle_scene_daily_arcane': (
        'Image 1 is our current battle background (a dark arcane sanctum of black marble with violet runes, blue braziers and floating '
        'books); keep its theme and palette (black and indigo marble, violet arcane glow, blue flames) but redraw it with the new '
        'composition: the near ground is dark polished marble with faint rune lines only near the edges (centre calm, not a big glowing '
        'circle), the raised ledge is a marble terrace with steps and blue braziers, behind it tall pillars, floating books and a '
        'distant spired sanctum fading into violet mist. '),
    # 限时副本 深渊裂隙
    'battle_scene_daily_abyss': (
        'Image 1 is our current battle background (a blood-red abyss wasteland with jagged spires and a dark citadel); keep its theme '
        'and palette (crimson sky, black-red rock, ash) but redraw it with the new composition: the near ground is cracked dark earth '
        'with ash, the raised ledge is a jagged rock shelf, behind it black spires and the distant citadel fade into red haze and '
        'drifting ash. '),
}

NEAR_EDIT = (
    'Edit image 1. Keep the near battle ground AND the raised ledge / terrace (its front face, its top edge, and any rocks, steps or '
    'props standing on the ledge) EXACTLY as they are, same position, same size, same pixels. Replace EVERYTHING behind and above the '
    'ledge (far cliffs, ruins, trees, mist, sky, cave ceiling, background structures) with flat solid pure magenta #FF00FF, no '
    'gradient, no shadow, no anti-aliasing halo. Output the same framing and size as image 1.'
)


def run_codex(inputs, prompt, dst, tag):
    while C.other_codex_exec() > 0:
        time.sleep(10)
    before = set(os.listdir(C.GEN)) if os.path.isdir(C.GEN) else set()
    work = tempfile.mkdtemp(prefix='lc-bglayer-')
    cmd = [C.codex_exe(), 'exec', '-c', 'model="gpt-6.1-sol"', '-c', 'service_tier="default"',
           '--skip-git-repo-check', '-s', 'read-only', '-C', work]
    for i in inputs:
        cmd += ['-i', i]
    cmd.append('-')
    t0 = time.time()
    print('gen', tag, flush=True)
    r = subprocess.run(cmd, input=prompt.encode('utf-8'), capture_output=True, timeout=1500)
    text = (r.stdout + r.stderr).decode('utf-8', 'ignore')
    new_dirs = [d for d in os.listdir(C.GEN) if d not in before]
    mine = [d for d in new_dirs if d in text] or (new_dirs if len(new_dirs) == 1 else [])
    imgs = [p for d in mine for p in glob.glob(os.path.join(C.GEN, d, '*.png'))]
    if not imgs:
        print('FAIL', tag, r.returncode, text[-400:], flush=True)
        return False
    shutil.copy(max(imgs, key=os.path.getmtime), dst)
    print('ok', tag, f'{time.time() - t0:.0f}s', dst, flush=True)
    return True


def gen(name):
    """整图(2048×1152)→ 再出一张「石坎后全涂品红」的遮罩图(只取遮罩,像素用整图)。"""
    os.makedirs(OUT, exist_ok=True)
    full = os.path.join(OUT, name + '.png')
    if not os.path.exists(full):
        prompt = ('Generate ONE new image with your image generation tool. ' + SPECS[name] + LAYOUT
                  + ' Size: landscape 16:9, exactly 2048x1152.')
        if not run_codex([os.path.join(BG, name + '.png')], prompt, full, name):
            return
    near = os.path.join(OUT, name + '_nearmask.png')
    if not os.path.exists(near):
        run_codex([full], 'Generate ONE new image with your image generation tool (image edit). ' + NEAR_EDIT, near, name + ' near')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    for n in sys.argv[1:] or list(SPECS):
        gen(n)
