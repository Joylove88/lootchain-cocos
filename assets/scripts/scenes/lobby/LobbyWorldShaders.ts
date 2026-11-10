import { EffectAsset, Material, Node, resources, Sprite, Vec4 } from 'cc';

/**
 * 跑图地图动态效果(2026-10-29 用户:小溪河流动态、树叶草地随风飘荡):
 * - wind:树 / 灌木 / 草丛立物,片元按高度错 UV 摆动(effects/world-wind)
 * - water:地形块,alpha 通道存水面遮罩,波纹 + 闪光 + 瀑布白沫(effects/world-water)
 * 全部立物共用一份材质(可合批);着色器还没加载完就先不挂,加载完回调里补挂。
 * - 11-08 透视孔:同一个 wind 着色器再建一份「带孔」材质,只挂在当前挡住队伍的几棵树上(setWindHole 每帧给孔的位置 / 强度)。
 * - 11-11 主城重做演示:cloth = 挂旗 / 布篷(wind 着色器的「上端固定」模式,另一份材质);flame = 程序火焰(effects/world-flame)。
 */
type ShaderKind = 'wind' | 'water' | 'cloth' | 'flame';

const EFFECT_PATH: Record<ShaderKind, string> = { wind: 'effects/world-wind', water: 'effects/world-water', cloth: 'effects/world-wind', flame: 'effects/world-flame' };
const materials: Partial<Record<ShaderKind, Material>> = {};
const loading = new Set<ShaderKind>();
const waiting: Record<ShaderKind, Sprite[]> = { wind: [], water: [], cloth: [], flame: [] };
const origin = new Vec4(0, 0, 1, 0);
const hole = new Vec4(0, 0, 0, 0);
/** 带透视孔的风材质(和 wind 同一个着色器)。 */
let holeMat: Material | null = null;

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
      holeMat = new Material();
      holeMat.initialize({ effectAsset: effect });
      holeMat.setProperty('mapOrigin', origin);
      holeMat.setProperty('holeParams', hole);
    } else if (kind === 'cloth') {
      // 摆幅(占贴图宽)/ 速度 / 弯曲指数 / 上端固定
      mat.setProperty('windParams', new Vec4(0.05, 2.0, 1.3, 1));
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
  const cloth = materials.cloth;
  if (!mat && !cloth) {
    return;
  }
  const p = world.worldPosition;
  const s = world.worldScale.x || 1;
  if (origin.x === p.x && origin.y === p.y && origin.z === 1 / s) {
    return;
  }
  origin.set(p.x, p.y, 1 / s, 0);
  mat?.setProperty('mapOrigin', origin);
  cloth?.setProperty('mapOrigin', origin);
  holeMat?.setProperty('mapOrigin', origin);
}

/** 透视孔位置(世界坐标 = 画布坐标)/ 半径 / 强度 0~1;强度 0 = 关。 */
export function setWindHole(x: number, y: number, radius: number, strength: number): void {
  if (!holeMat) {
    return;
  }
  if (hole.x === x && hole.y === y && hole.z === radius && hole.w === strength) {
    return;
  }
  hole.set(x, y, radius, strength);
  holeMat.setProperty('holeParams', hole);
}

/** 随风摆立物切到带孔 / 普通材质;材质没加载完返回 false(调用方退回半透明)。 */
export function useWindHole(sprite: Sprite, on: boolean): boolean {
  const base = materials.wind;
  if (!base || !holeMat) {
    return false;
  }
  const want = on ? holeMat : base;
  if (sprite.customMaterial !== want) {
    sprite.customMaterial = want;
  }
  return true;
}

/** 立物是否随风摆:树 / 灌木 / 草丛(麦田带围栏,不摆)。 */
export function isSwayAsset(asset: string): boolean {
  return /tree|bush|grass|fld_forest_trees/.test(asset);
}
