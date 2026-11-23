// 策划通玩「自动跟主线」驱动(2026-11-23):由 playtest_autopilot.py 拼进 playtest_cdp.py 的步骤里(接在 PRELUDE 后面)。
// 每段跑 AP_SEC 秒:处理弹窗 / 剧情 / 进化抉择 / 契约 → 按任务指引(primaryQuest + resolveQuestGuide)走路、和 NPC 交接、打怪、过出口。
// 遇到不认识的界面(离开大厅视图、指引去传送阵、反复卡同一个目标)就停下,交给手动步骤。
// 状态存在 window.__apState(跨步骤累计),每段返回本段事件日志 + 当前快照。
const AP = window.__apState || (window.__apState = { t0: Date.now(), events: [], lastQuest: '', lastLevel: 0, lastMap: '', fights: 0, kills: 0, deaths: 0, stuck: 0, repeat: {}, gold: null });
const slice = [];
const stamp = () => { const s = Math.round((Date.now() - AP.t0) / 1000); return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0'); };
const ev = (s) => { const line = stamp() + ' ' + s; AP.events.push(line); slice.push(line); };
const W = () => { try { return t.host.currentWorldState(); } catch (e) { return null; } };
const PROFILE = () => { try { return t.host.currentLobbyProfile(); } catch (e) { return null; } };
const HUD_RE = /^(LobbyTownWorld|LobbySystemIcon|LobbyTownMinimap|LobbyWorldQuestTracker|LobbyTownWorldMapBtn|LobbyField|LobbyUnstuck|LobbyCoach|LobbyTownJoystick|LobbyLeaderBar|LobbyPartyBar)/;
const inWorld = n => { let p = n; while (p) { if (HUD_RE.test(p.name) || /Joystick/.test(p.name)) return true; p = p.parent; } return false; };
const labelOf = n => { let s = ''; n.walk(c => { const l = c.getComponent(cc.Label); if (l && !s && l.string && l.string.trim()) s = l.string.trim(); }); return s; };
const PRI = [/^(领取奖励|领取|完成任务|交付|完成|收下奖励)/, /^(收下|确定|知道了|好的|好)$/, /^(接受任务|接受|开始训练|开始|出发)/, /^(继续|点击继续|点击开始|下一步)/, /^关闭$/];
const overlayButtons = () => { const c = []; cc.director.getScene().walk(n => { if (!n.activeInHierarchy) return; const b = n.getComponent(cc.Button); if (!b || b.interactable === false || inWorld(n)) return; if (/^Card_|^Prompt_/.test(n.name)) return; const s = labelOf(n); const pr = PRI.findIndex(re => re.test(s)); if (pr >= 0) c.push({ n, s, pr }); }); c.sort((a, b) => a.pr - b.pr); return c; };
const HUD_TXT = /^(召唤|商店|邮件|终端|N|传送|切换目标|vConsole|\d+ , \d+)$/;
const overlayTexts = (max = 14) => { const out = []; cc.director.getScene().walk(n => { if (!n.activeInHierarchy) return; const l = n.getComponent(cc.Label); if (!l || !l.string || !l.string.trim() || inWorld(n)) return; const op = n.getComponent(cc.UIOpacity); if (op && op.opacity < 10) return; const s = l.string.replace(/\s+/g, ' ').slice(0, 70); if (!HUD_TXT.test(s)) out.push(s); }); return [...new Set(out)].slice(0, max); };
const joyPush = async (x, y, ms) => { const dx = x - t.leader.x, dy = y - t.leader.y, len = Math.hypot(dx, dy) || 1; t.joy = { active: true, id: 99, dx: dx / len, dy: dy / len }; await sleep(ms); t.joy = { active: false, id: -1, dx: 0, dy: 0 }; };
const questKey = (q) => q ? q.code + ':' + q.state + ((q.objective === 'KILL' || q.objective === 'COLLECT') && q.state === 'ACCEPTED' ? ' ' + Math.min(q.progress, q.target) + '/' + q.target : '') : 'none';

// 绕路用的寻路器:生成步骤时注入了仓库里当前版本的 TownPathfinder(PF2,带逐段真实碰撞校验),没注入就退回页面自带的
const pfNow = () => {
  if (typeof PF2 === 'undefined') return t.pathfinder;
  const code = t.def.code;
  if (window.__apPF && window.__apPF.code === code) return window.__apPF.pf;
  const def = t.def; let pf;
  if (def.scene) { const sc = def.scene; const cell = sc.walk.cell * sc.unit; const rows = sc.walk.rows.length; const left = (-sc.px[0] / 2) * sc.unit; const bottom = (sc.px[1] / 2 - rows * sc.walk.cell) * sc.unit; pf = new PF2(left, bottom, sc.walk.cols * cell, rows * cell, (x, y) => t.walkable(x, y), cell); }
  else { const w = def.walk; const zones = def.buildings.filter(b => b.walkMask).map(b => { const xs = b.walkMask.outline.map(q => b.x + q[0]); const ys = b.walkMask.outline.map(q => b.y + q[1]); return { l: Math.min(...xs) - 60, r: Math.max(...xs) + 60, b: Math.min(...ys) - 60, t: Math.max(...ys) + 60 }; });
    const probe = zones.length ? (ax, ay, bx, by) => zones.some(z => Math.max(ax, bx) >= z.l && Math.min(ax, bx) <= z.r && Math.max(ay, by) >= z.b && Math.min(ay, by) <= z.t) : null;
    pf = new PF2(w.left, w.bottom, w.right - w.left, w.top - w.bottom, (x, y) => t.walkable(x, y), zones.length ? 40 : undefined, probe); }
  window.__apPF = { code, pf }; return pf;
};

const track = () => {
  const w = W(); if (!w || !t || !t.def) return;
  const q = t.primaryQuest(w);
  const key = questKey(q);
  if (key !== AP.lastQuest) { ev('任务 ' + key + (q ? ' 「' + q.name + '」' + (q.state === 'LOCKED' ? ' 需 Lv.' + q.minLevel : '') : '')); AP.lastQuest = key; }
  if (w.playerLevel && w.playerLevel !== AP.lastLevel) { const p = PROFILE(); ev('等级 Lv.' + w.playerLevel + (p && p.gold != null ? ' 金币 ' + p.gold : '') + (p && p.diamond != null ? ' 钻石 ' + p.diamond : '')); AP.lastLevel = w.playerLevel; }
  if (t.def.code !== AP.lastMap) { ev('地图 ' + t.def.code + ' (' + t.def.name + ')'); AP.lastMap = t.def.code; }
  // docs/57 引导核对:引导 / 聚光 / 手指 / 说明卡类节点第一次出现时记一笔(带上它的文字)
  const guides = []; cc.director.getScene().walk(n => { if (n.activeInHierarchy && /Guide|Spotlight|Finger|Coach|Tutorial|Tip|Hint|Teach|IntroCard|FeatureCard/.test(n.name) && n.name !== 'GuidePointer') { let s = ''; n.walk(c => { const l = c.getComponent(cc.Label); if (l && l.string && s.length < 60) s += l.string.replace(/\s+/g, ' ') + ' '; }); guides.push(n.name + (s ? '「' + s.trim().slice(0, 60) + '」' : '')); } });
  const gk = [...new Set(guides)].join(' | ');
  if (gk && gk !== AP.lastGuide) { ev('引导 ' + gk.slice(0, 240)); }
  AP.lastGuide = gk;
};

const handleOverlay = async () => {
  const cin = find('LobbyAwakenCinematic');
  if (cin) { const d = find('Dialogue'); let txt = ''; if (d) d.walk(n => { const l = n.getComponent(cc.Label); if (l && l.string && !/点击继续/.test(l.string)) txt += l.string.replace(/\s+/g, ' ') + ' '; }); if (txt && txt !== AP.lastCin) { ev('剧情: ' + txt.slice(0, 120)); AP.lastCin = txt; } tap(cin); await sleep(1300); return true; }
  const tx = overlayTexts(120).join(' ');
  const confirm = find('Confirm');
  if (confirm && /进\s*化/.test(tx)) { ev('进化抉择 → 确认默认项: ' + overlayTexts(12).join(' / ').slice(0, 220)); tap(confirm); await sleep(1600); return true; }
  const cards = []; cc.director.getScene().walk(n => { if (n.activeInHierarchy && /^Card_/.test(n.name)) cards.push(n); });
  if (cards.length && /契约/.test(tx)) { tap(cards[0]); await sleep(700); let btn = null; cc.director.getScene().walk(n => { if (!btn && n.activeInHierarchy && n.getComponent(cc.Button) && /订立契约/.test(labelOf(n))) btn = n; }); ev('契约之选: 选 ' + cards[0].name + (btn ? ' → 订立契约' : ' (没找到订立按钮)')); if (btn) tap(btn); await sleep(2600); return true; }
  const ob = overlayButtons();
  if (ob.length) { const b = ob[0]; ev('点「' + b.s + '」 ← ' + overlayTexts(10).filter(s => s !== b.s).join(' / ').slice(0, 200)); tap(b.n); await sleep(1400); return true; }
  const mc = find('MapClose'); if (mc) { tap(mc); await sleep(600); return true; }
  return false;
};

const fightNear = async (cx, cy, radius, maxSec, withDummy) => {
  const t0 = Date.now(); const hp0 = t.leaderMaxHp ? t.leaderHp / t.leaderMaxHp : 1; let loops = 0; let seen = new Set();
  while ((Date.now() - t0) / 1000 < maxSec) {
    refresh(); if (view() !== 'lobby' || !t || !t.leader) return 'view';
    if (await handleOverlay()) continue;
    if (t.leaderDead) { AP.deaths++; ev('阵亡 @' + Math.round(t.leader.x) + ',' + Math.round(t.leader.y) + ' ' + t.def.code); await sleep(5000); return 'dead'; }
    const alive = (t.monsters || []).filter(m => !m.dead && (withDummy || !m.camp.dummy) && Math.hypot(m.x - cx, m.y - cy) < radius);
    alive.forEach(m => seen.add(m));
    if (!alive.length) break;
    const m = alive.sort((a, b) => Math.hypot(a.x - t.leader.x, a.y - t.leader.y) - Math.hypot(b.x - t.leader.x, b.y - t.leader.y))[0];
    const d = Math.hypot(m.x - t.leader.x, m.y - t.leader.y);
    if (d > 150) {
      const before = d; await joyPush(m.x, m.y, Math.min(800, d * 2.5));
      // 直线推不近(怪在栅栏 / 拒马对面):像玩家一样绕——用寻路器算路,摇杆沿折点走(交战中游戏会取消自动寻路,只能手推)
      if (Math.hypot(m.x - t.leader.x, m.y - t.leader.y) > before - 20) {
        AP.blockedPush = (AP.blockedPush || 0) + 1;
        if (AP.blockedPush >= 2) {
          const path = pfNow() && pfNow().find(t.leader.x, t.leader.y, m.x, m.y);
          if (path) { if (!AP.detourLogged) { ev('怪在障碍对面,手动绕路 ' + path.length + ' 个折点'); AP.detourLogged = true; } for (const q of path.slice(0, 10)) { const e = Date.now() + 2500; while (Date.now() < e) { const dx = q.x - t.leader.x, dy = q.y - t.leader.y, dd = Math.hypot(dx, dy); if (dd < 40) break; t.joy = { active: true, id: 98, dx: dx / dd, dy: dy / dd }; await sleep(120); } t.joy = { active: false, id: -1, dx: 0, dy: 0 }; } }
          AP.blockedPush = 0;
        }
      } else { AP.blockedPush = 0; }
      continue;
    }
    for (let k = 0; k < 5; k++) { try { t.leaderAttack(); } catch (e) {} await sleep(230); }
    loops++;
    if (loops % 2 === 1) { try { t.leaderSkill(loops % 3); } catch (e) {} }
  }
  const killed = [...seen].filter(m => m.dead).length;
  if (seen.size) { AP.fights++; AP.kills += killed; const hp1 = t.leaderMaxHp ? t.leaderHp / t.leaderMaxHp : 1; ev('战斗 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's 击杀 ' + killed + '/' + seen.size + ' 血量 ' + Math.round(hp0 * 100) + '%→' + Math.round(hp1 * 100) + '%' + (withDummy ? ' (稻草靶)' : '')); }
  return 'done';
};

const walkTo = async (x, y, near, maxSec, tag) => {
  const map0 = t.def.code; const t0 = Date.now(); let ok = t.autoWalkTo(x, y);
  if (!ok) ev('寻路失败(' + tag + ') @' + Math.round(t.leader.x) + ',' + Math.round(t.leader.y) + ' → ' + Math.round(x) + ',' + Math.round(y));
  let last = [t.leader.x, t.leader.y], lastMove = Date.now();
  while ((Date.now() - t0) / 1000 < maxSec) {
    await sleep(300); refresh();
    if (view() !== 'lobby' || !t || !t.leader) return 'view';
    if (t.def.code !== map0) return 'map';
    if (overlayButtons().length || find('LobbyAwakenCinematic')) return 'overlay';
    if (t.inCombat) return 'combat';
    if (Math.hypot(t.leader.x - x, t.leader.y - y) < near) { t.autoPath = null; return 'arrived'; }
    if (!t.autoPath) { await joyPush(x, y, 700); ok = t.autoWalkTo(x, y); }
    if (Math.hypot(t.leader.x - last[0], t.leader.y - last[1]) > 20) { last = [t.leader.x, t.leader.y]; lastMove = Date.now(); }
    else if (Date.now() - lastMove > 6000) { AP.stuck++; ev('卡住(' + tag + ') @' + Math.round(t.leader.x) + ',' + Math.round(t.leader.y) + ' 目标 ' + Math.round(x) + ',' + Math.round(y)); t.autoPath = null; return 'stuck'; }
  }
  return 'timeout';
};

const apRun = async (sec) => {
  const end = Date.now() + sec * 1000; let lastTarget = ''; let sameCount = 0;
  while (Date.now() < end) {
    refresh();
    if (!root) { await sleep(1000); continue; }
    if (view() !== 'lobby') { ev('停:离开大厅视图 → ' + view()); return 'view'; }
    if (!t || !t.isMounted || !t.isMounted() || !t.leader) { await sleep(800); continue; }
    track();
    if (await handleOverlay()) continue;
    if (t.inCombat) { const r0 = AP.fights; await fightNear(t.leader.x, t.leader.y, 950, 60, false); if (AP.fights === r0) { AP.idleCombat = (AP.idleCombat || 0) + 1; if (AP.idleCombat % 5 === 1) ev("战斗中但 950 内没有可打的怪(交战状态挂着),寻路被取消"); } continue; }
    const w = W(); const q = t.primaryQuest(w);
    if (!q) { ev('停:没有任务了'); return 'noquest'; }
    const guide = t.resolveQuestGuide(w); const p = guide && t.guideTargetPoint(guide);
    if (!p) { ev('停:没有指引 ' + q.code + ' ' + q.state + ' ' + q.objective + ' ' + q.objectiveTarget + ' map ' + q.map); return 'noguide'; }
    // 养成类(召唤 / 升级英雄 / 编队)要进系统界面操作:接到后停下交给手动步骤
    if (q.objective === 'GROW' && q.state === 'ACCEPTED') { ev('停:养成任务 ' + q.code + ' ' + q.objectiveTarget + ' 「' + q.name + '」'); return 'grow'; }
    const key = questKey(q) + '@' + Math.round(p.x) + ',' + Math.round(p.y);
    sameCount = key === lastTarget ? sameCount + 1 : 0; lastTarget = key;
    if (sameCount >= 8) { ev('停:同一目标反复 8 次没进展 ' + key + ' 「' + p.label + '」'); return 'loop'; }
    const near = (a) => Math.hypot(a.x - p.x, a.y - p.y) < 6;
    const exit = t.def.exits.find(near);
    const camp = t.def.camps.find(near);
    const npc = t.def.npcs.find(near);
    const poi = (t.def.pois || []).find(near);
    if (t.def.waypoint && near(t.def.waypoint) && !exit) { ev('停:指引去传送阵「' + p.label + '」(要手动选图)'); return 'waypoint'; }
    if (exit) { const r = await walkTo(exit.x, exit.y, 25, 120, '出口 ' + exit.label); if (r === 'arrived' || r === 'timeout') { await joyPush(exit.x + (exit.x - t.leader.x), exit.y + (exit.y - t.leader.y), 900); } for (let i = 0; i < 20; i++) { refresh(); if (t && t.def && t.def.code !== AP.lastMap && t.isMounted()) break; await sleep(500); } await sleep(1500); continue; }
    if (camp) { const r = await walkTo(camp.x - 180, camp.y, 240, 90, '怪群 ' + camp.label); if (r === 'view') continue; await fightNear(camp.x, camp.y, 950, 120, !!camp.dummy); if (!(t.monsters || []).some(m => !m.dead && (camp.dummy || !m.camp.dummy) && Math.hypot(m.x - camp.x, m.y - camp.y) < 950)) await sleep(1500); continue; }
    if (npc || poi || q.state === 'DONE' || q.state === 'AVAILABLE' || q.objective === 'TALK' || q.objective === 'GROW') {
      const r = await walkTo(p.x, p.y - 70, 120, 90, (npc ? 'NPC ' : '点 ') + p.label);
      if (r !== 'arrived' && r !== 'overlay') continue;
      await sleep(400); refresh();
      // 交互条可能有好几条(公告板旁边站着闲聊 NPC):优先点文字里带目标名的那条
      const want = String(p.label || '').split(/[·(（]/).map(s => s.trim()).filter(s => s.length >= 2);
      const list = []; for (let i = 0; i < 5; i++) { const n = find('Prompt_' + i); if (!n) break; list.push({ n, s: labelOf(n) }); }
      const hit = list.find(o => want.some(w => o.s.includes(w))) || list[0];
      if (hit) { ev('交互「' + hit.s + '」' + (list.length > 1 ? ' (共 ' + list.length + ' 条:' + list.map(o => o.s).join(' / ') + ')' : '')); tap(hit.n); await sleep(1600); } else { await joyPush(p.x, p.y, 500); }
      continue;
    }
    await walkTo(p.x, p.y, 120, 90, '指引 ' + p.label);
  }
  return 'slice';
};

const apSnapshot = () => { refresh(); const w = W(); const q = t && w ? t.primaryQuest(w) : null; const p = PROFILE(); return { view: view(), map: t && t.def ? t.def.code : null, lv: w ? w.playerLevel : null, quest: q ? questKey(q) + ' 「' + q.name + '」' : null, gold: p ? p.gold : null, diamond: p ? p.diamond : null, at: t && t.leader ? [Math.round(t.leader.x), Math.round(t.leader.y)] : null, hp: t ? Math.round(t.leaderHp) + '/' + Math.round(t.leaderMaxHp) : null, totals: { fights: AP.fights, kills: AP.kills, deaths: AP.deaths, stuck: AP.stuck } }; };
