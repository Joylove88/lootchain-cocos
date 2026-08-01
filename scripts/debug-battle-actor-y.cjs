/* eslint-disable no-console */
// 诊断:战斗中各 actor/spine 节点 Y 与骨骼 bounds,定位"白银圣枪悬空"。只读观测,不改断言。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PREVIEW_URL = process.env.COCOS_PREVIEW_ORIGIN || 'http://localhost:7456/';
const OUT_DIR = path.join(__dirname, '..', 'temp', 'debug-actor-y');
const WANTED = ['SSR_KANE', 'UR_ARTHAS', 'SSR_LIVIA', 'SR_PALADIN_02', 'R_GUARD_07'];

const sceneNodeExists = (name) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  let found = false;
  const walk = (node) => {
    if (!node || found) return;
    if (node.name === name && node.activeInHierarchy) { found = true; return; }
    for (const child of node.children || []) walk(child);
  };
  walk(scene);
  return found;
};

const emitSceneButtonClick = (buttonNodeName) => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  let target = null;
  const walk = (node) => {
    if (!node || target) return;
    if (node.name === buttonNodeName && node.activeInHierarchy) { target = node; return; }
    for (const child of node.children || []) walk(child);
  };
  walk(scene);
  if (!target) return false;
  target.emit(cc.Button.EventType.CLICK, target.getComponent(cc.Button));
  return true;
};

const sampleActors = () => {
  const cc = globalThis.cc;
  const scene = cc?.director?.getScene?.();
  const actors = [];
  const walk = (node) => {
    if (!node) return;
    if (/^LobbyBattleActor_(Ally|Enemy)_\d+$/.test(node.name) && node.activeInHierarchy) {
      const wp = node.worldPosition;
      const record = {
        name: node.name,
        actorWorld: { x: Math.round(wp.x), y: Math.round(wp.y) },
        actorSize: { w: Math.round(node._uiProps?.uiTransformComp?.width ?? 0), h: Math.round(node._uiProps?.uiTransformComp?.height ?? 0) },
        spine: null,
      };
      const findSpine = (n) => {
        if (!n) return null;
        const comp = (n.components || []).find((c) => /Skeleton/.test(c?.constructor?.name || ''));
        if (comp) return { n, comp };
        for (const child of n.children || []) {
          const hit = findSpine(child);
          if (hit) return hit;
        }
        return null;
      };
      const spineHit = findSpine(node);
      if (spineHit) {
        const sn = spineHit.n;
        const sw = sn.worldPosition;
        let raw = null;
        try {
          const rd = spineHit.comp.skeletonData?.getRuntimeData?.(true);
          if (rd) raw = { x: Math.round(rd.x), y: Math.round(rd.y), w: Math.round(rd.width), h: Math.round(rd.height) };
        } catch (e) { raw = { err: String(e) }; }
        record.spine = {
          asset: spineHit.comp.skeletonData?.name ?? spineHit.comp.skeletonData?._name ?? '?',
          local: { x: Math.round(sn.position.x), y: Math.round(sn.position.y) },
          world: { x: Math.round(sw.x), y: Math.round(sw.y) },
          scaleY: Number(sn.scale.y.toFixed(4)),
          raw,
          boundsBottomWorldY: raw && raw.y !== undefined ? Math.round(sw.y + raw.y * sn.scale.y) : null,
          originWorldY: Math.round(sw.y),
        };
      }
      actors.push(record);
      return;
    }
    for (const child of node.children || []) walk(child);
  };
  walk(scene);
  return actors;
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(`${PREVIEW_URL}?r=debug-actor-y-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(15000);
  await page.mouse.click(640, 652);
  await page.waitForTimeout(2600);
  await page.mouse.click(640, 421);
  await page.waitForTimeout(9000);

  const heroes = await page.evaluate(async () => {
    const tokenName = localStorage.getItem('lootchain.player.tokenName');
    const tokenValue = localStorage.getItem('lootchain.player.tokenValue');
    const response = await fetch('http://localhost:8081/api/player/lobby/heroes', {
      headers: { [tokenName]: tokenValue, 'Accept-Language': 'zh-CN' },
    });
    return (await response.json()).data ?? [];
  });
  const picked = WANTED
    .map((code) => heroes.find((hero) => hero.heroCode === code))
    .filter(Boolean)
    .map((hero) => ({ id: Number(hero.id), heroCode: hero.heroCode, spineAsset: hero.spineAsset, portraitAsset: hero.portraitAsset, rarity: hero.rarity }));
  console.log('forced formation:', JSON.stringify(picked));
  const heroIds = picked.map((hero) => hero.id);

  await page.route('**/api/player/battles/start', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') { await route.continue(); return; }
    const body = JSON.parse(request.postData() || '{}');
    body.heroIds = heroIds;
    await route.continue({ postData: JSON.stringify(body) });
  });

  const clickUntilNode = async (x, y, nodeName, attempts, fallbackButtonName) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      // 有事件兜底名时每次都直接 emit(布局改版后物理坐标不再可靠)。
      if (fallbackButtonName) {
        await page.evaluate(emitSceneButtonClick, fallbackButtonName).catch(() => false);
      } else {
        await page.mouse.click(x, y);
      }
      const appeared = await page.waitForFunction(sceneNodeExists, nodeName, { timeout: 4000 }).then(() => true).catch(() => false);
      if (appeared) return true;
    }
    return false;
  };

  await clickUntilNode(1125, 690, 'LobbyAdventureFormationButton', 3);
  await page.waitForTimeout(2500);
  await clickUntilNode(0, 0, 'BattleChallengeDialogPanel', 3, 'LobbyAdventureFormationButton');
  await page.waitForTimeout(800);
  await clickUntilNode(0, 0, 'LobbyBattleSceneRoot', 3, 'BattleChallengeDialogChallengeButton');

  const settleRequests = [];
  const battleEnteredAt = Date.now();
  page.on('request', (request) => {
    if (/\/api\/player\/battles\/[^/]+\/settle/.test(request.url())) {
      settleRequests.push({ atMs: Date.now() - battleEnteredAt, url: request.url() });
    }
  });
  const samples = [];
  const moments = [1500, 3500, 6000, 9000, 12000, 16000, 20000];
  let lastAt = 0;
  for (const at of moments) {
    await page.waitForTimeout(at - lastAt);
    lastAt = at;
    const actors = await page.evaluate(sampleActors);
    samples.push({ atMs: at, actors });
    await page.screenshot({ path: path.join(OUT_DIR, `battle-${at}ms.png`) });
  }

  fs.writeFileSync(path.join(OUT_DIR, 'samples.json'), JSON.stringify({ picked, samples }, null, 2), 'utf8');
  await browser.close();

  for (const sample of samples) {
    console.log(`--- ${sample.atMs}ms ---`);
    for (const actor of sample.actors) {
      const spine = actor.spine;
      console.log(`${actor.name} actorY=${actor.actorWorld.y} slotH=${actor.actorSize.h}`
        + (spine ? ` | ${spine.asset} spineLocalY=${spine.local.y} scaleY=${spine.scaleY} raw=${JSON.stringify(spine.raw)} originWorldY=${spine.originWorldY} boundsBottomWorldY=${spine.boundsBottomWorldY}` : ' | no-spine'));
    }
  }
  console.log(`settle requests: ${JSON.stringify(settleRequests)}`);
  console.log(`out: ${OUT_DIR}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
