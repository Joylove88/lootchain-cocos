# -*- coding: utf-8 -*-
"""D26 古风角色 → 英雄骨骼入库(2026-11-07 试看批次)。

源:D:/骨骼动画素材/d26_42(fx_convert_batch 转好的 4.2.43,fx42 = skel+atlas+png,fx42json = 同套 json)。
做的事:
  1. 读 fx42json 的 json,把动作名改成游戏口径
     SSR/UR:idle / run / atk / skill1 / skill2 / ult / hit / dead(LobbyBattleUnitSpineRuntime.resolveSsrUrSpineAnimationNames)
     R/SR  :idle / run / skill0 / skill1 / hurt / die(resolveSrRSpineAnimationNames)
     大招取 attack_3(这批里普遍最长最满屏),attack_4 → skill2。
  2. 素材没有死亡动作:用受击动作 + 全部插槽 0.6 秒淡出合成一段。
  3. Spine 命令行把改好的 json 导成 4.2.43 二进制(沿用原图集,不重打包、不降分辨率)。
  4. 落位 assets/resources/spine/hero/<资源名>/<资源名>.skel/.atlas + 原 png。之后 Creator 导入生成 meta。

用法:python tools/qa/d26_install_heroes.py [--only sz_zhaoyun] [--spine D:/spine/Spine.exe]
"""
import json, os, shutil, subprocess, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = 'D:/骨骼动画素材/d26_42'
STAGE = 'D:/骨骼动画素材/d26_install_stage'
DEST = os.path.join(REPO, 'assets', 'resources', 'spine', 'hero')
EXPORT = os.path.join(REPO, 'tools', 'spine', 'fx42_reuse_atlas.export.json')
args = sys.argv[1:]
SPINE = args[args.index('--spine') + 1] if '--spine' in args else 'D:/spine/Spine.exe'
ONLY = set(args[args.index('--only') + 1].split(',')) if '--only' in args else set()

# (D26 编号, 资源名, 档位)
HEROES = [
    ('071', 'sz_zhaoyun', 'SSR_UR'),
    ('078', 'sz_zhugeliang', 'SSR_UR'),
    ('048', 'sz_sunwukong', 'SSR_UR'),
    ('006', 'sz_diaochan', 'SSR_UR'),
    ('062', 'sz_yangjian', 'SR_R'),
    ('004', 'sz_daqiao', 'SR_R'),
    # 11-07 第二批:限时召唤·异界神州 + 新手契约(R / SR 各职业一名)
    ('029', 'sz_lvbu', 'SSR_UR'),
    ('047', 'sz_sunshangxiang', 'SSR_UR'),
    ('066', 'sz_zhangfei', 'SSR_UR'),
    ('019', 'sz_huatuo', 'SR_R'),
    ('065', 'sz_zhangchunhua', 'SR_R'),
    ('068', 'sz_zhangjiao', 'SR_R'),
    ('018', 'sz_huangzhong', 'SR_R'),
    ('003', 'sz_caoren', 'SR_R'),
    ('020', 'sz_huaxiong', 'SR_R'),
    ('009', 'sz_ganning', 'SR_R'),
    ('058', 'sz_xunyou', 'SR_R'),
    ('049', 'sz_taishici', 'SR_R'),
    ('005', 'sz_dianwei', 'SR_R'),
]
RENAME = {
    'SSR_UR': {'idle': 'idle', 'walk': 'run', 'attack_1': 'atk', 'attack_2': 'skill1', 'attack_4': 'skill2', 'attack_3': 'ult', 'hit': 'hit'},
    'SR_R': {'idle': 'idle', 'walk': 'run', 'attack_1': 'skill0', 'attack_2': 'skill1', 'hit': 'hurt'},
}
DEATH_NAME = {'SSR_UR': 'dead', 'SR_R': 'die'}
FADE = 0.6


def synth_death(data, hit_anim):
    """受击动作照搬,插槽颜色从各自初始色淡到全透明。"""
    anim = json.loads(json.dumps(hit_anim))
    slots = anim.setdefault('slots', {})
    for slot in data.get('slots', []):
        color = (slot.get('color') or 'ffffffff')[:8].ljust(8, 'f')
        timeline = slots.setdefault(slot['name'], {})
        timeline.pop('rgb', None)
        timeline.pop('alpha', None)
        timeline['rgba'] = [{'color': color}, {'time': FADE, 'color': color[:6] + '00'}]
    return anim


NON_INHERIT_REFLECTION = ('noRotationOrReflection', 'noScaleOrReflection', 'onlyTranslation')


def mirror_non_inheriting_bones(data):
    """根骨骼镜像对「不继承父级镜像」的骨骼无效(D26 的脚 jiao1/jiao2 设成 noRotationOrReflection 让脚掌贴地,
    赵云的发梢 cf1~3 也是)→ 镜像后脚尖仍朝原方向,看起来像罗圈腿(11-08 用户反馈)。
    这些骨骼自己做镜像:局部旋转取反、scaleX 取反,旋转关键帧(相对 setup 的增量)与贝塞尔曲线的值坐标一起取反。
    IK 不用动(运行时按父级镜像自动处理,翻 bendPositive 反而更错,渲染逐像素比对过)。"""
    names = {b['name'] for b in data['bones'] if b.get('inherit', b.get('transform')) in NON_INHERIT_REFLECTION}
    for bone in data['bones']:
        if bone['name'] in names:
            bone['rotation'] = -bone.get('rotation', 0)
            bone['scaleX'] = -bone.get('scaleX', 1)
            if 'shearY' in bone:
                bone['shearY'] = -bone['shearY']
    for anim in data['animations'].values():
        for bone_name, timelines in anim.get('bones', {}).items():
            if bone_name not in names:
                continue
            for key in timelines.get('rotate', []):
                if 'value' in key:
                    key['value'] = -key['value']
                curve = key.get('curve')
                if isinstance(curve, list) and len(curve) == 4:
                    key['curve'] = [curve[0], -curve[1], curve[2], -curve[3]]
            for key in timelines.get('shear', []):
                if 'y' in key:
                    key['y'] = -key['y']
    return names


def run(code, asset, tier):
    jdir = os.path.join(SRC, 'fx42json', code)
    bdir = os.path.join(SRC, 'fx42', code)
    jfile = [f for f in os.listdir(jdir) if f.endswith('.json')][0]
    data = json.load(open(os.path.join(jdir, jfile), encoding='utf-8'))
    old = data['animations']
    rename = RENAME[tier]
    new = {}
    for src_name, dst_name in rename.items():
        if src_name in old:
            new[dst_name] = old[src_name]
    hit_src = old.get('hit')
    if hit_src is not None:
        new[DEATH_NAME[tier]] = synth_death(data, hit_src)
    dropped = sorted(set(old) - set(rename))
    data['animations'] = new
    # D26 原画朝左;游戏里英雄骨骼一律按「原生朝右」翻转(守卫战转身 / 野外 / 编队)→ 根骨骼水平镜像(11-07 用户:守卫战朝水晶打)。
    # 根骨骼没有动画关键帧,Spine 4 缩放关键帧也是乘在初始缩放上,镜像不会被动画盖掉。
    root = data['bones'][0]
    root['scaleX'] = -abs(root.get('scaleX', 1))
    mirror_non_inheriting_bones(data)

    stage = os.path.join(STAGE, asset)
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)
    stage_json = os.path.join(stage, asset + '.json')
    json.dump(data, open(stage_json, 'w', encoding='utf-8'), ensure_ascii=False)
    out = os.path.join(stage, 'out')
    r = subprocess.run([SPINE, '-u', '4.2.43', '-i', stage_json, '-o', out, '-e', EXPORT], capture_output=True, text=True, errors='replace')
    skels = [f for f in os.listdir(out) if f.endswith('.skel')] if os.path.isdir(out) else []
    if r.returncode != 0 or not skels:
        print(f'[{asset}] spine export failed: {r.returncode}\n{r.stdout[-1500:]}\n{r.stderr[-800:]}')
        return False

    dest = os.path.join(DEST, asset)
    os.makedirs(dest, exist_ok=True)
    for f in os.listdir(dest):
        if not f.endswith('.meta'):
            os.remove(os.path.join(dest, f))
    shutil.copyfile(os.path.join(out, skels[0]), os.path.join(dest, asset + '.skel'))
    atlas = [f for f in os.listdir(bdir) if f.endswith('.atlas')][0]
    shutil.copyfile(os.path.join(bdir, atlas), os.path.join(dest, asset + '.atlas'))
    pngs = [f for f in os.listdir(bdir) if f.endswith('.png')]
    for p in pngs:
        shutil.copyfile(os.path.join(bdir, p), os.path.join(dest, p))
    size = sum(os.path.getsize(os.path.join(dest, f)) for f in os.listdir(dest) if not f.endswith('.meta'))
    print(f'[{asset}] ok  anims={sorted(new)}  dropped={dropped}  png={len(pngs)}  {size / 1048576:.1f}MB')
    return True


def main():
    ok = 0
    for code, asset, tier in HEROES:
        if ONLY and asset not in ONLY:
            continue
        ok += run(code, asset, tier)
    print(f'done {ok}')


if __name__ == '__main__':
    main()
