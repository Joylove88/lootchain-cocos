# -*- coding: utf-8 -*-
"""D26 古风角色骨骼包审阅页(2026-11-07)。

前置:tools/spine/fx_convert_batch.ps1 已把包转成 4.2.43,产物在 <root>/fx42/<编号>/<编号>.skel、<root>/fx42json/<编号>/*.json。
本脚本:逐个角色用 fxprev/render_char.py 渲染全部动作(一次只开一个无头 Edge)→ GIF 转半尺寸动画 WebP → 生成 index.html 审阅页
(按 4 技能 / 2 技能 / 神兽分组,战魂版标出对应普通版,勾选后可复制清单)。

用法:python tools/qa/d26_review.py [--root D:/骨骼动画素材/d26_42] [--out D:/骨骼动画素材/d26_review] [--only 001,003] [--force] [--html-only]
断点续跑:已渲染的编号(out/<编号>/meta.json 存在)自动跳过。
"""
import hashlib, html, json, os, subprocess, sys, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(HERE, 'fxprev', 'render_char.py')
args = sys.argv[1:]


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


ROOT = opt('--root', 'D:/骨骼动画素材/d26_42')
OUT = opt('--out', 'D:/骨骼动画素材/d26_review')
ONLY = set(opt('--only', '').split(',')) - {''}
FORCE = '--force' in args
HTML_ONLY = '--html-only' in args

# 文件名拼音推出来的中文名;带 ? 的是猜的
NAMES = {
    '001': '白起', '002': '曹操', '003': '曹仁', '004': '大乔', '005': '典韦', '006': '貂蝉', '007': '董卓', '008': '盾兵',
    '009': '甘宁', '010': '弓兵', '011': '观音?', '012': '关银屏', '013': '关羽', '014': '郭嘉', '015': '黄巾?', '016': '黄盖',
    '017': '黄月英', '018': '黄忠', '019': '华佗', '020': '华雄', '021': '姜维', '022': '九天玄女', '023': '酒吞童子', '024': '贾诩',
    '025': '凌统', '026': '刘备', '027': '鲁肃', '028': '陆逊', '029': '吕布', '030': '吕玲绮', '031': '马超', '032': '马良',
    '033': '孟获', '034': '孔雀明王', '035': '花木兰', '036': '南极仙翁', '037': '男主', '038': '哪吒', '039': '吕蒙', '040': '女主',
    '041': '潘凤', '042': '庞统', '043': '枪兵', '044': '司马懿', '045': '孙策', '046': '孙权', '047': '孙尚香', '048': '孙悟空',
    '049': '太史慈', '050': '王异', '051': '魏延', '052': '文丑', '053': '吴国太', '054': '夏侯惇', '055': '小乔', '056': '西施',
    '057': '徐晃', '058': '荀攸', '059': '荀彧', '060': '徐庶?', '061': '许褚', '062': '杨戬', '063': '颜良', '064': '袁绍',
    '065': '张春华', '066': '张飞', '067': '张郃', '068': '张角', '069': '张辽', '070': '张星彩', '071': '赵云', '072': '甄姬',
    '073': '钟馗', '074': '周泰', '075': '周瑜', '076': '祝融', '077': '邹氏', '078': '诸葛亮', '079': '韩信', '080': '洛神甄姬',
    '081': '通天教主', '082': '幼麟姜维', '083': '云霄仙子', '084': '妲己', '085': '鬼谷子', '086': '姜子牙', '087': '女娲',
    '088': '秦始皇', '089': '武则天', '090': '白泽', '091': '蜚牛?', '092': '祸斗', '093': '麟渊?', '094': '麒麟', '095': '穷奇',
    '096': '狻猊', '097': '饕餮', '098': '梼杌', '099': '天狐',
    '100': '白起·战魂', '102': '曹操·战魂', '104': '董卓·战魂', '106': '凤凰', '108': '郭嘉·战魂', '110': '虎',
    '112': '花木兰·战魂', '114': '贾诩·战魂', '116': '酒吞童子·战魂', '118': '陆逊·战魂', '120': '吕布·战魂', '122': '吕玲绮·战魂',
    '124': '马超·战魂', '126': '魅灵?', '128': '哪吒·战魂', '130': '吕蒙·战魂', '132': '青龙', '134': '司马懿·骷髅',
    '136': '孙策·战魂', '138': '孙悟空·战魂', '140': '夏侯惇·战魂', '142': '张辽·战魂', '144': '赵云·战魂', '146': '周瑜·战魂',
    '148': '诸葛亮·战魂', '150': '观音·战魂', '152': '韩信·战魂', '154': '孔雀明王·战魂', '156': '洛神甄姬·战魂',
    '158': '通天教主·战魂', '160': '西施·战魂', '162': '幼麟姜维·战魂', '164': '云霄仙子·战魂',
}
# 战魂版 → 对应普通版
PAIR = {'100': '001', '102': '002', '104': '007', '108': '014', '112': '035', '114': '024', '116': '023', '118': '028',
        '120': '029', '122': '030', '124': '031', '128': '038', '130': '039', '134': '044', '136': '045', '138': '048',
        '140': '054', '142': '069', '144': '071', '146': '075', '148': '078', '150': '011', '152': '079', '154': '034',
        '156': '080', '158': '081', '160': '056', '162': '082', '164': '083'}
PAIR_BACK = {v: k for k, v in PAIR.items()}
SOLDIERS = {'008', '010', '015', '037', '040', '043'}
# 人工过目备注
NOTES = {'134': '攻击 2~4 时本体消失,像召唤物,不适合当英雄'}
ANIM_ORDER = ['idle', 'walk', 'attack_1', 'attack_2', 'attack_3', 'attack_4', 'hit', 'idle_2']


def load_json(code):
    d = os.path.join(ROOT, 'fx42json', code)
    if not os.path.isdir(d):
        return None
    js = [f for f in os.listdir(d) if f.endswith('.json')]
    return json.load(open(os.path.join(d, js[0]), encoding='utf-8')) if js else None


def is_character(data):
    return any(not n.startswith('death') for n in data.get('animations', {}))


def anim_info(data):
    out, hashes = {}, {}
    for n, a in data.get('animations', {}).items():
        t = 0.0
        stack = [a]
        while stack:
            o = stack.pop()
            if isinstance(o, dict):
                for k, v in o.items():
                    if k == 'time' and isinstance(v, (int, float)):
                        t = max(t, v)
                    else:
                        stack.append(v)
            elif isinstance(o, list):
                stack.extend(o)
        out[n] = round(t, 2)
        if n.startswith('attack'):
            hashes[n] = hashlib.md5(json.dumps(a, sort_keys=True).encode()).hexdigest()
    keys = sorted(hashes)
    dups = [f'{a}={b}' for i, a in enumerate(keys) for b in keys[i + 1:] if hashes[a] == hashes[b]]
    return out, dups


def group_of(code, anims):
    atk = sum(1 for n in anims if n.startswith('attack'))
    if atk >= 4:
        return 'A' if int(code) < 100 else 'B'
    if atk == 1:
        return 'E'
    if 'walk' not in anims:
        return 'D'
    return 'C'


def render(code):
    dst = os.path.join(OUT, code)
    raw = os.path.join(dst, 'raw')
    src = os.path.join(ROOT, 'fx42', code)
    t0 = time.time()
    r = subprocess.run([sys.executable, RENDER, src, code, raw, '--fps', '12'], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print(f'  render failed {code}: {r.stderr[-800:]}', flush=True)
        return False
    for f in os.listdir(raw):
        p = os.path.join(raw, f)
        if f.endswith('.gif'):
            im = Image.open(p)
            frames, durs = [], []
            try:
                while True:
                    fr = im.convert('RGB')
                    frames.append(fr.resize((fr.width // 2, fr.height // 2), Image.LANCZOS))
                    durs.append(im.info.get('duration', 83))
                    im.seek(im.tell() + 1)
            except EOFError:
                pass
            im.close()
            frames[0].save(os.path.join(dst, f[:-4] + '.webp'), save_all=True, append_images=frames[1:], duration=durs, loop=0, quality=72, method=4)
            os.remove(p)
        elif f == '_overview.jpg':
            os.replace(p, os.path.join(dst, 'overview.jpg'))
    os.rmdir(raw)
    print(f'  rendered {code} in {time.time() - t0:.0f}s', flush=True)
    return True


def pack_kb(code):
    d = os.path.join(ROOT, 'fx42', code)
    return round(sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d)) / 1024)


def main():
    os.makedirs(OUT, exist_ok=True)
    codes = sorted(c for c in os.listdir(os.path.join(ROOT, 'fx42')) if os.path.isdir(os.path.join(ROOT, 'fx42', c)))
    metas = []
    for code in codes:
        if ONLY and code not in ONLY:
            continue
        data = load_json(code)
        if not data or not is_character(data):
            continue
        anims, dups = anim_info(data)
        meta_path = os.path.join(OUT, code, 'meta.json')
        if not HTML_ONLY and (FORCE or not os.path.exists(meta_path)):
            os.makedirs(os.path.join(OUT, code), exist_ok=True)
            print(f'[{code}] {NAMES.get(code, "?")}', flush=True)
            if not render(code):
                continue
        if not os.path.exists(os.path.join(OUT, code, 'overview.jpg')):
            continue
        meta = {'code': code, 'name': NAMES.get(code, code), 'anims': anims, 'dups': dups, 'group': group_of(code, anims),
                'kb': pack_kb(code), 'pair': PAIR.get(code) or PAIR_BACK.get(code), 'soldier': code in SOLDIERS}
        json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False)
        metas.append(meta)
    write_html(metas)
    print(f'wrote {os.path.join(OUT, "index.html")} ({len(metas)} characters)')


GROUPS = [
    ('A', '4 技能 · 普通版', 'SSR / UR 候选。attack_1 普攻,attack_2~4 三个技能。'),
    ('B', '4 技能 · 战魂版及其他', '战魂版和对应普通版动作时长几乎一样,可当觉醒外观或皮肤;标「2=3」的第 2、3 段动作完全一样,实际只有 3 段。'),
    ('C', '2 技能 · 动作齐全', 'R / SR 候选。标「小兵」的更适合做野外小怪。'),
    ('D', '2 技能 · 没有走路和受击', '只有待机 / 两段攻击,适合站桩施法,跑图要补走路。'),
    ('E', '神兽', '只有一段攻击,适合做野外精英 / BOSS / 宠物。'),
]


def write_html(metas):
    cards = {g[0]: [] for g in GROUPS}
    for m in metas:
        names = sorted(m['anims'], key=lambda n: ANIM_ORDER.index(n) if n in ANIM_ORDER else 99)
        chips = ''.join(f'<button class="chip" data-src="{m["code"]}/{n}.webp">{n}<small>{m["anims"][n]}s</small></button>' for n in names)
        tags = []
        if m['dups']:
            tags.append('<span class="tag warn">2=3 重复</span>')
        if m['soldier']:
            tags.append('<span class="tag">小兵</span>')
        if m['code'] in NOTES:
            tags.append(f'<span class="tag warn">{html.escape(NOTES[m["code"]])}</span>')
        if m['pair']:
            tags.append(f'<a class="tag link" href="#c{m["pair"]}">对应 {m["pair"]} {html.escape(NAMES.get(m["pair"], ""))}</a>')
        tags.append(f'<span class="tag dim">{m["kb"] / 1024:.1f}MB</span>')
        first = 'idle' if 'idle' in m['anims'] else names[0]
        cards[m['group']].append(f'''
<article class="card" id="c{m['code']}" data-code="{m['code']}" data-name="{html.escape(m['name'])}">
  <header><label><input type="checkbox" class="pick"> <b>{m['code']}</b> {html.escape(m['name'])}</label></header>
  <div class="stage"><img loading="lazy" src="{m['code']}/{first}.webp" alt=""></div>
  <div class="chips">{chips}<button class="chip" data-src="{m['code']}/overview.jpg">总览</button></div>
  <div class="tags">{''.join(tags)}</div>
</article>''')
    sections = ''.join(
        f'<section><h2>{t} <span class="count">{len(cards[k])}</span></h2><p class="hint">{d}</p><div class="grid">{"".join(cards[k])}</div></section>'
        for k, t, d in GROUPS if cards[k])
    page = f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>D26 骨骼审阅</title>
<style>
:root {{ --bg:#14161b; --card:#1f232b; --line:#323844; --text:#e6e1d6; --dim:#8d929c; --gold:#d9b46a; --warn:#e07a5f; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:14px/1.5 "Microsoft YaHei",system-ui,sans-serif; padding:0 16px 80px; }}
h1 {{ font-size:22px; margin:20px 0 4px; }}
h2 {{ font-size:18px; margin:28px 0 2px; color:var(--gold); }}
.count {{ color:var(--dim); font-size:14px; }}
.hint {{ color:var(--dim); margin:0 0 12px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px; }}
.card.on {{ border-color:var(--gold); box-shadow:0 0 0 1px var(--gold) inset; }}
.card header label {{ cursor:pointer; display:block; }}
.stage {{ background:#262a33; border-radius:6px; margin:8px 0; aspect-ratio:6/7; display:flex; align-items:center; justify-content:center; overflow:hidden; }}
.stage img {{ max-width:100%; max-height:100%; }}
.chips {{ display:flex; flex-wrap:wrap; gap:4px; }}
.chip {{ background:#2b303a; color:var(--text); border:1px solid var(--line); border-radius:4px; padding:2px 6px; font-size:12px; cursor:pointer; }}
.chip.on {{ background:#4a3f28; border-color:var(--gold); }}
.chip small {{ color:var(--dim); margin-left:4px; }}
.tags {{ margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }}
.tag {{ font-size:12px; padding:1px 6px; border-radius:4px; background:#2b303a; color:var(--text); text-decoration:none; }}
.tag.warn {{ background:#4a2a22; color:var(--warn); }}
.tag.dim {{ color:var(--dim); }}
.bar {{ position:fixed; left:0; right:0; bottom:0; background:#0e1014; border-top:1px solid var(--line); padding:10px 16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }}
.bar button {{ background:var(--gold); color:#1b1b1b; border:0; border-radius:6px; padding:6px 14px; font-weight:bold; cursor:pointer; }}
.bar .sel {{ color:var(--dim); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
</style></head><body>
<h1>D26 玄幻三国古风角色 · 骨骼审阅</h1>
<p class="hint">已转 Spine 4.2.43。点动作名切换预览(动图是半尺寸,画面边缘被裁到的大特效是渲染取景问题,不是素材问题);勾选想进游戏试看的角色,底部「复制清单」发给我。</p>
{sections}
<div class="bar"><b id="n">已选 0</b><span class="sel" id="sel"></span><button id="copy">复制清单</button></div>
<script>
const KEY = 'd26_review_picks';
let picks = [];
try {{ picks = JSON.parse(localStorage.getItem(KEY) || '[]'); }} catch (e) {{}}
const cards = [...document.querySelectorAll('.card')];
function sync() {{
  cards.forEach(c => {{ const on = picks.includes(c.dataset.code); c.classList.toggle('on', on); c.querySelector('.pick').checked = on; }});
  const names = cards.filter(c => picks.includes(c.dataset.code)).map(c => c.dataset.code + ' ' + c.dataset.name);
  document.getElementById('n').textContent = '已选 ' + names.length;
  document.getElementById('sel').textContent = names.join('、');
  try {{ localStorage.setItem(KEY, JSON.stringify(picks)); }} catch (e) {{}}
  return names;
}}
cards.forEach(c => {{
  c.querySelector('.pick').addEventListener('change', e => {{
    picks = picks.filter(p => p !== c.dataset.code);
    if (e.target.checked) picks.push(c.dataset.code);
    sync();
  }});
  const img = c.querySelector('.stage img');
  const chips = [...c.querySelectorAll('.chip')];
  chips.forEach(b => b.addEventListener('click', () => {{ img.src = b.dataset.src; chips.forEach(x => x.classList.toggle('on', x === b)); }}));
  const first = chips.find(b => img.getAttribute('src') === b.dataset.src); if (first) first.classList.add('on');
}});
document.getElementById('copy').addEventListener('click', () => {{
  const text = '试看清单:' + sync().join('、');
  const done = () => {{ const b = document.getElementById('copy'); b.textContent = '已复制'; setTimeout(() => b.textContent = '复制清单', 1500); }};
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('复制下面这行', text));
  else prompt('复制下面这行', text);
}});
sync();
</script></body></html>'''
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)


if __name__ == '__main__':
    main()
