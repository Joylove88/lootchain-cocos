# -*- coding: utf-8 -*-
"""D26 异界神州英雄美术(2026-11-07):以骨骼待机透明立绘为参考,经本机 Codex(GPT 订阅)生成
  roster  = 横版半身卡面 16:9(名册卡 / 属性详情头条 / 契约之选卡)
  avatar  = 1:1 胸像头像
  emblem  = 1:1 大招徽章内芯(11-08;外圈金环统一,d26_art_install.py emblem 把内芯裁圆垫到 ult_emblem 金环下)
            参考图 = 现有三枚徽章内芯拼成的画风样张(不参考立绘),题材按 EMBLEM_SUBJECT 逐个写
            (11-08 用户:这套「AI 感太强」,要按现在的 B 毛玻璃主题 → 改用 emblem_paint / emblem_glyph)
  emblem_paint = B 主题大招徽章:哑光手绘、单一主体、降饱和、无发光粒子、无金环(界面自己画细白圈)
  emblem_glyph = B 主题大招徽章:深色圆底 + 香槟金 / 白色线描符号(对照方向)
            参考图 = 现在 B 风格技能面板截图(D:/骨骼动画素材/d26_art/_ref/skill_panel_b.png)
参考图:fxprev/render_portrait.py 渲出的 D:/骨骼动画素材/d26_portrait/<资源名>.png(透明底,垫中灰底后送参考)。
产物:D:/骨骼动画素材/d26_art/<kind>/<英雄码>.png(已存在则跳过,可断点续跑)。一次只跑一张(按生成时间取图会串)。
用法:python tools/qa/d26_art_gen.py [roster|avatar ...] [--only UR_LVBU,SR_HUATUO]
"""
import glob, os, shutil, subprocess, sys, tempfile, time
from PIL import Image

PORTRAIT = 'D:/骨骼动画素材/d26_portrait'
OUT = 'D:/骨骼动画素材/d26_art'
MODEL = os.environ.get('CODEX_MODEL', 'gpt-6.1-sol')  # 本机 config.toml 写的 gpt-5.5 用订阅账号跑不了
GEN_DIR = os.path.expanduser('~/.codex/generated_images')

# 英雄码 → 资源名
HEROES = {
    'UR_ZHAOYUN': 'sz_zhaoyun', 'UR_ZHUGELIANG': 'sz_zhugeliang', 'UR_LVBU': 'sz_lvbu',
    'SSR_SUNWUKONG': 'sz_sunwukong', 'SSR_DIAOCHAN': 'sz_diaochan', 'SSR_SUNSHANGXIANG': 'sz_sunshangxiang', 'SSR_ZHANGFEI': 'sz_zhangfei',
    'SR_YANGJIAN': 'sz_yangjian', 'SR_HUATUO': 'sz_huatuo', 'SR_ZHANGCHUNHUA': 'sz_zhangchunhua', 'SR_ZHANGJIAO': 'sz_zhangjiao',
    'SR_HUANGZHONG': 'sz_huangzhong', 'SR_CAOREN': 'sz_caoren',
    'R_DAQIAO': 'sz_daqiao', 'R_HUAXIONG': 'sz_huaxiong', 'R_GANNING': 'sz_ganning', 'R_XUNYOU': 'sz_xunyou',
    'R_TAISHICI': 'sz_taishici', 'R_DIANWEI': 'sz_dianwei',
}

COMMON = ('Use the attached image as the exact character design reference: keep the same face, hairstyle, outfit colors, armor '
          'ornaments, accessories and signature weapon. Re-draw it as a high-end game illustration in a semi-realistic painted '
          'style (detailed rendering, cinematic rim light, natural skin, not chibi, not cartoon, not flat cel shading). '
          'No text, no letters, no logo, no watermark, no UI, no frame, no border.')
PROMPTS = {
    'roster': ('Create ONE horizontal 16:9 hero card illustration (landscape, about 1672x941). ' + COMMON +
               ' Composition: waist-up / half-body shot of this single character, centered, body turned 3/4 toward the viewer, '
               'face fully visible in the upper-middle area, weapon partly in frame. Background: a mythic ancient Chinese otherworld - '
               'misty mountain peaks, ruined palace pavilions and stone stairs at dusk, drifting embers, kept dark and desaturated '
               'with soft depth of field so the character clearly stands out.'),
    'avatar': ('Create ONE square 1:1 avatar portrait (about 1024x1024). ' + COMMON +
               ' Composition: head-and-shoulders bust of this single character, face centered and large, looking at the viewer, '
               'both eyes visible. Background: dark smoky gradient with a soft glow in the character\'s main color, nothing else.'),
}

# 大招徽章内芯:技能名 + 画面(主色互相拉开,和同色系老英雄徽章也避开)
EMBLEM_SUBJECT = {
    'UR_LVBU': '无双·神鬼乱舞: a crimson Chinese halberd (fangtian ji) sweeping in a huge arc through swirling black-and-blood-red demonic ghost flames; palette deep crimson and black',
    'UR_ZHAOYUN': '龙胆·百鸟朝凤: a silver dragon-head spear thrusting forward while a radiant flock of white-gold phoenix birds spirals around it; palette silver white, pale gold, sky azure',
    'UR_ZHUGELIANG': '卧龙·借东风: a crane-feather fan summoning a swirling teal east wind over a glowing bagua star array; palette teal, jade and soft gold',
    'SSR_SUNWUKONG': '齐天·大闹天宫: a golden cudgel (ruyi jingu bang) smashing down amid golden auspicious clouds and shattered heavenly palace roofs; palette molten gold and orange',
    'SSR_DIAOCHAN': '闭月·倾国之舞: flowing pink silk ribbons dancing around a pale crescent moon, peach blossom petals falling; palette rose pink, moonlight lavender',
    'SSR_SUNSHANGXIANG': '枭姬·红莲炮: a blazing red lotus blossom exploding out of a cannon muzzle blast, fiery lotus petals and sparks; palette scarlet lotus red and bright orange flame',
    'SSR_ZHANGFEI': '燕人·丈八蛇矛: a long serpent-blade spear (snake-shaped wavy blade) held diagonally, with concentric pale cyan sonic shockwave rings of a roar bursting outward, cracked earth and dust; palette dark earth brown and black with pale cyan shockwaves (no gold, no orange)',
    'SR_YANGJIAN': '显圣·天眼神光: a vertical third eye opening and firing a beam of holy golden light, a three-pointed double-edged blade below; palette golden white beam on deep indigo',
    'SR_HUATUO': '青囊·回春药炉: an ancient bronze herbal cauldron releasing swirling jade-green healing mist with floating medicinal herbs and leaves; palette jade green and bronze',
    'SR_ZHANGCHUNHUA': '绝情·幽镰伤逝: a ghostly curved scythe slicing through withering violet flower petals and wisps of spirit smoke; palette violet, dusky purple and silver',
    'SR_ZHANGJIAO': '太平·黄天雷劫: a glowing yellow Taoist talisman paper with lightning bolts striking down from a storm vortex; palette electric yellow and storm grey',
    'SR_HUANGZHONG': '烈弓·定军一箭: a single golden arrow shot from a great drawn bow, piercing straight through, wind streaks and a distant mountain at dusk; palette amber gold and dusk blue',
    'SR_CAOREN': '铁壁·坚城不破: a massive iron tower shield planted in front of fortress walls, blue protective light rippling across it; palette steel grey and cold blue',
    'R_DAQIAO': '祈愿·明灯照归: glowing paper lanterns floating up over calm night water with reflections; palette warm lantern gold and night blue',
    'R_HUAXIONG': '骁将·赤刃斩: a heavy broad saber (dadao) cutting a single blazing crescent slash, embers flying; palette red-orange and charcoal',
    'R_GANNING': '锦帆·百骑劫营: brocade sails and twin short blades crossing over a dark river at night, small bronze bells and splashing water; palette teal river night with brocade red accents',
    'R_XUNYOU': '奇策·墨卷连环: an unrolling aged parchment scroll releasing chained flowing black ink-brush strokes that link into a ring; palette black ink on pale parchment with cool cyan-blue glow (no purple, no violet)',
    'R_TAISHICI': '神射·连珠火箭: a rapid volley of arrows wrapped in white-hot blue flame streaking in a line across a dark night sky; palette electric blue-white fire on deep navy (no orange, no red)',
    'R_DIANWEI': '恶来·双戟镇门: two crossed heavy iron halberds (ji) guarding a massive iron-studded fortress gate; palette cold gunmetal grey and dark rust red, gritty steel (no gold, no yellow)',
}
EMBLEM_STYLE_REF = 'D:/project/lootchain-cocos/assets/resources/ui/hero/ult_emblem'
PROMPTS['emblem'] = (
    'Create ONE square 1:1 skill emblem artwork (about 1024x1024). The attached sheet shows three existing skill emblem cores of '
    'this game: match their painting style exactly - dense glowing magical energy, high contrast, saturated, rich detail, painted '
    'fantasy game icon art, dark vignette edges. Subject of the new emblem (the skill name is only for meaning, do not write it): {subject}. '
    'Composition: one strong central motif filling the whole square edge to edge with background energy, centered and readable at small '
    'size, because it will be cropped into a circle. No ring, no frame, no border, no medallion rim, no text, no letters, no logo, no watermark, '
    'no human faces.')

EMBLEM_B_REF = 'D:/骨骼动画素材/d26_art/_ref/skill_panel_b.png'
_EMBLEM_B_COMMON = (
    'The attached image is a screenshot of this game\'s current UI (modern dark frosted-glass panels, thin 1px light outlines, '
    'one soft champagne-gold accent #E3C48A, white and grey text, calm and premium). The round skill icons in it (ornate spiky gold rings '
    'with red gems, saturated glowing magic) are the OLD style and look too AI-generated - do NOT copy them. '
    'Create ONE new square 1:1 skill emblem (about 1024x1024) that fits this frosted-glass UI. It will be cropped to a circle and shown '
    'at about 64-120 px inside a thin white circle, so: no ring, no frame, no border, no medallion rim, no text, no letters, no logo, no watermark. '
    'Subject (the skill name is only for meaning, do not write it): {subject}. '
    'Even if the subject mentions fire, light, lightning or energy, show it as calm shapes: NO glow, NO bloom, NO sparkles, NO particles, '
    'NO lens flare, NO neon, NO energy aura, no busy swirling background. ')
PROMPTS['emblem_paint'] = (_EMBLEM_B_COMMON +
    'Style: a refined hand-painted icon, matte like gouache or oil on paper with subtle brush texture, soft single directional light, '
    'one bold central motif with a clear silhouette readable at small size, generous negative space, muted desaturated palette '
    '(deep charcoal-navy background with a gentle vignette, the subject\'s hue toned down, small aged champagne-gold accents). '
    'Realistic and premium, not cartoon, no thick outlines, no plastic shine, no grain noise.')
PROMPTS['emblem_glyph'] = (_EMBLEM_B_COMMON +
    'Style: a minimal emblem glyph - the motif drawn as clean champagne-gold and white line art with uniform stroke weight and a few '
    'flat filled shapes, centered on a smooth dark charcoal-navy circular field with a very faint tint of the subject\'s hue; '
    'elegant, symmetrical where possible, like premium modern RPG skill icons; flat, no 3D bevel, no gradient glow.')


def emblem_b_ref(tmp):
    im = Image.open(EMBLEM_B_REF).convert('RGB')
    p = os.path.join(tmp, 'ref.png')
    im.save(p)
    return p


def emblem_style_ref(tmp):
    # 三枚现有徽章的内芯(圆心 256,254,半径 147)横排成画风样张
    cores = []
    for code in ('UR_ARTHAS', 'SR_WITCH_03', 'UR_SERAPHINA'):
        im = Image.open(os.path.join(EMBLEM_STYLE_REF, code + '.png')).convert('RGB')
        cores.append(im.crop((256 - 147, 254 - 147, 256 + 147, 254 + 147)).resize((360, 360), Image.LANCZOS))
    sheet = Image.new('RGB', (360 * 3 + 80, 400), (24, 24, 28))
    for i, c in enumerate(cores):
        sheet.paste(c, (20 + i * 380, 20))
    p = os.path.join(tmp, 'ref.png')
    sheet.save(p)
    return p


def find_codex():
    base = os.path.join(os.environ['LOCALAPPDATA'], 'OpenAI', 'Codex', 'bin')
    exes = glob.glob(os.path.join(base, '*', 'codex.exe'))
    if not exes:
        sys.exit('codex.exe not found under ' + base)
    return max(exes, key=os.path.getmtime)


def reference(asset, tmp):
    im = Image.open(os.path.join(PORTRAIT, asset + '.png')).convert('RGBA')
    im.thumbnail((900, 900), Image.LANCZOS)
    bg = Image.new('RGBA', (im.width + 80, im.height + 80), (70, 72, 80, 255))
    bg.alpha_composite(im, (40, 40))
    p = os.path.join(tmp, 'ref.png')
    bg.convert('RGB').save(p)
    return p


def gen(codex, kind, code, asset):
    dst = os.path.join(OUT, kind, code + '.png')
    if os.path.exists(dst):
        return 'skip'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='d26art_')
    ref = emblem_style_ref(tmp) if kind == 'emblem' else emblem_b_ref(tmp) if kind.startswith('emblem_') else reference(asset, tmp)
    prompt = PROMPTS[kind].replace('{subject}', EMBLEM_SUBJECT.get(code, ''))
    t0 = time.time()
    r = subprocess.run([codex, 'exec', '--skip-git-repo-check', '-m', MODEL, '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '-C', tmp, '-i', ref, '-'],
                       input=prompt, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    news = [p for p in glob.glob(os.path.join(GEN_DIR, '**', '*.png'), recursive=True) if os.path.getmtime(p) >= t0 - 1]
    shutil.rmtree(tmp, ignore_errors=True)
    if not news:
        return f'FAILED rc={r.returncode} {r.stdout[-400:]} {r.stderr[-400:]}'
    src = max(news, key=os.path.getmtime)
    shutil.copyfile(src, dst)
    w, h = Image.open(dst).size
    return f'ok {w}x{h} {time.time() - t0:.0f}s'


def main():
    args = sys.argv[1:]
    only = set()
    if '--only' in args:
        i = args.index('--only')
        only = set(args[i + 1].split(','))
        del args[i:i + 2]
    kinds = args or ['roster', 'avatar']
    codex = find_codex()
    for kind in kinds:
        for code, asset in HEROES.items():
            if only and code not in only:
                continue
            print(f'[{kind}] {code}: {gen(codex, kind, code, asset)}', flush=True)


if __name__ == '__main__':
    main()
