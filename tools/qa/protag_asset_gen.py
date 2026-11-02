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
    'protag_m_v2': ([f'{ROOT}/assets/resources/ui/hero/roster/R_PATROL_01.jpg', f'{ROOT}/assets/resources/ui/hero/roster/R_RANGER_06.jpg', f'{OUT}/protag_m_base.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'ART STYLE: match EXACTLY the hero illustrations in the FIRST two attached images (our existing in-game hero art): clean confident '
        'line art, cel shading with two or three tones, muted earthy palette, simple readable shapes. NOT semi-realistic painting, NOT airbrushed '
        'skin, NOT hyper-detailed texture, NO dramatic rim light, NO glow. Damage and dirt on the clothes only in a few places, not everywhere. '
        'POSE: relaxed natural standing pose, body turned about 20 degrees, head facing FORWARD and eyes looking straight at the viewer '
        '(NOT looking up, NOT looking to the side, NOT a heroic upward gaze), a calm slightly stubborn expression; the face is a little '
        'imperfect and individual, not a generic perfect face. Full body head to toe. ' +
        'CHARACTER (design from the THIRD image, redrawn in the style above): a lean village boy of about 18, short messy dark brown hair, '
        'faint golden glint in the eyes, plain worn linen tunic with a laced collar, leather belt with a small pouch, leather bracers, worn '
        'trousers and boots; a simple WOODEN training sword held low in his right hand, point down.'),
    'protag_f_v2': ([f'{ROOT}/assets/resources/ui/hero/roster/R_PATROL_01.jpg', f'{ROOT}/assets/resources/ui/hero/roster/R_RANGER_06.jpg', f'{OUT}/protag_f_base.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'ART STYLE: match EXACTLY the hero illustrations in the FIRST two attached images (our existing in-game hero art): clean confident '
        'line art, cel shading with two or three tones, muted earthy palette, simple readable shapes. NOT semi-realistic painting, NOT airbrushed '
        'skin, NOT hyper-detailed texture, NO dramatic rim light, NO glow. Damage and dirt on the clothes only in a few places, not everywhere. '
        'POSE: relaxed natural standing pose, body turned about 20 degrees, head facing FORWARD and eyes looking straight at the viewer '
        '(NOT looking up, NOT looking to the side, NOT a heroic upward gaze), a calm slightly stubborn expression; the face is a little '
        'imperfect and individual, not a generic perfect face. Full body head to toe. ' +
        'CHARACTER (design from the THIRD image, redrawn in the style above): a slender village girl of about 18, dark brown hair in a loose '
        'ponytail, faint golden glint in the eyes, a small golden seal sigil on the back of her left hand, plain worn linen tunic, leather belt '
        'with a small pouch, leather bracers, worn trousers and boots; a slim WOODEN practice rapier held low in her right hand, point down. '
        'Modest outfit, not revealing.'),
    'protag_m_v3': ([f'{ROOT}/assets/resources/ui/hero/roster/SSR_RON.jpg', f'{ROOT}/assets/resources/ui/hero/roster/SSR_KANE.jpg', f'{OUT}/protag_m_base.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'ART STYLE: match the SSR / UR hero illustrations in the FIRST two attached images (our premium in-game hero art): dark-fantasy '
        'semi-realistic painting, realistic face and proportions, refined brushwork, desaturated cold palette with muted browns, believable '
        'cloth and leather materials, soft directional light from the upper left. NOT chibi, NOT cel-shaded anime, NOT airbrushed plastic skin, '
        'NO glow, NO dramatic rim light. Wear and dirt only in a few deliberate places (cuffs, hem, knees), not spread evenly everywhere. '
        'POSE: a relaxed natural standing pose with weight on one leg, body turned about 25 degrees, head facing FORWARD and eyes looking '
        'straight at the viewer (NOT looking up, NOT to the side, NOT a heroic upward gaze); calm, slightly stubborn expression. The face is '
        'individual and a little imperfect (distinct nose and brows, slight asymmetry), not a generic perfect model face. Full body head to toe. ' +
        'CHARACTER (outfit design from the THIRD image): a lean village youth of about 18, short messy dark brown hair, a faint golden glint in '
        'the eyes, plain worn linen tunic with a laced collar, leather belt with a small pouch, leather bracers, worn trousers and boots; a simple '
        'WOODEN training sword (pale worn wood, clearly wood) held low in his right hand, point down.'),
    'protag_f_v3': ([f'{ROOT}/assets/resources/ui/hero/roster/SSR_LIVIA.jpg', f'{ROOT}/assets/resources/ui/hero/roster/UR_ATLAS.jpg', f'{OUT}/protag_f_base.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'ART STYLE: match the SSR / UR hero illustrations in the FIRST two attached images (our premium in-game hero art): dark-fantasy '
        'semi-realistic painting, realistic face and proportions, refined brushwork, desaturated cold palette with muted browns, believable '
        'cloth and leather materials, soft directional light from the upper left. NOT chibi, NOT cel-shaded anime, NOT airbrushed plastic skin, '
        'NO glow, NO dramatic rim light. Wear and dirt only in a few deliberate places (cuffs, hem, knees), not spread evenly everywhere. '
        'POSE: a relaxed natural standing pose with weight on one leg, body turned about 25 degrees, head facing FORWARD and eyes looking '
        'straight at the viewer (NOT looking up, NOT to the side, NOT a heroic upward gaze); calm, slightly stubborn expression. The face is '
        'individual and a little imperfect (distinct nose and brows, slight asymmetry), not a generic perfect model face. Full body head to toe. ' +
        'CHARACTER (outfit design from the THIRD image): a slender village girl of about 18, dark brown hair in a loose low ponytail with a few '
        'loose strands, a faint golden glint in the eyes, a small golden seal sigil on the back of her left hand, plain worn linen tunic, leather '
        'belt with a small pouch, leather bracers, worn trousers and boots; a slim WOODEN practice rapier (pale worn wood) held low in her right '
        'hand, point down. Modest outfit, not revealing.'),
    'protag_m_v4': ([f'{OUT}/protag_m_v3.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'The attached image is our APPROVED character. Redraw EXACTLY the same character: same face, hair, outfit, colours, weapon, pose, '
        'proportions and framing. Change ONLY the rendering quality: smooth, refined, finely blended painting like a high-end game character '
        'illustration; clean crisp silhouette edges; smooth skin; hair drawn as clean flowing locks with soft gradients; cloth and leather with '
        'subtle smooth texture. REMOVE all grain, noise, speckles, scratchy strokes, fuzzy or frayed edges and grimy dirt texture. '
        'Keep the worn look only as a few clean, clearly drawn patches and tears. Same semi-realistic dark-fantasy style, NOT anime, NOT chibi.'),
    'protag_f_v4': ([f'{OUT}/protag_f_v3.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'The attached image is our APPROVED character. Redraw EXACTLY the same character: same face, hair, outfit, colours, weapon, pose, '
        'proportions and framing. Change ONLY the rendering quality: smooth, refined, finely blended painting like a high-end game character '
        'illustration; clean crisp silhouette edges; smooth skin; hair drawn as clean flowing locks with soft gradients; cloth and leather with '
        'subtle smooth texture. REMOVE all grain, noise, speckles, scratchy strokes, fuzzy or frayed edges and grimy dirt texture. '
        'Keep the worn look only as a few clean, clearly drawn patches and tears. Same semi-realistic dark-fantasy style, NOT anime, NOT chibi.'),
    'protag_m_v5': ([f'{OUT}/protag_m_v4.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'The attached image is our APPROVED character. Redraw EXACTLY the same character, face, outfit, colours, weapon, pose and framing, '
        'with the same smooth refined rendering. Change ONLY the HAIR: neat, smooth hair drawn as a few clean defined locks with soft '
        'gradients and a clean outline; NO frizz, NO flyaway strands, NO fuzzy or wispy hair edges, NO stray single hairs sticking out. '
        'Also keep every silhouette edge of the figure crisp and clean.'),
    'protag_f_v5': ([f'{OUT}/protag_f_v4.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'The attached image is our APPROVED character. Redraw EXACTLY the same character, face, outfit, colours, weapon, pose and framing, '
        'with the same smooth refined rendering. Change ONLY the HAIR: neat, smooth hair drawn as a few clean defined locks with soft '
        'gradients and a clean outline; NO frizz, NO flyaway strands, NO fuzzy or wispy hair edges, NO stray single hairs sticking out. '
        'Also keep every silhouette edge of the figure crisp and clean.'),
    'skinref_m': ([f'{OUT}/stand_Eulenspigel.png', f'{OUT}/protag_m_v5.png'],
        'Generate ONE image, portrait 2:3 (about 1024x1536), on a plain flat dark grey background (#22252C), no shadow, no text. '
        'This is a REFERENCE for re-texturing a 2D skeletal (Spine) character: keep the EXACT pose, body proportions, silhouette, and the '
        'position, size and angle of EVERY body part and prop of the character in the FIRST image (head, torso, both arms, hands, legs, feet, '
        'cloth pieces, weapons), so each part lands in the same place. Only change what they look like: the face, hair, skin and outfit become '
        'the protagonist of the SECOND image, painted in the same smooth refined semi-realistic style as the SECOND image (NOT anime, NOT chibi). ' +
        'Mapping: his long dark coat becomes a long worn hooded traveller’s cloak of rough brown wool hanging to the ankles, keeping the same '
        'torn hem shape; under it the plain linen tunic with laced collar, leather belt with pouch, leather bracers, brown trousers and leather boots '
        'of the SECOND image; the dagger in his right hand becomes a short WOODEN training sword of the same length and angle; the greatsword hilt '
        'over his back becomes the hilt of a big WOODEN training greatsword strapped on his back; the rope at his left side becomes a plain cloth strap.'),
    'skinref_f': ([f'{OUT}/stand_Lucrecia.png', f'{OUT}/protag_f_v5.png'],
        'Generate ONE image, portrait 2:3 (about 1024x1536), on a plain flat dark grey background (#22252C), no shadow, no text. '
        'This is a REFERENCE for re-texturing a 2D skeletal (Spine) character: keep the EXACT pose, body proportions, silhouette, and the '
        'position, size and angle of EVERY body part and prop of the character in the FIRST image (head, torso, both arms, hands, legs, feet, '
        'cloth pieces, weapons), so each part lands in the same place. Only change what they look like: the face, hair, skin and outfit become '
        'the protagonist of the SECOND image, painted in the same smooth refined semi-realistic style as the SECOND image (NOT anime, NOT chibi). ' +
        'Mapping: her white armoured dress becomes the plain linen tunic, leather belt with pouch, leather bracers, brown trousers and leather boots '
        'of the SECOND image (modest, not revealing); her red cape becomes a short worn brown wool cape; the long red spear-blade in her right hand '
        'becomes a long slim WOODEN practice blade of the same length and angle; the huge spiked tower shield becomes a big plain WOODEN tower shield '
        'made of rough planks bound with dark iron bands, same size and outline but no spikes; her hair becomes the brown low ponytail of the SECOND image.'),
    'protag_f_v6': ([f'{OUT}/protag_f_v5.png', f'{OUT}/stand_Lucrecia_reskin.png'],
        'Generate ONE image, tall portrait 2:3 (about 1024x1536). ' + ALPHA +
        'The FIRST image is our APPROVED character. Redraw EXACTLY the same girl, face, outfit, colours, wooden rapier, pose, framing and the same '
        'smooth refined semi-realistic rendering. Change ONLY the HAIR: a short chin-length brown bob with a soft side part, like the field '
        'character in the SECOND image; no ponytail. Neat clean locks, no frizz, no flyaway strands, crisp clean edges.'),
    'skinref_m2': ([f'{OUT}/stand_IshmaelA.png', f'{OUT}/protag_m_v5.png'],
        'Generate ONE image, portrait 2:3 (about 1024x1536), on a plain flat dark grey background (#22252C), no shadow, no text. '
        'This is a REFERENCE for re-texturing a 2D skeletal (Spine) character: keep the EXACT pose, body proportions, silhouette, and the '
        'position, size and angle of EVERY body part and the sword of the character in the FIRST image, so each part lands in the same place. '
        'Only change what they look like: the character becomes the protagonist of the SECOND image, painted in the same smooth refined '
        'semi-realistic style as the SECOND image (NOT anime, NOT chibi). There is NO armour at all: the bulky armour plates become layered '
        'worn cloth and leather that follow the same outline (a hooded brown wool travelling cloak over the shoulders, the linen tunic, leather '
        'belt with pouch, leather bracers, brown trousers, leather boots); the full helmet becomes the bare head with the face and hair of the '
        'SECOND image; the red cape becomes a worn brown wool cape; the long red sword becomes a long pale WOODEN training sword of the same '
        'length and angle. ONLY the sword, no shield, no second weapon. ' + 'The character is the young man of the SECOND image.'),
    'skinref_f2': ([f'{OUT}/stand_IshmaelA.png', f'{OUT}/protag_f_v6.png'],
        'Generate ONE image, portrait 2:3 (about 1024x1536), on a plain flat dark grey background (#22252C), no shadow, no text. '
        'This is a REFERENCE for re-texturing a 2D skeletal (Spine) character: keep the EXACT pose, body proportions, silhouette, and the '
        'position, size and angle of EVERY body part and the sword of the character in the FIRST image, so each part lands in the same place. '
        'Only change what they look like: the character becomes the protagonist of the SECOND image, painted in the same smooth refined '
        'semi-realistic style as the SECOND image (NOT anime, NOT chibi). There is NO armour at all: the bulky armour plates become layered '
        'worn cloth and leather that follow the same outline (a hooded brown wool travelling cloak over the shoulders, the linen tunic, leather '
        'belt with pouch, leather bracers, brown trousers, leather boots); the full helmet becomes the bare head with the face and hair of the '
        'SECOND image; the red cape becomes a worn brown wool cape; the long red sword becomes a long pale WOODEN training sword of the same '
        'length and angle. ONLY the sword, no shield, no second weapon. ' + 'The character is the young woman of the SECOND image (short brown bob, a slimmer feminine figure inside the same outline, modest).'),
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
