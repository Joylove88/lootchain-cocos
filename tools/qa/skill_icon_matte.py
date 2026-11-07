# -*- coding: utf-8 -*-
"""技能图标换 B 主题哑光手绘(2026-11-08 用户:异界神州徽章选 A 哑光手绘后「一起换成哑光」)。

覆盖:
  ult     老英雄大招徽章 22 + 主角 PROTAGONIST + 下架英雄兜底 GENERIC → ui/hero/ult_emblem/<码>.png(384×384 圆形透明)
  passive 被动技能图标 10 → ui/hero/proto/sk_<效果>.png(256×256 圆形透明)
  skill   主角四键技能 4(五段连招 / 重斩 / 突进斩 / 旋风斩)→ ui/hero/proto/sk_p_<键>.png(256×256,题材对齐野外 HUD 按钮)
题材沿用老图的主体(玩家认得出是谁的),只换画风;提示词 = d26_art_gen.PROMPTS['emblem_paint'](用户确认的 A 口径),
参考图 = 现在 B 技能面板截图。异界神州 19 张走 d26_art_gen.py emblem_paint(同一口径)。

用法:
  python tools/qa/skill_icon_matte.py gen [--only UR_ARTHAS,sk_stun]    # 生成到 D:/骨骼动画素材/skill_icon_matte(已存在跳过,可断点续跑)
  python tools/qa/skill_icon_matte.py install                           # 先备份旧图到 素材原始备份/skill-icons-goldring-20261108,再裁圆覆盖
一次只跑一张(按生成时间取图会串)。
"""
import glob, os, shutil, subprocess, sys, tempfile, time
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import d26_art_gen as G  # noqa: E402
from d26_art_install import write_meta  # noqa: E402

ROOT = r'D:\project\lootchain-cocos'
RES = os.path.join(ROOT, 'assets', 'resources')
OUT = 'D:/骨骼动画素材/skill_icon_matte'
BACKUP = os.path.join(ROOT, '素材原始备份', 'skill-icons-goldring-20261108')
ULT_DIR = os.path.join(RES, 'ui', 'hero', 'ult_emblem')
PASSIVE_DIR = os.path.join(RES, 'ui', 'hero', 'proto')

ULT = {
    'UR_ARTHAS': '永夜·裂空龙斩: a fire dragon coiling and diving through a night sky above a great sword slash; palette midnight blue with ember gold-orange',
    'UR_ATLAS': '圣铠·天启旋盾: a heavy golden crusader tower shield with an engraved cross, a ring of teal wind circling it; palette teal and aged gold',
    'UR_AURELIA': '苍翎·翠翎风暴: a vortex storm of emerald green feathers spiraling inward to the center; palette emerald and sage green',
    # 11-08 首版是一簇冰晶,和被动「冰冻」sk_freeze 撞图 → 改冰封漩涡
    'UR_EVELYN': '深渊·冰狱湮灭: a frozen abyssal whirlpool seen from above - a deep indigo vortex spiraling inward, its rim ringed with jagged ice shards, frost spreading outward (NOT a crystal cluster); palette icy pale blue and deep indigo',
    'UR_NYX': '影刃·血影绞杀: two crossed curved daggers trailing a crimson shadow; palette black and deep blood red',
    'UR_SERAPHINA': '晨星·月华圣辉: a four-pointed morning star rising above a silver crescent moon; palette silver white and pale gold on dark blue',
    'SSR_KANE': '白银·圣枪穿刺: a silver holy lance thrusting diagonally with wind streaks; palette silver and cool white on slate',
    'SSR_LIVIA': '夜烬·焚世之焰: a twisting tornado pillar of dark flame with a curved scythe silhouette inside; palette ember red and charcoal',
    'SSR_MICHAEL': '圣光·雷霆裁决: a golden judgement sword pointing down with blue lightning bolts behind it; palette gold and electric blue on dark',
    'SSR_RON': '灰烬·杀星一闪: a dark four-point throwing star split by one diagonal slash, ash and embers; palette ash grey and burnt orange',
    'SR_ABYSS_06': '深渊·冥狱之环: a dark void portal ring framed by runic chains; palette dark navy with cold violet runes',
    'SR_BLADE_04': '断刃·旋刃风暴: a whirlwind of broken sword blades spinning around the center; palette steel grey and pale cyan',
    'SR_PALADIN_02': '圣盾·圣纹壁垒: a golden paladin kite shield with an engraved holy sigil and rays behind it; palette warm gold and ivory',
    'SR_PRIEST_01': '银色·圣愈祷言: an ornate silver cross wreathed with green healing leaves and small petals; palette silver and soft green',
    'SR_SNIPER_05': '峡谷·狂裂爆矢: a heavy crossbow bolt bursting through shattering canyon rock; palette rust orange and sandstone',
    'SR_WITCH_03': '契约·朔夜降临: a black new moon above a contract sigil drawn in violet lightning; palette black and magenta-purple',
    'R_ACOLY_02': '祈福·微光庇护: a small warm candle flame cupped inside a translucent golden protective sphere; palette warm amber',
    'R_CULT_05': '低语·暗蚀诅咒: a hooded skull emerging from sickly green curse smoke; palette poison green and black',
    'R_GUARD_07': '城门·盾锋回斩: a round bronze buckler with a silver crescent slash sweeping around it; palette bronze and steel',
    'R_PATROL_01': '王国·誓约结界: a golden lion head emblem on a royal blue banner; palette royal blue and gold',
    'R_RANGER_06': '荒原·猎鹰降临: a falcon diving with wings spread wide over wild grassland; palette brown and teal',
    'R_SCOUT_03': '灰谷·血镰绝影: a blood-red sickle sweeping in a dark crescent arc; palette dark red and smoky grey',
    # 11-08 首版整体太暗,小尺寸认不出 → 剑改亮、虚影提亮
    'PROTAGONIST': '夜帝残影: an upright longsword with a champagne-gold hilt and pale silver blade, behind it a large translucent pale violet-grey silhouette of a crowned night emperor raising his own blade; clear contrast against a deep navy background, readable at small size; palette pale silver, champagne gold and soft violet-grey',
    'GENERIC': '终极技能: a single upright sword crossed with a stylized flame; palette charcoal and aged gold',
}
# 被动名与效果一一对应(LobbyHeroDetailPanelRenderer.describeHeroSkillEffect):题材必须照「名字字面」画,玩家一眼对上。
# 11-08 用户「名字和图标不对版」:眩晕画成闪电、溅射画成八芒星、荆棘反弹没有荆棘、力量强化只是一把剑、冰封冻结只是冰晶 → 重写这 5 条。
PASSIVE = {
    'sk_atkUp': '力量强化 (attack power up): a clenched armored gauntlet fist raised upward, knuckles forward, conveying raw strength; palette crimson and dark steel',
    'sk_freeze': '冰封冻结 (freeze an enemy in place): a monster claw sealed inside a solid block of clear ice, frost creeping over the block; palette pale ice blue and white',
    'sk_hpUp': '生命强化: a red heart with a small plus cross; palette deep red',
    'sk_lifesteal': '吸血: a single drop of blood between two curved fangs; palette dark red',
    'sk_reflect': '荆棘反弹 (thorns that strike back at attackers): a round shield wrapped in dark thorny vines with sharp spikes, a few thorns lashing outward; palette dark green-brown thorns and steel',
    'sk_shield': '护盾: a translucent hexagon-patterned protective dome; palette pale cyan blue',
    'sk_speed': '速度: a pair of swept feathered wings; palette olive and soft gold',
    'sk_splash': '溅射 (splash damage hitting nearby enemies): one heavy impact crater in the center whose shockwave splashes outward onto two smaller enemy silhouettes on its left and right, debris flying sideways; palette amber orange and charcoal',
    'sk_stun': '眩晕 (stun / daze): a dented horned helmet with a ring of small spinning stars circling above it, dizzy swirl lines; palette steel grey and soft yellow stars',
    'sk_truePierce': '真伤穿透: a red arrow piercing through a cracked armor plate; palette red and bronze',
}
PASSIVE_NOTE = (' This is a small passive-skill icon: keep it ONE simple symbol, centered, with very little background detail '
                'so it reads at 48 px. The symbol must literally depict the skill name so players can match name and icon.')

# 主角四键技能(野外 J / K / L / I,夜帝):题材对齐野外 HUD 按钮线稿 ui/glass/hud_sword / hud_slash / hud_dash / hud_whirl,
# 详情页与按钮是同一个意象(原来借被动图标:重斩 = 溅射星、旋风斩 = 眩晕闪电,完全不对版)。
SKILL = {
    'sk_p_combo': '五段连招 (five-hit sword combo): a longsword in the center surrounded by five sequential crescent slash trails at different angles (upward, horizontal sweep, overhead, forward thrust, leaping down-slash); palette pale silver and soft violet-grey',
    'sk_p_heavy': '重斩 (charged heavy cleave): one huge crescent slash arc cleaving straight down from a two-handed greatsword, the ground cracking under the impact; palette steel silver and ember orange',
    'sk_p_dash': '突进斩 (dash forward and slash): a sword thrusting horizontally forward with strong forward speed lines and a faint afterimage trail behind it; palette pale silver and cool blue',
    'sk_p_whirl': '旋风斩 (spinning slash around oneself): a sword sweeping a full 360-degree circular slash ring around the center, whirlwind arcs; palette pale silver and teal',
}


def targets():
    for key, subject in ULT.items():
        yield key, subject, 'ult'
    for key, subject in PASSIVE.items():
        yield key, subject, 'passive'
    for key, subject in SKILL.items():
        yield key, subject, 'skill'


def gen(codex, key, subject, kind):
    dst = os.path.join(OUT, key + '.png')
    if os.path.exists(dst):
        return 'skip'
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='matteicon_')
    ref = G.emblem_b_ref(tmp)
    prompt = G.PROMPTS['emblem_paint'].replace('{subject}', subject) + (PASSIVE_NOTE if kind in ('passive', 'skill') else '')
    t0 = time.time()
    r = subprocess.run([codex, 'exec', '--skip-git-repo-check', '-m', G.MODEL, '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '-C', tmp, '-i', ref, '-'],
                       input=prompt, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    news = [p for p in glob.glob(os.path.join(G.GEN_DIR, '**', '*.png'), recursive=True) if os.path.getmtime(p) >= t0 - 1]
    shutil.rmtree(tmp, ignore_errors=True)
    if not news:
        return f'FAILED rc={r.returncode} {r.stdout[-400:]} {r.stderr[-400:]}'
    shutil.copyfile(max(news, key=os.path.getmtime), dst)
    return f'ok {time.time() - t0:.0f}s'


def round_icon(src, size):
    from PIL import ImageDraw
    im = src.convert('RGB')
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    big = size * 4
    im = im.resize((big, big), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, big - 3, big - 3), fill=255)
    im.putalpha(mask)
    return im.resize((size, size), Image.LANCZOS)


def install():
    done = []
    for key, _subject, kind in targets():
        src = os.path.join(OUT, key + '.png')
        if not os.path.exists(src):
            continue
        dst_dir, size = (ULT_DIR, 384) if kind == 'ult' else (PASSIVE_DIR, 256)
        dst = os.path.join(dst_dir, key + '.png')
        if os.path.exists(dst):
            bdir = os.path.join(BACKUP, os.path.relpath(dst_dir, RES))
            os.makedirs(bdir, exist_ok=True)
            bfile = os.path.join(bdir, key + '.png')
            if not os.path.exists(bfile):  # 只备份最早的金环原图,重复安装不覆盖备份
                shutil.copy2(dst, bfile)
        im = round_icon(Image.open(src), size)
        im.save(dst, optimize=True)
        write_meta(dst, os.path.join(ULT_DIR, 'UR_ARTHAS.png.meta'), key, im.width, im.height, True)
        done.append(key)
    print(f'installed {len(done)}:', ' '.join(done))


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ('gen', 'install'):
        sys.exit(__doc__)
    if args[0] == 'install':
        install()
        return
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else set()
    codex = G.find_codex()
    for key, subject, kind in targets():
        if only and key not in only:
            continue
        print(f'[{kind}] {key}: {gen(codex, key, subject, kind)}', flush=True)


if __name__ == '__main__':
    main()
