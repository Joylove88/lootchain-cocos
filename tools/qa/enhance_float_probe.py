# 强化成功后「特效完 → 战力飘字」卡顿计时探针(安卓调试包 + inspector 43086)。
# 用法:python tools/qa/enhance_float_probe.py [--item <equipmentId>]
# 挂钩:点击、api.equipment.enhance 往返、spawnForgeFlash、spawnPowerDeltaFloat、refreshLobbyHeroEquipDialog 耗时。
# 前置:已在锻造-强化页(或由脚本切到),账号有普通强化石;默认挑第一件 +9 以下、未满级的装备。
import argparse, json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "let root=null; cc.director.getScene().walk(n=>{ if(!root){ const c=n.getComponent('LootChainGameRoot'); if(c) root=c; } });"

def ev(js, timeout=20):
    out = subprocess.run([sys.executable, os.path.join(HERE, 'native_js_eval.py'), js], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout).stdout.strip().splitlines()
    return out[-1] if out else ''

ap = argparse.ArgumentParser(); ap.add_argument('--item', type=int, default=0); ap.add_argument('--wait', type=float, default=9)
a = ap.parse_args()
pick = f"{a.item}" if a.item else "(root.lobbyEquipmentItems.find(i=>(i.enhanceLevel||0)<9)||{}).id"
print('view', ev(f"(()=>{{ {ROOT} if(!root) return 'noroot'; if(root.currentView!=='forge') root.openLobbyForgePanel(null, null); return root.currentView; }})()"))
time.sleep(1.5)
print('hook', ev(f"""(()=>{{ {ROOT} window.__t={{}}; const T=window.__t;
  const fr=root.lobbyForgePanelRenderer;
  const of=fr.spawnForgeFlash.bind(fr); fr.spawnForgeFlash=function(...x){{ T.flash=Date.now(); return of(...x); }};
  const op=root.spawnPowerDeltaFloat.bind(root); root.spawnPowerDeltaFloat=function(...x){{ T.float=Date.now(); T.delta=x[0]; return op(...x); }};
  const orr=root.refreshLobbyHeroEquipDialog.bind(root); root.refreshLobbyHeroEquipDialog=function(...x){{ const t0=Date.now(); const r=orr(...x); T.rebuild_ms=Date.now()-t0; T.rebuild_at=Date.now(); return r; }};
  const oe=root.api.equipment.enhance.bind(root.api.equipment); root.api.equipment.enhance=async function(...x){{ T.api0=Date.now(); const r=await oe(...x); T.api1=Date.now(); T.ok=r&&r.success; T.hpa=r&&r.heroPowerAfter; return r; }};
  const id={pick}; T.item=id; root.selectLobbyForgeEnhanceSlot(id); return 'hooked '+id; }})()"""))
time.sleep(2)
print('click', ev(f"""(()=>{{ {ROOT} let b=null; cc.director.getScene().walk(n=>{{ if(!b && n.name==='ForgeEnhConfirm') b=n; }});
  const btn=b&&b.getComponent('cc.Button'); if(!btn) return 'no-button'; let txt=''; b.children.forEach(c=>{{ const l=c.getComponent('cc.Label'); if(l) txt=l.string; }});
  window.__t.click=Date.now(); b.emit(cc.Button.EventType.CLICK, btn); return 'clicked ['+txt+']'; }})()"""))
time.sleep(a.wait)
raw = ev("(()=>{ const t=window.__t||{}; const o={item:t.item, ok:t.ok, delta:t.delta, heroPowerAfter:t.hpa}; if(t.click&&t.api0) o.click_to_api_ms=t.api0-t.click; if(t.api0&&t.api1) o.api_ms=t.api1-t.api0; if(t.flash&&t.float) o.flash_to_float_ms=t.float-t.flash; if(t.float&&t.rebuild_at) o.float_to_rebuild_done_ms=t.rebuild_at-t.float; o.rebuild_ms=t.rebuild_ms; return JSON.stringify(o); })()")
print('result', raw)
