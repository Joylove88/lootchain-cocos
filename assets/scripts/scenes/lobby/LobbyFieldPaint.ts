import { EffectAsset, Material, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec4 } from 'cc';
import { FIELD_PAINT, FieldPaintDef } from './LobbyFieldPaintData';

/**
 * 野外整图重绘(2026-11-20 用户看完「整图重绘」上限原型:「先重绘林地一张」)。
 * 地面 + 贴地件 + 矮物件 + 立物的颜色都在一张重绘大图里(tools/qa/field_repaint.py,切成 2048×1024 的 JPG 图块),
 * 图块只加载镜头附近的(离远了释放),整图常驻显存会到几百 MB。
 * 比人高的立物另画一层遮挡件(effects/world-paint-occlude):颜色取图块上同一块像素,形状取原立物贴图的透明度,
 * 按脚线参与人物排序 → 人走到树后面被树盖住;平时和地面逐像素相同,看不出来。
 * 没登记 / ?fieldpaint=0 的地图照旧(多层地表 + 立物贴图)。
 */
const OCCLUDE_EFFECT = 'effects/world-paint-occlude';
/** 镜头外多留一圈再加载 / 超出这圈再释放(世界单位)。 */
const LOAD_MARGIN = 700;
const DROP_MARGIN = 1800;

interface Tile {
  key: string;
  r: number;
  c: number;
  node: Node | null;
  tex: Texture2D | null;
  loading: boolean;
}

interface OccluderPart {
  node: Node;
  mat: Material;
}

interface Occluder {
  /** 精灵容器(TownRenderer 的淡出改它的不透明度)。 */
  art: Node;
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  mask: SpriteFrame;
  /** 按图块记的已挂部件。 */
  parts: Map<string, OccluderPart>;
}

export function fieldPaintDef(code: string): FieldPaintDef | null {
  const off = typeof location !== 'undefined' && /[?&]fieldpaint=0(&|$)/.test(location.search);
  return off ? null : FIELD_PAINT[code] ?? null;
}

export class FieldPaint {
  private def: FieldPaintDef | null = null;
  private root: Node | null = null;
  private tiles = new Map<string, Tile>();
  private occluders: Occluder[] = [];
  private effect: EffectAsset | null = null;
  private effectLoading = false;
  /** 有新登记的遮挡件 / 着色器刚到:下一帧给已到的图块补挂。 */
  private dirty = true;
  /** 镜头内的图块是不是全到齐了(没到齐时 TownRenderer 留着旧地表兜底)。 */
  covered = false;

  get active(): boolean {
    return !!this.def;
  }

  /** 在贴地层最底下挂图块容器;世界重建后重挂。 */
  mount(ground: Node, def: FieldPaintDef): void {
    if (this.root && this.root.isValid && this.root.parent === ground) {
      return;
    }
    this.reset();
    this.def = def;
    const root = new Node('PaintGround');
    root.layer = ground.layer;
    root.addComponent(UITransform).setContentSize(new Size(def.mapW, def.mapH));
    ground.addChild(root);
    root.setSiblingIndex(0);
    this.root = root;
    if (!this.effect && !this.effectLoading) {
      this.effectLoading = true;
      resources.load(OCCLUDE_EFFECT, EffectAsset, (error, asset) => {
        this.effectLoading = false;
        this.effect = error ? null : asset;
        this.dirty = true;
      });
    }
  }

  /** 登记一件比人高的立物(art = 立物节点下的空容器;x / y = 脚点,w / h = 显示尺寸)。 */
  addOccluder(art: Node, x: number, y: number, w: number, h: number, flip: boolean, mask: SpriteFrame): void {
    this.occluders.push({ art, x, y, w, h, flip, mask, parts: new Map() });
    this.dirty = true;
  }

  private tileRect(def: FieldPaintDef, r: number, c: number): { x0: number; y0: number; w: number; h: number } {
    const x0 = c * def.tileW;
    const y0 = r * def.tileH;
    return { x0, y0, w: Math.min(def.tileW, def.w - x0), h: Math.min(def.tileH, def.h - y0) };
  }

  /** 每帧:按镜头加载 / 释放图块,给已到的图块补遮挡件。 */
  step(camX: number, camY: number, viewW: number, viewH: number): void {
    const def = this.def;
    const root = this.root;
    if (!def || !root || !root.isValid) {
      return;
    }
    const px = def.px;
    // 世界坐标 → 图像素:x 从地图左边起,y 从地图上边起
    const toPx = (wx: number, wy: number): [number, number] => [(wx + def.mapW / 2) * px, (def.mapH / 2 - wy) * px];
    const want = (margin: number): { c0: number; c1: number; r0: number; r1: number } => {
      const [ax, ay] = toPx(camX - viewW / 2 - margin, camY + viewH / 2 + margin);
      const [bx, by] = toPx(camX + viewW / 2 + margin, camY - viewH / 2 - margin);
      return {
        c0: Math.max(0, Math.floor(ax / def.tileW)), c1: Math.min(def.cols - 1, Math.floor(bx / def.tileW)),
        r0: Math.max(0, Math.floor(ay / def.tileH)), r1: Math.min(def.rows - 1, Math.floor(by / def.tileH)),
      };
    };
    const load = want(LOAD_MARGIN);
    for (let r = load.r0; r <= load.r1; r += 1) {
      for (let c = load.c0; c <= load.c1; c += 1) {
        const key = `${r}_${c}`;
        if (!this.tiles.has(key)) {
          this.loadTile(def, r, c, key);
        }
      }
    }
    const keep = want(DROP_MARGIN);
    for (const tile of Array.from(this.tiles.values())) {
      if (tile.r < keep.r0 || tile.r > keep.r1 || tile.c < keep.c0 || tile.c > keep.c1) {
        this.dropTile(tile);
      }
    }
    const view = want(0);
    let covered = true;
    for (let r = view.r0; r <= view.r1 && covered; r += 1) {
      for (let c = view.c0; c <= view.c1; c += 1) {
        if (!this.tiles.get(`${r}_${c}`)?.node) {
          covered = false;
          break;
        }
      }
    }
    this.covered = covered;
    if (this.dirty && this.effect) {
      this.dirty = false;
      this.refreshOccluders();
    }
  }

  private loadTile(def: FieldPaintDef, r: number, c: number, key: string): void {
    const tile: Tile = { key, r, c, node: null, tex: null, loading: true };
    this.tiles.set(key, tile);
    resources.load(`${def.dir}/p_${r}_${c}/texture`, Texture2D, (error, tex) => {
      tile.loading = false;
      if (error || !tex) {
        console.warn('[FieldPaint] tile load failed', key, error);
        return;
      }
      if (this.tiles.get(key) !== tile || !this.root || !this.root.isValid) {
        // 加载期间已经离远 / 换图:直接放掉
        tex.addRef();
        tex.decRef(true);
        return;
      }
      tex.addRef();
      tile.tex = tex;
      const rect = this.tileRect(def, r, c);
      const frame = new SpriteFrame();
      frame.texture = tex;
      const node = new Node(`PaintTile_${key}`);
      node.layer = this.root.layer;
      const w = rect.w / def.px;
      const h = rect.h / def.px;
      // 相邻图块各多铺 1 个单位,位置不取整,镜头停在任何位置都不露缝
      node.addComponent(UITransform).setContentSize(new Size(w + 1, h + 1));
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      node.setPosition(-def.mapW / 2 + (rect.x0 + rect.w / 2) / def.px, def.mapH / 2 - (rect.y0 + rect.h / 2) / def.px, 0);
      this.root.addChild(node);
      tile.node = node;
      this.attachOccluders(def, tile);
    });
  }

  private dropTile(tile: Tile): void {
    this.tiles.delete(tile.key);
    for (const o of this.occluders) {
      const part = o.parts.get(tile.key);
      if (part) {
        o.parts.delete(tile.key);
        part.mat.destroy();
        if (part.node.isValid) {
          part.node.destroy();
        }
      }
    }
    if (tile.node && tile.node.isValid) {
      tile.node.destroy();
    }
    if (tile.tex) {
      tile.tex.decRef(true);
    }
  }

  /** 图块到了:给和它重叠的遮挡件各挂一块(精灵帧 = 图块上的交叠区,遮罩 = 原立物贴图对应的那一截)。 */
  private attachOccluders(def: FieldPaintDef, tile: Tile): void {
    const tex = tile.tex;
    const effect = this.effect;
    if (!tex || !effect) {
      return;
    }
    const tr = this.tileRect(def, tile.r, tile.c);
    const px = def.px;
    for (const o of this.occluders) {
      if (!o.art.isValid || o.parts.has(tile.key)) {
        continue;
      }
      // 立物在图上的像素框(精灵底边 = 脚线)
      const X0 = (o.x - o.w / 2 + def.mapW / 2) * px;
      const X1 = (o.x + o.w / 2 + def.mapW / 2) * px;
      const Y0 = (def.mapH / 2 - (o.y + o.h)) * px;
      const Y1 = (def.mapH / 2 - o.y) * px;
      const ix0 = Math.max(X0, tr.x0);
      const ix1 = Math.min(X1, tr.x0 + tr.w);
      const iy0 = Math.max(Y0, tr.y0);
      const iy1 = Math.min(Y1, tr.y0 + tr.h);
      if (ix1 - ix0 < 1 || iy1 - iy0 < 1) {
        continue;
      }
      const frame = new SpriteFrame();
      frame.texture = tex;
      frame.rect = new Rect(Math.round(ix0 - tr.x0), Math.round(iy0 - tr.y0), Math.round(ix1 - ix0), Math.round(iy1 - iy0));
      const fr = frame.rect;
      const mat = new Material();
      mat.initialize({ effectAsset: effect });
      const mtex = o.mask.texture as Texture2D;
      mat.setProperty('maskTex', mtex);
      mat.setProperty('baseRect', new Vec4(fr.x / tex.width, fr.y / tex.height, fr.width / tex.width, fr.height / tex.height));
      // 交叠区在立物贴图里的位置(0..1,左上起);立物帧在它自己贴图里的区域(trim none 时就是整张)
      const u0 = (fr.x + tr.x0 - X0) / (X1 - X0);
      const v0 = (fr.y + tr.y0 - Y0) / (Y1 - Y0);
      const du = fr.width / (X1 - X0);
      const dv = fr.height / (Y1 - Y0);
      const mr = o.mask.rect;
      const mw = mtex.width;
      const mh = mtex.height;
      const ux = o.flip ? 1 - u0 : u0;
      mat.setProperty('maskRect', new Vec4((mr.x + ux * mr.width) / mw, (mr.y + v0 * mr.height) / mh, ((o.flip ? -du : du) * mr.width) / mw, (dv * mr.height) / mh));
      const node = new Node(`PaintOcc_${tile.key}`);
      node.layer = o.art.layer;
      const w = fr.width / px;
      const h = fr.height / px;
      node.addComponent(UITransform).setContentSize(new Size(w, h));
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      sprite.customMaterial = mat;
      // 容器原点 = 脚点
      const cx = (fr.x + tr.x0 + fr.width / 2) / px - def.mapW / 2 - o.x;
      const cy = def.mapH / 2 - (fr.y + tr.y0 + fr.height / 2) / px - o.y;
      node.setPosition(cx, cy, 0);
      o.art.addChild(node);
      o.parts.set(tile.key, { node, mat });
    }
  }

  /** 遮挡件登记完 / 着色器晚到时补挂(已到的图块各过一遍)。 */
  refreshOccluders(): void {
    const def = this.def;
    if (!def || !this.effect) {
      return;
    }
    for (const tile of this.tiles.values()) {
      if (tile.node) {
        this.attachOccluders(def, tile);
      }
    }
  }

  /** 换图 / 世界重建:放掉全部图块(节点随世界销毁)。 */
  reset(): void {
    for (const tile of Array.from(this.tiles.values())) {
      this.dropTile(tile);
    }
    this.tiles.clear();
    this.occluders = [];
    this.root = null;
    this.def = null;
    this.covered = false;
  }
}
