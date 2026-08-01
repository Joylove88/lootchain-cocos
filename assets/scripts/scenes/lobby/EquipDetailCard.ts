// 装备详情大卡(2026-07-21 参考图定稿,2026-07-22 抽为共享模块):
// 英雄详情悬浮 / 召唤结果详情共用同一实现,样式改动只改这里。
// 结构:equip_info 框 + 不透明暗底 + 可选全屏压暗幕(无输入拦截)/ 装备真图 + 名称品质色 /
// 基础属性(含强化系数)/ 特殊词条槽(紫1/橙2/红3)/ 宝石孔位(阶数=品质阶)/ 风味描述 / 穿戴状态。
import { Color, Graphics, HorizontalTextAlignment, Label, Node, Size, Sprite, UIOpacity } from 'cc';
import { rgba } from './LobbyHudTypes';
import { safeText } from '../UiTextFormatter';
import { equipIconAssetByCode } from './EquipIconAssets';
import type { EquipmentItemVO } from '../../api/EquipmentApi';

/** 渲染宿主:三个 UI 原语即可,英雄详情/召唤等场景 host 均满足。 */
export interface EquipCardHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
  /** 可选:按英雄 id 反查名字(穿戴状态行显示"已穿戴:某某");缺省回退通用文案。 */
  resolveHeroName?(heroId: number): string | null;
  addSprite(name: string, assetPath: string, x: number, y: number, width: number, height: number, parent?: Node): Sprite | null;
  addChildLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: Color,
    contentSize: Size,
    horizontalAlign?: HorizontalTextAlignment,
  ): Label;
}

export function equipQualityLabel(quality: string): string {
  switch ((quality || '').toUpperCase()) {
    case 'WHITE':
      return '白装';
    case 'GREEN':
      return '绿装';
    case 'BLUE':
      return '蓝装';
    case 'PURPLE':
      return '紫装';
    case 'GOLD':
      return '橙装';
    case 'RED':
      return '红装';
    default:
      return quality;
  }
}

// 装备部位(docs/11 固定 6 部位)。
export const HERO_EQUIP_SLOTS: { code: string; label: string }[] = [
  { code: 'WEAPON', label: '武器' },
  { code: 'HELMET', label: '头盔' },
  { code: 'CHEST', label: '胸甲' },
  { code: 'BOOTS', label: '鞋子' },
  { code: 'RING', label: '戒指' },
  { code: 'NECKLACE', label: '项链' },
];

// 装备品质配色(白灰/蓝/紫/金/红/神话粉红)。
export function equipQualityColor(quality: string): { r: number; g: number; b: number } {
  switch (safeText(quality).toUpperCase()) {
    case 'MYTHIC':
      return { r: 255, g: 84, b: 148 };
    case 'RED':
      return { r: 236, g: 92, b: 74 };
    case 'GOLD':
      return { r: 236, g: 194, b: 92 };
    case 'PURPLE':
      return { r: 176, g: 126, b: 220 };
    case 'BLUE':
      return { r: 98, g: 158, b: 224 };
    case 'GREEN':
      return { r: 112, g: 196, b: 118 };
    default:
      return { r: 168, g: 162, b: 152 };
  }
}

function formatInteger(value: number): string {
  return Math.trunc(Number(value) || 0).toLocaleString('en-US');
}

function applyOutline(label: Label, scale: number, strong: boolean): void {
  label.enableOutline = true;
  label.outlineColor = rgba(0, 0, 0, strong ? 230 : 188);
  label.outlineWidth = Math.max(1, (strong ? 1.4 : 1) * scale);
}

// 卡内装备图标:v2 真图 + 品质细框。
function addEquipIconInCard(host: EquipCardHost, tip: Node, item: EquipmentItemVO, x: number, y: number, size: number, scale: number): void {
  const q = equipQualityColor(item.quality);
  const holder = host.addChildPlainNode(tip, 'CardIconHolder', x, y, size, size);
  const g = holder.addComponent(Graphics);
  g.fillColor = rgba(8, 7, 8, 235);
  g.roundRect(-size / 2, -size / 2, size, size, 6 * scale);
  g.fill();
  g.strokeColor = rgba(q.r, q.g, q.b, 220);
  g.lineWidth = 1.6 * scale;
  g.roundRect(-size / 2, -size / 2, size, size, 6 * scale);
  g.stroke();
  const asset = equipIconAssetByCode(item.equipCode);
  if (asset) {
    host.addSprite('CardIconArt', asset, 0, 0, size * 0.92, size * 0.92, holder);
  }
}

/** 渲染装备详情大卡,返回卡根节点(调用方负责销毁)。dim=是否附带全屏压暗幕(无输入拦截)。 */
export function renderEquipDetailCard(host: EquipCardHost, parent: Node, item: EquipmentItemVO, tipX: number, tipY: number, scale: number, dim = true): Node {
  const q = equipQualityColor(item.quality);
  const qualityKey = (item.quality || '').toUpperCase();
  // 品质阶:库内橙装存储为 GOLD(历史 ORANGE 键位保留兼容)。
  const tierIndex = ({ WHITE: 0, GREEN: 1, BLUE: 2, PURPLE: 3, GOLD: 4, ORANGE: 4, RED: 5 } as Record<string, number>)[qualityKey] ?? 0;
  const tierColors = [rgba(200, 200, 200, 255), rgba(126, 214, 126, 255), rgba(108, 168, 236, 255), rgba(186, 126, 236, 255), rgba(240, 168, 86, 255), rgba(238, 92, 70, 255)];
  const affixSlotCount = ({ PURPLE: 1, GOLD: 2, ORANGE: 2, RED: 3 } as Record<string, number>)[qualityKey] ?? 0;
  const gemSlotCount = Math.max(0, tierIndex);
  // 卡高按内容自适应(2026-07-22):橙/红装词条与宝石孔位变多后固定 700 会溢出压到底部描述。
  // 分段高度与下方 cursor 流水一致:顶区152 + 基础属性(30+行×30+强化行24) + 词条区(8+30+行×26)
  // + 宝石区(8+46+行×58) + 描述区(8+22+55) + 底部分割/穿戴区 92。
  const shownAttrCount = [item.attrHp, item.attrAttack, item.attrDefense, item.attrSpeed, item.attrCrit]
    .filter((value) => (value ?? 0) > 0).length;
  const instanceAffixCount = (item.specialAffixes ?? []).length;
  const shownAffixCount = instanceAffixCount > 0 ? instanceAffixCount : affixSlotCount;
  const enhanceRowExtra = (item.enhanceLevel ?? 0) > 0 ? 24 : 0;
  const contentHeight = 152 + 30 + shownAttrCount * 30 + enhanceRowExtra
    + (shownAffixCount > 0 ? 8 + 30 + shownAffixCount * 26 : 0)
    + (gemSlotCount > 0 ? 8 + 46 + ((item.gems ?? []).some((code) => parseGemCode(code) != null) ? 28 : 0) + gemSlotCount * 58 : 0)
    + 85 + 108;
  const w = 400 * scale;
  const h = Math.max(560, contentHeight) * scale;
  const tip = host.addChildPlainNode(parent, 'WearTooltip', tipX, tipY, w, h);
  if (dim) {
    // 全屏压暗(无输入拦截,仅视觉):背景退后,卡片成为唯一焦点。
    const dimNode = host.addChildPlainNode(tip, 'EquipCardDim', -tipX, -tipY, 4000, 4000);
    const dimG = dimNode.addComponent(Graphics);
    dimG.fillColor = rgba(0, 0, 0, 132);
    dimG.rect(-2000, -2000, 4000, 4000);
    dimG.fill();
  }
  // 不透明暗底垫在框图之下:框图自带透明度,直接贴会和场景背景融为一体。
  const solid = host.addChildPlainNode(tip, 'EquipCardSolid', 0, 0, w - 14 * scale, h - 14 * scale);
  const sg = solid.addComponent(Graphics);
  sg.fillColor = rgba(9, 7, 7, 255);
  sg.roundRect(-(w - 14 * scale) / 2, -(h - 14 * scale) / 2, w - 14 * scale, h - 14 * scale, 12 * scale);
  sg.fill();
  if (!host.addSprite('EquipCardBg', 'ui/equip/equip_info/spriteFrame', 0, 0, w, h, tip)) {
    const g = tip.addComponent(Graphics);
    g.fillColor = rgba(10, 8, 8, 250);
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.fill();
    g.strokeColor = rgba(q.r, q.g, q.b, 220);
    g.lineWidth = 2 * scale;
    g.roundRect(-w / 2, -h / 2, w, h, 10 * scale);
    g.stroke();
  }
  // 顶部:装备真图 + 名称(品质色+强化)+ 品质·部位·需求
  addEquipIconInCard(host, tip, item, -w / 2 + 80 * scale, h / 2 - 90 * scale, 70 * scale, scale);
  const enhance = item.enhanceLevel ?? 0;
  const nameLabel = host.addChildLabel(tip, 'CardName', `${safeText(item.equipName)}${enhance > 0 ? ` +${enhance}` : ''}`, -w / 2 + 126 * scale, h / 2 - 71 * scale, 21 * scale, rgba(q.r, q.g, q.b, 255), new Size(w - 150 * scale, 30 * scale), HorizontalTextAlignment.LEFT);
  nameLabel.fontSize = 23 * scale;
  nameLabel.overflow = Label.Overflow.SHRINK;
  applyOutline(nameLabel, scale, true);
  const slotLabel = HERO_EQUIP_SLOTS.find((slot) => slot.code === item.slot)?.label ?? item.slot;
  const tierText = (item.tier ?? 1) > 1 ? ` · ${item.tier}阶` : '';
  const sub = host.addChildLabel(tip, 'CardSub', `${equipQualityLabel(item.quality)} · ${slotLabel}${(item.requiredLevel ?? 1) > 1 ? ` · 需Lv.${item.requiredLevel}` : ''}${tierText}`, -w / 2 + 126 * scale, h / 2 - 103 * scale, 17 * scale, rgba(206, 190, 158), new Size(w - 150 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
  sub.overflow = Label.Overflow.SHRINK;
  // 单件战力(含强化/词条/宝石,与服务端权值同源)。
  const powerLabel = host.addChildLabel(tip, 'CardPower', `战力 +${formatInteger(equipItemPowerScore(item))}`, -w / 2 + 126 * scale, h / 2 - 127 * scale, 17 * scale, rgba(250, 214, 120), new Size(w - 150 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
  powerLabel.overflow = Label.Overflow.SHRINK;
  applyOutline(powerLabel, scale, false);
  // 分区标题:标题线-左 + 金字 + 标题线-右
  const sectionTitle = (name: string, text: string, y: number) => {
    const lineW = 96 * scale;
    host.addSprite(`${name}L`, 'ui/equip/title_line_l/spriteFrame', -lineW - 8 * scale, y, lineW, lineW * (67 / 285), tip);
    host.addSprite(`${name}R`, 'ui/equip/title_line_r/spriteFrame', lineW + 8 * scale, y, lineW, lineW * (67 / 285), tip);
    const title = host.addChildLabel(tip, name, text, 0, y, 21 * scale, rgba(238, 210, 148), new Size(150 * scale, 26 * scale));
    title.overflow = Label.Overflow.SHRINK;
    applyOutline(title, scale, true);
  };
  let cursor = h / 2 - 152 * scale;
  // 基础属性(白):数值含强化系数
  sectionTitle('CardBaseTitle', '基础属性', cursor);
  cursor -= 30 * scale;
  const enhFactor = 1 + 0.1 * enhance;
  const baseAttrs: { label: string; value: number; pct?: boolean }[] = [
    { label: '生命', value: item.attrHp },
    { label: '攻击', value: item.attrAttack },
    { label: '防御', value: item.attrDefense },
    { label: '速度', value: item.attrSpeed },
    { label: '暴击', value: item.attrCrit, pct: true },
  ].filter((entry) => (entry.value ?? 0) > 0);
  baseAttrs.forEach((attr) => {
    host.addSprite('CardBaseBullet', 'ui/equip/ic_attr_base/spriteFrame', -w / 2 + 44 * scale, cursor, 15 * scale, 16 * scale, tip);
    const row = host.addChildLabel(tip, 'CardBaseRow', `${attr.label} +${formatInteger(Math.round(attr.value * enhFactor))}${attr.pct ? '%' : ''}`, -w / 2 + 60 * scale, cursor, 19 * scale, rgba(238, 236, 232, 255), new Size(w - 90 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
    row.overflow = Label.Overflow.SHRINK;
    cursor -= 30 * scale;
  });
  if (enhance > 0) {
    const enh = host.addChildLabel(tip, 'CardEnhRow', `强化 +${enhance}：全属性 ×${enhFactor.toFixed(1)}`, -w / 2 + 60 * scale, cursor, 17 * scale, rgba(240, 200, 120, 255), new Size(w - 90 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
    enh.overflow = Label.Overflow.SHRINK;
    cursor -= 24 * scale;
  }
  // 特殊属性(P4 实例词条):档位色=数值区间(绿<蓝<紫<橙<炽红),特级词条带★;无数据时回退未觉醒占位。
  const instanceAffixes = item.specialAffixes ?? [];
  if (instanceAffixes.length > 0) {
    cursor -= 8 * scale;
    sectionTitle('CardAffixTitle', '特殊属性', cursor);
    cursor -= 30 * scale;
    const tierIndexOf: Record<string, number> = { GREEN: 1, BLUE: 2, PURPLE: 3, ORANGE: 4, CRIMSON: 5 };
    for (const affix of instanceAffixes) {
      const affixTier = tierIndexOf[(affix.tier || '').toUpperCase()] ?? 1;
      host.addSprite('CardAffixBullet', `ui/equip/ic_affix_t${affixTier}/spriteFrame`, -w / 2 + 44 * scale, cursor, 15 * scale, 17 * scale, tip);
      const tc = tierColors[affixTier];
      const text = `${affix.special ? '★ ' : ''}${affix.name} +${affix.value}${affix.percent ? '%' : ''}`;
      const row = host.addChildLabel(tip, 'CardAffixRow', text, -w / 2 + 60 * scale, cursor, 17 * scale, rgba(tc.r, tc.g, tc.b, affix.special ? 255 : 225), new Size(w - 90 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
      row.overflow = Label.Overflow.SHRINK;
      cursor -= 26 * scale;
    }
  } else if (affixSlotCount > 0) {
    cursor -= 8 * scale;
    sectionTitle('CardAffixTitle', '特殊属性', cursor);
    cursor -= 30 * scale;
    for (let i = 0; i < affixSlotCount; i += 1) {
      host.addSprite('CardAffixBullet', `ui/equip/ic_affix_t${Math.max(1, tierIndex)}/spriteFrame`, -w / 2 + 44 * scale, cursor, 15 * scale, 17 * scale, tip);
      const tc = tierColors[tierIndex];
      const row = host.addChildLabel(tip, 'CardAffixRow', `未觉醒词条 · 洗练可至${equipQualityLabel(item.quality).replace('装', '')}档`, -w / 2 + 60 * scale, cursor, 17 * scale, rgba(tc.r, tc.g, tc.b, 190), new Size(w - 90 * scale, 20 * scale), HorizontalTextAlignment.LEFT);
      row.overflow = Label.Overflow.SHRINK;
      cursor -= 26 * scale;
    }
  }
  // 宝石孔位:开孔数=稀有度阶数,第 i 孔=i 阶宝石专槽
  if (gemSlotCount > 0) {
    cursor -= 8 * scale;
    sectionTitle('CardGemTitle', '宝石孔位', cursor);
    // 宝石收益合计:免逐行心算;五阶全属性另列。
    const gemTotals: Record<string, number> = {};
    let gemHasT5 = false;
    (item.gems ?? []).forEach((code) => {
      const gem = parseGemCode(code);
      if (!gem) {
        return;
      }
      gemTotals[gem.type] = (gemTotals[gem.type] ?? 0) + gem.value;
      if (gem.tier === 5) {
        gemHasT5 = true;
      }
    });
    const gemParts: string[] = [];
    if (gemTotals.ATK) {
      gemParts.push(`攻击+${formatInteger(gemTotals.ATK)}`);
    }
    if (gemTotals.HP) {
      gemParts.push(`生命+${formatInteger(gemTotals.HP)}`);
    }
    if (gemTotals.DEF) {
      gemParts.push(`防御+${formatInteger(gemTotals.DEF)}`);
    }
    if (gemHasT5) {
      gemParts.push('全属性+2%');
    }
    if (gemParts.length > 0) {
      // 合计行独占 16px:下移并把槽行起点顺延,避免压到首条槽条顶部。
      const gemTotalLabel = host.addChildLabel(tip, 'CardGemTotal', `合计 ${gemParts.join(' · ')}`, 0, cursor - 34 * scale, 13 * scale, rgba(214, 190, 148, 235), new Size(w - 90 * scale, 17 * scale));
      gemTotalLabel.overflow = Label.Overflow.SHRINK;
      cursor -= 74 * scale;
    } else {
      cursor -= 46 * scale;
    }
    // 任意孔可镶任意阶(2026-07-27):槽名改孔序;行色/图标跟随已镶宝石的阶。
    const gemNames = ['宝石孔 1', '宝石孔 2', '宝石孔 3', '宝石孔 4', '宝石孔 5'];
    for (let i = 0; i < gemSlotCount; i += 1) {
      // 槽条:宽度撑满内容区、高度 50;框内内容按框自身内缘缩进(角饰约占框宽 6%)。
      const barW = w - 72 * scale;
      const barH = 50 * scale;
      const barLeft = 2 * scale - barW / 2;
      const barRight = 2 * scale + barW / 2;
      host.addSprite('CardGemBar', 'ui/equip/gem_slot_bar/spriteFrame', 2 * scale, cursor, barW, barH, tip);
      // P5:真镶嵌数据——图标按宝石类型(血玉红/锋晶橙/铁髓蓝,同类型各阶共用一图);
      // 空孔灰化降透明,避免被误读成已镶宝石。
      const socketed = parseGemCode((item.gems ?? [])[i]);
      if (socketed) {
        host.addSprite('CardGemIcon', gemIconAsset(socketed.type), barLeft + barW * 0.09 + 30 * scale, cursor, 42 * scale, 42 * scale, tip);
      } else {
        const emptyIcon = host.addSprite('CardGemIcon', 'ui/equip/gem_t1/spriteFrame', barLeft + barW * 0.09 + 30 * scale, cursor, 38 * scale, 38 * scale, tip);
        if (emptyIcon) {
          emptyIcon.color = new Color(110, 110, 110, 255);
          emptyIcon.node.addComponent(UIOpacity).opacity = 92;
        }
      }
      const tc = socketed ? tierColors[socketed.tier] : { r: 150, g: 140, b: 124 };
      const gemLabel = host.addChildLabel(tip, 'CardGemName', socketed ? socketed.label : gemNames[i], barLeft + barW * 0.09 + 30 * scale + 26 * scale, cursor, 17 * scale, rgba(tc.r, tc.g, tc.b, 255), new Size(130 * scale, 22 * scale), HorizontalTextAlignment.LEFT);
      gemLabel.overflow = Label.Overflow.SHRINK;
      const empty = host.addChildLabel(tip, 'CardGemEmpty', socketed ? socketed.attrText : '未镶嵌', barRight - barW * 0.09, cursor, 15 * scale, socketed ? rgba(238, 210, 148, 255) : rgba(160, 150, 132, 220), new Size((socketed ? 170 : 90) * scale, 20 * scale), HorizontalTextAlignment.RIGHT);
      empty.overflow = Label.Overflow.SHRINK;
      cursor -= 58 * scale;
    }
  }
  // 装备描述(系列风味文案)
  cursor -= 8 * scale;
  sectionTitle('CardDescTitle', '装备描述', cursor);
  cursor -= 22 * scale;
  const flavors: Record<string, string> = {
    WHITE: '粗铁铸造的实用之物,朴实无华,却陪伴无数新兵走过第一场战斗。',
    GREEN: '铁誓工坊的制式军备,以誓约符文淬火,锋刃间有誓言低鸣。',
    BLUE: '裂隙能量浸染的铸物,寒芒游走,隐约可闻位面裂缝深处的回响。',
    PURPLE: '深渊之力凝成的器物,黑曜表面流动着紫色低语,注视过久会被回望。',
    GOLD: '以深渊炎核锻造的灼世之器,缠绕不灭余烬,传闻每次挥动都在焚烧命运。',
    ORANGE: '以深渊炎核锻造的灼世之器,缠绕不灭余烬,传闻每次挥动都在焚烧命运。',
    RED: '烬灭级禁忌造物,曾亲手终结过一个时代。持有它的人,终将被它选择。',
  };
  const desc = host.addChildLabel(tip, 'CardDesc', flavors[qualityKey] ?? flavors.WHITE, 0, cursor - 24 * scale, 16 * scale, rgba(196, 182, 152, 255), new Size(w - 96 * scale, 62 * scale));
  desc.lineHeight = 21 * scale;
  desc.overflow = Label.Overflow.SHRINK;
  // 底部:穿戴状态
  host.addSprite('CardFootDivider', 'ui/equip/divider_cross/spriteFrame', 0, -h / 2 + 70 * scale, w - 80 * scale, (w - 80 * scale) * (79 / 711), tip);
  const worn = host.addChildLabel(tip, 'CardWorn', item.heroId == null ? '未穿戴' : `已穿戴：${host.resolveHeroName?.(item.heroId) ?? '英雄'}`, 0, -h / 2 + 46 * scale, 20 * scale, item.heroId == null ? rgba(160, 148, 126, 255) : rgba(238, 210, 148, 255), new Size(w - 60 * scale, 26 * scale));
  worn.overflow = Label.Overflow.SHRINK;
  applyOutline(worn, scale, false);
  return tip;
}

// ===== P5 宝石共享工具(与服务端 GemConfig 同源:数值逐阶×2;五阶另附全属性+2%)=====
/** 第 i 孔(0基)对应阶的品质键:绿/蓝/紫/橙/红。 */
export const GEM_TIER_QUALITY: string[] = ['GREEN', 'BLUE', 'PURPLE', 'GOLD', 'RED'];
const GEM_TYPE_DEFS: Record<string, { label: string; attr: string; base: number }> = {
  HP: { label: '血玉', attr: '生命', base: 60 },
  ATK: { label: '锋晶', attr: '攻击', base: 10 },
  DEF: { label: '铁髓', attr: '防御', base: 8 },
};
const GEM_ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];

export interface GemInfo {
  code: string;
  type: string;
  tier: number;
  label: string;
  attrText: string;
  value: number;
}

/** 解析宝石编码 GEM_{HP|ATK|DEF}_{1..5};非法返回 null。 */
export function parseGemCode(code: string | null | undefined): GemInfo | null {
  if (!code) {
    return null;
  }
  const parts = code.trim().toUpperCase().split('_');
  if (parts.length !== 3 || parts[0] !== 'GEM') {
    return null;
  }
  const def = GEM_TYPE_DEFS[parts[1]];
  const tier = Number(parts[2]);
  if (!def || !Number.isInteger(tier) || tier < 1 || tier > 5) {
    return null;
  }
  const value = def.base * Math.pow(2, tier - 1);
  return {
    code: parts.join('_'),
    type: parts[1],
    tier,
    label: `${def.label}·${GEM_ROMAN[tier - 1]}`,
    attrText: `${def.attr}+${value}${tier === 5 ? ' · 全属性+2%' : ''}`,
    value,
  };
}

/** 开孔数=稀有度阶数(与服务端 GemConfig.openSlots 同源)。 */
export function gemOpenSlots(quality: string): number {
  switch ((quality || '').toUpperCase()) {
    case 'GREEN': return 1;
    case 'BLUE': return 2;
    case 'PURPLE': return 3;
    case 'GOLD':
    case 'ORANGE': return 4;
    case 'RED': return 5;
    default: return 0;
  }
}

// 词条档位战力权值(镜像服务端 EquipAffixRoller:普通 绿10/蓝25/紫60/橙140/炽红300,特级 橙200/炽红450)。
const AFFIX_TIER_POWER: Record<string, number> = { GREEN: 10, BLUE: 25, PURPLE: 60, ORANGE: 140, CRIMSON: 300 };
const AFFIX_TIER_POWER_SPECIAL: Record<string, number> = { ORANGE: 200, CRIMSON: 450 };

/**
 * 单件装备战力(镜像服务端 HeroPowerCalculator.equipInstancePowerBonus 的单件口径):
 * 平属性权重和(hp+atk×2+def×1.5+spd×1.2+crit)×(1+0.1×强化) + 词条档位权值 + 宝石加成(五阶另+200)。
 * 改权重必须与服务端同步。
 */
export function equipItemPowerScore(item: EquipmentItemVO): number {
  const base = (item.attrHp ?? 0) + (item.attrAttack ?? 0) * 2 + (item.attrDefense ?? 0) * 1.5
    + (item.attrSpeed ?? 0) * 1.2 + (item.attrCrit ?? 0);
  const enhance = item.enhanceLevel ?? 0;
  let total = Math.round(base * (1 + 0.1 * enhance));
  (item.specialAffixes ?? []).forEach((affix) => {
    const key = (affix.tier || '').toUpperCase();
    total += affix.special ? (AFFIX_TIER_POWER_SPECIAL[key] ?? 200) : (AFFIX_TIER_POWER[key] ?? 10);
  });
  let gemTotal = 0;
  (item.gems ?? []).forEach((code) => {
    const gem = parseGemCode(code);
    if (!gem) {
      return;
    }
    gemTotal += gem.type === 'HP' ? gem.value : gem.type === 'ATK' ? gem.value * 2 : gem.value * 1.5;
    if (gem.tier === 5) {
      gemTotal += 200;
    }
  });
  return total + Math.round(gemTotal);
}

/** 宝石图标按类型(2026-07-27 定稿):血玉=红晶(t5图)/锋晶=橙晶(t4图)/铁髓=蓝晶(t2图);同类型各阶共用一图,阶靠名称与颜色区分。 */
export function gemIconAsset(type: string): string {
  switch ((type || '').toUpperCase()) {
    case 'HP':
      return 'ui/equip/gem_t5/spriteFrame';
    case 'ATK':
      return 'ui/equip/gem_t4/spriteFrame';
    default:
      return 'ui/equip/gem_t2/spriteFrame';
  }
}

/** 拆卸金币:100×2^(阶-1)(镜像服务端)。 */
export function gemUnsocketGold(tier: number): number {
  return 100 * Math.pow(2, Math.max(1, Math.min(5, tier)) - 1);
}
