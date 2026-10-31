# -*- coding: utf-8 -*-
"""野外坐标表导出(docs/55 §2.2):无头 Edge 打开网页包,读前端地图定义(window.__lootchainWorldMaps),
生成后端 FieldGeometry.java(锚点 / 宝箱 / 兴趣点 / 怪群坐标),服务端领奖位置校验用。改地图布局后重跑。
锚点 = 传送阵、传送阵旁默认落点(x + 40, y - 150)、出生点、其他图出口通往本图的落点。
用法:PREVIEW_PORT=7460 python tools/qa/export_world_geometry.py
"""
import asyncio, json, os, shutil, subprocess, sys, time, urllib.request
import websockets
import boss_bar_cdp as base

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(ROOT), 'LootChain', 'lootchain-core', 'src', 'main', 'java', 'com', 'lootchain', 'game', 'world', 'support', 'FieldGeometry.java')
JS_CC = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 120; i++) { if (window.__lootchainWorldMaps) return 'ok'; await sleep(1000); } return 'missing'; })()"""
DUMP = r"""(() => { const W = window.__lootchainWorldMaps; const out = {}; for (const [code, d] of Object.entries(W)) {
  out[code] = { waypoint: [d.waypoint.x, d.waypoint.y], spawn: [d.spawn.x, d.spawn.y],
    exits: (d.exits || []).map(e => [e.toMap, e.toSpawn.x, e.toSpawn.y]),
    chests: (d.chests || []).map(c => [c.code, c.x, c.y]), pois: (d.pois || []).map(p => [p.code, p.x, p.y]),
    camps: (d.camps || []).map(c => [c.stageCode, c.x, c.y, c.radius || 0]) }; } return JSON.stringify(out); })()"""


async def main():
    profile = base.PROFILE + '_geom'
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([base.EDGE, '--headless=new', f'--remote-debugging-port={base.PORT}', f'--user-data-dir={profile}', '--no-first-run',
                             '--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'])
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{base.PORT}/json/version', timeout=1)
                break
            except Exception:
                time.sleep(0.3)
        tab = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{base.PORT}/json/new?about:blank', method='PUT'), timeout=5))
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=None, ping_interval=None) as ws:
            seq = 0

            async def call(m, p=None, timeout=300):
                nonlocal seq
                seq += 1
                my = seq
                await ws.send(json.dumps({'id': my, 'method': m, 'params': p or {}}))
                while True:
                    x = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if x.get('id') == my:
                        return x

            async def ev(expr, timeout=200):
                r = await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)
                return r.get('result', {}).get('result', {}).get('value')

            await call('Page.navigate', {'url': base.PAGE})
            print('maps', await ev(JS_CC), flush=True)
            data = json.loads(await ev(DUMP))
    finally:
        proc.kill()
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)

    anchors = {code: [d['waypoint'], [d['waypoint'][0] + 40, d['waypoint'][1] - 150], d['spawn']] for code, d in data.items()}
    for code, d in data.items():
        for to_map, x, y in d['exits']:
            if to_map in anchors:
                anchors[to_map].append([x, y])
    lines = []
    for code, pts in anchors.items():
        arr = ', '.join(f'{{{round(x)}, {round(y)}}}' for x, y in pts)
        lines.append(f'        ANCHORS.put(FieldStageRules.MapCode.{code}, List.of(new int[][]{{{arr}}}));')
    points = []
    for code, d in data.items():
        for c, x, y in d['chests']:
            points.append(f'        point("CHEST:{c}", {round(x)}, {round(y)}, 0);')
        for c, x, y in d['pois']:
            points.append(f'        point("POI:{c}", {round(x)}, {round(y)}, 0);')
        for c, x, y, r in d['camps']:
            points.append(f'        point("CAMP:{c}", {round(x)}, {round(y)}, {round(r)});')
    java = f'''package com.lootchain.game.world.support;

import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 野外坐标表(docs/55 §2.2;**本文件由 lootchain-cocos/tools/qa/export_world_geometry.py 从前端地图定义生成,别手改**)。
 * 单位 = 前端世界单位。锚点 = 合法瞬移落点(传送阵 / 传送阵旁 / 出生点 / 出口落点);点位 key = CHEST:码 / POI:码 / CAMP:关卡码,
 * 值 = {{x, y, 半径(怪群散开半径,其余 0)}}。
 */
public final class FieldGeometry {{

    private static final Map<FieldStageRules.MapCode, List<int[]>> ANCHORS = new EnumMap<>(FieldStageRules.MapCode.class);
    private static final Map<String, int[]> POINTS = new HashMap<>();

    static {{
{chr(10).join(lines)}
{chr(10).join(points)}
    }}

    private FieldGeometry() {{}}

    private static void point(String key, int x, int y, int radius) {{
        POINTS.put(key, new int[]{{x, y, radius}});
    }}

    public static List<int[]> anchors(FieldStageRules.MapCode map) {{
        return ANCHORS.getOrDefault(map, List.of());
    }}

    /** {{x, y, 半径}};没有这个点返回 null。 */
    public static int[] point(String key) {{
        return POINTS.get(key);
    }}
}}
'''
    open(OUT, 'w', encoding='utf-8').write(java)
    print('wrote', OUT, len(points), 'points')


if __name__ == '__main__':
    asyncio.run(main())
