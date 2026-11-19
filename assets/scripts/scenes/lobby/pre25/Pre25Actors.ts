import { assetManager, builtinResMgr, EffectAsset, gfx, MeshRenderer, UIMeshRenderer, utils, JsonAsset, Material, Node, Rect, resources, Size, Sprite, SpriteFrame, sys, Texture2D, UIOpacity, UITransform, Vec2, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';
import { LobbyTownRenderer } from '../LobbyTownRenderer';
import { CITY_PRE25, PRE25_CHUNKS, PRE25_CITY_RUNTIME as R, pre25Lift } from './Pre25City';
import { PRE25_WATER as WATER } from './Pre25WaterData';

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
/**
 * 预渲染主城里的移动速度倍数(11-19 用户:「跑步看起来很快,实际移动比较慢」)。原速 340 单位 / 秒 ≈ 2 米 / 秒(一米 = unit × ppm ≈ 170 单位),
 * 跑步片段本身一步约 4 米 / 秒,看着像原地滑步 → 提到约 3.6 米 / 秒。后端坐标校验只记日志(每 0.5 秒一报,单段上限约 870 单位,提速后约 300)。
 */
const SPEED_MUL = 1.8;
/** 跑步片段原本的前进速度(米 / 秒,转套时量的位移 ÷ 时长);播放进度按实际走过的地面距离推,脚步和位移对得上。 */
const RUN_MPS = 4.25;
/** 遮挡块多久没用到就放掉(毫秒):整城 253 块,一块解压 4MB,只留身边的。 */
const OCC_IDLE_MS = 8000;

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
const WHITE = (): Texture2D => builtinResMgr.get<Texture2D>('white-texture');

class Pre25Layer {
  private atlas: HeroAtlas | null = null;
  private pages: Texture2D[] = [];
  private effect: EffectAsset | null = null;
  private loading = false;
  private failed = '';
  private frameCache = new Map<string, SpriteFrame>();
  private occ = new Map<string, Texture2D | null>();
  private occUsed = new Map<string, number>();
  private npcMats = new Map<Node, Material>();
  private npcLift = new Map<Node, number>();
  private lift = 0;
  private occSweepAt = 0;
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
  /** 跑步片段的相位(0~1 循环),按实际走过的地面距离推。 */
  private runPhase = 0;
  private lastPoseAt = 0;
  private stats = { frames: 0, occLoads: 0, block: '', chunks: 0, chunkLoads: 0 };

  sync(self: any): void {
    if (self.def !== CITY_PRE25) {
      if (this.owner) {
        this.stop();
      }
      return;
    }
    this.streamChunks(self);
    this.mountWater(self);
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
    this.lift = pre25Lift(leader.x, leader.y);
    this.pose(self, leader);
    const mat = this.sprite?.getMaterialInstance(0);
    if (mat) {
      this.stats.block = this.applyOcc(mat, leader.x, leader.y, leader.node, this.lift);
    }
    this.npcOcclusion(self);
    this.sweepOcc();
  }

  /**
   * NPC 也挂同一个遮挡材质(11-19 整城:斜视角下 NPC 常站在前面那栋房子的屋檐后面,不挡就画到屋顶上去了)。
   * 只更新镜头附近的;站立图换成骨骼的(art 上没有 Sprite)不管。
   */
  private npcOcclusion(self: any): void {
    const list = self.npcNodes as Array<{ node: Node; art: Node; x: number; y: number }> | undefined;
    const layout = self.layout;
    if (!list || !layout || !this.effect) {
      return;
    }
    const k = self.k || 1;
    const hw = Math.max(layout.width, layout.stageWidth) / k / 2 + 300;
    const hh = Math.max(layout.height, layout.stageHeight) / k / 2 + 400;
    for (const e of list) {
      if (!e.node || !e.node.isValid || !e.art || !e.art.isValid) {
        continue;
      }
      if (Math.abs(e.x - self.camX) > hw || Math.abs(e.y - self.camY) > hh) {
        continue;
      }
      const sp = e.art.getComponent(Sprite);
      if (!sp || !e.art.activeInHierarchy) {
        continue;
      }
      let mat = this.npcMats.get(e.art);
      if (!mat || sp.customMaterial !== mat) {
        mat = new Material();
        mat.initialize({ effectAsset: this.effect });
        sp.customMaterial = mat;
        this.npcMats.set(e.art, mat);
      }
      // 站在上城 / 台阶 / 桥上的 NPC:身体和头顶名牌一起往上挪(节点本身不动,逻辑位置还是地面投影)
      const lift = pre25Lift(e.x, e.y);
      const upU = lift * R.cosP * R.ppm * R.unit;
      const had = this.npcLift.get(e.node) ?? 0;
      if (Math.abs(upU - had) > 0.5) {
        for (const ch of e.node.children) {
          ch.setPosition(ch.position.x, ch.position.y + upU - had, ch.position.z);
        }
        this.npcLift.set(e.node, upU);
      }
      const inst = sp.getMaterialInstance(0);
      if (inst) {
        this.applyOcc(inst, e.x, e.y, e.node, lift);
      }
    }
  }

  /** 放掉一阵子没用到的遮挡块(每秒扫一次)。 */
  private sweepOcc(): void {
    const now = Date.now();
    if (now < this.occSweepAt) {
      return;
    }
    this.occSweepAt = now + 1000;
    for (const [key, at] of Array.from(this.occUsed.entries())) {
      if (now - at < OCC_IDLE_MS) {
        continue;
      }
      const tex = this.occ.get(key);
      this.occ.delete(key);
      this.occUsed.delete(key);
      if (tex) {
        tex.decRef();
        assetManager.releaseAsset(tex);
      }
    }
  }

  // ── 流动的水(11-19 用户:「河流是流动的吧?」)──
  // 河 / 港湾 / 池塘上叠一层 effects/pre25-water(网格 + 遮罩见 tools/proto3d/pre25/water_build.py):插在地面层最后(地图块之上、人物之下)
  private waterNode: Node | null = null;
  private waterLoading = false;

  private mountWater(self: any): void {
    const root: Node | null = self.groundRoot;
    if (!root || !root.isValid) {
      return;
    }
    if (this.waterNode && this.waterNode.isValid && this.waterNode.parent === root) {
      if (this.waterNode.getSiblingIndex() !== root.children.length - 1) {
        this.waterNode.setSiblingIndex(root.children.length - 1);
      }
      return;
    }
    if (this.waterLoading) {
      return;
    }
    this.waterLoading = true;
    resources.load('effects/pre25-water', EffectAsset, (err, eff) => {
      resources.load(WATER.mask, Texture2D, (err2, mask) => {
        this.waterLoading = false;
        if (err || err2 || !eff || !mask || !root.isValid) {
          console.warn('[pre25] water', err, err2);
          return;
        }
        mask.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        mask.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        const n = WATER.speed.length;
        const positions: number[] = [];
        const uvs: number[] = [];
        const uv1: number[] = [];
        const colors: number[] = [];
        for (let i = 0; i < n; i += 1) {
          positions.push(WATER.pos[i * 2], WATER.pos[i * 2 + 1], 0);
          uvs.push(WATER.uv0[i * 2], WATER.uv0[i * 2 + 1]);
          uv1.push(WATER.uv1[i * 2], WATER.uv1[i * 2 + 1]);
          colors.push(WATER.speed[i] / 255, ((WATER as unknown as { radial?: number[] }).radial ?? [])[i] ?? 0, 0, 1);
        }
        const mesh = utils.MeshUtils.createMesh({
          positions, uvs, colors, indices: Array.from(WATER.idx),
          customAttributes: [{ attr: new gfx.Attribute('a_texCoord1', gfx.Format.RG32F), values: uv1 }],
        });
        const mat = new Material();
        mat.initialize({ effectAsset: eff });
        mat.setProperty('maskTex', mask);
        mat.setProperty('params', new Vec4(1, WATER.riverHalf, 1, 0));
        const node = new Node('Pre25Water');
        node.layer = root.layer;
        node.addComponent(UITransform);
        const mr = node.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setMaterial(mat, 0);
        node.addComponent(UIMeshRenderer);
        root.addChild(node);
        node.setPosition(0, 0, 0);
        this.waterNode = node;
      });
    });
  }

  // ── 地面块跟着镜头载入 / 释放 ──
  private chunks = new Map<string, { node: Node; sf: SpriteFrame | null; ready: boolean }>();
  private chunkWorld: Node | null = null;
  private revealed = false;

  private streamChunks(self: any): void {
    const root: Node | null = self.groundRoot;
    const world: Node | null = self.world;
    const layout = self.layout;
    if (!root || !root.isValid || !world || !world.isValid || !layout) {
      return;
    }
    if (this.chunkWorld !== world) {
      // 换了图 / 世界重建:旧节点跟着旧世界没了,只要放掉贴图;新世界先藏起来,等眼前的块到齐
      this.releaseChunks(false);
      this.chunkWorld = world;
      this.revealed = false;
    }
    const k = self.k || 1;
    const hw = Math.max(layout.width, layout.stageWidth) / k / 2;
    const hh = Math.max(layout.height, layout.stageHeight) / k / 2;
    const cx = self.camX;
    const cy = self.camY;
    const need = (m: number) => (ch: { x: number; y: number; size: number }) =>
      Math.abs(ch.x - cx) < hw + ch.size / 2 + m && Math.abs(ch.y - cy) < hh + ch.size / 2 + m;
    const want = need(R.chunk * R.unit * 0.5);
    const keep = need(R.chunk * R.unit * 1.5);
    // 插在平铺底纹(Tile_*,整图外沿黑角的兜底)/ 多层地表后面;别的贴地件、传送阵光圈都在它们之后,照样压在地面块上面。
    // 只在真要新建块时才扫一遍子节点
    let after = -2;
    const insertAt = (): number => {
      if (after === -2) {
        after = -1;
        root.children.forEach((n, i) => {
          if (n.name.startsWith('Tile_') || n.name.startsWith('GroundTile') || n.name.startsWith('GroundSplat') || n.name === 'Splat') {
            after = i;
          }
        });
      }
      after += 1;
      return after;
    };
    let visibleReady = true;
    for (const ch of PRE25_CHUNKS) {
      const key = `${ch.r}_${ch.c}`;
      const have = this.chunks.get(key);
      if (want(ch)) {
        if (!have) {
          const node = new Node(`Pre25Chunk_${key}`);
          node.layer = root.layer;
          node.addComponent(UITransform).setContentSize(ch.size, ch.size);
          const sp = node.addComponent(Sprite);
          sp.sizeMode = Sprite.SizeMode.CUSTOM;
          sp.trim = false;
          root.addChild(node);
          node.setSiblingIndex(insertAt());
          node.setPosition(ch.x, ch.y, 0);
          const entry = { node, sf: null as SpriteFrame | null, ready: false };
          this.chunks.set(key, entry);
          resources.load(ch.path, SpriteFrame, (err, sf) => {
            if (err || !sf) {
              return;
            }
            if (!node.isValid || this.chunks.get(key) !== entry) {
              return;
            }
            sf.addRef();
            entry.sf = sf;
            sp.spriteFrame = sf;
            entry.ready = true;
            this.stats.chunkLoads += 1;
          });
          visibleReady = false;
        } else if (!have.ready) {
          visibleReady = false;
        }
      } else if (have && !keep(ch)) {
        this.dropChunk(key);
      }
    }
    // 进图先藏住世界,等眼前的块都到了再显示(不出现缺图的地面)
    const op = world.getComponent(UIOpacity) ?? world.addComponent(UIOpacity);
    if (!this.revealed) {
      op.opacity = visibleReady ? 255 : 0;
      this.revealed = visibleReady;
    }
    this.stats.chunks = this.chunks.size;
  }

  private dropChunk(key: string): void {
    const e = this.chunks.get(key);
    if (!e) {
      return;
    }
    this.chunks.delete(key);
    if (e.node.isValid) {
      e.node.destroy();
    }
    if (e.sf) {
      e.sf.decRef();
      assetManager.releaseAsset(e.sf);
    }
  }

  private releaseChunks(destroyNodes: boolean): void {
    for (const key of Array.from(this.chunks.keys())) {
      const e = this.chunks.get(key)!;
      if (!destroyNodes) {
        this.chunks.delete(key);
        if (e.sf) {
          e.sf.decRef();
          assetManager.releaseAsset(e.sf);
        }
      } else {
        this.dropChunk(key);
      }
    }
  }

  stop(): void {
    this.releaseChunks(true);
    // 离开主城:遮挡块全放掉(sweepOcc 只在城里跑)
    for (const tex of Array.from(this.occ.values())) {
      if (tex) {
        tex.decRef();
        assetManager.releaseAsset(tex);
      }
    }
    this.occ.clear();
    this.occUsed.clear();
    this.npcMats.clear();
    this.npcLift.clear();
    if (this.waterNode && this.waterNode.isValid) {
      this.waterNode.destroy();
    }
    this.waterNode = null;
    const w: Node | null = this.owner?.world ?? this.chunkWorld;
    if (w && w.isValid) {
      const op = w.getComponent(UIOpacity);
      if (op) {
        op.opacity = 255;
      }
    }
    this.chunkWorld = null;
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

  /** 队长当前抬高了多少世界单位(镜头跟着往上看)。 */
  liftUnits(): number {
    return this.lift * R.cosP * R.ppm * R.unit;
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
    // 朝向:按玩家的输入方向(摇杆 / 方向键;自动寻路时按寻路方向)换回 3D 地面上的方向,再取最近的 45 度。
    // 不按实际位移算(11-19 用户:顶着障碍物时「卡出多个方向的人物」—— 顶墙时逻辑会左右试着滑,位移方向每帧乱跳)。
    // 防抖:输入方向离当前朝向超过 27.5°(一格 22.5° 再多 5°)才换,摇杆停在两个方向交界处时不来回切。
    // 这一帧走过的地面距离(米):画面横向 1 单位 = 1 / (unit × ppm) 米,纵向还要除 sin(俯角)
    const mdx = Number.isNaN(this.lastX) ? 0 : leader.x - this.lastX;
    const mdy = Number.isNaN(this.lastY) ? 0 : leader.y - this.lastY;
    const perM = R.unit * R.ppm;
    const meters = Math.hypot(mdx / perM, mdy / perM / R.sinP);
    const dtS = this.lastPoseAt ? Math.min(0.1, (now - this.lastPoseAt) / 1000) : 0;
    this.lastPoseAt = now;
    this.lastX = leader.x;
    this.lastY = leader.y;
    let v: { x: number; y: number } = { x: 0, y: 0 };
    try {
      v = self.inputVector();
      if (v.x === 0 && v.y === 0 && self.autoPath && self.autoPath.length > 0) {
        v = self.autoPathVector(leader);
      }
    } catch (error) {
      void error;
    }
    if (v.x * v.x + v.y * v.y > 0.04) {
      // 画面上的方向 → 地面方向:横向沿 R.right,纵向沿 R.up 除 sin(俯角)(地面在画面上纵向被压扁)
      const t = v.y / R.sinP;
      const gX = v.x * R.right[0] + t * R.up[0];
      const gZ = v.x * R.right[1] + t * R.up[1];
      // 模型 yaw θ 面朝 (cos θ, 0, -sin θ):0 = +X(东)、90 = -Z
      const deg = (Math.atan2(-gZ, gX) * 180) / Math.PI;
      const diff = Math.abs((((deg - this.yaw) % 360) + 540) % 360 - 180);
      if (diff > 27.5) {
        this.yaw = ((Math.round(deg / 45) * 45) % 360 + 360) % 360;
      }
    }
    let clip = leader.moving ? 'run' : 'stand';
    let prog = (now / 1000) / (atlas.clips[clip]?.dur || 1);
    if (clip === 'run') {
      // 一个跑步循环走 RUN_MPS × 片段时长 米;顶着墙走不动时按半速原地跑,不定住
      const stride = RUN_MPS * (atlas.clips.run?.dur || 0.7);
      const minAdv = (dtS * 0.5) / (atlas.clips.run?.dur || 0.7);
      this.runPhase = (this.runPhase + Math.max(meters / stride, minAdv)) % 1;
      prog = this.runPhase;
    }
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
    // 站在桥上:整个人往上挪(抬高 h 米 → 画面上移 h·cos 俯角 米)
    const up = this.lift * R.cosP * R.ppm * R.unit;
    this.node.setPosition(cx * flip, cy + up, 0);
    this.node.setScale(flip, 1, 1);
  }

  // ── 遮挡材质的参数 ──
  /**
   * 给一个站在 2D 世界 (x, y)(脚底)的人物设遮挡参数;ref = 坐标原点就在脚底的那个节点(换算世界 → 整图像素用),
   * lift = 脚底高出地面多少米(桥上)。返回用到的 2 × 2 块的左上块号。
   */
  private applyOcc(mat: Material, x: number, y: number, ref: Node, lift: number): string {
    const [IW, IH] = R.px;
    const wp = ref.worldPosition;
    const s = ref.worldScale.x || 1;
    const Wx = wp.x - x * s;
    const Wy = wp.y - y * s;
    mat.setProperty('xf', v4.set(Wx - (IW / 2) * s * R.unit, Wy + (IH / 2) * s * R.unit, 1 / (s * R.unit), 0));
    // 地面上脚底那一点的整图 y 和视深;抬高 lift 米后:画面上移 lift·cos、离镜头近 lift·sin
    const groundIy = IH / 2 - y / R.unit;
    const groundDepth = (R.planeTop - groundIy / R.ppm) / R.tanP + R.dist;
    const footIy = groundIy - lift * R.cosP * R.ppm;
    mat.setProperty('foot', v4.set(footIy, groundDepth - lift * R.sinP, R.tanP / R.ppm, EPS_M));
    mat.setProperty('nf', v4.set(R.near, R.far, 0, 0));
    // 2 × 2 遮挡块:人物中心(脚上方约 80 像素)往左上半块取整
    const ix = IW / 2 + x / R.unit;
    const iy = footIy - 80;
    const ch = R.chunk;
    const [cols, rows] = R.grid;
    const bc = Math.max(0, Math.min(cols - 2, Math.floor((ix - ch / 2) / ch)));
    const br = Math.max(0, Math.min(rows - 2, Math.floor((iy - ch / 2) / ch)));
    mat.setProperty('blk', v4.set(bc * ch, br * ch, ch, 0));
    const names = ['occ0', 'occ1', 'occ2', 'occ3'];
    [[br, bc], [br, bc + 1], [br + 1, bc], [br + 1, bc + 1]].forEach(([r, c], k) => {
      // 还没载到(或刚被放掉)的块先给白图 = 「这里没有遮挡」,不留着上一块的旧图
      mat.setProperty(names[k], this.occTex(r, c) ?? WHITE());
    });
    return `${br}_${bc}`;
  }

  private occTex(r: number, c: number): Texture2D | null {
    const key = `${r}_${c}`;
    this.occUsed.set(key, Date.now());
    if (this.occ.has(key)) {
      return this.occ.get(key) ?? null;
    }
    this.occ.set(key, null);
    resources.load(R.occPath(r, c), Texture2D, (err, tex) => {
      if (err || !tex) {
        return;
      }
      if (!this.occ.has(key)) {
        // 载到之前已经被放掉了(走远了)
        assetManager.releaseAsset(tex);
        return;
      }
      tex.addRef();
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
  const origCam = proto.applyCamera;
  if (typeof origCam === 'function' && !origCam.__pre25) {
    const cam = function (this: any, ...args: any[]): any {
      const r = origCam.apply(this, args);
      try {
        if (this.def === CITY_PRE25 && this.leader && this.world && this.world.isValid) {
          const up = layer.liftUnits() * (this.k || 1);
          if (up > 0.5) {
            const p = this.world.position;
            this.world.setPosition(p.x, p.y - up, p.z);
          }
        }
      } catch (error) {
        // 镜头偏移失败不影响原来的镜头
      }
      return r;
    };
    (cam as any).__pre25 = true;
    proto.applyCamera = cam;
  }
  const origMul = proto.moveMul;
  if (typeof origMul === 'function' && !origMul.__pre25) {
    const mul = function (this: any, ...args: any[]): number {
      const base = origMul.apply(this, args);
      return this.def === CITY_PRE25 ? base * SPEED_MUL : base;
    };
    (mul as any).__pre25 = true;
    proto.moveMul = mul;
  }
}

if (!EDITOR && sys.isBrowser) {
  install();
  (globalThis as any).__pre25 = { info: () => layer.info(), layer };
}
