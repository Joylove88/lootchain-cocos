import { Node, sp } from 'cc';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';
import {
  patchBattleUnitSpineRuntimeEnums,
  resolveBattleUnitSpineNodePosition,
  resolveBattleUnitSpineRuntimeData,
  resolveBattleUnitSpineScale,
  resolveBattleUnitSpineSkinName,
} from './LobbyBattleUnitSpineRuntime';
import type { HeroSkinAssets } from './HeroSkins';
import { loadSharedSpineData } from './SpineDataStore';

/** 与野外英雄同一套体型口径(LobbyTownRenderer HERO_SLOT_W / H):骨骼原始高含技能特效外扩,不能直接按 runtime.height 缩。 */
const SLOT_W = 180;
const SLOT_H = 230;
/** 野外镜头约放大 2 倍,同一缩放在界面里只有目标高的一半(11-01 实测):界面预览补回来。 */
const UI_SIZE_FIX = 2.0;

/**
 * 皮肤动作预览(docs/56,商店皮肤页 / 英雄详情皮肤页共用):皮肤战斗骨骼依次播 待机 → 技能 → 大招 → 待机循环。
 * footY = 脚底位置;charH = 角色约高(按野外 230 槽位等比放大)。
 */
export function mountHeroSkinSpine(
  host: { addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node },
  parent: Node,
  assets: HeroSkinAssets,
  x: number,
  footY: number,
  charH: number,
): Node {
  const holder = host.addChildPlainNode(parent, 'HeroSkinSpinePreview', x, footY, 10, 10);
  const node = host.addChildPlainNode(holder, 'Spine', 0, 0, 10, 10);
  const skeleton = node.addComponent(sp.Skeleton);
  skeleton.premultipliedAlpha = false;
  const unit = {
    unitKey: `skin:${assets.heroCode}`,
    side: 'ally',
    role: 'front',
    rarity: assets.rarity,
    heroCode: assets.heroCode,
  } as unknown as BattlePresentationUnitSnapshot;
  loadSharedSpineData(assets.spine, null, 'HeroSkinPreview', (data) => {
    if (!data || !node.isValid) {
      return;
    }
    const runtime = resolveBattleUnitSpineRuntimeData(data);
    if (!runtime) {
      return;
    }
    try {
      patchBattleUnitSpineRuntimeEnums(data, runtime);
      skeleton.skeletonData = data;
      const skin = resolveBattleUnitSpineSkinName(data, runtime);
      if (skin) {
        skeleton.setSkin(skin);
      }
      const m = (charH / SLOT_H) * UI_SIZE_FIX;
      const scale = resolveBattleUnitSpineScale(runtime.width, runtime.height, SLOT_W, SLOT_H, 1, false, unit);
      const pos = resolveBattleUnitSpineNodePosition(runtime, scale, SLOT_H, unit, false);
      node.setPosition(pos.x * m, (pos.y + SLOT_H * 0.44) * m, 0);
      node.setScale(scale * m, scale * m, 1);
      const names = (runtime.animations ?? []).map((a) => a?.name ?? '').filter((n) => !!n);
      const idle = names.find((n) => n === 'stand' || n === 'idle') ?? names[0];
      if (!idle) {
        return;
      }
      skeleton.setAnimation(0, idle, false);
      ['skill1', 'skill2', 'skill4', 'ult'].filter((n) => names.includes(n)).forEach((n) => skeleton.addAnimation(0, n, false, 0));
      skeleton.addAnimation(0, idle, true, 0);
    } catch (error) {
      console.warn('[HeroSkinPreview] mount failed', assets.spine, error);
    }
  });
  return holder;
}
