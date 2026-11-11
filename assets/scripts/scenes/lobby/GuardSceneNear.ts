import { EffectAsset, Material, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';

/**
 * 分层战斗背景的近景层(高清版,2026-11-11 战斗画面精致化)。
 *
 * 原先近景是另存的一张透明 PNG(和整图同尺寸、逐像素相同,只是石坎以上透明):两张 1672×941 的大图各占一份显存,
 * 而且出包时带透明的 PNG 会被压成 256 色调色板——地面成了一块块色斑、和整图对不上(线上实测)。
 * 高清版背景是 2508×1412 的 JPG,近景不再另存颜色:**颜色直接取背景整图那张贴图,透明度取一张半分辨率遮罩**
 * (复用主城的 effects/world-occlude:rgb = 精灵贴图,alpha = maskTex 的 R 通道)。
 * 同一张贴图画两遍:显存只多一张小遮罩,近景和整图也不可能有色差;雾带 / 浮尘夹在两层中间,从石坎后面穿过。
 */
const EFFECT_PATH = 'effects/world-occlude';

let effect: EffectAsset | null = null;
let effectLoading = false;
const effectWaiters: Array<() => void> = [];
/** 一张遮罩一份材质(同一关重建场景时复用)。 */
const materials = new Map<string, Material>();

function withEffect(done: () => void): void {
  if (effect && effect.isValid) {
    done();
    return;
  }
  effectWaiters.push(done);
  if (effectLoading) {
    return;
  }
  effectLoading = true;
  resources.load(EFFECT_PATH, EffectAsset, (error, asset) => {
    effectLoading = false;
    if (error || !asset) {
      console.warn('[LootChain] scene near effect load failed', error);
    } else {
      effect = asset;
    }
    for (const waiter of effectWaiters.splice(0)) {
      waiter();
    }
  });
}

function withFrame(path: string, done: (frame: SpriteFrame | null) => void): void {
  const cached = resources.get(path, SpriteFrame);
  if (cached) {
    done(cached);
    return;
  }
  resources.load(path, SpriteFrame, (error, frame) => done(error ? null : frame));
}

/** 开战加载门里调:先把着色器读进来,进场时近景层同步就绪。 */
export function preloadSceneNearEffect(): void {
  withEffect(() => undefined);
}

/**
 * 在 node 上挂近景层:贴图 = 背景整图,透明度 = 遮罩。三样(着色器 / 整图 / 遮罩)到齐才挂精灵,
 * 没到齐时节点是空的(不会把整张背景盖在雾带上);任何一样读失败就保持空——只是雾不再被石坎挡住,画面照常。
 */
export function mountSceneNearLayer(node: Node, bgFramePath: string, maskFramePath: string): void {
  let bg: SpriteFrame | null = null;
  let mask: SpriteFrame | null = null;
  let pending = 3;
  const finish = (): void => {
    pending -= 1;
    if (pending > 0 || !node.isValid || !effect || !bg || !mask || !mask.texture) {
      return;
    }
    let material = materials.get(maskFramePath) ?? null;
    if (!material || !material.isValid) {
      material = new Material();
      material.initialize({ effectAsset: effect });
      materials.set(maskFramePath, material);
    }
    // 遮罩贴图可能被「进战前释放页面图」换过实例:每次挂载都重新指一遍
    material.setProperty('maskTex', mask.texture);
    const size = node.getComponent(UITransform)?.contentSize.clone() ?? null;
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.spriteFrame = bg;
    sprite.customMaterial = material;
    if (size) {
      node.getComponent(UITransform)?.setContentSize(size);
    }
  };
  withEffect(finish);
  withFrame(bgFramePath, (frame) => {
    bg = frame;
    finish();
  });
  withFrame(maskFramePath, (frame) => {
    mask = frame;
    finish();
  });
}
