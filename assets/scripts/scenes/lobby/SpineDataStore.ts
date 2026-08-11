import { assetManager, resources, sp } from 'cc';
import { isBattleUnitSpineDataAsset } from './LobbyBattleUnitSpineRuntime';

// 全局骨骼数据缓存(2026-08-04 复用重构):战斗/编队/英雄详情/大厅挂机原先各持一套
// 私有 Map 缓存+在途去重(6 份等价实现),互不可见导致同一骨骼每页重复加载、进战预热只惠及战斗页。
// 收敛为模块级单例后任一页面加载过的骨骼全局命中;Gacha 场景因 abyss 专用回退/失败禁重试语义独立维护。
const spineDataCache = new Map<string, sp.SkeletonData>();
const spineLoadCallbacks = new Map<string, Array<(data: sp.SkeletonData | null) => void>>();

// uuid 提供时优先按 uuid 加载,失败自动回退 resourcePath(旧战斗页显式二段回退的统一化);
// tag 仅用于失败日志定位调用方。同 key 并发调用合并为一次加载。
export function loadSharedSpineData(
  resourcePath: string | null,
  uuid: string | null,
  tag: string,
  onLoaded: (data: sp.SkeletonData | null) => void,
): void {
  const normalizedPath = (resourcePath || '').trim();
  const normalizedUuid = (uuid || '').trim();
  if (!normalizedPath && !normalizedUuid) {
    onLoaded(null);
    return;
  }
  const cacheKey = normalizedUuid ? `uuid:${normalizedUuid}|${normalizedPath}` : normalizedPath;
  const cached = spineDataCache.get(cacheKey);
  if (cached) {
    onLoaded(cached);
    return;
  }
  const pending = spineLoadCallbacks.get(cacheKey);
  if (pending) {
    pending.push(onLoaded);
    return;
  }
  spineLoadCallbacks.set(cacheKey, [onLoaded]);
  const finish = (data: sp.SkeletonData | null): void => {
    const callbacks = spineLoadCallbacks.get(cacheKey) ?? [];
    spineLoadCallbacks.delete(cacheKey);
    if (data) {
      spineDataCache.set(cacheKey, data);
    }
    callbacks.forEach((callback) => callback(data));
  };
  const loadByPath = (): void => {
    resources.load(normalizedPath, sp.SkeletonData, (error: Error | null, data: sp.SkeletonData | null) => {
      if (error || !isBattleUnitSpineDataAsset(data)) {
        console.warn(`[SpineDataStore:${tag}] spine resource load failed: ${normalizedPath}`, error);
        finish(null);
        return;
      }
      finish(data);
    });
  };
  if (normalizedUuid) {
    assetManager.loadAny({ uuid: normalizedUuid, type: sp.SkeletonData }, (error: Error | null, asset: unknown) => {
      if (!error && isBattleUnitSpineDataAsset(asset)) {
        finish(asset);
        return;
      }
      console.warn(`[SpineDataStore:${tag}] spine uuid load failed: ${normalizedUuid}, ${normalizedPath}`, error);
      if (normalizedPath) {
        loadByPath();
        return;
      }
      finish(null);
    });
    return;
  }
  loadByPath();
}
