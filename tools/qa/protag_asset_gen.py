"""docs/60 主角开场第一批素材:按顺序逐张调 gen_proto.py 出图(同一时间只跑一个)。

用法:python tools/qa/protag_asset_gen.py [名字 ...]   不带参数 = 全部;已存在的跳过(删掉文件可重出)
产物:周报截图/2026-11-02_主角/assets_src/<名字>.png(原始图,入库前另行裁切 / 缩放)
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROTO = os.path.join(ROOT, '周报截图', '2026-11-02_主角', 'proto')
OUT = os.path.join(ROOT, '周报截图', '2026-11-02_主角', 'assets_src')
GEN = os.path.join(ROOT, 'tools', 'qa', 'gen_proto.py')

STYLE = ('Semi-realistic painted illustration, matte, grounded proportions, soft natural light, '
         'consistent with the attached reference (NOT anime, NOT chibi, NOT glossy cartoon, NOT photo-real). ')
ALPHA = ('Fully TRANSPARENT background (real alpha channel): no ground, no floor, no platform, no shadow, '
         'no scenery, no text, nothing else in the image. The whole figure is visible and not cropped. ')

ASSETS = {
    'protag_m_base': ([f'{PROTO}/protagonist_create_b.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA + STYLE +
        'Copy EXACTLY the young male protagonist standing in the centre of the attached prototype: a lean young man of about 18, '
        'short messy dark hair, determined eyes with a faint golden glint, plain worn linen tunic with laces, leather belt with a pouch, '
        'leather bracers, worn trousers and boots. He holds a simple WOODEN training sword (pale worn wood, clearly wood, NOT metal) '
        'low in his right hand. Full body, standing, 3/4 front view, looking slightly upward, same pose as in the prototype.'),
    'protag_f_base': ([f'{PROTO}/protagonist_create_b_female.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA + STYLE +
        'Copy EXACTLY the young female protagonist standing in the centre of the attached prototype: a slender young woman of about 18, '
        'dark hair in a loose ponytail with loose strands, determined eyes with a faint golden glint, plain worn linen tunic, leather belt '
        'with a pouch, leather bracers, worn trousers and boots; a faint small golden seal sigil on the back of her left hand. She holds a '
        'slim WOODEN practice rapier (pale worn wood, simple wooden cross-guard, clearly wood) low in her right hand. Full body, standing, '
        '3/4 front view, same pose as in the prototype.'),
    'yedi_m': ([f'{PROTO}/prologue_char_ref_v2.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA + STYLE +
        'Copy EXACTLY the LEFT character of the attached reference sheet, the dark emperor 夜帝: long wavy black hair, pale stern face, '
        'tall spiked dark-gold crown, ornate layered dark armour with thin gold filigree, long torn dark-purple cape, large black bat-like '
        'energy wings half-spread, a great sword with a glowing pale-violet blade planted point-down in front of him, both hands resting '
        'on its pommel. Full body, standing, facing the viewer, majestic and calm. No wound, no cracks on the armour.'),
    'yedi_f': ([f'{PROTO}/prologue_char_ref_v2.png', f'{PROTO}/protagonist_create_b_female.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA + STYLE +
        'The FEMALE version of 夜帝 (the dark empress, the past life of the girl in the second image). Same design language as the LEFT '
        'character of the first image: a tall regal woman with long wavy black hair, pale stern beautiful face, tall spiked dark-gold crown, '
        'ornate layered dark armour with thin gold filigree (a feminine cut, NOT revealing), a long torn dark-purple cape, large black '
        'bat-like energy wings half-spread, a slender great sword with a glowing pale-violet blade planted point-down in front of her, both '
        'hands resting on its pommel. Full body, standing, facing the viewer, majestic and calm.'),
    'zero_m': ([f'{PROTO}/protagonist_create_b.png', f'{PROTO}/prologue_char_ref_v2.png'],
        'Generate ONE image, square (about 1024x1024). ' + ALPHA + STYLE +
        'The soul spirit "零": a small floating translucent spirit shaped like a miniature of the dark emperor (LEFT character of the second '
        'image): a hooded cape and a dark armoured face-mask with a small spiked crown, NO visible face except two small glowing GOLDEN eyes; '
        'the lower body fades into a soft wisp of pale blue-white flame instead of legs. Semi-transparent (about 70% opacity), cool '
        'blue-grey with thin gold edges, as the small spirit near the boy\'s shoulder in the first image. Centred, floating, facing the viewer.'),
    'zero_f': ([f'{OUT}/zero_m.png', f'{PROTO}/protagonist_create_b_female.png'],
        'Generate ONE image, square (about 1024x1024). ' + ALPHA + STYLE +
        'The soul spirit "零" (female variant). Match the FIRST image EXACTLY in rendering, colour, transparency and darkness (same cool '
        'blue-grey semi-transparent body with thin gold edges, same dark face-mask, same pale flame wisp, NOT whiter, NOT brighter), '
        'only make it a miniature of a dark EMPRESS: a hooded cape, '
        'long hair strands, a dark armoured face-mask with a small spiked crown, NO visible face except two small glowing GOLDEN eyes; the '
        'lower body fades into a soft wisp of pale blue-white flame instead of legs. Semi-transparent (about 70% opacity), cool blue-grey '
        'with thin gold edges, like the small spirit near the girl\'s shoulder in the first image. Centred, floating, facing the viewer.'),
    'zero_m_portrait': ([f'{OUT}/zero_m.png', f'{PROTO}/awaken_b.png'],
        'Generate ONE image, square (about 1024x1024). ' + STYLE +
        'A portrait bust of the soul spirit "零" from the FIRST image (same hood, same small spiked crown on the hood, same dark armoured '
        'face-mask, same cool blue-grey translucent cape with gold edges; NO horns, NO crescent helm), framed like the round portrait in the '
        'dialogue card of the second image: two glowing golden eyes, a pale flame wisp at the shoulders, centred, head and '
        'shoulders filling about 75% of the frame, on a plain very dark blue-grey background with a soft vignette. No frame, no ring, no text.'),
    'zero_f_portrait': ([f'{OUT}/zero_f.png', f'{OUT}/zero_m_portrait.png'],
        'Generate ONE image, square (about 1024x1024). ' + STYLE +
        'A portrait bust of the FEMALE soul spirit "零" from the FIRST image (same hood, crown, face-mask, long hair strands, same cool '
        'blue-grey translucent body with gold edges), rendered and framed EXACTLY like the SECOND image (same lighting, same pale blue '
        'flame wisps, same background, same size in frame): a dark armoured face-mask with a small spiked crown, a hood with long hair strands, two glowing golden '
        'eyes, a pale flame wisp at the shoulders, centred, head and shoulders filling about 75% of the frame, on a plain very dark '
        'blue-grey background with a soft vignette. No frame, no ring, no text.'),
    'soul_sea_bg': ([f'{PROTO}/protagonist_create_b.png'],
        'Generate ONE image, wide 16:9 (about 1920x1080). No UI, no text, NO characters, NO spirits, NO ghost silhouettes. ' + STYLE +
        'Copy ONLY the background of the attached prototype: the dim cool blue-grey "sea of souls" void with soft mist, a calm misty sea '
        'surface, a few distant tiny floating islands with small glowing buildings, faint stars; and the round engraved dark stone platform '
        'in the lower centre-left (empty). Slightly darker towards the right third. No particles, no light rays, no lens flare.'),
    'skill_slash': ([f'{PROTO}/protagonist_create_b.png'],
        'Generate ONE image, square (about 1024x1024). A single flat game skill ICON glyph in soft champagne gold (#E3C48A), '
        'clean bold shapes with crisp edges and uniform stroke weight, centred, filling about 70% of the canvas, on a PURE BLACK '
        'background (#000000). No circle, no ring, no frame, no badge, no text, no glow, no gradient background. Modern minimal '
        'dark-fantasy UI style, matching the gold line icons in the attached prototype panel. ' +
        'Subject: a sword slashing diagonally with a curved crescent of soul energy trailing behind the blade (skill "魂斩").'),
    'skill_seal': ([f'{PROTO}/protagonist_create_b.png'],
        'Generate ONE image, square (about 1024x1024). A single flat game skill ICON glyph in soft champagne gold (#E3C48A), '
        'clean bold shapes with crisp edges and uniform stroke weight, centred, filling about 70% of the canvas, on a PURE BLACK '
        'background (#000000). No circle, no ring, no frame, no badge, no text, no glow, no gradient background. Modern minimal '
        'dark-fantasy UI style, matching the gold line icons in the attached prototype panel. ' +
        'Subject: a four-pointed star seal sigil bursting outward, small shards radiating from it (skill "契印爆发").'),
    'skill_step': ([f'{PROTO}/protagonist_create_b.png'],
        'Generate ONE image, square (about 1024x1024). A single flat game skill ICON glyph in soft champagne gold (#E3C48A), '
        'clean bold shapes with crisp edges and uniform stroke weight, centred, filling about 70% of the canvas, on a PURE BLACK '
        'background (#000000). No circle, no ring, no frame, no badge, no text, no glow, no gradient background. Modern minimal '
        'dark-fantasy UI style, matching the gold line icons in the attached prototype panel. ' +
        'Subject: a dashing swordsman silhouette in mid-stride with two fading afterimage silhouettes behind him (skill "残影步"), elegant, NOT clip-art.'),
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(ASSETS)
    for name in names:
        refs, prompt = ASSETS[name]
        out = os.path.join(OUT, f'{name}.png')
        if os.path.exists(out):
            print(f'[skip] {name}')
            continue
        txt = os.path.join(OUT, f'{name}.txt')
        with open(txt, 'w', encoding='utf-8') as f:
            f.write(prompt)
        print(f'[gen] {name}', flush=True)
        r = subprocess.run([sys.executable, GEN, '--prompt', txt, '--out', out, '--ref', *refs, '--timeout', '900'])
        print(f'[{"ok" if r.returncode == 0 and os.path.exists(out) else "FAIL"}] {name}', flush=True)


if __name__ == '__main__':
    main()
