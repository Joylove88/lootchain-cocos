import { Graphics, Mask, Node, Rect, resources, Size, Sprite, SpriteFrame, UITransform, Vec2 } from 'cc';
import { resolveHeroCardArtPath } from '../../api/LobbyHeroApi';

/**
 * 英雄静态头像。
 * - 首选 ui/hero/ai/avatar/<英雄码>:2026-10-15 用户「头像直接调用 GPT 订阅模式生成,给 GPT 截图做参考」——
 *   每位英雄以名册立绘为参考生成的 1:1 胸像(256px,原图备份在 素材原始备份/hero-avatar-20261015)。
 * - 没有生成头像的英雄,退回从名册卡立绘里裁头部(2026-10-11 守卫战统计首用的裁切表)。
 */
export const HERO_AVATAR_DIR = 'ui/hero/ai/avatar';
/** 已生成头像的英雄码(新英雄生成头像后加进来)。 */
export const HERO_AVATAR_CODES: ReadonlySet<string> = new Set([
  'R_PATROL_01', 'R_ACOLY_02', 'R_SCOUT_03', 'R_CULT_05', 'R_RANGER_06', 'R_GUARD_07',
  'SR_PRIEST_01', 'SR_PALADIN_02', 'SR_WITCH_03', 'SR_BLADE_04', 'SR_SNIPER_05', 'SR_ABYSS_06',
  'SSR_KANE', 'SSR_LIVIA', 'SSR_MICHAEL', 'SSR_RON',
  'UR_ARTHAS', 'UR_ATLAS', 'UR_AURELIA', 'UR_NYX', 'UR_SERAPHINA', 'UR_EVELYN',
]);

export function resolveHeroAvatarPath(heroCode: string | null | undefined): string | null {
  const code = (heroCode ?? '').trim().toUpperCase();
  return HERO_AVATAR_CODES.has(code) ? `${HERO_AVATAR_DIR}/${code}/spriteFrame` : null;
}

let avatarsPreloaded = false;
/** 进大厅后预读全部头像(22 张小图),挑战弹窗 / 统计打开时直接有图、不闪首字。 */
export function preloadHeroAvatars(): void {
  if (avatarsPreloaded) {
    return;
  }
  avatarsPreloaded = true;
  resources.loadDir(HERO_AVATAR_DIR, SpriteFrame, (error) => {
    if (error) {
      avatarsPreloaded = false;
    }
  });
}

/** 在 parent 中心挂圆形 / 圆角方形遮罩窗口,里面放一张 size×size 的图。 */
function mountMaskedFrame(parent: Node, frame: SpriteFrame, size: number, shape: 'circle' | 'round'): void {
  const clip = new Node('HeadClip');
  clip.layer = parent.layer;
  parent.addChild(clip);
  clip.addComponent(UITransform).setContentSize(size, size);
  const mask = clip.addComponent(Mask);
  if (shape === 'circle') {
    // 圆形用 Mask 自带椭圆(按节点尺寸生成):自绘 Graphics 的模板遮罩在这里没生效(安卓模拟器实测方图四角伸出圆圈)
    mask.type = Mask.Type.GRAPHICS_ELLIPSE;
    mask.segments = 48;
  } else {
    mask.type = Mask.Type.GRAPHICS_STENCIL;
    const mg = clip.getComponent(Graphics) ?? clip.addComponent(Graphics);
    mg.roundRect(-size / 2, -size / 2, size, size, Math.max(4, size * 0.1));
    mg.fill();
  }
  const img = new Node('Img');
  img.layer = parent.layer;
  clip.addChild(img);
  img.addComponent(UITransform).setContentSize(size, size);
  const sprite = img.addComponent(Sprite);
  sprite.type = Sprite.Type.SIMPLE;
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.spriteFrame = frame;
}

/** 读帧:缓存命中同步回调(resources.load 命中也是异步,会闪一帧占位),否则异步加载。 */
function withFrame(path: string, done: (frame: SpriteFrame | null) => void): void {
  const cached = resources.get(path, SpriteFrame);
  if (cached) {
    done(cached);
    return;
  }
  resources.load(path, SpriteFrame, (error, frame) => done(error ? null : frame));
}

/**
 * 英雄头像:生成头像优先,没有则从立绘裁头部。两者都没有返回 false(调用方自己画占位)。
 * 图在缓存里同步挂好;否则异步,到了再挂并回调 onReady(调用方据此撤掉首字占位)。
 */
export function mountHeroAvatar(parent: Node, heroCode: string | null | undefined, size: number, shape: 'circle' | 'round', onReady?: () => void): boolean {
  const avatar = resolveHeroAvatarPath(heroCode);
  if (!avatar) {
    return mountHeroHeadCrop(parent, heroCode, size, shape, onReady);
  }
  withFrame(avatar, (frame) => {
    if (!parent.isValid) {
      return;
    }
    if (!frame) {
      mountHeroHeadCrop(parent, heroCode, size, shape, onReady);
      return;
    }
    mountMaskedFrame(parent, frame, size, shape);
    onReady?.();
  });
  return true;
}

/** 名册卡立绘的头部裁切框(原图像素 x/y/w/h;2026-10-11 用 PIL 按 alpha 包围盒自动估算后目视复核)。 */
export const HERO_HEAD_CROPS: Record<string, [number, number, number, number]> = {
  Belladonna_Illust: [324, 426, 295, 295], Carmilla_center: [346, 83, 276, 276], Eulenspigel_Illust: [334, 457, 289, 289], HeylelS01_Illust: [306, 448, 305, 305],
  IshmaelA_Illust: [330, 403, 378, 378], Ishmael_center: [357, 110, 369, 369], LucienA_Illust: [311, 326, 393, 393], Lucrecia_Illust: [582, 433, 290, 290],
  Nuu_Illust: [195, 3, 289, 289], Simone_Illust: [409, 352, 353, 353], Sphinx_Illust: [363, 362, 270, 270],
  npc_1001: [184, 0, 254, 254], npc_1002: [164, 3, 210, 210], npc_1003: [124, 0, 138, 138], npc_1004: [140, 0, 318, 318], npc_1008: [227, 40, 391, 391],
  npc_1012: [153, 10, 203, 203], npc_1016: [112, 18, 231, 231], npc_1028: [149, 56, 281, 281], npc_1036: [153, 110, 292, 292], npc_1037: [168, 192, 396, 396],
  npc_1038: [164, 70, 265, 265], npc_21006: [103, 62, 321, 321],
};

/** 立绘路径(不带 /spriteFrame)有裁切框时返回框,否则 null。 */
export function heroHeadCropOf(artPath: string): [number, number, number, number] | null {
  return HERO_HEAD_CROPS[artPath.split('/').pop() ?? ''] ?? null;
}

/** 从立绘帧里切出头部子帧(源帧可能被裁过透明边:先算原图左上角在贴图里的坐标,再加裁切框)。 */
export function buildHeroHeadCropFrame(base: SpriteFrame, crop: [number, number, number, number]): SpriteFrame | null {
  if (!base || !base.isValid || !base.texture) {
    return null;
  }
  const originX = base.rect.x - ((base.originalSize.width - base.rect.width) / 2 + base.offset.x);
  const originY = base.rect.y - ((base.originalSize.height - base.rect.height) / 2 - base.offset.y);
  const texW = base.texture.width;
  const texH = base.texture.height;
  const x = Math.max(0, Math.min(texW - 1, Math.round(originX + crop[0])));
  const y = Math.max(0, Math.min(texH - 1, Math.round(originY + crop[1])));
  const w = Math.max(1, Math.min(texW - x, crop[2]));
  const h = Math.max(1, Math.min(texH - y, crop[3]));
  const sub = new SpriteFrame();
  sub.texture = base.texture;
  sub.rect = new Rect(x, y, w, h);
  sub.originalSize = new Size(w, h);
  sub.offset = new Vec2(0, 0);
  return sub;
}

/**
 * 在 parent 中心挂一个 size×size 的英雄头像(圆形或圆角方形窗口)。英雄没有立绘 / 裁切框时返回 false(调用方自己画占位)。
 * 立绘已在缓存则同步挂好;否则异步加载,到了再挂并回调 onReady(调用方据此撤掉首字占位)。
 */
export function mountHeroHeadCrop(parent: Node, heroCode: string | null | undefined, size: number, shape: 'circle' | 'round', onReady?: () => void): boolean {
  const artPath = resolveHeroCardArtPath(heroCode);
  const crop = artPath ? heroHeadCropOf(artPath) : null;
  if (!artPath || !crop) {
    return false;
  }
  withFrame(`${artPath}/spriteFrame`, (base) => {
    if (!parent.isValid) {
      return;
    }
    const frame = base ? buildHeroHeadCropFrame(base, crop) : null;
    if (!frame) {
      return;
    }
    mountMaskedFrame(parent, frame, size, shape);
    onReady?.();
  });
  return true;
}
