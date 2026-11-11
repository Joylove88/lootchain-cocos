import { assetManager, ImageAsset, Texture2D } from 'cc';
import { HTML5 } from 'cc/env';

/**
 * 角色骨骼贴图的缩小抗锯齿(2026-11-11 战斗画面精致化,用户确认「偏锐」档)。
 *
 * 现象:异界神州英雄的图集是 2 页 2048²,战场上只按约 0.11(电脑 1080p)/ 0.14(手机)倍显示,怪物 0.24~0.37 倍;
 * 贴图导入设置里多级渐远全是「无」,GPU 缩小时每个屏幕像素只取贴图上相邻 4 个点 → 满身锯齿、颗粒、动起来闪。
 *
 * 做法:英雄 / 怪物骨骼贴图在**第一次上传显卡之前**把多级渐远过滤改成「取最近一级」(LINEAR_MIPMAP_NEAREST,比三线性更锐),
 * 引擎建贴图时就会带上自动生成多级渐远的标记。
 * - 必须赶在首次上传前:手机开了 macro.CLEANUP_IMAGE_CACHE,图片上传完就释放,之后没法重建。所以挂在 Texture2D.onLoaded 上。
 * - 只在网页端做;压缩贴图(安卓原生的 ASTC)引擎不会自动生成多级渐远,开了反而是残缺贴图,一律跳过。
 * - 项目的网页端是 WebGL1:只有宽高都是 2 的幂的贴图能生成(异界神州 19 个英雄 + 全部怪物正好都是);
 *   老英雄的小图集不是 2 的幂,引擎自己会退回普通双线性,不受影响(它们只缩到 1/3 左右,本来也不明显)。
 * - 代价:这些贴图显存 +1/3。
 */
const MIP_PATH_PREFIXES = ['spine/hero/', 'spine/monster/', 'spine/hero_skin/'];

let installed = false;

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** 资源在包里的路径(贴图子资源形如 spine/hero/sz_x/zhangjiao/texture,骨骼数据形如 spine/hero/sz_x/sz_x);查不到返回空串。 */
export function resourcePathOf(uuid: string): string {
  if (!uuid) {
    return '';
  }
  let found = '';
  assetManager.bundles.forEach((bundle) => {
    if (found) {
      return;
    }
    const info = bundle.getAssetInfo(uuid) as { path?: string } | null;
    if (info?.path) {
      found = info.path;
    }
  });
  if (!found && uuid.indexOf('@') > 0) {
    // 子资源查不到路径时退回主资源(图片本身)的路径
    return resourcePathOf(uuid.split('@')[0]);
  }
  return found;
}

function wantsMips(texture: Texture2D): boolean {
  const image = (texture as unknown as { _mipmaps?: Array<ImageAsset | null> })._mipmaps?.[0] ?? null;
  if (!image || image.isCompressed || !isPowerOfTwo(image.width) || !isPowerOfTwo(image.height)) {
    return false;
  }
  // 小图不值得(多级渐远只对被大幅缩小的大图集有意义)
  if (Math.max(image.width, image.height) < 512) {
    return false;
  }
  const path = resourcePathOf(texture.uuid);
  return MIP_PATH_PREFIXES.some((prefix) => path.indexOf(prefix) === 0);
}

/** 启动时调用一次(在任何骨骼贴图加载之前)。 */
export function installSpineTextureMips(): void {
  if (installed || !HTML5) {
    return;
  }
  const proto = Texture2D.prototype as unknown as { onLoaded?: (this: Texture2D) => void };
  const original = proto.onLoaded;
  if (typeof original !== 'function') {
    console.warn('[LootChain] spine texture mips skipped: engine internals changed');
    return;
  }
  installed = true;
  proto.onLoaded = function onLoaded(this: Texture2D): void {
    try {
      if (wantsMips(this)) {
        this.setMipFilter(Texture2D.Filter.NEAREST);
      }
    } catch (error) {
      void error;
    }
    original.call(this);
  };
}
