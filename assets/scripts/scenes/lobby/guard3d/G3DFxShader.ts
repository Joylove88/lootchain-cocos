import { EffectAsset, Material, Texture2D, Vec4 } from 'cc';
import { tex } from './G3DKit';
import { paintFxNoise } from './G3DFxTex';

/**
 * 技能特效专用着色器(resources/effects/g3d-fx.effect,2026-11-22)的材质工厂:渐变上色 + 噪声流动 + 边缘溶解。
 * 着色器由 TownPost3D.loadPost 顺带读进来(setFxEffect);没读到 / 地址带 &fxs=0 时 fxMaterial 返回 null,调用方退回引擎通用的不受光材质。
 *
 * 顶点色的约定(和通用材质不一样):加色那套 rgb = 颜色 × 亮度、a = 寿命(1 新 → 0 消失,驱动溶解);
 * 半透明那套 rgb = 颜色、a = 不透明度 × 寿命(和原来一样,溶解力度给得小)。
 */
let fxEffect: EffectAsset | null = null;
let noiseTex: Texture2D | null = null;

export function setFxEffect(e: EffectAsset | null): void {
  fxEffect = e;
}

function disabled(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('fxs') === '0';
  } catch (error) {
    return false;
  }
}

export function fxShaderReady(): boolean {
  return !!fxEffect && !disabled();
}

/**
 * kind:add = 发光(加色)、alpha = 云雾碎石(半透明)。
 * fx = [溶解力度, 扭曲, 白热核心, 整体亮度];noise = [每米几个周期 x, y, 滚动速度 x, y]。
 */
export function fxMaterial(kind: 'add' | 'alpha', texture: Texture2D, fx: [number, number, number, number], noise: [number, number, number, number]): Material | null {
  if (!fxShaderReady()) {
    return null;
  }
  if (!noiseTex) {
    noiseTex = tex(paintFxNoise(), true, 1);
  }
  const m = new Material();
  m.initialize({ effectAsset: fxEffect!, technique: kind === 'add' ? 0 : 1 });
  m.setProperty('mainTexture', texture);
  m.setProperty('noiseTexture', noiseTex);
  m.setProperty('fxParams', new Vec4(fx[0], fx[1], fx[2], fx[3]));
  m.setProperty('noiseParams', new Vec4(noise[0], noise[1], noise[2], noise[3]));
  return m;
}
