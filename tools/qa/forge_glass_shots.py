"""锻造 B 风格四页签自验截图(2026-10-28):只在测试进程里塞几件不同稀有度 / 强化 / 宝石的装备,依次截 强化 / 合成 / 分解 / 宝石,并与原型拼上下对比。
前提:模拟器调试包在前台(QA 账号已登录或 QA_LOGIN 自动登录)、本地游戏服 8081、inspector 43086。
用法:python tools/qa/forge_glass_shots.py <输出目录>
"""
import os
import sys
import time

from PIL import Image, ImageDraw, ImageFont

from native_capture_screens import ROOT_JS
from town_v3_round import INSPECTOR, shot

PROTO = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '周报截图', '2026-10-28_整体UI去AI感', 'proto')

INJECT = """
const s = root.currentLobbyHeroEquipState();
const base = s.items.find(i => !String(i.id).startsWith('9')) || s.items[0];
for (let i = s.items.length - 1; i >= 0; i -= 1) { if (s.items[i].id >= 900000) s.items.splice(i, 1); }
const defs = [
  ['HELMET', 'EQ_HELMET_PURPLE', '灼世角盔', 'PURPLE', 2, ['GEM_HP_1']],
  ['CHEST', 'EQ_CHEST_PURPLE', '灼世龙鳞甲', 'PURPLE', 2, ['GEM_DEF_1']],
  ['BOOTS', 'EQ_BOOTS_GOLD', '灼世掠影靴', 'GOLD', 12, ['GEM_DEF_1']],
  ['CHEST', 'EQ_CHEST_BLUE', '铁鳞甲', 'BLUE', 0, []],
  ['CHEST', 'EQ_CHEST_BLUE', '铁鳞甲', 'BLUE', 1, []],
  ['CHEST', 'EQ_CHEST_BLUE', '铁鳞甲', 'BLUE', 0, []],
  ['RING', 'EQ_RING_BLUE', '蓝晶戒指', 'BLUE', 3, []],
  ['NECKLACE', 'EQ_NECK_PURPLE', '星辉项链', 'PURPLE', 0, []],
  ['HELMET', 'EQ_V2_WHITE_HELMET', '铁盔', 'WHITE', 0, []],
];
defs.forEach((d, i) => s.items.push(Object.assign({}, base, { id: 900000 + i, heroId: null, slot: d[0], equipCode: d[1], equipName: d[2], quality: d[3], enhanceLevel: d[4], gems: d[5], attrHp: 40 + i * 12, attrAttack: d[0] === 'RING' ? 9 : 0 })));
return s.items.length;
"""


def q(body: str) -> str:
    return INSPECTOR.call(f"(() => {{ {ROOT_JS} try {{ {body} }} catch (e) {{ return 'err ' + e.message; }} }})()")


def main() -> None:
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    if os.environ.get('QA_FULLSCREEN') == '1':
        # AVD 自带挖孔:安全区打成整屏再比原型(同 capture_once);不设则顺带验窄屏(挖孔安全区)不叠
        q("const vs = cc.view.getVisibleSize(); cc.sys.getSafeAreaRect = () => cc.rect(0, 0, vs.width, vs.height); return 1;")
    # 打开锻造会重新拉装备列表(覆盖注入):先开锻造、等列表到,再注入并整刷
    q("setTimeout(() => root.openLobbyForgePanel(), 30); return 1;")
    time.sleep(4)
    print('inject', q(INJECT + " ", ), flush=True)
    q("setTimeout(() => root.renderCurrentView(), 30); return 1;")
    time.sleep(2)
    for tab in ['enhance', 'fuse', 'decompose', 'gem']:
        q(f"setTimeout(() => root.selectLobbyForgeTab('{tab}'), 30); return 1;")
        time.sleep(2.5)
        if tab == 'fuse':
            q("const s = root.currentLobbyHeroEquipState(); setTimeout(() => root.setLobbyForgeFuseSlots([900003, 900004, 900005]), 30); return 1;")
            time.sleep(2)
        if tab == 'decompose':
            q("setTimeout(() => root.setLobbyForgeDecomposeSelection([900008, 900003]), 30); return 1;")
            time.sleep(2)
        shot(out, f'forge_{tab}')
    f = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 22)
    names = {'enhance': ('forge_b', '强化'), 'fuse': ('forge_fuse_b', '合成'), 'decompose': ('forge_decompose_b', '分解'), 'gem': ('forge_gem_b', '宝石')}
    for tab, (proto, title) in names.items():
        P = Image.open(os.path.join(PROTO, proto + '.png')).convert('RGB').resize((1400, 630))
        D = Image.open(os.path.join(out, f'forge_{tab}.png')).convert('RGB').resize((1400, 630))
        s = Image.new('RGB', (1400, 1300), (24, 24, 24))
        s.paste(P, (0, 30))
        s.paste(D, (0, 670))
        d = ImageDraw.Draw(s)
        d.text((10, 2), f'{title} · 原型', font=f, fill=(235, 205, 140))
        d.text((10, 642), f'{title} · 实机', font=f, fill=(235, 205, 140))
        s.save(os.path.join(out, f'cmp_{tab}.jpg'), quality=86)
    print('done', flush=True)


if __name__ == '__main__':
    main()
