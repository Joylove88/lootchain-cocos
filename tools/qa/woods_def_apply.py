# -*- coding: utf-8 -*-
"""把 woods_def_gen.py 的生成结果装进 LobbyWorldMaps.ts 的 WOODS 定义(整段替换 const W3 … const WOODS … };)。
用法:python tools/qa/woods_def_apply.py
"""
import io
import os
import re
import sys
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import woods_def_gen as g  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TS = os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyWorldMaps.ts')
# 宝箱(码 / 名 / 种类 / 原型 x, y):码对应服务端 FieldChestRules
CHESTS = [
    ('WOODS_W1', '林间木箱', 'WOOD', 140, 312),
    ('WOODS_W2', '林间木箱', 'WOOD', 435, 605),
    ('WOODS_W3', '林间木箱', 'WOOD', 1555, 660),
    ('WOODS_I1', '蛛后铁箱', 'IRON', 790, 162),
    ('WOODS_I2', '熊踪铁箱', 'IRON', 1640, 362),
    ('WOODS_S1', '秘藏宝箱', 'SECRET', 775, 795),
    ('WOODS_B1', '首领宝箱', 'BOSS', 1570, 205),
]



# 兴趣点(docs/54 §2.2):坐标 = 10-30 实测吸附后固定(与服务端 FieldGeometry 一致,docs/55 §3)
WOODS_POIS = [
    ('W_HIDDEN_1', 'HIDDEN', '瀑布后的岩缝', -1448, 2350),
    ('W_HIDDEN_2', 'HIDDEN', '倒木下的箭袋', 308, 746),
    ('W_HIDDEN_3', 'HIDDEN', '崖边的营火', 5800, 1412),
    ('W_STELE_1', 'STELE', '古树之碑', 1909, -1008),
    ('W_HERB_1', 'HERB', '草药丛', 3907, 182),
    ('W_HERB_2', 'HERB', '草药丛', -881, -363),
    ('W_ORE_1', 'ORE', '矿脉', -624, -2532),
    ('W_ORE_2', 'ORE', '矿脉', 3121, -2225),
]

def main() -> None:
    buf = io.StringIO()
    with redirect_stdout(buf):
        g.main()
    out = buf.getvalue()
    parts = re.split(r'^---(\w+).*$', out, flags=re.M)
    sec = {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}
    corr = parts[0].rstrip()
    trees = [(int(x), int(y)) for x, y in re.findall(r'\[(-?\d+), (-?\d+)\]', sec['trees'])]
    roads_ts = sec['roads'].strip()
    roads_ts = roads_ts[roads_ts.index('const WOODS_ROADS'):]
    tree_lines = []
    for i, (x, y) in enumerate(trees):
        if i % 11 == 5:
            tree_lines.append(f"[{x}, {y}, 'tree_autumn', {560 + (i % 3) * 40}]")
        elif i % 5 in (0, 1, 2):
            tree_lines.append(f"[{x}, {y}, 'tree_pine', {380 + (i % 4) * 40}]")
        else:
            tree_lines.append(f"[{x}, {y}, 'tree_oak', {540 + (i % 4) * 40}]")
    tl = ',\n  '.join(', '.join(tree_lines[j:j + 6]) for j in range(0, len(tree_lines), 6))
    places = [('入口营地', 'portal', 240, 735), ('幼鼠窝', 'den', 430, 470), ('林间蛛巢', 'cave', 1000, 245),
              ('猎人营地', 'camp', 1330, 370), ('古树遗迹', 'ruins', 1150, 650), ('熊穴', 'cave', 1580, 195)]
    places_ts = '\n'.join(f"    {{ name: '{n}', x: {g.wx(x)}, y: {g.wy(y)}, icon: '{i}' }}," for n, i, x, y in places)
    chest_ts = '\n'.join(f"    {{ code: '{c}', label: '{n}', kind: '{k}', x: {g.wx(x)}, y: {g.wy(y)} }}," for c, n, k, x, y in CHESTS)
    pois_ts = '\n'.join(f"    {{ code: '{c}', kind: '{kd}', name: '{n}', x: {x}, y: {y} }}," for c, kd, n, x, y in WOODS_POIS)
    ts = f'''/** 村外林地 v3 素材(2026-10-29 按林地原型出写实件;tools/qa/woods_assets_gen.py + woods_install_assets.py)。 */
const W3 = (name: string): string => worldAsset(`woods3/w3_${{name}}`);

/** 林地路网(世界坐标,tools/qa/woods_def_gen.py 由原型换算;woods_def_apply.py 装进来):路刷 + 走廊可走区共用。 */
{roads_ts}

/** 林地树林:沿走廊两侧固定种子撒(离路越远越稀,树冠不盖路),[x, y, 素材, 宽];每 3 棵配一丛蕨。 */
const WOODS_TREES: Array<[number, number, string, number]> = [
  {tl},
];

/**
 * 村外林地 v3(docs/52 / 53,2026-10-29 用户确认按原型规模做):原型 woods_overview(1808×870)换算 x = (px - 904) × 7.5、y = (435 - py) × 7.5,
 * 地图 13560×6525;走廊结构(路 + 林间空地),两侧密林。西南入口营地(传送阵)→ 幼鼠窝 → 木桥 → 北:瀑布 / 林间蛛巢;
 * 东:猎人营地 → 东北熊穴(区域首领腐木巨熊);南:古树遗迹。11 群小怪(6~10 只)+ 2 精英 + 首领,怪群按距离生成 / 回收。
 * 本段由 tools/qa/woods_def_apply.py 生成,改布局改 woods_def_gen.py 再重跑。
 */
const WOODS: WorldMapDef = {{
  code: 'WOODS',
  actorTint: [236, 242, 226],
  ambient: true,
  name: '村外林地',
  levelText: 'Lv.1-10',
  width: 13560,
  height: 6525,
  walk: {{ left: -6750, right: 6750, bottom: -3240, top: 3240 }},
{corr}
  spawn: {{ x: -4980, y: -2250 }},
  ground: worldAsset('ground_woods3'),
  // 10-29 写实林地底纹(苔草 + 腐殖土),一格 1000 世界单位
  groundTile: 1000,
  buildings: [],
  npcs: [],
  props: [
    // ── 贴地(先画的在下):地表贴花 → 崖 / 水 → 营地 / 遗迹地面 → 路 → 桥 ──
    ...groundDecals({{ walk: {{ left: -6750, right: 6750, bottom: -3240, top: 3240 }}, buildings: [] }}, 760,
      [['decal_leaves', 560], ['decal_moss', 340], ['decal_roots', 460], ['decal_leaves', 560]], W3),
{sec['flats'].rstrip()}
    ...roads(WOODS_ROADS, 220, V3('road_brush')),
    {{ asset: W3('bridge'), x: {g.wx(790)}, y: {g.wy(437)}, width: 1050, flat: true }},
    // ── 立物 ──
{sec['stands'].rstrip()}
    ...WOODS_TREES.flatMap(([x, y, asset, width], i) => {{
      const tree: WorldMapProp = {{ asset: W3(asset), x, y, width, block: {{ w: 110, d: 50 }} }};
      return i % 3 === 0 ? [tree, {{ asset: W3(i % 7 === 0 ? 'mushrooms' : 'fern'), x: x + (i % 2 ? 170 : -170), y: y - 50, width: i % 7 === 0 ? 120 : 200 }}] : [tree];
    }}),
  ],
  lamps: [],
  lampAsset: V2('lamp'),
  waypoint: {{ x: {g.wx(180)}, y: {g.wy(755)}, drawn: true }},
  // 地图页「地点」(10-30 原型 proto_map_b)
  places: [
{places_ts}
  ],
  // 兴趣点(docs/54 §2.2)
  pois: [
{pois_ts}
  ],
  // 野外宝箱(docs/52 §3.1,走近点「开启」;铁箱 / 首领宝箱要先打赢旁边的精英 / 首领)
  chests: [
{chest_ts}
  ],
  camps: [
{sec['camps'].rstrip()}
  ],
  exits: [{{ key: 'to_village', label: '返回 · 晨风村', x: -6420, y: -2440, radius: 130, toMap: 'VILLAGE', toSpawn: {{ x: 2300, y: -1000 }} }}],
  battleBg: 'battle_scene_field_forest',
}};
'''
    s = open(TS, encoding='utf-8').read()
    i = s.index('/** 村外林地 v3 素材(')
    j = s.index('\n};\n', s.index('const WOODS: WorldMapDef = {')) + 4
    s = s[:i] + ts + s[j:]
    open(TS, 'w', encoding='utf-8').write(s)
    print('trees', len(trees))


if __name__ == '__main__':
    main()
