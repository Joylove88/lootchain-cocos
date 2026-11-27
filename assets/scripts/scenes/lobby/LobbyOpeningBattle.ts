/**
 * 开局爽感原型(2026-11-27,网址带 ?opening=v2 才开;不带时游戏与线上完全一样):
 * 建完主角直接在晨风村广场打一场「前世一战」—— 主角(炼魂装 + 夜帝残影)+ 3 名 UR 满配,4 波兽潮约 2~3 分钟,
 * 打完一句话收尾回到 Lv.1 正常开局。方案见 docs/开局爽感原型方案.md。
 *
 * 本文件只放数据和纯表现件(强队名单 / 波次 / 假掉落与光柱 / 连杀计数);战斗本身复用 LobbyTownRenderer 的野外战斗(opening 模式)。
 * 【全部是假的】掉落名字 / 品质 / 图标客户端随机,不进背包、不调接口;战斗不登记遭遇、不上报击杀。
 */
import { Graphics, Label, Node, Size, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, Vec3, resources, tween } from 'cc';
import type { LobbyHeroItemVO } from '../../types/LobbyHeroTypes';
import { rgba, type LobbyHudHost, type UiLayout } from './LobbyHudTypes';
import { gameAudio } from '../../audio/GameAudio';

// ── 开关 ──

/** off = 没开;once = 每个账号打一次;again = 每次进大厅都打(?opening=again,给反复试玩用)。 */
export type OpeningMode = 'off' | 'once' | 'again';

export function openingMode(): OpeningMode {
  const search = typeof location !== 'undefined' ? location.search ?? '' : '';
  const m = /[?&]opening=([a-z0-9]+)/i.exec(search);
  if (!m) {
    return 'off';
  }
  const v = m[1].toLowerCase();
  return v === 'v2' ? 'once' : v === 'again' ? 'again' : 'off';
}

export function openingOn(): boolean {
  return openingMode() !== 'off';
}

const DONE_KEY = 'lc_opening_v2_done_';

export function openingDone(userId: number): boolean {
  if (openingMode() === 'again') {
    return false;
  }
  try {
    return localStorage.getItem(`${DONE_KEY}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function markOpeningDone(userId: number): void {
  try {
    localStorage.setItem(`${DONE_KEY}${userId}`, '1');
  } catch {
    // 无痕模式写不进去:本会话内由调用方的内存标记兜底
  }
}

// ── 强队(主角 + 3 名 UR,西式立绘、各带满屏大招包)──

const OPENING_HEROES: Array<{ code: string; name: string; cls: string; spine: string; uuid: string }> = [
  { code: 'UR_AURELIA', name: '苍翎神射·奥蕾莉亚', cls: '射手', spine: 'Belladonna', uuid: '0b593cca-d1f8-4495-b6bf-2ed043f2d765' },
  { code: 'UR_EVELYN', name: '深渊魔女·伊芙琳', cls: '法师', spine: 'Nuu', uuid: '' },
  { code: 'UR_NYX', name: '影刃女皇·妮克丝', cls: '刺客', spine: 'Sphinx', uuid: 'a25ac6d0-765c-4ac9-bc9a-3945d8ad6c79' },
];

/** 假英雄的 id 用负数(-9001 起),绝不和真实 user_hero 撞号;没有主角时用男主占位。 */
export function buildOpeningParty(protagonist: LobbyHeroItemVO | null): LobbyHeroItemVO[] {
  const base: LobbyHeroItemVO = protagonist ?? {
    id: -9000, heroCode: 'PROTAGONIST_MALE_ATTACK', heroName: '夜帝', rarity: 'UR', heroClass: '战士', level: 60, star: 6, power: 0,
    protagonist: true, sourceType: 'PROTAGONIST', portraitAsset: null, spineAsset: 'protag_m',
  };
  const spine = base.spineAsset && !base.spineAsset.endsWith('_lh') ? `${base.spineAsset}_lh` : base.spineAsset;
  const lead: LobbyHeroItemVO = { ...base, id: base.id > 0 ? base.id : -9000, spineAsset: spine, level: 60, star: 6, rarity: 'UR' };
  return [lead, ...OPENING_HEROES.map((h, i) => ({
    id: -9001 - i, heroCode: h.code, heroName: h.name, rarity: 'UR', heroClass: h.cls, level: 60, star: 6, power: 0,
    protagonist: false, sourceType: 'OPENING', portraitAsset: h.spine, spineAsset: h.spine, spineUuid: h.uuid || null,
  }))];
}

// ── 数值(只在开局战斗里用,和服务端无关)──

export const OPENING_TUNING = {
  /** 队长攻击:连招每段 0.9~1.9 倍 → 900~1900;小怪 800 血 = 一刀一只。 */
  attack: 1000,
  leaderHp: 24000,
  companionAttack: 650,
  companionHp: 18000,
  /** 队长血量下限(比例):先尝到强,不会死。 */
  hpFloor: 0.3,
  /** 普攻 / 技能命中范围倍率(一刀清一片)。 */
  reachMul: 1.6,
  skillCdMul: 0.4,
  ultCdMs: 10_000,
  assistCdMs: 8_000,
  /** 伤害飘字字号倍率。 */
  floatMul: 1.4,
  /** 总时长上限:到点首领直接登场。 */
  bossByMs: 165_000,
};

export const OPENING_STAGE_PREFIX = 'OPENING_';

export interface OpeningSpawn {
  monsterCode: string;
  count: number;
  hp: number;
  hit: number;
  /** 借用林地营地的变种(专属骨骼 / 光环 / 读条重击):FIELD_WOODS_E 棕鬃熊、FIELD_WOODS_B 腐木巨熊。 */
  variantOf?: string;
  elite?: boolean;
  boss?: boolean;
  label: string;
}

export interface OpeningWave {
  title: string;
  spawns: OpeningSpawn[];
  /** 本波最多打多久(到点不管剩多少直接下一波)。 */
  maxMs: number;
}

const A = OPENING_TUNING.attack;

export const OPENING_WAVES: OpeningWave[] = [
  {
    title: '兽潮 · 第一波',
    maxMs: 35_000,
    spawns: [
      { monsterCode: 'MINI_RAT', count: 12, hp: A * 0.8, hit: 90, label: '长夜幼鼠' },
      { monsterCode: 'SMALL_SPIDER', count: 6, hp: A * 0.8, hit: 110, label: '蚀影蛛' },
    ],
  },
  {
    title: '兽潮 · 第二波',
    maxMs: 35_000,
    spawns: [
      { monsterCode: 'MEDIUM_DOG', count: 10, hp: A * 1.6, hit: 140, label: '长夜猎犬' },
      { monsterCode: 'SMALL_SPIDER', count: 10, hp: A * 0.8, hit: 110, label: '蚀影蛛' },
    ],
  },
  {
    title: '兽潮 · 第三波',
    maxMs: 40_000,
    spawns: [
      { monsterCode: 'MINI_RAT', count: 10, hp: A * 0.8, hit: 90, label: '长夜幼鼠' },
      { monsterCode: 'MEDIUM_DOG', count: 8, hp: A * 1.8, hit: 150, label: '长夜猎犬' },
      { monsterCode: 'SMALL_SPIDER', count: 6, hp: A * 0.9, hit: 110, label: '蚀影蛛' },
    ],
  },
  {
    title: '兽潮 · 精英来袭',
    maxMs: 50_000,
    spawns: [
      { monsterCode: 'MEDIUM_BEAR', count: 3, hp: A * 70, hit: 380, label: '狂化棕鬃熊', variantOf: 'FIELD_WOODS_E', elite: true },
      { monsterCode: 'MINI_RAT', count: 10, hp: A * 0.8, hit: 90, label: '长夜幼鼠' },
    ],
  },
  {
    title: '兽潮 · 最后一波',
    maxMs: 40_000,
    spawns: [
      { monsterCode: 'MEDIUM_DOG', count: 12, hp: A * 2, hit: 160, label: '长夜猎犬' },
      { monsterCode: 'SMALL_SPIDER', count: 12, hp: A * 1, hit: 120, label: '蚀影蛛' },
    ],
  },
  {
    title: '首领 · 腐木巨熊',
    maxMs: 120_000,
    spawns: [
      { monsterCode: 'MEDIUM_BEAR', count: 1, hp: A * 300, hit: 520, label: '腐木巨熊', variantOf: 'FIELD_WOODS_B', elite: true, boss: true },
      { monsterCode: 'MEDIUM_DOG', count: 8, hp: A * 2, hit: 150, label: '长夜猎犬' },
    ],
  },
];

/** 本波剩这么几只(不含首领)就提前放下一波,节奏不断。 */
export const OPENING_WAVE_NEXT_ALIVE = 3;

export const OPENING_LINES = {
  start: '这是你前世的力量——借你一战。',
  hint: '拖左边走 · 点右边打 · 亮起来的技能放出去',
  hintPc: 'WASD 移动 · J 普攻 · K L I 技能 · U 夜帝残影 · 1 2 3 援护',
  end: '力量睡着了。从这里开始,把它找回来。',
  loot: '前世的东西带不走 —— 去这一世再打出来。',
};

// ── 掉落品质(白 / 绿 / 蓝 / 紫 / 橙)──

export type LootRarity = 'white' | 'green' | 'blue' | 'purple' | 'orange';

export const RARITY_STYLE: Record<LootRarity, { name: string; color: [number, number, number]; beam: number; hold: number }> = {
  white: { name: '白', color: [226, 226, 226], beam: 0, hold: 0.45 },
  green: { name: '绿', color: [110, 226, 120], beam: 0, hold: 0.5 },
  blue: { name: '蓝', color: [90, 170, 255], beam: 1, hold: 0.7 },
  purple: { name: '紫', color: [196, 110, 255], beam: 2, hold: 1.2 },
  orange: { name: '橙', color: [255, 160, 50], beam: 3, hold: 1.4 },
};

const SLOTS = ['weapon', 'helmet', 'chest', 'boots', 'ring', 'neck'] as const;
const SLOT_NAMES: Record<(typeof SLOTS)[number], string[]> = {
  weapon: ['渡鸦之牙', '夜刃', '断罪长剑', '霜脊战斧', '灰烬之弓'],
  helmet: ['长夜王冠', '守夜人面甲', '鸦羽兜帽', '圣契头环'],
  chest: ['龙鳞胸甲', '暮色法袍', '影织皮甲', '圣徽板甲'],
  boots: ['疾风靴', '无声之履', '踏雪战靴'],
  ring: ['誓约之戒', '星辉指环', '夜帝印戒'],
  neck: ['月痕吊坠', '深渊之眼', '晨星项链'],
};

export interface OpeningDrop {
  rarity: LootRarity;
  name: string;
  icon: string;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function makeDrop(rarity: LootRarity): OpeningDrop {
  const slot = pick(SLOTS);
  return { rarity, name: pick(SLOT_NAMES[slot]), icon: `ui/forge/ai/equip/equip_${rarity}_${slot}/spriteFrame` };
}

/** 小怪约 30% 掉(白 / 绿为主,偶尔蓝紫);精英必掉蓝以上;首领必掉 1 橙 + 2 紫。 */
export function rollOpeningLoot(kind: 'normal' | 'elite' | 'boss'): OpeningDrop[] {
  if (kind === 'boss') {
    return [makeDrop('orange'), makeDrop('purple'), makeDrop('purple'), makeDrop('blue')];
  }
  if (kind === 'elite') {
    const r = Math.random();
    return [makeDrop(r < 0.25 ? 'orange' : r < 0.7 ? 'purple' : 'blue'), makeDrop('green')];
  }
  if (Math.random() > 0.3) {
    return [];
  }
  const r = Math.random();
  return [makeDrop(r < 0.03 ? 'purple' : r < 0.15 ? 'blue' : r < 0.5 ? 'green' : 'white')];
}

/** 掉落图标预载(装备图标不在开局包常驻缓存里;addSprite 没缓存时只发请求返回 null)。 */
export function preloadOpeningIcons(): void {
  const list: string[] = [];
  (['white', 'green', 'blue', 'purple', 'orange'] as LootRarity[]).forEach((r) => SLOTS.forEach((slot) => list.push(`ui/forge/ai/equip/equip_${r}_${slot}/spriteFrame`)));
  resources.load(list, SpriteFrame, () => undefined);
}

/** 图标:有缓存直接挂,没有就现拉、到了再挂(短命节点,isValid 判断)。 */
function mountIcon(host: LobbyHudHost, parent: Node, path: string, size: number): void {
  const hit = resources.get(path, SpriteFrame);
  const put = (sf: SpriteFrame): void => {
    if (!parent.isValid) {
      return;
    }
    const n = host.addChildPlainNode(parent, 'Icon', 0, 0, size, size);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = sf;
    n.getComponent(UITransform)?.setContentSize(size, size);
  };
  if (hit) {
    put(hit);
    return;
  }
  resources.load(path, SpriteFrame, (err, sf) => {
    if (!err && sf) {
      put(sf);
    }
  });
}

/** 真实野外掉落的品质表现(方案 F,只在开关打开时):金币白、经验书绿、强化石蓝。 */
export const REAL_DROP_RARITY: Record<string, LootRarity> = {
  GOLD: 'white',
  HERO_EXP_BOOK: 'green',
  LOW_ENHANCE_STONE: 'blue',
};

// ── 掉落表现:地上光圈 + 光柱(蓝起)+ 自动吸附 + 拾取飘名字 ──

export interface DropFxHost {
  host: LobbyHudHost;
  root: Node;
  /** 世界 UI 缩放(跟镜头)。 */
  z: number;
  target: () => { x: number; y: number } | null;
}

/** 地上掉一件:蓝起有光柱,紫 / 橙停一会儿再吸附(紫橙落地「叮」声,橙轻震屏由调用方做);拾取时 onPick(在队长头顶飘名字)。 */
export function spawnRarityDrop(fx: DropFxHost, x: number, y: number, drop: { rarity: LootRarity; icon: string }, delayMs: number, onPick: () => void): void {
  const style = RARITY_STYLE[drop.rarity];
  const [r, g, b] = style.color;
  const { host, root, z } = fx;
  setTimeout(() => {
    if (!root.isValid) {
      return;
    }
    const sx = x + (Math.random() - 0.5) * 120;
    const sy = y + (Math.random() - 0.5) * 50;
    const node = host.addChildPlainNode(root, `OpeningDrop_${drop.rarity}`, sx, sy, 80, 80);
    node.setSiblingIndex(root.children.length - 1);
    // 地上光圈
    const ring = node.addComponent(Graphics);
    ring.fillColor = rgba(r, g, b, 60);
    ring.ellipse(0, 0, 46 * z, 15 * z);
    ring.fill();
    ring.strokeColor = rgba(r, g, b, 200);
    ring.lineWidth = 2.5 * z;
    ring.ellipse(0, 0, 40 * z, 13 * z);
    ring.stroke();
    // 光柱:多层半透明竖条叠出中间亮、两边淡的柱子,顶端渐隐
    if (style.beam > 0) {
      const beam = host.addChildPlainNode(node, 'Beam', 0, 0, 10, 10);
      const bg = beam.addComponent(Graphics);
      const height = (160 + style.beam * 110) * z;
      const width = (10 + style.beam * 7) * z;
      const layers = 6;
      for (let i = 0; i < layers; i += 1) {
        const f = 1 - i / layers;
        const w = width * (0.35 + 0.65 * f);
        const steps = 8;
        for (let s = 0; s < steps; s += 1) {
          const y0 = (height * s) / steps;
          const a = Math.round((34 + style.beam * 16) * (1 - s / steps) * (0.45 + 0.55 * (1 - f)));
          bg.fillColor = rgba(Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40), a);
          bg.rect(-w / 2, y0, w, height / steps + 0.5);
          bg.fill();
        }
      }
      const bop = beam.addComponent(UIOpacity);
      bop.opacity = 0;
      beam.setScale(1, 0.2, 1);
      tween(beam).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      tween(bop).to(0.12, { opacity: 255 }).start();
    }
    // 图标:从怪身上弹起落地
    const art = host.addChildPlainNode(node, 'Art', 0, 30 * z, 60, 60);
    mountIcon(host, art, drop.icon, 58 * z);
    art.setPosition(0, 120 * z, 0);
    tween(art).to(0.28, { position: new Vec3(0, 30 * z, 0) }, { easing: 'bounceOut' }).start();
    if (style.beam >= 2) {
      gameAudio.sfx(drop.rarity === 'orange' ? 'chest_jackpot' : 'gacha_rare', drop.rarity === 'orange' ? 0.9 : 0.7);
    } else if (style.beam === 1) {
      gameAudio.sfx('chest_land', 0.5);
    }
    // 停一会儿 → 飞向队长 → 拾取
    tween(node).delay(style.hold).call(() => {
      const to = fx.target();
      if (!to || !node.isValid) {
        node.isValid && node.destroy();
        onPick();
        return;
      }
      const beamNode = node.getChildByName('Beam');
      if (beamNode) {
        beamNode.destroy();
      }
      ring.clear();
      tween(node).to(0.32, { position: new Vec3(to.x, to.y + 110 * z, 0) }, { easing: 'quadIn' }).call(() => {
        node.isValid && node.destroy();
        onPick();
      }).start();
    }).start();
  }, delayMs);
}

/** 队长头顶飘「【紫】渡鸦之牙」(品质色,紫橙大一号)。 */
export function floatDropName(host: LobbyHudHost, root: Node, z: number, x: number, y: number, drop: { rarity: LootRarity; name: string }, seq: number): void {
  if (!root.isValid) {
    return;
  }
  const style = RARITY_STYLE[drop.rarity];
  const [r, g, b] = style.color;
  const size = style.beam >= 2 ? 30 : 24;
  const text = `【${style.name}】${drop.name}`;
  const label = host.addChildLabel(root, 'OpeningDropName', text, x, y + seq * 34 * z, size, rgba(r, g, b), new Size(text.length * size * 1.2 + 40, size * 1.5));
  label.isBold = true;
  label.enableOutline = true;
  label.outlineColor = rgba(14, 8, 4, 255);
  label.outlineWidth = 3;
  label.node.setSiblingIndex(root.children.length - 1);
  label.node.setScale(z, z, 1);
  const op = label.node.addComponent(UIOpacity);
  tween(label.node).by(1.2, { position: new Vec3(0, 50 * z, 0) }, { easing: 'quadOut' }).start();
  tween(op).delay(0.9).to(0.4, { opacity: 0 }).call(() => label.node.isValid && label.node.destroy()).start();
}

// ── 顶部 / 右侧 HUD:波次标题 + 计时 + 连杀计数 ──

const COMBO_TIERS: Array<{ at: number; color: [number, number, number]; shout: string }> = [
  { at: 100, color: [255, 120, 70], shout: '百人斩!' },
  { at: 50, color: [255, 170, 60], shout: '势不可挡!' },
  { at: 25, color: [255, 220, 110], shout: '杀出一条路!' },
  { at: 0, color: [255, 244, 225], shout: '' },
];

export class OpeningHud {
  private root: Node | null = null;
  private comboLabel: Label | null = null;
  private comboSub: Label | null = null;
  private waveLabel: Label | null = null;
  private killsLabel: Label | null = null;
  private lootLabel: Label | null = null;
  combo = 0;
  best = 0;
  kills = 0;
  private comboUntil = 0;
  private tierShown = 0;
  private waveTitle = '';
  private lootText = '';
  private scale = 1;

  /** 挂到跑图 HUD(整层重建时由 renderHud 重新调)。 */
  mount(host: LobbyHudHost, hud: Node, layout: UiLayout, scale: number): void {
    this.scale = scale;
    const root = host.addChildPlainNode(hud, 'OpeningHud', 0, 0, layout.width, layout.height);
    this.root = root;
    const cx = (layout.stageLeft + layout.stageRight) / 2;
    const top = layout.stageTop;
    const wave = host.addChildLabel(root, 'Wave', this.waveTitle, cx, top - 52 * scale, 34 * scale, rgba(255, 232, 190), new Size(700 * scale, 50 * scale));
    wave.isBold = true;
    wave.enableOutline = true;
    wave.outlineColor = rgba(20, 10, 6, 255);
    wave.outlineWidth = 3;
    this.waveLabel = wave;
    const kills = host.addChildLabel(root, 'Kills', '', cx, top - 92 * scale, 20 * scale, rgba(236, 226, 206), new Size(600 * scale, 30 * scale));
    kills.enableOutline = true;
    kills.outlineColor = rgba(20, 10, 6, 255);
    kills.outlineWidth = 2;
    this.killsLabel = kills;
    // 连杀放左侧中部(右侧是援护头像 + 技能簇,左上的小地图 / 任务追踪开局时都收起了)
    const rx = layout.stageLeft + 230 * scale;
    const cy = layout.stageTop - layout.stageHeight * 0.36;
    const combo = host.addChildLabel(root, 'Combo', '', rx, cy, 64 * scale, rgba(255, 244, 225), new Size(360 * scale, 80 * scale));
    combo.isBold = true;
    combo.enableOutline = true;
    combo.outlineColor = rgba(30, 10, 4, 255);
    combo.outlineWidth = 4;
    this.comboLabel = combo;
    const sub = host.addChildLabel(root, 'ComboSub', '', rx, cy - 54 * scale, 24 * scale, rgba(255, 220, 140), new Size(360 * scale, 34 * scale));
    sub.isBold = true;
    sub.enableOutline = true;
    sub.outlineColor = rgba(30, 10, 4, 255);
    sub.outlineWidth = 3;
    this.comboSub = sub;
    const loot = host.addChildLabel(root, 'Loot', this.lootText, rx, cy - 96 * scale, 22 * scale, rgba(236, 226, 206), new Size(420 * scale, 32 * scale));
    loot.enableOutline = true;
    loot.outlineColor = rgba(20, 10, 6, 255);
    loot.outlineWidth = 2;
    this.lootLabel = loot;
    this.refresh(Date.now());
  }

  setWave(title: string): void {
    this.waveTitle = title;
    if (this.waveLabel && this.waveLabel.isValid) {
      this.waveLabel.string = title;
      const n = this.waveLabel.node;
      Tween.stopAllByTarget(n);
      n.setScale(1.5, 1.5, 1);
      tween(n).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }
  }

  setLoot(counts: Record<LootRarity, number>): void {
    const parts = (['orange', 'purple', 'blue', 'green', 'white'] as LootRarity[])
      .filter((k) => counts[k] > 0).map((k) => `${RARITY_STYLE[k].name} ×${counts[k]}`);
    this.lootText = parts.length ? `战利品  ${parts.join('  ')}` : '';
    if (this.lootLabel && this.lootLabel.isValid) {
      this.lootLabel.string = this.lootText;
    }
  }

  /** 记一次击杀;返回新达到的档位喊话(没有 = '')。 */
  addKill(now: number): string {
    this.kills += 1;
    this.combo = now < this.comboUntil ? this.combo + 1 : 1;
    if (this.combo === 1) {
      this.tierShown = 0;
    }
    this.best = Math.max(this.best, this.combo);
    this.comboUntil = now + 3000;
    let shout = '';
    for (const tier of COMBO_TIERS) {
      if (tier.at > 0 && this.combo >= tier.at && this.tierShown < tier.at) {
        this.tierShown = tier.at;
        shout = tier.shout;
        break;
      }
    }
    this.refresh(now);
    const n = this.comboLabel?.node;
    if (n && n.isValid) {
      Tween.stopAllByTarget(n);
      n.setScale(1.35, 1.35, 1);
      tween(n).to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    }
    return shout;
  }

  /** 每帧:断档淡出、计时刷新。 */
  refresh(now: number, elapsedMs = -1): void {
    const live = now < this.comboUntil && this.combo >= 2;
    const tier = COMBO_TIERS.find((t) => this.combo >= t.at) ?? COMBO_TIERS[COMBO_TIERS.length - 1];
    if (this.comboLabel && this.comboLabel.isValid) {
      this.comboLabel.string = live ? `连杀 ×${this.combo}` : '';
      this.comboLabel.color = rgba(tier.color[0], tier.color[1], tier.color[2]);
    }
    if (this.comboSub && this.comboSub.isValid) {
      this.comboSub.string = live && tier.shout ? tier.shout : '';
    }
    if (this.killsLabel && this.killsLabel.isValid && elapsedMs >= 0) {
      const s = Math.floor(elapsedMs / 1000);
      this.killsLabel.string = `击杀 ${this.kills}   ·   ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
  }

  unmount(): void {
    if (this.root && this.root.isValid) {
      this.root.destroy();
    }
    this.root = null;
  }
}
