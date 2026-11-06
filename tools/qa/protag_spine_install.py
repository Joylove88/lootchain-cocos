# -*- coding: utf-8 -*-
"""主角野外骨骼入库(docs/60,2026-11-03 用户确认永夜龙骑底的男女两套):
- C:/mw/protag/<m2|f2>/out_fix(protag_spine_reskin + protag_spine_fix 产物,图集 ×2)→ assets/resources/spine/hero/<protag_m|protag_f>/
  贴图缩回原骨骼尺寸(1939×821,AI 按两倍像素画的细节缩下来更干净,显存 / 包体与其他英雄一致),图集直接用原 IshmaelA.atlas 坐标(×2 图集正好是它的两倍)
- 队伍头像:立绘(protag_m_v5 / protag_f_v6)裁头胸,暗底 256 → ui/hero/ai/avatar/PROTAGONIST_<MALE|FEMALE>_ATTACK.png(同其他英雄头像口径)
spine/hero/protag_ 前缀进网页开局包(scripts/web-pack-tiers.mjs)。
用法:python tools/qa/protag_spine_install.py
"""
import os, shutil, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERO = os.path.join(ROOT, 'assets', 'resources', 'spine', 'hero')
AVATAR = os.path.join(ROOT, 'assets', 'resources', 'ui', 'hero', 'ai', 'avatar')
ART = os.path.join(ROOT, '周报截图', '2026-11-02_主角', 'assets_src')
BASE = 'IshmaelA'
TARGETS = [('m2', 'protag_m', 'protag_m_v9', 'PROTAGONIST_MALE_ATTACK'), ('f2', 'protag_f', 'protag_f_v8', 'PROTAGONIST_FEMALE_ATTACK'),
           # 11-04 境界 P1b 炼魂外观(docs/60):m3 = 深色皮甲 + 蓝钢肩甲 / 护膝 + 兜帽短披风 + 符文钢剑;女版同觉醒口径 = 男版整套贴图只留女主的脸
           # 队伍头像不分境界,沿用觉醒版
           ('m3', 'protag_m_lh', None, None), ('m3', 'protag_f_lh', None, None),
           # 11-04 炼魂大招「夜帝残影」虚影(用户选 B:Meowa 换成夜帝本人,头部单独重画露脸 + 王冠 + 长发);游戏里放大 + 半透明 + 染紫
           ('yd2', 'protag_yedi', None, None)]


# 11-03 用户「头一直在仰头」:永夜龙骑头盔骨骼本来斜向上,画进去的脸跟着仰;骨骼动画是在初始姿势上叠加,
# 把头骨 face01 初始角度往下压 15°(实测 -12° 已明显看向正前方,+ 方向更仰)全部动作一起修正
HEAD_TILT = -15.0
# 夜帝的脸是 Meowa 按头盔网格重画的,朝向本来就对,不压角度、不挪位置
HEAD_TILT_BY = {'protag_yedi': 0.0}
# 11-03 用户「头和脖子错位、离领口远」:压角度是绕脖根转,脸整体前移;把头骨在世界坐标里往背后(左)挪 18、下沉 5.4
# (父骨 chest 世界角 62.71°,换算成 chest 本地坐标;0 / 10 / 18 三档渲染对比 18 最贴领口)
# 11-03 深夜 用户「女主能不能和男主一样」:女主前面几轮(挪头 / 画上衣后 / 挖领口 / 脖子画进立领 / 大招单独挪)都不对,
# 根因 = GPT 把女主马甲画成贴脖立领,男主是宽毛领 V 口。终解 = 女主头参数与男主完全一致(HEAD_SHIFT 同值,不单独改动作)
# + 用户再拍板「衣服直接和男主一样」:女主贴图 = 男主整张贴图,只保留女主的脸 / 眼睛区域(protag_body_from_male.py)。
# 废弃:只换领口 protag_collar_graft.py、立领填脖子 _unused_protag_collar_cut.py
HEAD_SHIFT = {'protag_m': (-18.0, -5.4), 'protag_f': (-18.0, -5.4), 'protag_m_lh': (-18.0, -5.4), 'protag_f_lh': (-18.0, -5.4), 'protag_yedi': (0.0, 0.0)}
# 11-04 炼魂(m3)用户「脑袋快掉到胸口」:新肩甲比毛领高,头夹在两块肩甲中间,要把头抬出领口。
# 按世界坐标往上抬会在上身后仰的动作(skill1 举剑)里把头带偏到侧面(用户「这个动作的头位置偏移过大」),
# 改成顺着脊柱(chest 骨本地 x 轴)抬 22,各动作头都贴着脖子
# 脸贴图脖子根在头骨本地的 y(skill1 翻转补偿用)
FACE_NECK_Y = -15.0
# 夜帝脸贴图按肤色像素实测脖子根 y≈-20
FACE_NECK_Y_BY = {'protag_yedi': -20.0}
# 女版同值显得脖子长(用户 11-04「女版的头可以再往下一点点」),低 8 / 低 14 对比取低 8
HEAD_LIFT_SPINE = {'protag_m_lh': 22.0, 'protag_f_lh': 14.0}
# 11-06 抬头后后颈和肩甲之间露透明缝(用户「脖子左侧出现透明空白」):装完炼魂两套后必须再跑
#   python tools/qa/protag_neck_fill.py assets/resources/spine/hero/<protag_m_lh|protag_f_lh> <同名> --x 86 --y 30 --w 62 --h 38 --color 38,34,36
# 身体贴图整套用男主的角色(只留自己的脸)
BODY_FROM_MALE = {'protag_f': None, 'protag_f_lh': 'protag_m_lh'}
# 11-03 用户「跑步的时候衣服是对的,站立的时候不对」:站立用 body01(高立领马甲)、跑步用 body02(毛领马甲);
# 这些角色全程只用 body02(setup 附件 + 各动作切回 body01 的关键帧都换成 body02)
BODY02_ALWAYS = {'protag_m', 'protag_f', 'protag_m_lh', 'protag_f_lh'}
CHEST_WORLD_DEG = 62.71
# 11-03 用户「跑步时脑袋背后多了个衣服角」:跑步 / 攻击 / 大招等动作身体槽换成 body02,男版 AI 把它画成了带兜帽的上衣,
# 头往后挪之后兜帽尖露在脑后;把 body02 贴图里毛领以上的兜帽抹掉(区域坐标 y<147、渐隐 10,只动网格包围内、亮色毛领保留)
HOOD_CUT = {'protag_m': (147.0, 10.0)}
# 11-04 大招虚影另出一份加色混合的发光层(protag_yedi_glow,共用贴图)
GLOW_COPY = {'protag_yedi'}


def head_shift_local(name):
    import math
    a = math.radians(CHEST_WORLD_DEG)
    wx, wy = HEAD_SHIFT[name]
    return wx * math.cos(a) + wy * math.sin(a) + HEAD_LIFT_SPINE.get(name, 0.0), -wx * math.sin(a) + wy * math.cos(a)


def install_spine(src_key, name):
    # 衣服统一(protag_spine_unify.py)跑过就用它的结果
    src = os.path.join('C:/mw/protag', src_key, 'out_unify')
    if not os.path.isdir(src):
        src = os.path.join('C:/mw/protag', src_key, 'out_fix')
    dst = os.path.join(HERO, name)
    os.makedirs(dst, exist_ok=True)
    orig = os.path.join(HERO, BASE)
    w, h = Image.open(os.path.join(orig, BASE + '.png')).size
    Image.open(os.path.join(src, BASE + '.png')).convert('RGBA').resize((w, h), Image.LANCZOS).save(os.path.join(dst, name + '.png'), optimize=True)
    atlas = open(os.path.join(orig, BASE + '.atlas'), encoding='utf-8').read().splitlines()
    first = next(i for i, l in enumerate(atlas) if l.strip())
    atlas[first] = name + '.png'
    open(os.path.join(dst, name + '.atlas'), 'w', encoding='utf-8', newline='\n').write('\n'.join(atlas) + '\n')
    import json
    data = json.load(open(os.path.join(src, BASE + '.json'), encoding='utf-8'))
    for bone in data['bones']:
        if bone['name'] == 'face01':
            bone['rotation'] = round(bone.get('rotation', 0) + HEAD_TILT_BY.get(name, HEAD_TILT), 2)
            lx, ly = head_shift_local(name)
            bone['x'] = round(bone.get('x', 0) + lx, 2)
            bone['y'] = round(bone.get('y', 0) + ly, 2)
    # 11-04 用户「这个动作(skill1 举剑)的头位置偏移过大」:原骨骼 face01 在 0.2~1.2s 上下翻转(scale y=-1,给头盔转头用),
    # 1.0→1.1667 平移已经横挪 29 而翻转到 1.2 才结束,中间这段换成人脸后头被甩到肩甲上;改成平移在 1.1667 一步到位、翻转同帧结束
    sk1 = data['animations'].get('skill1', {}).get('bones', {}).get('face01')
    if sk1 and sk1.get('scale') and sk1.get('translate'):
        assert sk1['translate'][0].get('time') == 1 and sk1['translate'][1].get('time') == 1.1667
        # 用户「头没对准领口,领口偏左头偏右」:画进去的脸不在头骨中轴上,脖子根在头骨本地 y≈-15(按贴图不透明像素实测),
        # 翻转把它甩到 +15,横向差 30;翻转期间反向补平移 R(θ)·(0, 2·y0)(θ = 头骨相对 chest 的角度,0/15/22 三档对比 15 正对领口)
        import math
        setup = next(b for b in data['bones'] if b['name'] == 'face01').get('rotation', 0)

        def comp(rot, y0=FACE_NECK_Y_BY.get(name, FACE_NECK_Y)):
            t = math.radians(setup + rot)
            return {'x': round(-2 * y0 * math.sin(t), 2), 'y': round(2 * y0 * math.cos(t), 2)}
        c1, c2 = comp(35.82), comp(8.62)
        sk1['translate'] = [{'time': 0.1667, 'curve': 'stepped'}, dict(time=0.2, curve='stepped', **c1), dict(time=1, **c1),
                            dict(time=1.1666, curve='stepped', **c2)] + sk1['translate'][1:]
        sk1['scale'] = [{'time': 0.1667}, {'time': 0.2, 'y': -1, 'curve': 'stepped'}, {'time': 1.1667}]
    if name in BODY02_ALWAYS:
        for slot in data['slots']:
            if slot['name'] == 'body01':
                slot['attachment'] = 'body02'
        for anim in data['animations'].values():
            for key in anim.get('slots', {}).get('body01', {}).get('attachment', []):
                if key.get('name') == 'body01':
                    key['name'] = 'body02'
    if name in BODY_FROM_MALE:
        png = os.path.join(dst, name + '.png')
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'protag_body_from_male.py')
        male = BODY_FROM_MALE[name]
        if male:
            # 身体来自炼魂男主(src 已经是 m3 贴图),脸取觉醒女主
            subprocess.run([sys.executable, script, os.path.join(HERO, 'protag_f', 'protag_f.png'), png, os.path.join(HERO, male, male + '.png')], check=True)
        else:
            subprocess.run([sys.executable, script, png, png], check=True)
    json.dump(data, open(os.path.join(dst, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    if name in HOOD_CUT:
        cut_hood(dst, name, data, *HOOD_CUT[name])
    if name in GLOW_COPY:
        # 发光层:同一张贴图、同一份图集,骨骼数据所有部件改加色混合(暗甲透明、金纹 / 披风 / 刃发亮 = 虚影的光)
        glow = json.loads(json.dumps(data))
        for slot in glow['slots']:
            slot['blend'] = 'additive'
        json.dump(glow, open(os.path.join(dst, name + '_glow.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        shutil.copy(os.path.join(dst, name + '.atlas'), os.path.join(dst, name + '_glow.atlas'))
    print('spine', name, (w, h), 'from', src)


def cut_hood(dst, name, data, cut, feather):
    from PIL import ImageDraw
    att = next(s for s in data['skins'] if s['name'] == 'default')['attachments']['body01']['body02']
    atlas = open(os.path.join(dst, name + '.atlas'), encoding='utf-8').read().splitlines()
    i = atlas.index('body02')
    reg = {l.split(':')[0].strip(): l.split(':')[1].strip() for l in atlas[i + 1:i + 7]}
    x, y = map(int, reg['xy'].split(','))
    w, h = map(int, reg['size'].split(','))
    assert reg['rotate'] == 'true'
    path = os.path.join(dst, name + '.png')
    im = Image.open(path).convert('RGBA')
    up = im.crop((x, y, x + h, y + w)).rotate(-90, expand=True)  # 转回正向,网格 uv 是正向区域内 0~1
    uv, hull = att['uvs'], att['hull']
    mask = Image.new('L', up.size, 0)
    ImageDraw.Draw(mask).polygon([(uv[2 * k] * w, uv[2 * k + 1] * h) for k in range(hull)], fill=255)
    arr = np.asarray(up).astype(np.float32)
    yy = np.mgrid[0:up.size[1], 0:up.size[0]][0]
    erase = np.clip((cut - yy) / feather, 0, 1)
    erase = np.where((np.asarray(mask) > 0) & (arr[..., :3].mean(axis=2) <= 165), erase, 0)
    arr[..., 3] *= 1 - erase
    im.paste(Image.fromarray(arr.round().astype(np.uint8), 'RGBA').rotate(90, expand=True), (x, y))
    im.save(path, optimize=True)
    print('hood cut', name, int((erase > 0.5).sum()), 'px')


def install_avatar(art, code):
    im = Image.open(os.path.join(ART, art + '.png')).convert('RGBA')
    a = np.array(im.getchannel('A')) > 40
    top = np.where(a.any(1))[0][0]
    head = a[top:top + int(im.height * 0.08)]
    cx = int(np.where(head.any(0))[0].mean())
    side = int(im.width * 0.42)
    x0 = max(0, min(im.width - side, cx - side // 2))
    y0 = max(0, top - int(side * 0.06))
    crop = im.crop((x0, y0, x0 + side, y0 + side)).resize((256, 256), Image.LANCZOS)
    # 暗底(同 UR_ARTHAS 等头像的深色底)+ 轻微暗角
    yy, xx = np.mgrid[0:256, 0:256]
    d = np.sqrt((xx - 128) ** 2 + (yy - 110) ** 2) / 181
    base = np.clip(np.array([30, 26, 30]) * (1 - 0.55 * d[..., None]), 0, 255).astype(np.uint8)
    bg = Image.fromarray(np.dstack([base, np.full((256, 256), 255, np.uint8)]), 'RGBA')
    bg.alpha_composite(crop)
    path = os.path.join(AVATAR, code + '.png')
    bg.convert('RGB').save(path, optimize=True)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'qa', 'install_sprite_meta.py'), path], check=True)
    print('avatar', code)


if __name__ == '__main__':
    for key, name, art, code in TARGETS:
        install_spine(key, name)
        if art:
            install_avatar(art, code)
