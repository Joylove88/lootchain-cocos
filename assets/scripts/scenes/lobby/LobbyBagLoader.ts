import type { BagApi } from '../../api/BagApi';
import type { EquipmentApi, EquipmentItemVO } from '../../api/EquipmentApi';
import type { HeroApi } from '../../api/HeroApi';
import type { BagItemEntryVO, ItemTypeBagGroupVO, LobbyBagPanelState } from '../../types/BagTypes';
import type { UserHeroFragmentVO } from '../../types/HeroTypes';
import { LobbyBagState } from './LobbyBagState';

export interface LobbyBagLoaderHost {
  isLobbyViewActive(): boolean;
  refreshLobbyOverlay(): void;
}

/** 大厅背包只读加载器。 */
export class LobbyBagLoader {
  private readonly bagState = new LobbyBagState();
  private loadTicket = 0;
  private sourceTicket = 0;

  constructor(
    private readonly bagApi: BagApi,
    private readonly heroApi: HeroApi,
    private readonly equipmentApi: EquipmentApi,
    private readonly host: LobbyBagLoaderHost,
  ) {}

  get loading(): boolean {
    return this.bagState.snapshot().loading;
  }

  get loaded(): boolean {
    return this.bagState.snapshot().loaded;
  }

  get version(): number {
    return this.bagState.version;
  }

  cancel(): void {
    // 销毁场景或重新登录时让旧请求失效，防止慢响应覆盖新玩家背包。
    this.loadTicket += 1;
    this.sourceTicket += 1;
  }

  resetForLogin(): void {
    this.cancel();
    this.bagState.reset();
  }

  currentState(): LobbyBagPanelState {
    return this.bagState.snapshot();
  }

  clearSelection(): void {
    if (this.bagState.clearSelection()) {
      this.refreshIfActive();
    }
  }

  selectItem(itemCode: string): boolean {
    const changed = this.bagState.selectItem(itemCode);
    if (changed) {
      this.refreshIfActive();
    }
    return changed;
  }

  async load(force = false): Promise<void> {
    if (this.loading) {
      return;
    }
    if (this.loaded && !force) {
      return;
    }
    const ticket = this.nextLoadTicket();
    this.bagState.startLoading();
    this.refreshIfActive();
    try {
      const [bag, fragments, equipments] = await Promise.all([
        this.bagApi.myBag(),
        this.heroApi.fragments().catch((error) => {
          console.warn('[LootChain] hero fragments load failed while composing bag:', error);
          return [] as UserHeroFragmentVO[];
        }),
        // 装备存 user_equipment 独立表(非 user_bag),背包页把它合成为 EQUIPMENT 分组展示(只读;穿戴入口在英雄详情)。
        this.equipmentApi.list().catch((error) => {
          console.warn('[LootChain] equipment load failed while composing bag:', error);
          return [] as EquipmentItemVO[];
        }),
      ]);
      if (!this.isCurrentLoad(ticket)) {
        return;
      }
      this.bagState.applyLoaded(mergeBagGroupsWithEquipments(mergeBagGroupsWithFragments(bag.groups ?? [], fragments), equipments));
      const selectedItemCode = this.bagState.snapshot().selectedItemCode;
      if (selectedItemCode) {
        void this.loadSource(selectedItemCode, true);
      }
    } catch (error) {
      if (!this.isCurrentLoad(ticket)) {
        return;
      }
      this.bagState.applyError(error);
      console.warn('[LootChain] lobby bag load failed:', error);
    } finally {
      if (this.isCurrentLoad(ticket)) {
        this.refreshIfActive();
      }
    }
  }

  async loadSource(itemCode: string, force = false): Promise<void> {
    const safeCode = itemCode.trim();
    if (!safeCode) {
      return;
    }
    const state = this.bagState.snapshot();
    if (!force && state.sourceItemCode === safeCode && (state.sourceLoading || state.sourceDesc || state.sourceError)) {
      return;
    }
    const ticket = this.nextSourceTicket();
    this.bagState.startSourceLoading(safeCode);
    this.refreshIfActive();
    const fragmentItem = this.findItem(safeCode);
    if (fragmentItem && isHeroFragmentItem(fragmentItem)) {
      this.bagState.applySourceLoaded(safeCode, heroFragmentSourceDesc(fragmentItem));
      this.refreshIfActive();
      return;
    }
    // 装备是合成分组(user_equipment),后端 item source 接口查不到,直接给本地途径文案。
    if (fragmentItem && isEquipBagItem(fragmentItem)) {
      this.bagState.applySourceLoaded(safeCode, equipSourceDesc(fragmentItem));
      this.refreshIfActive();
      return;
    }
    try {
      const source = await this.bagApi.source(safeCode);
      if (!this.isCurrentSource(ticket)) {
        return;
      }
      this.bagState.applySourceLoaded(safeCode, source.sourceDesc ?? '');
    } catch (error) {
      if (!this.isCurrentSource(ticket)) {
        return;
      }
      this.bagState.applySourceError(safeCode, error);
      console.warn('[LootChain] lobby bag source load failed:', error);
    } finally {
      if (this.isCurrentSource(ticket)) {
        this.refreshIfActive();
      }
    }
  }

  private nextLoadTicket(): number {
    this.loadTicket += 1;
    return this.loadTicket;
  }

  private nextSourceTicket(): number {
    this.sourceTicket += 1;
    return this.sourceTicket;
  }

  private isCurrentLoad(ticket: number): boolean {
    return ticket === this.loadTicket;
  }

  private isCurrentSource(ticket: number): boolean {
    return ticket === this.sourceTicket;
  }

  private findItem(itemCode: string): BagItemEntryVO | null {
    return this.bagState.snapshot().groups.flatMap((group) => group.items).find((item) => item.itemCode === itemCode) ?? null;
  }

  private refreshIfActive(): void {
    if (this.host.isLobbyViewActive()) {
      this.host.refreshLobbyOverlay();
    }
  }
}

function mergeBagGroupsWithFragments(groups: ItemTypeBagGroupVO[], fragments: UserHeroFragmentVO[]): ItemTypeBagGroupVO[] {
  const fragmentItems = (fragments ?? [])
    .filter((fragment) => fragment && fragment.heroCode && Number(fragment.fragmentCount) > 0)
    .map(toFragmentBagItem);
  if (fragmentItems.length === 0) {
    return groups ?? [];
  }
  return [
    ...(groups ?? []),
    {
      itemType: 'HERO_FRAGMENT',
      itemTypeLabel: '英雄碎片',
      items: fragmentItems,
    },
  ];
}

function toFragmentBagItem(fragment: UserHeroFragmentVO, index: number): BagItemEntryVO {
  const heroCode = safeText(fragment.heroCode || `HERO_${index}`);
  const heroName = safeText(fragment.heroName || heroCode);
  return {
    bagId: -100000 - index,
    itemCode: `HERO_FRAGMENT:${heroCode}`,
    itemName: `${heroName}碎片`,
    itemType: 'HERO_FRAGMENT',
    rarity: safeText(fragment.rarity || 'R'),
    itemCount: Math.max(0, Math.floor(Number(fragment.fragmentCount) || 0)),
    expireTime: null,
    maxStack: 999999,
    sellGold: 0,
    useEffectType: '重复英雄转化碎片',
  };
}

// 装备合成为背包 EQUIPMENT 分组:同编码聚合计数,名称后缀"(已穿N)",品质映射到背包稀有度配色。
function mergeBagGroupsWithEquipments(groups: ItemTypeBagGroupVO[], equipments: EquipmentItemVO[]): ItemTypeBagGroupVO[] {
  const list = (equipments ?? []).filter((item) => item && item.equipCode);
  if (list.length === 0) {
    return groups ?? [];
  }
  const byCode = new Map<string, { sample: EquipmentItemVO; total: number; equipped: number }>();
  list.forEach((item) => {
    const entry = byCode.get(item.equipCode) ?? { sample: item, total: 0, equipped: 0 };
    entry.total += 1;
    if (item.heroId != null) {
      entry.equipped += 1;
    }
    byCode.set(item.equipCode, entry);
  });
  const items: BagItemEntryVO[] = [...byCode.values()].map((entry, index) => toEquipBagItem(entry.sample, entry.total, entry.equipped, index));
  return [
    ...(groups ?? []),
    {
      itemType: 'EQUIPMENT',
      itemTypeLabel: '装备',
      items,
    },
  ];
}

function toEquipBagItem(sample: EquipmentItemVO, total: number, equipped: number, index: number): BagItemEntryVO {
  const attrParts: string[] = [];
  if (sample.attrHp > 0) {
    attrParts.push(`生命+${sample.attrHp}`);
  }
  if (sample.attrAttack > 0) {
    attrParts.push(`攻击+${sample.attrAttack}`);
  }
  if (sample.attrDefense > 0) {
    attrParts.push(`防御+${sample.attrDefense}`);
  }
  if (sample.attrSpeed > 0) {
    attrParts.push(`速度+${sample.attrSpeed}`);
  }
  if (sample.attrCrit > 0) {
    attrParts.push(`暴击+${sample.attrCrit}`);
  }
  const effects = safeText(sample.specialEffectsJson ?? '');
  if (effects.includes('combo')) {
    attrParts.push('连击');
  }
  if (effects.includes('execute')) {
    attrParts.push('斩杀');
  }
  return {
    bagId: -200000 - index,
    itemCode: `EQUIP:${sample.equipCode}`,
    itemName: `${(sample.tier ?? 1) > 1 ? `${sample.tier}阶·` : ''}${safeText(sample.equipName)}${equipped > 0 ? `（已穿${equipped}）` : ''}`,
    itemType: 'EQUIPMENT',
    rarity: equipQualityToBagRarity(sample.quality),
    itemCount: total,
    expireTime: null,
    maxStack: 999999,
    sellGold: 0,
    useEffectType: attrParts.join(' · ') || null,
  };
}

// 装备品质 → 背包稀有度配色近似(蓝→R蓝框、紫→SR、金→SSR、红/神话→UR)。
function equipQualityToBagRarity(quality: string): string {
  switch (safeText(quality || '').toUpperCase()) {
    case 'MYTHIC':
    case 'RED':
      return 'UR';
    case 'GOLD':
      return 'SSR';
    case 'PURPLE':
      return 'SR';
    default:
      return 'R';
  }
}

function isEquipBagItem(item: BagItemEntryVO): boolean {
  return (item.itemType || '').toUpperCase() === 'EQUIPMENT' && item.itemCode.startsWith('EQUIP:');
}

function equipSourceDesc(item: BagItemEntryVO): string {
  return `${safeText(item.itemName)}为装备:请在「英雄详情 → 装备」中穿戴/卸下;来源:主线首通掉落与召唤。`;
}

function isHeroFragmentItem(item: BagItemEntryVO): boolean {
  return (item.itemType || '').toUpperCase() === 'HERO_FRAGMENT' || item.itemCode.startsWith('HERO_FRAGMENT:');
}

function heroFragmentSourceDesc(item: BagItemEntryVO): string {
  return `${safeText(item.itemName)}来自重复抽到同名英雄后的自动转化，当前只读展示，不提供兑换、升星或资源变更入口。`;
}

function safeText(value: string): string {
  return String(value ?? '').trim();
}
