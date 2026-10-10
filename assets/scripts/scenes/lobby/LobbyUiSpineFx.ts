import { Node, sp } from 'cc';
import { lookupBattleFxBounds } from './LobbyBattleSkillEffectConfig';
import { patchBattleUnitSpineRuntimeEnums, resolveBattleUnitSpineRuntimeData } from './LobbyBattleUnitSpineRuntime';
import { loadSharedSpineData } from './SpineDataStore';

/**
 * 大厅 / 面板里挂骨骼特效(新批次 UI 特效,docs/29 v3,2026-09-27):
 * 按实测包围盒表(BATTLE_FX_MEASURED_BOUNDS)把最长边缩到 sizePx、亮区居中;没有表项不猜尺寸,返回 null 让调用方走贴图/矢量回退。
 * loop=false 时 holdMs 内播完自毁(数据异步到达前节点已销毁则跳过)。数据走 SpineDataStore 共享缓存,同一 effect 多处复用不重复加载。
 */
export interface LobbyUiSpineFxSpec {
  effect: string;
  animation: string;
}

export interface LobbyUiSpineFxHost {
  addChildPlainNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node;
}

export function mountLobbySpineFx(host: LobbyUiSpineFxHost, parent: Node, spec: LobbyUiSpineFxSpec, x: number, y: number, sizePx: number, loop: boolean, holdMs: number, name = 'LobbySpineFx'): Node | null {
  const bounds = lookupBattleFxBounds(spec.effect, spec.animation);
  if (!bounds || !parent.isValid) {
    return null;
  }
  const fit = sizePx / Math.max(8, bounds.w, bounds.h);
  const node = host.addChildPlainNode(parent, name, x - bounds.cx * fit, y - bounds.cy * fit, 10, 10);
  node.setScale(fit, fit, 1);
  const skeleton = node.addComponent(sp.Skeleton);
  skeleton.premultipliedAlpha = false;
  // 循环 / 一次性 UI 特效走共享动画缓存(同一特效只算一遍帧,画面不变;2026-10-10 真机剖析)
  try {
    skeleton.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.SHARED_CACHE);
  } catch (error) {
    void error;
  }
  loadSharedSpineData(`spine/effect/${spec.effect}/${spec.effect}`, null, 'LobbyUiFx', (data) => {
    if (!node.isValid || !data) {
      return;
    }
    try {
      const runtime = resolveBattleUnitSpineRuntimeData(data);
      const names = (runtime?.animations ?? []).map((animation) => (animation?.name || '').trim()).filter(Boolean);
      if (!runtime || names.length === 0) {
        return;
      }
      patchBattleUnitSpineRuntimeEnums(data, runtime);
      const wanted = spec.animation.toLowerCase();
      const animation = names.find((entry) => entry.toLowerCase() === wanted) ?? names[0];
      skeleton.skeletonData = data;
      if (!loop) {
        const duration = Math.max(0.12, skeleton.findAnimation(animation)?.duration ?? 0.6);
        skeleton.timeScale = Math.max(0.5, duration / (Math.max(120, holdMs) / 1000));
      }
      skeleton.setAnimation(0, animation, loop);
    } catch (error) {
      void error;
    }
  });
  if (!loop) {
    setTimeout(() => {
      if (node.isValid) {
        node.destroy();
      }
    }, holdMs + 80);
  }
  return node;
}

/** 预热(登录后 / 打开面板前):只拉数据进共享缓存。 */
export function prewarmLobbySpineFx(specs: readonly LobbyUiSpineFxSpec[]): void {
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.effect)) {
      continue;
    }
    seen.add(spec.effect);
    loadSharedSpineData(`spine/effect/${spec.effect}/${spec.effect}`, null, 'LobbyUiFx', () => { /* 仅预热 */ });
  }
}
