import { EffectAsset, Material, Node, resources, Sprite, Vec4 } from 'cc';

/**
 * 跑图地图动态效果(2026-10-29 用户:小溪河流动态、树叶草地随风飘荡):
 * - wind:树 / 灌木 / 草丛立物,片元按高度错 UV 摆动(effects/world-wind)
 * - water:地形块,alpha 通道存水面遮罩,波纹 + 闪光 + 瀑布白沫(effects/world-water)
 * 全部立物共用一份材质(可合批);着色器还没加载完就先不挂,加载完回调里补挂。
 */
type ShaderKind = 'wind' | 'water';

const EFFECT_PATH: Record<ShaderKind, string> = { wind: 'effects/world-wind', water: 'effects/world-water' };
const materials: Partial<Record<ShaderKind, Material>> = {};
const loading = new Set<ShaderKind>();
const waiting: Record<ShaderKind, Sprite[]> = { wind: [], water: [] };
const origin = new Vec4(0, 0, 1, 0);

function load(kind: ShaderKind): void {
  if (materials[kind] || loading.has(kind)) {
    return;
  }
  loading.add(kind);
  resources.load(EFFECT_PATH[kind], EffectAsset, (error, effect) => {
    loading.delete(kind);
    if (error || !effect) {
      console.warn('[WorldShaders] load failed', kind, error);
      waiting[kind].length = 0;
      return;
    }
    const mat = new Material();
    mat.initialize({ effectAsset: effect });
    if (kind === 'wind') {
      mat.setProperty('mapOrigin', origin);
    }
    materials[kind] = mat;
    for (const sprite of waiting[kind].splice(0)) {
      if (sprite.isValid) {
        sprite.customMaterial = mat;
      }
    }
  });
}

/** 给精灵挂动态材质;材质还在加载就排队,到了再挂。 */
export function applyWorldShader(sprite: Sprite | null, kind: ShaderKind): void {
  if (!sprite) {
    return;
  }
  const mat = materials[kind];
  if (mat) {
    sprite.customMaterial = mat;
    return;
  }
  waiting[kind].push(sprite);
  load(kind);
}

/** 每帧镜头更新后调:世界层的世界坐标 / 缩放 → 风的空间相位换算成地图坐标(走动时相位不跟着镜头变)。 */
export function updateWorldShaderOrigin(world: Node): void {
  const mat = materials.wind;
  if (!mat) {
    return;
  }
  const p = world.worldPosition;
  const s = world.worldScale.x || 1;
  if (origin.x === p.x && origin.y === p.y && origin.z === 1 / s) {
    return;
  }
  origin.set(p.x, p.y, 1 / s, 0);
  mat.setProperty('mapOrigin', origin);
}

/** 立物是否随风摆:树 / 灌木 / 草丛(麦田带围栏,不摆)。 */
export function isSwayAsset(asset: string): boolean {
  return /tree|bush|grass|fld_forest_trees/.test(asset);
}
