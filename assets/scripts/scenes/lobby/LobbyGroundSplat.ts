import { EffectAsset, Material, Node, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec4 } from 'cc';
import type { GroundSplatDef } from './LobbyWorldMaps';

/**
 * 野外多层地表(2026-11-08 用户「地面效果能做到流放之路2这种级别吗,更细腻的材质」,E 方案 a):
 * 整张地图铺一个四边形,着色器 effects/world-ground 按两张混合遮罩(cc_spriteTexture + mask2Tex)混 6 层平铺材质(高度混合)。
 * 遮罩 / 材质由 tools/qa/woods_ground_install.py 生成入库。素材全到齐才挂上(之前仍是旧的平铺底纹),材质按地图缓存复用。
 */
const EFFECT = 'effects/world-ground';
const cache = new Map<string, { material: Material; mask: SpriteFrame }>();
const loading = new Set<string>();

export function groundSplatReady(cfg: GroundSplatDef): boolean {
  return cache.has(cfg.mask);
}

function build(cfg: GroundSplatDef, width: number, height: number, effect: EffectAsset, frames: SpriteFrame[]): void {
  const [mask, mask2, floor, moss, meadow, dirt, leaf] = frames;
  const material = new Material();
  material.initialize({ effectAsset: effect });
  const layer = (name: string, frame: SpriteFrame): void => {
    const tex = frame.texture as Texture2D;
    tex.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
    material.setProperty(name, tex);
  };
  layer('floorTex', floor);
  layer('mossTex', moss);
  layer('meadowTex', meadow);
  layer('dirtTex', dirt);
  layer('leafTex', leaf);
  material.setProperty('mask2Tex', mask2.texture as Texture2D);
  const [tf, tm, tw, td, tl] = cfg.tiles;
  material.setProperty('tiles', new Vec4(width / tf, height / tf, width / tm, height / tm));
  material.setProperty('tiles2', new Vec4(width / tw, height / tw, width / td, height / td));
  material.setProperty('tiles3', new Vec4(width / tl, height / tl, 0, 0));
  cache.set(cfg.mask, { material, mask });
}

/**
 * 在 root 下挂整图地表节点 'Splat'(width × height,中心对齐);素材到齐后回调 onReady(节点),root 已销毁就不挂。
 * 重复调用安全:节点已存在直接返回。
 */
export function mountGroundSplat(root: Node, width: number, height: number, cfg: GroundSplatDef, onReady: (node: Node) => void): void {
  if (root.getChildByName('Splat')) {
    return;
  }
  const node = new Node('Splat');
  node.layer = root.layer;
  node.addComponent(UITransform).setContentSize(new Size(width, height));
  root.addChild(node);
  const attach = (): void => {
    const hit = cache.get(cfg.mask);
    if (!hit || !node.isValid) {
      return;
    }
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = hit.mask;
    sprite.customMaterial = hit.material;
    node.getComponent(UITransform)?.setContentSize(new Size(width, height));
    onReady(node);
  };
  if (cache.has(cfg.mask)) {
    attach();
    return;
  }
  const waitAttach = (): void => {
    // 同一张图另一份请求已经在装:轮询到装好(只有切图瞬间会遇到)
    const timer = setInterval(() => {
      if (!node.isValid || cache.has(cfg.mask)) {
        clearInterval(timer);
        attach();
      }
    }, 100);
  };
  if (loading.has(cfg.mask)) {
    waitAttach();
    return;
  }
  loading.add(cfg.mask);
  const paths = [cfg.mask, cfg.mask2, cfg.floor, cfg.moss, cfg.meadow, cfg.dirt, cfg.leaf];
  const frames: Array<SpriteFrame | null> = paths.map(() => null);
  let effect: EffectAsset | null = null;
  let left = paths.length + 1;
  let failed = false;
  const done = (): void => {
    left -= 1;
    if (left > 0) {
      return;
    }
    loading.delete(cfg.mask);
    if (failed || !effect || frames.some((frame) => !frame)) {
      console.warn('[GroundSplat] load failed', cfg.mask);
      return;
    }
    build(cfg, width, height, effect, frames as SpriteFrame[]);
    attach();
  };
  resources.load(EFFECT, EffectAsset, (error, asset) => {
    failed ||= !!error;
    effect = asset ?? null;
    done();
  });
  paths.forEach((path, index) => {
    const hit = resources.get(path, SpriteFrame);
    if (hit) {
      frames[index] = hit;
      done();
      return;
    }
    resources.load(path, SpriteFrame, (error, frame) => {
      failed ||= !!error;
      frames[index] = frame ?? null;
      done();
    });
  });
}
