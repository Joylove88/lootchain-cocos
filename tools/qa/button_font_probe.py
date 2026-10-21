"""原生调试包:逐个打开界面,统计按钮 / 页签里文字「字号 / 按钮高」,列出偏挤的(2026-10-21 用户:按钮字撑满按钮,要上下留空)。

用法:python tools/qa/button_font_probe.py [--only bag,quest] [--ratio 0.5]
按钮 = 挂 Button 组件且激活的节点;文字 = 其子孙 Label(深度 ≤ 3)。高取按钮节点 UITransform 高 × 世界缩放 / 字号 × 世界缩放,口径一致。
"""
import argparse
import asyncio
import json
import time

from native_capture_screens import ROOT_JS, RESET_JS, SCREENS, evaluate

PROBE_JS = """
(() => { %s
  const out = [];
  const scene = cc.director.getScene();
  const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };
  walk(scene, (n) => {
    if (!n.activeInHierarchy) return;
    const btn = n.getComponent('cc.Button');
    if (!btn) return;
    const ut = n.getComponent('cc.UITransform');
    if (!ut) return;
    const ws = n.worldScale.y;
    const h = ut.height * ws;
    const labels = [];
    const sub = (m, d) => { if (d > 3) return; const l = m.getComponent('cc.Label'); if (l && l.string && m.activeInHierarchy) labels.push([m, l]); m.children.forEach((c) => sub(c, d + 1)); };
    sub(n, 0);
    labels.forEach(([m, l]) => {
      const fs = l.fontSize * m.worldScale.y;
      // 实际渲染字号:SHRINK 时取 actualFontSize
      const actual = (l._actualFontSize || l.fontSize) * m.worldScale.y;
      const r = actual / Math.max(1, h);
      if (r > %f && h > 8) out.push({ btn: n.name, path: n.parent ? n.parent.name : '', text: l.string.slice(0, 12), font: Math.round(actual), h: Math.round(h), r: Math.round(r * 100) / 100 });
    });
  });
  return JSON.stringify(out);
})()
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=43086)
    ap.add_argument('--only', default='')
    ap.add_argument('--ratio', type=float, default=0.5)
    args = ap.parse_args()
    only = set(filter(None, args.only.split(',')))
    for key, js, wait in SCREENS:
        if only and key not in only:
            continue
        expr = f"(() => {{ {ROOT_JS} {RESET_JS} try {{ {js} }} catch (e) {{ return 'err ' + e.message; }} return root.currentView; }})()"
        asyncio.run(evaluate(args.port, expr))
        time.sleep(wait)
        res = asyncio.run(evaluate(args.port, PROBE_JS % ('', args.ratio)))
        try:
            rows = json.loads(json.loads(res))
        except Exception:
            print(key, 'probe failed', res[:200])
            continue
        print(f'== {key}: {len(rows)}', flush=True)
        seen = set()
        for r in rows:
            k = (r['btn'].split('_')[0], r['text'], r['h'])
            if k in seen:
                continue
            seen.add(k)
            print(f"  {r['r']:.2f}  font {r['font']:>3} / h {r['h']:>3}  {r['path']}/{r['btn']}  「{r['text']}」")


if __name__ == '__main__':
    main()
