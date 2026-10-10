# -*- coding: utf-8 -*-
"""真机盯「确认退出」:挂到手机 Chrome 游戏页,记录退出确认按钮的触摸事件、退出流程各步调用与异常(2026-10-10 用户「点确认退出没反应」)。
前提同 phone_probe.py(adb tcpip 5555 + forward tcp:9555)。用法:python phone_exit_watch.py [--secs 300]
"""
import asyncio, json, re, socket, sys, time
import websockets

ARGS = sys.argv[1:]
OPT = lambda k, d: ARGS[ARGS.index(k) + 1] if k in ARGS else d
SECS = int(OPT('--secs', '300'))
PORT = int(OPT('--port', '9555'))

INSTALL = r"""(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms));
  let cc = null; for (let i = 0; i < 10 && !cc; i++) { try { cc = await System.import('cc'); } catch (e) { await sleep(1000); } }
  if (!cc) return 'cc import failed'; window.__cc = cc;
  const s = cc.director.getScene(); let root = null; const walk = n => { if (root) return; const c = n.getComponent && n.getComponent('LootChainGameRoot'); if (c) { root = c; return; } n.children.forEach(walk); }; if (s) walk(s);
  if (!root) return 'no root'; window.__root = root; const gr = root.lobbyGuardBattleRenderer;
  const log = window.__exitLog = window.__exitLog || []; const push = (m) => { log.push([Math.round(performance.now()), m]); console.warn('[exitwatch] ' + m); };
  if (!window.__exitWatchInstalled) {
    window.__exitWatchInstalled = true;
    const wrap = (obj, name, label) => { const o = obj[name]; if (typeof o !== 'function') { push('no fn ' + label); return; } obj[name] = function () { push('call ' + label); try { const r = o.apply(this, arguments); push('done ' + label); return r; } catch (e) { push('THROW ' + label + ': ' + (e && e.stack || e).toString().slice(0, 500)); throw e; } }; };
    wrap(root, 'returnToLobbyFromBattlePreview', 'returnToLobbyFromBattlePreview');
    wrap(root, 'renderLobby', 'renderLobby');
    wrap(root, 'refreshLobbyReadonlyStateAfterBattle', 'refreshLobbyReadonlyStateAfterBattle');
    wrap(root.lobbyBattleFlow, 'cancel', 'lobbyBattleFlow.cancel');
    wrap(gr, 'unmount', 'guard.unmount');
    wrap(gr, 'openExitConfirm', 'guard.openExitConfirm');
    wrap(gr, 'closeExitConfirm', 'guard.closeExitConfirm');
    window.addEventListener('error', (e) => push('window.error ' + (e.message || '') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
    window.addEventListener('unhandledrejection', (e) => push('unhandledrejection ' + String(e.reason && e.reason.stack || e.reason).slice(0, 400)));
    // 每 300ms 找一次退出确认按钮,找到就挂触摸监听(弹层每次打开都是新节点)
    const seen = new WeakSet();
    setInterval(() => { try { let ok = null; const w = n => { if (ok) return; if (n.name === 'GuardExitConfirmOk') { ok = n; return; } n.children.forEach(w); }; w(cc.director.getScene());
      if (ok && !seen.has(ok)) { seen.add(ok); push('exit dialog open; ok button found, active=' + ok.activeInHierarchy);
        for (const t of ['touch-start', 'touch-end', 'touch-cancel']) ok.on(t, () => push('ok ' + t), null);
        // 同时记录覆盖层上所有触摸,看点到的是不是别的节点
        let ov = ok.parent; while (ov && ov.name !== 'GuardExitConfirmOverlay') ov = ov.parent;
        if (ov) ov.on('touch-end', (ev) => { const p = ev.getUILocation(); push('overlay touch-end at ' + Math.round(p.x) + ',' + Math.round(p.y) + ' target=' + (ev.target && ev.target.name)); }, null, true);
      } } catch (e) { push('watch err ' + e.message); } }, 300);
  }
  return 'installed view=' + root.currentView; })()"""

DUMP = r"""JSON.stringify((window.__exitLog || []).slice(-80))"""


def http_get(path):
    s = socket.create_connection(('127.0.0.1', PORT), timeout=20)
    s.sendall(f'GET {path} HTTP/1.1\r\nHost: localhost:{PORT}\r\nConnection: close\r\n\r\n'.encode())
    data = b''
    try:
        while True:
            c = s.recv(65536)
            if not c:
                break
            data += c
            head, _, body = data.partition(b'\r\n\r\n')
            m = re.search(rb'Content-Length:(\d+)', head)
            if m and len(body) >= int(m.group(1)):
                break
    except Exception:
        pass
    return data.partition(b'\r\n\r\n')[2]


async def main():
    tabs = json.loads(http_get('/json/list'))
    page = next((t for t in tabs if t.get('type') == 'page' and '7460' in t.get('url', '')), None)
    if not page:
        print('no game tab')
        return
    async with websockets.connect(page['webSocketDebuggerUrl'], max_size=None, ping_interval=None, open_timeout=30) as ws:
        seq = 0
        pending = {}

        async def reader():
            while True:
                m = json.loads(await ws.recv())
                meth = m.get('method')
                if meth == 'Runtime.exceptionThrown':
                    d = m['params']['exceptionDetails']
                    print(time.strftime('%H:%M:%S'), 'EXCEPTION', (d.get('exception', {}).get('description') or d.get('text', ''))[:900], flush=True)
                elif meth == 'Runtime.consoleAPICalled' and m['params'].get('type') in ('error', 'warning'):
                    s = ' '.join(str(a.get('value', a.get('description', '')))[:600] for a in m['params'].get('args', []))
                    print(time.strftime('%H:%M:%S'), 'console.' + m['params']['type'], s, flush=True)
                if 'id' in m and m['id'] in pending:
                    pending.pop(m['id']).set_result(m)

        task = asyncio.create_task(reader())

        async def call(method, params=None):
            nonlocal seq
            seq += 1
            fut = asyncio.get_event_loop().create_future()
            pending[seq] = fut
            await ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
            return await asyncio.wait_for(fut, 120)

        async def ev(expr):
            r = (await call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})).get('result', {})
            return 'EXC ' + str(r['exceptionDetails'])[:400] if 'exceptionDetails' in r else r.get('result', {}).get('value')

        await call('Runtime.enable')
        print('INSTALL', await ev(INSTALL), flush=True)
        t0 = time.time()
        while time.time() - t0 < SECS:
            await asyncio.sleep(5)
            if '"call returnToLobbyFromBattlePreview"' in (await ev(DUMP) or '') and time.time() - t0 > 10:
                await asyncio.sleep(4)
                break
        print('LOG', await ev(DUMP), flush=True)
        task.cancel()


asyncio.run(main())
