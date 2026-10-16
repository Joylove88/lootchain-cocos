// 原生调试包:测 XHR 往返耗时(登录 guidetest02 后连测几个接口)。用法:
// python tools/qa/native_js_eval.py --port <端口> --timeout 90 --file tools/qa/native_xhr_timing.js
(async () => {
  const base = 'http://localhost:8081';
  const xhr = (method, path, body, headers) => new Promise((resolve) => {
    const t0 = Date.now();
    const x = new XMLHttpRequest();
    x.open(method, base + path, true);
    x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.onreadystatechange = () => {
      if (x.readyState === 4) {
        let data = null;
        try { data = JSON.parse(x.responseText || '{}'); } catch (e) { /* ignore */ }
        resolve({ ms: Date.now() - t0, status: x.status, data });
      }
    };
    x.send(body ? JSON.stringify(body) : null);
  });
  const login = await xhr('POST', '/api/player/auth/login', { username: 'guidetest02', password: 'pass1234' });
  const d = (login.data && login.data.data) || {};
  const h = {}; h[d.tokenName || 'satoken'] = d.tokenValue || d.token;
  const out = { login: login.ms };
  for (const p of ['/api/player/me/lobby', '/api/player/lobby/heroes', '/api/player/equipment']) {
    const ts = [];
    for (let i = 0; i < 4; i++) ts.push((await xhr('GET', p, null, h)).ms);
    out[p] = ts;
  }
  const t0 = Date.now();
  await Promise.all(['/api/player/me/lobby', '/api/player/lobby/heroes', '/api/player/equipment', '/api/player/bag'].map((p) => xhr('GET', p, null, h)));
  out.parallel4 = Date.now() - t0;
  return out;
})()
