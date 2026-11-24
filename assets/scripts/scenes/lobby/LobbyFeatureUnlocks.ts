import { sys } from 'cc';
import type { WorldStateVO } from '../../types/WorldTypes';
import type { LobbyTerminalAction } from './LobbyTerminalPanelRenderer';

/**
 * docs/57 §11 终端功能逐步解锁(11-24 策划通玩 P1:Lv.3 时终端 15 格全开)。
 *
 * 解锁条件全部取自服务端下发的世界状态(剧情任务状态 + 玩家等级 + 是否出村),客户端只做显示:
 * - 出生:英雄、背包、任务、邮件、设置、公告、资料(不在表里 = 一直开);
 * - 剧情 V04「祭坛的回应」接到后:召唤、图鉴;V06「编队」接到后:编队;V08「铁匠的委托」接到后:锻造
 *   (按「接到」算:V04 / V06 本身就要用到召唤 / 编队,得在做任务时就能打开);
 * - 出村(离开晨风村)后:世界地图、野外探索、商店、佣兵公会;
 * - Lv.12 秘境试炼(每日副本);Lv.15 守卫水晶、矿境掠夺;Lv.20 排行。
 * 老号:跳过新手村(SKIPPED)/ 已出村的剧情门槛直接算过;等级门槛照当前等级;首次计算(进游戏那一刻)不播报。
 * 世界状态还没拉到时一律当作已开放(拉不到状态不能把功能锁死)。
 */
export type FeatureKey = LobbyTerminalAction;

interface FeatureGate {
  name: string;
  quest?: string;
  questName?: string;
  village?: boolean;
  level?: number;
}

export const FEATURE_GATES: Partial<Record<FeatureKey, FeatureGate>> = {
  gacha: { name: '召唤', quest: 'V04', questName: '祭坛的回应' },
  codex: { name: '图鉴', quest: 'V04', questName: '祭坛的回应' },
  formation: { name: '编队', quest: 'V06', questName: '编队' },
  forge: { name: '锻造', quest: 'V08', questName: '铁匠的委托' },
  worldmap: { name: '世界地图', village: true },
  idle: { name: '野外探索', village: true },
  shop: { name: '商店', village: true },
  guild: { name: '佣兵公会', village: true },
  daily: { name: '秘境试炼', level: 12 },
  crystal: { name: '守卫水晶', level: 15 },
  raid: { name: '矿境掠夺', level: 15 },
  rank: { name: '排行', level: 20 },
};

const QUEST_REACHED = new Set(['ACCEPTED', 'DONE', 'CLAIMED', 'SKIPPED']);

function villageLeft(world: WorldStateVO): boolean {
  return world.villageDone || world.stage === 'CITY';
}

/** 没开放时返回给玩家看的条件(短句,终端格子里放得下);已开放返回 null。 */
export function featureLockText(key: FeatureKey, world: WorldStateVO | null, playerLevel: number): string | null {
  const gate = FEATURE_GATES[key];
  if (!gate || !world) {
    return null;
  }
  if (gate.quest) {
    if (villageLeft(world)) {
      return null;
    }
    const quest = world.quests.find((item) => item.code === gate.quest);
    // 任务表里找不到这一条(老号 / 服务端换了编排)→ 不锁
    if (!quest || QUEST_REACHED.has(quest.state)) {
      return null;
    }
    return `剧情「${gate.questName}」开放`;
  }
  if (gate.village) {
    return villageLeft(world) ? null : '离开晨风村后开放';
  }
  if (gate.level) {
    const level = Math.max(playerLevel, world.playerLevel ?? 0);
    return level >= gate.level ? null : `Lv.${gate.level} 开放`;
  }
  return null;
}

export function featureUnlocked(key: FeatureKey, world: WorldStateVO | null, playerLevel: number): boolean {
  return featureLockText(key, world, playerLevel) === null;
}

export function featureName(key: FeatureKey): string {
  return FEATURE_GATES[key]?.name ?? '';
}

/**
 * 解锁跟踪:本会话第一次算出的已开放集合只当基线(不播报);之后新开放的功能返回给调用方播报,
 * 并记进本机「新」角标(按账号存,点进去一次就清;换设备只是少个角标,不影响功能)。
 */
export class FeatureUnlockTracker {
  private uid = 0;
  private baseline: Set<FeatureKey> | null = null;
  private fresh = new Set<FeatureKey>();

  bind(uid: number): void {
    if (uid === this.uid) {
      return;
    }
    this.uid = uid;
    this.baseline = null;
    this.fresh = new Set(this.loadFresh());
  }

  /** 按最新世界状态 / 等级重算;返回这次新开放的功能(基线那次返回空)。 */
  update(world: WorldStateVO | null, playerLevel: number): FeatureKey[] {
    if (!world || !this.uid) {
      return [];
    }
    const keys = Object.keys(FEATURE_GATES) as FeatureKey[];
    const open = new Set(keys.filter((key) => featureUnlocked(key, world, playerLevel)));
    if (!this.baseline) {
      this.baseline = open;
      // 角标里已经开放不了的(数据回退)清掉
      for (const key of Array.from(this.fresh)) {
        if (!open.has(key)) {
          this.fresh.delete(key);
        }
      }
      return [];
    }
    const added = keys.filter((key) => open.has(key) && !this.baseline!.has(key));
    this.baseline = open;
    if (added.length > 0) {
      added.forEach((key) => this.fresh.add(key));
      this.saveFresh();
    }
    return added;
  }

  isFresh(key: FeatureKey): boolean {
    return this.fresh.has(key);
  }

  anyFresh(): boolean {
    return this.fresh.size > 0;
  }

  /** 玩家点进过这个功能:清「新」角标;返回是否真的清掉了(调用方据此决定要不要重画)。 */
  markSeen(key: FeatureKey): boolean {
    if (!this.fresh.delete(key)) {
      return false;
    }
    this.saveFresh();
    return true;
  }

  private storageKey(): string {
    return `lc_feature_new_${this.uid}`;
  }

  private loadFresh(): FeatureKey[] {
    try {
      const raw = sys.localStorage.getItem(this.storageKey());
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((key): key is FeatureKey => typeof key === 'string' && key in FEATURE_GATES) : [];
    } catch {
      return [];
    }
  }

  private saveFresh(): void {
    try {
      sys.localStorage.setItem(this.storageKey(), JSON.stringify(Array.from(this.fresh)));
    } catch {
      // 本地存储不可用:只少个角标
    }
  }
}
