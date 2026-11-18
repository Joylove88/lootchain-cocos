import { EffectAsset, JsonAsset, Material, Node, Rect, resources, Size, Sprite, SpriteFrame, sys, Texture2D, UITransform, Vec2, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';
import { LobbyTownRenderer } from '../LobbyTownRenderer';
import { CITY_PRE25, PRE25_CITY_RUNTIME as R } from './Pre25City';

/**
 * 预渲染 2.5D(第 0 期):主城换成 CITY_PRE25 时,队长的 2D 骨骼藏起来,换成 3D 模型离线拍的 8 方向序列帧,
 * 并挂上逐像素比深度的遮挡材质(effects/pre25-actor):走到建筑 / 树 / 墙后面就被挡住。
 *
 * 做法照 TownUnits3D:不改渲染器文件,模块加载时包一层 LobbyTownRenderer.prototype.step,每帧跟在原来的逻辑后面照着队长的状态换帧
 * (moving → 跑,oneShotEnd 没到 → 出手,连着出手轮到下一段连招;倒地 → 倒下)。逻辑、出手时长、伤害时刻全是原来的。
 * 骨骼节点不销毁只藏:出手时长按骨骼动作时长算,它仍是节拍器。
 * 第 0 期的口径(方案拍板 3):主城只显示主角,队友节点藏起来(逻辑照跑)。
 * 只拍了男主(hero_m),女主暂时也用它。
 */
const HERO = 'pre25/hero_m/hero_m';
const COMBO_GAP_MS = 1400;          // 两次出手间隔不超过这么久,算连招的下一段
const EPS_M = 0.35;                 // 判定余量(米):人物当竖板,手和剑往前伸的部分不被身后的东西误挡

interface HeroAtlas {
  ppm: number;
  pitch: number;
  fps: number;
  pages: number;
  clips: Record<string, { dur: number; n: number; loop: boolean }>;
  yaws: number[];
  mirror: Record<string, number>;
  frames: Record<string, [number, number, number, number, number, number, number]>;
}

const v4 = new Vec4();

class Pre25Layer {
  private atlas: HeroAtlas | null = null;
  private pages: Texture2D[] = [];
  private effect: EffectAsset | null = null;
  private loading = false;
  private failed = '';
  private frameCache = new Map<string, SpriteFrame>();
  private occ = new Map<string, Texture2D | null>();
  private node: Node | null = null;
  private sprite: Sprite | null = null;
  private owner: any = null;
  private yaw = 180;
  private lastX = NaN;
  private lastY = NaN;
  private shotEnd = 0;
  private shotStart = 0;
  private combo = 0;
  private downAt = 0;
  private hidden: Node[] = [];
  private stats = { frames: 0, occLoads: 0, block: '' };

  sync(self: any): void {
    if (self.def !== CITY_PRE25) {
      if (this.owner) {
        this.stop();
      }
      return;
    }
    if (!this.ready()) {
      return;
    }
    const leader = self.leader;
    if (!leader || !leader.node || !leader.node.isValid) {
      return;
    }
    this.owner = self;
    // 队友:主城只显示主角
    for (const f of self.followers as any[]) {
      if (f.node && f.node.isValid && f.node.active) {
        f.node.active = false;
        this.hidden.push(f.node);
      }
    }
    if (!this.node || !this.node.isValid || this.node.parent !== leader.node) {
      this.mount(leader.node);
    }
    if (leader.spineNode && leader.spineNode.isValid && leader.spineNode.active) {
      leader.spineNode.active = false;
    }
    this.pose(self, leader);
    this.uniforms(leader);
  }

  stop(): void {
    const leader = this.owner?.leader;
    if (leader?.spineNode && leader.spineNode.isValid) {
      leader.spineNode.active = true;
    }
    for (const n of this.hidden) {
      if (n.isValid) {
        n.active = true;
      }
    }
    this.hidden = [];
    if (this.node && this.node.isValid) {
      this.node.destroy();
    }
    this.node = null;
    this.sprite = null;
    this.owner = null;
  }

  info(): unknown {
    return { ready: !!this.atlas && !!this.effect && this.pages.length > 0, failed: this.failed, yaw: this.yaw, combo: this.combo, occ: this.occ.size, ...this.stats };
  }

  // ── 素材 ──
  private ready(): boolean {
    if (this.atlas && this.effect && this.atlas.pages === this.pages.length) {
      return true;
    }
    if (this.loading || this.failed) {
      return false;
    }
    this.loading = true;
    resources.load(HERO, JsonAsset, (err, json) => {
      if (err || !json) {
        this.failed = `atlas ${err}`;
        return;
      }
      const atlas = json.json as unknown as HeroAtlas;
      const paths = Array.from({ length: atlas.pages }, (_, i) => `${HERO}_${i}/texture`);
      resources.load(paths, Texture2D, (err2, texs) => {
        if (err2 || !texs) {
          this.failed = `pages ${err2}`;
          return;
        }
        resources.load('effects/pre25-actor', EffectAsset, (err3, eff) => {
          if (err3 || !eff) {
            this.failed = `effect ${err3}`;
            return;
          }
          this.pages = texs as Texture2D[];
          this.effect = eff;
          this.atlas = atlas;
          this.loading = false;
        });
      });
    });
    return false;
  }

  private mount(parent: Node): void {
    if (this.node && this.node.isValid) {
      this.node.destroy();
    }
    const node = new Node('Pre25Hero');
    node.layer = parent.layer;
    node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    const mat = new Material();
    mat.initialize({ effectAsset: this.effect! });
    sprite.customMaterial = mat;
    const tint = CITY_PRE25.actorTint;
    if (tint) {
      sprite.color.set(tint[0], tint[1], tint[2], 255);
      sprite.color = sprite.color;
    }
    parent.addChild(node);
    this.node = node;
    this.sprite = sprite;
  }

  private frame(key: string): { sf: SpriteFrame; r: number[] } | null {
    const r = this.atlas!.frames[key];
    if (!r) {
      return null;
    }
    let sf = this.frameCache.get(key);
    if (!sf) {
      sf = new SpriteFrame();
      sf.reset({ texture: this.pages[r[0]], rect: new Rect(r[1], r[2], r[3], r[4]), originalSize: new Size(r[3], r[4]), offset: new Vec2(0, 0), isRotate: false });
      sf.packable = false;
      this.frameCache.set(key, sf);
    }
    return { sf, r };
  }

  // ── 换帧 ──
  private pose(self: any, leader: any): void {
    const atlas = this.atlas!;
    const now = Date.now();
    // 朝向:按这一帧挪动的方向换回 3D 地面上的方向,再取最近的 45 度
    const dx = Number.isNaN(this.lastX) ? 0 : leader.x - this.lastX;
    const dy = Number.isNaN(this.lastY) ? 0 : leader.y - this.lastY;
    this.lastX = leader.x;
    this.lastY = leader.y;
    if (dx * dx + dy * dy > 0.25) {
      // 画面上的挪动 → 地面方向:横向沿 R.right,纵向沿 R.up 走 dy / sin(俯角)(地面在画面上纵向被压扁)
      const t = dy / R.sinP;
      const gX = dx * R.right[0] + t * R.up[0];
      const gZ = dx * R.right[1] + t * R.up[1];
      // 模型 yaw θ 面朝 (cos θ, 0, -sin θ):0 = +X(东)、90 = -Z
      const deg = (Math.atan2(-gZ, gX) * 180) / Math.PI;
      this.yaw = ((Math.round(deg / 45) * 45) % 360 + 360) % 360;
    }
    let clip = leader.moving ? 'run' : 'stand';
    let prog = (now / 1000) / (atlas.clips[clip]?.dur || 1);
    const dead = !!self.leaderDead || !!leader.down;
    if (dead) {
      if (!this.downAt) {
        this.downAt = now;
      }
      clip = 'fall';
      prog = Math.min(1, (now - this.downAt) / 1000 / (atlas.clips.fall?.dur || 1));
    } else {
      this.downAt = 0;
      if (leader.oneShotEnd && leader.oneShotEnd > now) {
        if (leader.oneShotEnd !== this.shotEnd) {
          this.combo = this.shotEnd && now - this.shotEnd < COMBO_GAP_MS ? (this.combo + 1) % 4 : 0;
          this.shotStart = now;
          this.shotEnd = leader.oneShotEnd;
        }
        clip = `cut${this.combo + 1}`;
        prog = (now - this.shotStart) / Math.max(1, this.shotEnd - this.shotStart);
      }
    }
    const c = atlas.clips[clip] ?? atlas.clips.stand;
    const n = c.n;
    const i = c.loop ? Math.floor(((prog % 1) + 1) % 1 * n) % n : Math.min(n - 1, Math.floor(prog * n));
    const mirrored = atlas.mirror[String(this.yaw)];
    const yaw = mirrored ?? this.yaw;
    const f = this.frame(`${clip}/${yaw}/${i}`);
    if (!f || !this.sprite || !this.node) {
      return;
    }
    if (this.sprite.spriteFrame !== f.sf) {
      this.sprite.spriteFrame = f.sf;
      this.stats.frames += 1;
    }
    // 图集像素 → 世界单位:图集按 atlas.ppm 拍,地图按 R.ppm,一个地图像素 = R.unit 世界单位
    const s = (R.ppm / atlas.ppm) * R.unit;
    const [, , , w, h, ox, oy] = f.r;
    this.node.getComponent(UITransform)!.setContentSize(w * s, h * s);
    const cx = (ox + w / 2) * s;
    const cy = -(oy + h / 2) * s;
    const flip = mirrored !== undefined ? -1 : 1;
    this.node.setPosition(cx * flip, cy, 0);
    this.node.setScale(flip, 1, 1);
  }

  // ── 遮挡材质的参数 ──
  private uniforms(leader: any): void {
    const mat = this.sprite?.getMaterialInstance(0);
    if (!mat || !this.node) {
      return;
    }
    const [IW, IH] = R.px;
    const wp = leader.node.worldPosition;
    const s = leader.node.worldScale.x || 1;
    const Wx = wp.x - leader.x * s;
    const Wy = wp.y - leader.y * s;
    mat.setProperty('xf', v4.set(Wx - (IW / 2) * s * R.unit, Wy + (IH / 2) * s * R.unit, 1 / (s * R.unit), 0));
    const footIy = IH / 2 - leader.y / R.unit;
    const sy = R.planeTop - footIy / R.ppm;
    mat.setProperty('foot', v4.set(footIy, sy / R.tanP + R.dist, R.tanP / R.ppm, EPS_M));
    mat.setProperty('nf', v4.set(R.near, R.far, 0, 0));
    // 2 × 2 遮挡块:人物中心(脚上方约 80 像素)往左上半块取整
    const ix = IW / 2 + leader.x / R.unit;
    const iy = footIy - 80;
    const ch = R.chunk;
    const [cols, rows] = R.grid;
    const bc = Math.max(0, Math.min(cols - 2, Math.floor((ix - ch / 2) / ch)));
    const br = Math.max(0, Math.min(rows - 2, Math.floor((iy - ch / 2) / ch)));
    mat.setProperty('blk', v4.set(bc * ch, br * ch, ch, 0));
    const key = `${br}_${bc}`;
    if (key !== this.stats.block) {
      this.stats.block = key;
    }
    const names = ['occ0', 'occ1', 'occ2', 'occ3'];
    [[br, bc], [br, bc + 1], [br + 1, bc], [br + 1, bc + 1]].forEach(([r, c], k) => {
      const t = this.occTex(r, c);
      if (t) {
        mat.setProperty(names[k], t);
      }
    });
  }

  private occTex(r: number, c: number): Texture2D | null {
    const key = `${r}_${c}`;
    if (this.occ.has(key)) {
      return this.occ.get(key) ?? null;
    }
    this.occ.set(key, null);
    resources.load(R.occPath(r, c), Texture2D, (err, tex) => {
      if (err || !tex) {
        return;
      }
      // 深度拆成两个 8 位存的,不能插值(插值会把高 8 位和低 8 位搅在一起);也不要多级渐远
      tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
      tex.setMipFilter(Texture2D.Filter.NONE);
      this.occ.set(key, tex);
      this.stats.occLoads += 1;
    });
    return null;
  }
}

const layer = new Pre25Layer();

function install(): void {
  const proto = LobbyTownRenderer.prototype as any;
  const orig = proto.step;
  if (typeof orig !== 'function' || orig.__pre25) {
    return;
  }
  const wrapped = function (this: any, ...args: any[]): any {
    const result = orig.apply(this, args);
    try {
      layer.sync(this);
    } catch (error) {
      console.warn('[pre25] step', error);
    }
    return result;
  };
  (wrapped as any).__pre25 = true;
  proto.step = wrapped;
}

if (!EDITOR && sys.isBrowser) {
  install();
  (globalThis as any).__pre25 = { info: () => layer.info(), layer };
}
