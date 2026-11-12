import { AnimationClip, Camera, Canvas, Color, DirectionalLight, director, Director, game, instantiate, js, Layers, Mat4, Material, Mesh, MeshRenderer, Node, PointLight, Prefab, Quat, renderer, rendering, resources, SkeletalAnimation, SkinnedMeshRenderer, sys, Vec3, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';
import { Actor, actorMaterials, ActorTemplate, buildKnight, buildSorcerer, poseKnight, poseSorcerer } from './G3DActor';
import { BRAZIERS, buildCourtyard, TER_BACK, TER_H, UVD } from './G3DCourtyard';
import { FxWorld } from './G3DFx';
import { addMesh, DynMesh, keptMaterial, loadKit, material, tex } from './G3DKit';
import { MeshBatch } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { buildEnvCube, FX_CELL, paintCrystal, paintHaze, paintShaft, paintVignette } from './G3DSkins';
import { GD, GW, GX0, GZ0, hash2, mulberry32, paintBackdrop, paintGround, paintRock, paintWood, puddleLevel, wetValue } from './G3DTextures';

/**
 * 守卫战全 3D 样板(2026-11-12,用户要求「骨骼和技能特效全部换成 3D、自己生成制作」「做成 3A 的效果」,
 * 参考 github.com/wquguru/fable52-fps-repro 的画面水平 —— 只借鉴做法,代码全是自己写的)。
 *
 * 一个不依赖登录 / 战斗流程的展示模式:预览地址带 ?g3dshow=1,进来后停掉界面相机,只画这个 3D 场景:
 * - 场景:和战斗里的 3D 光影层共用院子的几何,地面换成雨后的湿石板(积水里有实时倒影),水晶、英雄站位石台;
 * - 灯:逆光的月光(带投影)+ 水晶的冷光 + 火盆和敌方来路的暖光,左冷右暖;技能再临时点灯;
 * - 后期:高动态渲染 + 泛光 + 抗锯齿(可选超采样),镜头前一层暗角;
 * - 角色:程序生成的 3D 术士和重甲骑士(G3DActor),按脚本循环演一段「施法 → 落雷 → 连锁」;
 * - 特效:G3DFx(闪电、火星、焦痕、法阵、火焰、尘埃)。
 * 只是样板:不接战斗数值、不改任何现有文件;不带参数就完全不启用。
 *
 * 画质档 ?q=ultra|high|mid(默认 high);调试接口 window.__g3dshow。
 */

const FOV = 19;
const PITCH = 31;
const CAM_POS = new Vec3(-0.4, 16.8, 24.85);
const MOON_DIR = new Vec3(0.34, -0.55, 0.76).normalize();
const CRYSTAL = new Vec3(-7.6, 0, 0.3);
const HERO = new Vec3(-4.2, 0, 0.9);
// 对照模型摆在哪(见 loadRefs):雕像在术士斜后方那块石台上,胸像在术士身侧、头部同高
const REF = {
  statue: new Vec3(HERO.x + 1.45, 0.07, HERO.z - 1.75), statueH: 2.0, statueYaw: 0,
  bust: new Vec3(HERO.x + 0.05, 1.22, HERO.z + 0.85), bustH: 0.56, bustYaw: 90,
};
// AI 图转 3D 出来的带骨骼角色摆在哪(见 loadChars):术士靠镜头那一侧的石台上,和术士并排、同一套灯光。
// height = 缩放到多高(头顶,和代码生成的术士一样高);yaw = 转到面朝 +x(敌人来的方向);baked = 用不用预烘焙的骨骼动画
// (预烘焙省性能但动作之间不能过渡;关掉是每帧实时算骨骼,动作切换有过渡,以后要在骨架上叠程序姿势也得关)
// albedo = 颜色贴图整体压多少:AI 出的颜色贴图里白的(胡子、交领)接近纯白,在这套给深色材质校过的灯下会曝成一片
const CHAR = { at: new Vec3(HERO.x, 0.07, HERO.z + 1.75), height: 1.86, yaw: 0, baked: false, albedo: 0.84 };   // Tripo 出的模型本来就面朝 +x
const CHAR_ORDER = ['idle', 'walk', 'run', 'slash', 'shoot', 'hurt', 'fall'];
// 每个角色站哪、多高、朝哪(按 g3d_char 下的文件夹名认);没登记的用 CHAR 的默认值,沿 z 往镜头方向排开。
// 英雄站石台(台面高 0.07)、面朝 +x:术士和妮克丝在后排两侧,悟空顶在前排正中;怪物站在右边的地上、转 180 度面朝英雄。
// height 是包围盒的高度(狼算到耳尖,蜘蛛算到背顶)。
const slot = (ix: number, iz: number): Vec3 => new Vec3(HERO.x + ix * 1.45, 0.07, HERO.z + iz * 1.75);
const CHAR_SPECS: Record<string, { at: Vec3; height: number; yaw: number }> = {
  sorcerer: { at: slot(0, 1), height: 1.86, yaw: 0 },
  nyx: { at: slot(0, -1), height: 1.8, yaw: 0 },
  wukong: { at: slot(1, 0), height: 1.74, yaw: 0 },
  wolf: { at: new Vec3(HERO.x + 5.0, 0, HERO.z + 1.5), height: 1.32, yaw: 180 },
  spider: { at: new Vec3(HERO.x + 3.9, 0, HERO.z - 1.9), height: 0.74, yaw: 180 },
};
interface ShowChar {
  name: string;
  at: Vec3;
  height: number;
  yaw: number;
  /** 水平方向上占多宽(缩放后),给镜头算距离用。 */
  span: number;
  node: Node;
  anim: SkeletalAnimation | null;
  names: string[];
  cur: string;
  t: number;
  hold: number;
  seq: number;
  manual: boolean;
  tris: number;
  joints: number;
}
const OVERLAY_LAYER = 1 << 1;   // 贴在镜头前的暗角:只给主相机看,倒影相机不看
const WET = 0.42;               // 地面有多湿(积水面积)
const GROUND_LAYER = 1 << 2;    // 地面:倒影相机也不看(地面自己在采样倒影图,再画进倒影图就成了自己读自己)

export interface ShowCfg {
  quality: string;
  /** 月光 / 环境光照度;点光强度 × fluxK = 光通量。都是对着画面校的,不是物理换算。 */
  moon: number;
  ambient: number;
  fluxK: number;
  shadow: number;
  ground: number;
  /** 超采样倍数(1 = 不开,靠后期抗锯齿)。 */
  ss: number;
  bloom: number;
  bloomThreshold: number;
  /** 积水里的实时倒影(把场景再画一遍)。 */
  reflect: boolean;
  /** 火盆 / 敌方火光是不是真的点光。 */
  fillLights: boolean;
  dynLights: number;
  env: number;
  crystal: number;
  /** 晶体芯子的自发光倍数 / 棱线的亮度。 */
  crystalGlow: number;
  crystalEdge: number;
  brazier: number;
  enemyFire: number;
  /** 前景两侧(画面外)的暖光:给角色朝镜头的这一面补光。 */
  fill: number;
  /** 细雨(0 = 不下)。 */
  rain: number;
  fxScale: number;
}
const TIERS: Record<string, Partial<ShowCfg>> = {
  ultra: { ss: 2, shadow: 4096, ground: 4096, reflect: true, fillLights: true, dynLights: 3 },
  high: { ss: 1.5, shadow: 2048, ground: 4096, reflect: true, fillLights: true, dynLights: 3 },
  mid: { ss: 1, shadow: 1024, ground: 2048, reflect: false, fillLights: false, dynLights: 2 },
};
export const SHOW: ShowCfg = {
  quality: 'high', moon: 70000, ambient: 15000, fluxK: 100, shadow: 2048, ground: 4096, ss: 1.5, bloom: 0.42, bloomThreshold: 1.15,
  reflect: true, fillLights: true, dynLights: 3, env: 1, crystal: 48, crystalGlow: 1.0, crystalEdge: 1.5, brazier: 75, enemyFire: 260, fill: 520, rain: 1, fxScale: 5,
};

interface Pulse { x: number; y: number; z: number; r: number; g: number; b: number; peak: number; range: number; hold: number; tau: number; age: number }
interface Knight { actor: Actor; x: number; z: number; walk: number; state: 'walk' | 'fight' | 'hit' | 'dying' | 'gone'; t: number; attack: number; hit: number; dead: number; stopX: number; speed: number }

const _v = new Vec3();
const _v2 = new Vec3();
const _q = new Quat();
const _q2 = new Quat();

class Stage {
  world: Node | null = null;
  cam: Camera | null = null;
  moon: DirectionalLight | null = null;
  fx: FxWorld | null = null;
  hero: Actor | null = null;
  knights: Knight[] = [];
  opened = false;
  lastError = '';
  time = 0;
  /** > 0 时每帧固定走这么多秒(截图 / 录屏逐帧推用)。 */
  fixedDt = 0;
  /** 演出:loop = 循环施法;idle = 只站着(拍定妆照)。 */
  mode: 'loop' | 'idle' = 'loop';
  stats: Record<string, number> = {};
  private saved: any = null;
  private quad: Mesh | null = null;
  private knightTpl: ActorTemplate | null = null;
  private brazier: PointLight[] = [];
  private crystalLight: PointLight | null = null;
  private enemyLight: PointLight | null = null;
  private fillLights: PointLight[] = [];
  private staffLight: PointLight | null = null;
  private dyn: PointLight[] = [];
  private pulses: Pulse[] = [];
  private crystalMat: Material | null = null;
  private refs: Node[] = [];
  private refStoneMat: Material | null = null;
  chars: ShowChar[] = [];
  private heroHidden = false;
  private crystalEdgeMat: Material | null = null;
  private crystalTips: Vec3[] = [];
  private crystalBits: Array<{ node: Node; r: number; h: number; a: number; w: number }> = [];
  private hazes: Array<{ mat: Material; speed: number; off: number }> = [];
  private shaft: DynMesh | null = null;
  private shaftMat: Material | null = null;
  private groundMat: Material | null = null;
  private groundNodes: Node[] = [];
  private probeNode: Node | null = null;
  private camBase = new Vec3();
  private camLook = new Vec3();
  private shake = 0;
  private rnd = mulberry32(2026);
  // 演出
  private castT = -1;          // 这一次施法走到第几秒(-1 = 没在施法)
  private nextCast = 2.2;
  private cast = 0;
  private strike = 0;
  private struck = false;
  private chain: Array<{ at: number; k: Knight; from: Vec3 }> = [];
  private dim = 0;

  open(done?: () => void): void {
    loadKit(['g3d-standard', 'g3d-bloom', 'g3d-fxaa'], (missing) => {
      if (missing.indexOf('g3d-standard') >= 0) {
        this.lastError = `missing ${missing.join(',')}`;
        return;
      }
      try {
        if (!this.world) {
          this.build();
        }
        this.takeOver();
        this.opened = true;
        director.on(Director.EVENT_BEFORE_UPDATE, this.tick, this);
        done?.();
      } catch (error) {
        this.lastError = String((error as any)?.stack ?? error);
        console.warn('[g3dshow] open failed', error);
      }
    });
  }

  // ───────────────────────── 建场景 ─────────────────────────
  private build(): void {
    const t0 = performance.now();
    const scene = director.getScene()!;
    const world = new Node('G3DShow');
    scene.addChild(world);
    this.world = world;
    const { stone, wood, iron, contacts } = buildCourtyard();
    const rnd = mulberry32(77);
    const metal = new Sculpt();

    // ── 英雄站位:三排三列的圆石台(嵌一圈铜环),术士站正中那块 ──
    for (let ix = 0; ix < 3; ix += 1) {
      for (let iz = 0; iz < 3; iz += 1) {
        const x = HERO.x + (ix - 1) * 1.45;
        const z = HERO.z + (iz - 1) * 1.75;
        const v = 0.78 + rnd() * 0.2;
        stone.cylinder(0.6, 0.64, 0.07, 22, new Vec3(x, 0.035, z), new Vec3(0, rnd() * 360, 0), [v, v, v * 1.02], UVD, rnd, 0);
        metal.lathe([[0.47, 0.068], [0.5, 0.078], [0.53, 0.068]], 28, { den: 2.9, tint: [0.5, 0.39, 0.22], smooth: false, xf: xform([x, 0, z]) });
        contacts.push({ x, z, r: 0.95 });
      }
    }
    // ── 水晶:两层石座 + 铜箍和六只铜爪 + 一圈深色的岩基,上面长出一大簇晶柱(十几根,粗细高矮、歪的方向都不一样)──
    stone.cylinder(1.25, 1.4, 0.22, 10, new Vec3(CRYSTAL.x, 0.11, CRYSTAL.z), new Vec3(0, 12, 0), [0.44, 0.44, 0.46], UVD, rnd, 0);
    stone.cylinder(0.92, 1.05, 0.2, 10, new Vec3(CRYSTAL.x, 0.32, CRYSTAL.z), new Vec3(0, 40, 0), [0.5, 0.5, 0.52], UVD, rnd);
    metal.lathe([[0.9, 0.4], [0.96, 0.44], [0.9, 0.48]], 30, { den: 2.9, tint: [0.52, 0.4, 0.22], smooth: false, xf: xform([CRYSTAL.x, 0, CRYSTAL.z]) });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      metal.prism([[-0.045, -0.022], [0.045, -0.022], [0.045, 0.022], [-0.045, 0.022]], 0, 0.3, 0.45, [0.5, 0.38, 0.2], 2.9,
        Mat4.multiply(new Mat4(), xform([CRYSTAL.x + Math.cos(a) * 0.8, 0.42, CRYSTAL.z + Math.sin(a) * 0.8], [Math.sin(a) * -24, 0, Math.cos(a) * 24]), xform([0, 0, 0], [0, (-a * 180) / Math.PI + 90, 0])));
    }
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.5;
      const rr = 0.42 + rnd() * 0.3;
      const v = 0.3 + rnd() * 0.12;
      stone.rock(0.17 + rnd() * 0.12, new Vec3(CRYSTAL.x + Math.cos(a) * rr, 0.47 + rnd() * 0.05, CRYSTAL.z + Math.sin(a) * rr), [v, v, v * 1.05], UVD * 2, rnd, 0.8);
    }
    contacts.push({ x: CRYSTAL.x, z: CRYSTAL.z, r: 2.0 });
    const crystal = new Sculpt();
    const edge = new Sculpt();
    /**
     * 一根晶柱:六棱(每个角的半径、角度都抖一点,不是规整的正六边形),柱身 → 收肩 → 收尖三段;both = 两头都带尖(悬浮的碎晶)。
     * 柱身用带贴图坐标的平直面(绕一圈 / 沿长度展开);每条棱再叠两片细长的加色亮线(一片贴着面、一片立在棱上),晶体的轮廓才是「利」的。
     */
    const growShard = (sc: Sculpt, ed: Sculpt, m: Mat4, r: number, h: number, seed: number, both = false): Vec3 => {
      const rj: number[] = [];
      const aj: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        rj.push(r * (0.84 + 0.3 * hash2(i, seed, 11)));
        aj.push((i / 6) * Math.PI * 2 + (hash2(i, seed, 12) - 0.5) * 0.22);
      }
      const rings: Array<[number, number]> = both
        ? [[-0.5, 0.03], [-0.3, 0.52], [-0.17, 0.95], [0.17, 0.95], [0.3, 0.52], [0.5, 0.03]]
        : [[0, 1], [0.62, 0.93], [0.86, 0.5], [1, 0.03]];
      const P: Vec3[][] = rings.map(([ky, ks]) => rj.map((rr, i) => Vec3.transformMat4(new Vec3(), new Vec3(Math.cos(aj[i]) * rr * ks, ky * h, Math.sin(aj[i]) * rr * ks), m)));
      const axis: Vec3[] = rings.map(([ky]) => Vec3.transformMat4(new Vec3(), new Vec3(0, ky * h, 0), m));
      const y0 = rings[0][0];
      const span = rings[rings.length - 1][0] - y0;
      const vOf = (k: number): number => 1 - (rings[k][0] - y0) / span;
      for (let k = 0; k < rings.length - 1; k += 1) {
        for (let i = 0; i < 6; i += 1) {
          const j = (i + 1) % 6;
          const b = 0.74 + 0.5 * hash2(i, seed, 13);
          sc.facet([P[k][i], P[k + 1][i], P[k + 1][j], P[k][j]], [[i / 6, vOf(k)], [i / 6, vOf(k + 1)], [(i + 1) / 6, vOf(k + 1)], [(i + 1) / 6, vOf(k)]], [b, b, b]);
        }
      }
      // 棱线
      const w = Math.max(0.0035, 0.0105 * Math.sqrt(r / 0.36));
      const out = (k: number, i: number): Vec3 => Vec3.subtract(new Vec3(), P[k][i], axis[k]).normalize();
      const seg = (A: Vec3, B: Vec3, O: Vec3, bright: number): void => {
        const d = Vec3.subtract(new Vec3(), B, A);
        if (d.lengthSqr() < 1e-10) {
          return;
        }
        const T = Vec3.cross(new Vec3(), d, O).normalize().multiplyScalar(w);
        const lift = O.clone().multiplyScalar(0.004);
        const tint: [number, number, number] = [0.62 * bright, 0.9 * bright, bright];
        const a0 = Vec3.add(new Vec3(), A, lift);
        const b0 = Vec3.add(new Vec3(), B, lift);
        ed.poly([Vec3.subtract(new Vec3(), a0, T), Vec3.add(new Vec3(), a0, T), Vec3.add(new Vec3(), b0, T), Vec3.subtract(new Vec3(), b0, T)], O, tint, 1, 0, 0);
        const fin = O.clone().multiplyScalar(w * 1.7);
        ed.poly([A, Vec3.add(new Vec3(), A, fin), Vec3.add(new Vec3(), B, fin), B], T, tint, 1, 0, 0);
      };
      for (let i = 0; i < 6; i += 1) {
        const j = (i + 1) % 6;
        for (let k = 0; k < rings.length - 1; k += 1) {
          const O = out(k, i).add(out(k + 1, i)).normalize();
          if (!both && k === 0) {
            // 最下面一段:靠根部那 40% 不描,往上才亮起来(根埋在岩基里)
            const mid = Vec3.lerp(new Vec3(), P[0][i], P[1][i], 0.4);
            seg(mid, P[1][i], O, 0.5);
          } else {
            seg(P[k][i], P[k + 1][i], O, both ? 0.7 : 0.85);
          }
        }
        for (let k = 1; k < rings.length - 1; k += 1) {
          const O = out(k, i).add(out(k, j)).normalize();
          seg(P[k][i], P[k][j], O, 0.6);
        }
      }
      return P[rings.length - 1][0];
    };
    const tips: Vec3[] = [];
    const shard = (az: number, dist: number, r: number, h: number, lean: number, seed: number): void => {
      const a = (az * Math.PI) / 180;
      // 先绕自己的轴转一个角度,再整根朝外歪(两步分开乘,歪的方向才一定是朝外)
      const m = Mat4.multiply(new Mat4(), xform([CRYSTAL.x + Math.cos(a) * dist, 0.44, CRYSTAL.z + Math.sin(a) * dist], [Math.sin(a) * lean, 0, -Math.cos(a) * lean]), xform([0, 0, 0], [0, seed * 37, 0]));
      tips.push(growShard(crystal, edge, m, r, h, seed));
    };
    shard(0, 0, 0.36, 2.6, 2, 1);
    shard(20, 0.4, 0.2, 1.7, 14, 2);
    shard(95, 0.4, 0.23, 1.95, 11, 3);
    shard(165, 0.42, 0.19, 1.5, 17, 4);
    shard(235, 0.4, 0.22, 1.75, 13, 5);
    shard(300, 0.42, 0.17, 1.3, 19, 6);
    shard(58, 0.58, 0.12, 0.95, 27, 7);
    shard(130, 0.6, 0.1, 0.8, 31, 8);
    shard(200, 0.6, 0.13, 1.05, 25, 9);
    shard(268, 0.58, 0.1, 0.75, 33, 10);
    shard(335, 0.6, 0.12, 0.9, 28, 11);
    shard(-15, 0.72, 0.07, 0.5, 40, 12);
    shard(75, 0.74, 0.06, 0.42, 44, 13);
    shard(150, 0.72, 0.075, 0.55, 38, 14);
    shard(222, 0.74, 0.06, 0.4, 46, 15);
    shard(290, 0.72, 0.07, 0.48, 41, 16);
    this.crystalTips = tips;

    // ── 前景左下角:一截倒下的大柱子和碎块(压住画面的角,拉开前后层次)──
    stone.cylinder(0.56, 0.56, 2.6, 20, new Vec3(-10.9, 0.56, 5.0), new Vec3(0, 24, 90), [0.84, 0.84, 0.86], UVD, rnd, 0);
    stone.cylinder(0.56, 0.52, 1.1, 20, new Vec3(-8.6, 0.5, 5.75), new Vec3(8, -30, 84), [0.78, 0.78, 0.8], UVD, rnd, 0);
    for (let i = 0; i < 7; i += 1) {
      const w = 0.3 + rnd() * 0.5;
      stone.box(w, 0.26 + rnd() * 0.2, 0.3 + rnd() * 0.4, new Vec3(-10.2 + rnd() * 3.2, 0.14, 4.3 + rnd() * 1.5), new Vec3(rnd() * 20, rnd() * 360, rnd() * 20), [0.8, 0.8, 0.82], UVD, rnd, 0.035, 0);
    }
    contacts.push({ x: -10.9, z: 5.0, r: 1.8 }, { x: -8.6, z: 5.75, r: 1.1 });
    // ── 石平台上两面旧旗幡:木杆 + 横梁 + 垂下来的布(下摆撕破)──
    const cloth = new Sculpt();
    const banner = (x: number, z: number, hue: [number, number, number], seed: number): void => {
      wood.cylinder(0.05, 0.065, 3.1, 8, new Vec3(x, TER_H + 1.55, z), new Vec3(0, rnd() * 360, 1.5), [0.8, 0.78, 0.74], 0.9, rnd, TER_H);
      wood.cylinder(0.035, 0.035, 1.2, 7, new Vec3(x + 0.42, TER_H + 2.92, z + 0.03), new Vec3(0, 0, 90), [0.8, 0.78, 0.74], 0.9, rnd);
      const rr = mulberry32(seed);
      const rag = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => rr() * 0.28);
      cloth.surf(8, 10, (u, v, out) => {
        const t = 1 - v;
        const tear = t > 0.99 ? rag[Math.round(u * 8)] : 0;
        out.set(x - 0.05 + u * 0.95, TER_H + 2.88 - (1.9 - tear) * t, z + 0.05 + 0.05 * Math.sin(u * 7 + seed) * t + 0.03 * Math.sin(t * 6 + u * 3));
      }, { den: 8, twoSided: true, tint: (u, v) => (u < 0.1 || u > 0.9 || v > 0.93 ? [0.5, 0.39, 0.2] : [hue[0] * (0.62 + 0.38 * v), hue[1] * (0.62 + 0.38 * v), hue[2] * (0.62 + 0.38 * v)]) });
    };
    banner(-7.3, -9.3, [0.5, 0.15, 0.13], 3);
    banner(3.4, -9.3, [0.48, 0.14, 0.13], 8);
    // ── 贴图 / 材质 ──
    const t1 = performance.now();
    const ground = paintGround(SHOW.ground, contacts, WET);
    const rock = paintRock(512);
    const woodTex = paintWood(256);
    this.stats.texMs = Math.round(performance.now() - t1);
    const groundMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true });
    groundMat.setProperty('mainTexture', tex(ground.albedo, false, 8));
    groundMat.setProperty('normalMap', tex(ground.normal, false, 8));
    groundMat.setProperty('pbrMap', tex(ground.orm, false, 4));
    groundMat.setProperty('occlusion', 1);
    groundMat.setProperty('roughness', 1);
    groundMat.setProperty('metallic', 1);
    groundMat.setProperty('normalStrength', 0.85);
    this.groundMat = groundMat;
    const stoneMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    stoneMat.setProperty('mainTexture', tex(rock.albedo, true));
    stoneMat.setProperty('normalMap', tex(rock.normal, true));
    stoneMat.setProperty('roughness', 0.62);   // 淋过雨
    stoneMat.setProperty('metallic', 0);
    stoneMat.setProperty('albedoScale', new Vec3(0.72, 0.74, 0.78));
    this.refStoneMat = stoneMat;
    const woodMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    woodMat.setProperty('mainTexture', tex(woodTex.albedo, true));
    woodMat.setProperty('normalMap', tex(woodTex.normal, true));
    woodMat.setProperty('roughness', 0.66);
    woodMat.setProperty('metallic', 0);
    woodMat.setProperty('albedoScale', new Vec3(0.7, 0.7, 0.72));
    const ironMat = material('builtin-standard', {});
    ironMat.setProperty('mainColor', new Color(44, 39, 35, 255));
    ironMat.setProperty('roughness', 0.45);
    ironMat.setProperty('metallic', 1);
    const bronzeMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
    bronzeMat.setProperty('roughness', 0.42);
    bronzeMat.setProperty('metallic', 1);
    // 水晶:光滑的晶体(受场景灯,每个面的高光都不一样)+ 一张自发光贴图(芯子里的亮脉)+ 生长纹的法线;
    // 棱线另用一层加色的细线。亮度只让棱线和高光超过泛光的门槛,晶体本身不糊成一团光。
    const cr = paintCrystal(512);
    const crystalMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_EMISSIVE_MAP: true, USE_VERTEX_COLOR: true });
    crystalMat.setProperty('mainTexture', tex(cr.albedo, true, 8));
    crystalMat.setProperty('normalMap', tex(cr.normal, true, 8));
    crystalMat.setProperty('emissiveMap', tex(cr.emissive, true, 8));
    crystalMat.setProperty('roughness', 0.1);
    crystalMat.setProperty('metallic', 0.3);
    crystalMat.setProperty('specularIntensity', 1);
    this.crystalMat = crystalMat;
    const edgeMat = material('builtin-unlit', { USE_VERTEX_COLOR: true }, 2);
    this.crystalEdgeMat = edgeMat;

    // ── 网格 ──
    for (const m of MeshBatch.groundTiles(GX0, GZ0, GW, GD, 8, 4)) {
      const gn = addMesh(world, 'ShowGround', m, groundMat, false, true);
      gn.layer = GROUND_LAYER;
      this.groundNodes.push(gn);
    }
    const apron = material('builtin-standard', {});
    apron.setProperty('mainColor', new Color(34, 30, 27, 255));
    apron.setProperty('roughness', 0.9);
    addMesh(world, 'ShowApron', MeshBatch.groundTiles(-80, TER_BACK + 0.2, 160, 40, 1, 1, -0.03)[0], apron, false, true);
    let tris = 0;
    for (const [batch, mat, name] of [[stone, stoneMat, 'ShowStone'], [wood, woodMat, 'ShowWood'], [iron, ironMat, 'ShowIron'], [metal, bronzeMat, 'ShowBronze'], [crystal, crystalMat, 'ShowCrystal'], [edge, edgeMat, 'ShowCrystalEdge'], [cloth, actorMaterials().cloth, 'ShowBanner']] as Array<[MeshBatch, Material, string]>) {
      for (const m of batch.build()) {
        addMesh(world, name, m, mat, name !== 'ShowCrystalEdge', name !== 'ShowCrystal' && name !== 'ShowCrystalEdge');
      }
      tris += batch.triangles;
    }
    // 绕着晶簇慢慢转的几块碎晶(两头带尖)
    const bit = new Sculpt();
    const bitEdge = new Sculpt();
    growShard(bit, bitEdge, new Mat4(), 0.075, 0.44, 91, true);
    const bitMesh = bit.build()[0];
    const bitEdgeMesh = bitEdge.build()[0];
    for (let i = 0; i < 5; i += 1) {
      const n = new Node('ShowCrystalBit');
      world.addChild(n);
      const k = 0.7 + 0.5 * hash2(i, 5, 21);
      n.setScale(k, k, k);
      addMesh(n, 'body', bitMesh, crystalMat, true, false);
      addMesh(n, 'edge', bitEdgeMesh, edgeMat, false, false);
      this.crystalBits.push({ node: n, r: 1.2 + 0.4 * hash2(i, 6, 21), h: 1.25 + 1.25 * hash2(i, 7, 21), a: i * 1.257, w: (0.2 + 0.12 * hash2(i, 8, 21)) * (i % 2 ? 1 : -1) });
    }
    this.stats.sceneTris = tris;
    const quad = MeshBatch.quad();
    this.quad = quad;

    // ── 灯 ──
    const point = (name: string, x: number, y: number, z: number, color: Color, range: number): PointLight => {
      const n = new Node(name);
      world.addChild(n);
      n.setPosition(x, y, z);
      const L = n.addComponent(PointLight);
      L.color = color;
      L.range = range;
      L.luminousFlux = 0;
      return L;
    };
    for (const b of BRAZIERS) {
      this.brazier.push(point('ShowBrazierLight', b.x, TER_H + 2.6, b.z + 1.4, new Color(255, 150, 86, 255), 15));
    }
    this.crystalLight = point('ShowCrystalLight', CRYSTAL.x + 0.9, 3.3, CRYSTAL.z + 2.0, new Color(96, 200, 255, 255), 16);
    this.enemyLight = point('ShowEnemyFire', 12.5, 2.6, 1.2, new Color(255, 92, 40, 255), 19);
    this.staffLight = point('ShowStaffLight', HERO.x, 2.4, HERO.z, new Color(190, 225, 255, 255), 7);
    this.fillLights.push(point('ShowFillL', -10, 6.5, 13, new Color(255, 216, 190, 255), 30));
    this.fillLights.push(point('ShowFillR', 9, 6.5, 13, new Color(255, 172, 122, 255), 30));
    for (let i = 0; i < 3; i += 1) {
      const L = point('ShowSkillLight', 0, 2, 0, new Color(255, 255, 255, 255), 10);
      L.node.active = false;
      this.dyn.push(L);
    }
    const moonNode = new Node('ShowMoon');
    world.addChild(moonNode);
    moonNode.setPosition(-MOON_DIR.x * 48, -MOON_DIR.y * 48, -MOON_DIR.z * 48 - 1.5);
    moonNode.lookAt(new Vec3(0, 0, -1.5));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.color = new Color(176, 198, 244, 255);
    moon.illuminance = SHOW.moon;
    this.moon = moon;

    // ── 相机 + 远景 + 镜头前的暗角 ──
    const camNode = new Node('ShowCamera');
    world.addChild(camNode);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fovAxis = Camera.FOVAxis.VERTICAL;
    cam.near = 1;
    cam.far = 700;
    cam.priority = -1;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(58, 76, 112, 255);   // 主画面里看不到(被远景和地面盖住),但倒影相机沿用它:积水映出来的夜空
    cam.visibility = Layers.Enum.DEFAULT | OVERLAY_LAYER | GROUND_LAYER;
    this.cam = cam;
    const back = material('builtin-unlit', { USE_TEXTURE: true });
    back.setProperty('mainTexture', tex(paintBackdrop(), false));
    back.setProperty('colorScale', new Vec3(0.2, 0.22, 0.27));   // 夜里压暗的远山和天
    addMesh(camNode, 'ShowBackdrop', quad, back, false, false);
    const vig = material('builtin-unlit', { USE_TEXTURE: true }, 3);
    vig.setProperty('mainTexture', tex(paintVignette(256), false, 1));
    const vq = addMesh(camNode, 'ShowVignette', quad, vig, false, false);
    vq.layer = OVERLAY_LAYER;

    // ── 薄雾:几张大片子,贴图慢慢横移 ──
    const hazeTex = tex(paintHaze(256), true, 2);
    const haze = (x: number, y: number, z: number, w: number, h: number, color: Color, speed: number, tilt = -12): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 3);
      m.setProperty('mainTexture', hazeTex);
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(1.7, 1.7, 1.7));
      const n = addMesh(world, 'ShowHaze', quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(w, h, 1);
      n.setRotationFromEuler(tilt, 0, 0);
      this.hazes.push({ mat: m, speed, off: this.rnd() });
    };
    haze(0, 3.2, -12.5, 64, 9, new Color(70, 86, 120, 150), 0.006);
    haze(-3, 1.3, -8.0, 40, 3.2, new Color(96, 108, 140, 78), -0.011);
    haze(6, 0.9, -5.2, 30, 2.4, new Color(120, 104, 100, 54), 0.016);
    haze(13, 1.5, -1.0, 16, 4.4, new Color(150, 84, 60, 70), 0.02, -6);
    haze(-12, 1.4, 1.0, 14, 4.0, new Color(70, 120, 150, 60), -0.014, -6);

    // ── 月光从塌掉的墙口斜射进来的光柱 ──
    const sm = material('builtin-unlit', { USE_TEXTURE: true, USE_VERTEX_COLOR: true }, 2);
    sm.setProperty('mainTexture', tex(paintShaft(128, 256), false, 2));
    sm.setProperty('colorScale', new Vec3(3.5, 3.5, 3.5));
    this.shaftMat = sm;
    this.shaft = new DynMesh(world, 'ShowShaft', sm, 12 * 4, 12 * 6);

    // ── 特效、角色 ──
    this.fx = new FxWorld(world);
    const sorcerer = buildSorcerer();
    this.hero = sorcerer.spawn(world, 'ShowHero', 1);
    this.hero.root.setPosition(HERO.x, 0.07, HERO.z);
    this.hero.root.setRotationFromEuler(0, 90, 0);
    this.knightTpl = buildKnight();
    this.stats.heroTris = sorcerer.triangles;
    for (let i = 0; i < 6; i += 1) {
      this.spawnKnight(2.5 + i * 2.1 + this.rnd() * 0.8);
    }
    this.stats.knightTris = this.knightTpl.triangles;
    this.setCam('battle');
    this.loadRefs();
    this.loadChars();
    this.stats.buildMs = Math.round(performance.now() - t0);
  }

  private spawnKnight(x: number): void {
    const lanes = [-2.3, -0.7, 0.9, 2.5];
    const used = this.knights.filter((k) => k.state !== 'gone' && k.x > x - 2.2).map((k) => k.z);
    let z = lanes[Math.floor(this.rnd() * lanes.length)];
    for (let tries = 0; tries < 6 && used.some((u) => Math.abs(u - z) < 1.2); tries += 1) {
      z = lanes[Math.floor(this.rnd() * lanes.length)];
    }
    z += (this.rnd() - 0.5) * 0.5;
    const slot = this.knights.find((k) => k.state === 'gone');
    const actor = slot ? slot.actor : this.knightTpl!.spawn(this.world!, 'ShowKnight', 1.02 + this.rnd() * 0.09);
    actor.root.active = true;
    const k: Knight = { actor, x, z, walk: this.rnd() * 6.28, state: 'walk', t: 0, attack: 0, hit: 0, dead: 0, stopX: -1.3 + this.rnd() * 1.2 + (z + 2.3) * 0.12, speed: 0.92 + this.rnd() * 0.22 };
    actor.root.setPosition(x, 0, z);
    actor.root.setRotationFromEuler(0, -90, 0);
    actor.settle();
    if (slot) {
      this.knights[this.knights.indexOf(slot)] = k;
    } else {
      this.knights.push(k);
    }
  }

  // ───────────────────────── 对照模型 ─────────────────────────
  /**
   * 对照用的现成高精度模型(2026-11-12 验证「精细度卡在素材来源,不在引擎」):
   * assets/resources/g3d_ref 下有导入好的模型就摆出来 —— 哥特雕像站在术士斜后方的石台上,大理石胸像摆到术士头部同高的石墩上;
   * 那个目录平时是空的(素材放在仓库外,验证时临时拷进来),没有就什么都不做。
   */
  private loadRefs(): void {
    let infos: Array<{ path: string }> = [];
    try {
      infos = ((resources as any).getDirWithPath('g3d_ref', Prefab) as Array<{ path: string }>) ?? [];
    } catch (error) {
      infos = [];
    }
    for (const info of infos) {
      resources.load(info.path, Prefab, (err, prefab) => {
        if (err || !prefab || !this.world || !this.world.isValid) {
          return;
        }
        const n = instantiate(prefab);
        this.world.addChild(n);
        const bust = info.path.indexOf('bust') >= 0;
        const yaw = bust ? REF.bustYaw : REF.statueYaw;
        n.setRotationFromEuler(0, yaw, 0);
        // 量一下它的包围盒(按网格自带的最小 / 最大点),缩放到目标高度、底面落到指定的高度上
        const lo = new Vec3(1e9, 1e9, 1e9);
        const hi = new Vec3(-1e9, -1e9, -1e9);
        for (const mr of n.getComponentsInChildren(MeshRenderer)) {
          mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
          mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
          const st = mr.mesh?.struct;
          if (!st || !st.minPosition || !st.maxPosition) {
            continue;
          }
          mr.node.updateWorldTransform();
          for (let i = 0; i < 8; i += 1) {
            _v.set(i & 1 ? st.maxPosition.x : st.minPosition.x, i & 2 ? st.maxPosition.y : st.minPosition.y, i & 4 ? st.maxPosition.z : st.minPosition.z);
            Vec3.transformMat4(_v, _v, mr.node.worldMatrix);
            Vec3.min(lo, lo, _v);
            Vec3.max(hi, hi, _v);
          }
        }
        const h = Math.max(0.01, hi.y - lo.y);
        const s = (bust ? REF.bustH : REF.statueH) / h;
        const at = bust ? REF.bust : REF.statue;
        n.setScale(s, s, s);
        n.setPosition(at.x - ((lo.x + hi.x) / 2) * s, at.y - lo.y * s, at.z - ((lo.z + hi.z) / 2) * s);
        this.refs.push(n);
        this.stats[bust ? 'refBust' : 'refStatue'] = 1;
      });
    }
    if (infos.length && this.refStoneMat) {
      // 胸像下面垫一个石墩
      const b = new MeshBatch();
      b.cylinder(0.2, 0.24, REF.bust.y - 0.04, 16, new Vec3(REF.bust.x, (REF.bust.y - 0.04) / 2, REF.bust.z), new Vec3(0, 30, 0), [0.62, 0.62, 0.64], UVD, () => 0.5, 0);
      b.cylinder(0.27, 0.27, 0.05, 16, new Vec3(REF.bust.x, REF.bust.y - 0.025, REF.bust.z), new Vec3(0, 10, 0), [0.7, 0.7, 0.72], UVD, () => 0.5);
      for (const m of b.build()) {
        this.refs.push(addMesh(this.world!, 'ShowRefPlinth', m, this.refStoneMat, true, true));
      }
    }
  }

  // ───────────────────────── AI 图转 3D 的角色 ─────────────────────────
  /**
   * AI 图转 3D 出来的带骨骼角色(2026-11-12:三视图设定图 → Tripo 多视图转 3D → 自动绑骨 → 预设动作,见 tools/proto3d/char3d):
   * assets/resources/g3d_char 下有导入好的模型就摆出来,站在术士靠镜头那一侧的石台上,同一套灯光,轮流播它自带的动作。
   * 那个目录平时是空的(模型放在仓库外,对比时临时拷进来,截完移出 —— 留着会被打进资源包),没有就什么都不做。
   */
  private loadChars(): void {
    let infos: Array<{ path: string }> = [];
    try {
      infos = ((resources as any).getDirWithPath('g3d_char', Prefab) as Array<{ path: string }>) ?? [];
    } catch (error) {
      infos = [];
    }
    infos.forEach((info, index) => {
      resources.load(info.path, Prefab, (err, prefab) => {
        if (err || !prefab || !this.world || !this.world.isValid) {
          return;
        }
        const n = instantiate(prefab);
        // 用不用预烘焙必须在节点进场景之前设:引擎里动画状态一旦按「预烘焙」初始化过,之后再切成实时骨骼也不会去驱动骨头
        // (skeletal-animation-state.ts 的 _doNotCreateEval 只在第一次初始化时定)—— 表现是时间在走、人站着不动。
        const pre = n.getComponent(SkeletalAnimation) ?? n.getComponentInChildren(SkeletalAnimation);
        if (pre) {
            pre.useBakedAnimation = CHAR.baked;
        }
        this.world.addChild(n);
        const key = info.path.split('/')[1] ?? '';
        const spec = CHAR_SPECS[key] ?? { at: new Vec3(CHAR.at.x, CHAR.at.y, CHAR.at.z + index * 1.75), height: CHAR.height, yaw: CHAR.yaw };
        n.setRotationFromEuler(0, spec.yaw, 0);
        n.updateWorldTransform();
        // 量包围盒(站姿下的网格最小 / 最大点),缩放到目标身高、脚落到石台面上
        const lo = new Vec3(1e9, 1e9, 1e9);
        const hi = new Vec3(-1e9, -1e9, -1e9);
        let tris = 0;
        let joints = 0;
        for (const mr of n.getComponentsInChildren(MeshRenderer)) {
          mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
          mr.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
          if (CHAR.albedo !== 1) {
            for (let i = 0; i < mr.sharedMaterials.length; i += 1) {
              mr.getMaterialInstance(i)?.setProperty('albedoScale', new Vec3(CHAR.albedo, CHAR.albedo, CHAR.albedo));
            }
          }
          const st = mr.mesh?.struct;
          if (!st) {
            continue;
          }
          for (const p of st.primitives) {
            tris += p.indexView ? p.indexView.count / 3 : 0;
          }
          const skinned = mr as SkinnedMeshRenderer;
          joints = Math.max(joints, skinned.skeleton?.joints.length ?? 0);
          if (!st.minPosition || !st.maxPosition) {
            continue;
          }
          // 蒙皮网格的顶点是相对骨架根算的(挂网格的那个节点自己的位移不算数),静态网格才按自己的节点算
          const base = skinned.skinningRoot ?? mr.node;
          base.updateWorldTransform();
          for (let i = 0; i < 8; i += 1) {
            _v.set(i & 1 ? st.maxPosition.x : st.minPosition.x, i & 2 ? st.maxPosition.y : st.minPosition.y, i & 4 ? st.maxPosition.z : st.minPosition.z);
            Vec3.transformMat4(_v, _v, base.worldMatrix);
            Vec3.min(lo, lo, _v);
            Vec3.max(hi, hi, _v);
          }
        }
        const s = spec.height / Math.max(0.01, hi.y - lo.y);
        n.setScale(s, s, s);
        n.setPosition(spec.at.x - ((lo.x + hi.x) / 2) * s, spec.at.y - lo.y * s, spec.at.z - ((lo.z + hi.z) / 2) * s);
        const c: ShowChar = { name: key, at: spec.at.clone(), height: spec.height, yaw: spec.yaw, span: Math.max(hi.x - lo.x, hi.z - lo.z) * s,
          node: n, anim: null, names: [], cur: '', t: 0, hold: 0, seq: -1, manual: false, tris, joints };
        this.chars.push(c);
        this.stats.charTris = (this.stats.charTris ?? 0) + tris;
        this.stats.charJoints = joints;
        const ready = (anim: SkeletalAnimation | null): void => {
          if (!anim) {
            return;
          }
          const rank = (name: string): number => {
            const i = CHAR_ORDER.findIndex((k) => name.toLowerCase().indexOf(k) >= 0);
            return i < 0 ? CHAR_ORDER.length : i;
          };
          c.anim = anim;
          c.names = anim.clips.filter((clip) => !!clip).map((clip) => clip!.name).sort((a, b) => rank(a) - rank(b));
          if (c.names.length) {
            this.playChar(c, c.names[0], 0);
            c.seq = 0;
          }
        };
        const own = n.getComponent(SkeletalAnimation) ?? n.getComponentInChildren(SkeletalAnimation);
        if (own && own.clips.some((clip) => !!clip)) {
          ready(own);
        } else {
          // 预制体上没带动画组件:把同目录导入出来的动作片段挂上去
          const dir = info.path.slice(0, info.path.lastIndexOf('/'));
          resources.loadDir(dir, AnimationClip, (e2, clips) => {
            if (e2 || !clips || !clips.length || !n.isValid) {
              return;
            }
            const anim = own ?? n.addComponent(SkeletalAnimation);
            anim.useBakedAnimation = CHAR.baked;   // 同样要赶在挂动作片段(建状态)之前
            anim.clips = clips;
            ready(anim);
          });
        }
      });
    });
  }

  private playChar(c: ShowChar, name: string, fade = 0.25): void {
    const anim = c.anim;
    const st = anim?.getState(name);
    if (!anim || !st) {
      return;
    }
    const lower = name.toLowerCase();
    const loop = /idle|walk|run/.test(lower);
    st.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
    anim.crossFade(name, fade);
    c.cur = name;
    c.t = 0;
    // 循环动作播一会儿就换下一个;一次性的动作播完再停半秒(倒地多躺一会儿);平台给的预设动作有的很长(受击 14 秒),最多播 5 秒
    c.hold = loop ? (lower.indexOf('idle') >= 0 ? 3.0 : 3.2) : Math.min(5, st.duration) + (lower.indexOf('fall') >= 0 ? 1.2 : 0.45);
  }

  /** 调试:拍定妆照时把骑士藏起来(他们会走到镜头前面挡住人)。 */
  showKnights(on: boolean): void {
    for (const k of this.knights) {
      k.actor.root.active = on && k.state !== 'gone';
    }
  }

  /** 调试:把代码生成的术士藏起来(只看 AI 图转 3D 的阵容时用)。 */
  showHero(on: boolean): void {
    this.heroHidden = !on;
    if (this.hero) {
      this.hero.root.active = on;
    }
  }

  /**
   * 调试:把镜头对准某个带骨骼的角色(文件夹名或序号)。
   * kind = body 全身(正面偏镜头侧 24 度)/ side 侧面 / face 头部特写(人形才有意义)。
   */
  camOn(who: string | number, kind = 'body'): string {
    const c = typeof who === 'number' ? this.chars[who] : this.chars.find((x) => x.name === who);
    const cam = this.cam;
    if (!c || !cam) {
      return '';
    }
    for (const other of this.chars) {      // 单人特写:别的角色先藏起来(镜头常常正好落在别人身上)
      other.node.active = other === c;
    }
    const h = c.height;
    const yaw = (c.yaw * Math.PI) / 180;
    const fx = Math.cos(yaw);          // 角色面朝的方向(模型本来面朝 +x,绕 y 转 yaw)
    const fz = -Math.sin(yaw);
    // 镜头从角色正前方往 +z(主镜头、补光那一侧)偏开
    const swing = ((kind === 'side' ? 82 : 24) * Math.PI) / 180 * (fx >= 0 ? -1 : 1);
    const dx = fx * Math.cos(swing) + fz * Math.sin(swing);
    const dz = -fx * Math.sin(swing) + fz * Math.cos(swing);
    const face = kind === 'face';
    const fov = face ? 22 : 30;
    const tall = face ? h * 0.42 : Math.max(h * 1.3, c.span * 0.72);     // 画面竖直方向要装下多高
    const dist = tall / (2 * Math.tan((fov * Math.PI) / 360));
    const lookY = c.at.y + h * (face ? 0.9 : 0.5);
    cam.fov = fov;
    this.camBase.set(c.at.x + dx * dist, lookY + h * (face ? 0.03 : 0.12), c.at.z + dz * dist);
    cam.node.setPosition(this.camBase);
    this.camLook.set(c.at.x, lookY, c.at.z);
    cam.node.lookAt(this.camLook);
    this.placeOverlays();
    return `${c.name}@${kind}`;
  }

  /** 轮流播角色自带的动作;动作的快慢跟着样板自己的时钟走(逐帧截图 / 录屏时引擎的帧间隔和样板的不一样)。 */
  private stepChars(dt: number): void {
    const engineDt = director.getDeltaTime();
    const speed = engineDt > 1e-5 ? dt / engineDt : 1;
    for (const c of this.chars) {
      if (!c.anim || !c.names.length) {
        continue;
      }
      const st = c.anim.getState(c.cur);
      if (st) {
        st.speed = speed;
      }
      c.t += dt;
      if (!c.manual && c.t >= c.hold && c.names.length > 1) {
        c.seq = (c.seq + 1) % c.names.length;
        this.playChar(c, c.names[c.seq]);
      }
    }
  }

  /** 调试:指定播哪个动作(名字里含这个词就行);不传 / 传 seq = 恢复轮流播。返回每个角色有哪些动作。 */
  charPlay(name?: string): string[][] {
    for (const c of this.chars) {
      if (!name || name === 'seq') {
        // 恢复轮流播,从第一个动作(待机)重新开始
        c.manual = false;
        if (c.names.length) {
          c.seq = 0;
          this.playChar(c, c.names[0], 0);
        }
        continue;
      }
      const hit = c.names.find((k) => k.toLowerCase().indexOf(name.toLowerCase()) >= 0);
      if (hit) {
        c.manual = true;
        this.playChar(c, hit);
      }
    }
    return this.chars.map((c) => c.names);
  }

  // ───────────────────────── 镜头 ─────────────────────────
  setCam(name: string): string {
    const cam = this.cam!;
    const presets: Record<string, { pos: [number, number, number]; look?: [number, number, number]; fov: number; only?: string[] }> = {
      battle: { pos: [CAM_POS.x, CAM_POS.y, CAM_POS.z], fov: FOV },
      hero: { pos: [-1.2, 1.75, 5.4], look: [HERO.x + 0.25, 1.22, HERO.z], fov: 24 },
      heroFace: { pos: [-2.55, 1.72, 2.6], look: [HERO.x + 0.1, 1.5, HERO.z], fov: 20 },
      knights: { pos: [0.4, 1.5, 6.6], look: [3.0, 1.05, 0.6], fov: 26 },
      low: { pos: [-0.5, 2.3, 12.5], look: [-0.6, 1.2, 0], fov: 34 },
      crystal: { pos: [-3.6, 2.2, 6.4], look: [CRYSTAL.x + 0.6, 1.3, CRYSTAL.z], fov: 30 },
      // 对照用:正面看术士的脸和旁边的胸像;中景看术士和雕像
      refFace: { pos: [HERO.x + 2.3, 1.62, HERO.z + 0.55], look: [HERO.x, 1.52, HERO.z + 0.42], fov: 24 },
      refBody: { pos: [HERO.x + 3.6, 1.7, HERO.z + 3.9], look: [HERO.x + 0.75, 1.05, HERO.z - 0.9], fov: 30 },
      // AI 图转 3D 的角色(靠镜头的石台)和代码生成的术士(正中石台)并排,都面朝 +x:正面中景、两张脸、单看 AI 角色的全身 / 脸
      pair: { pos: [HERO.x + 5.4, 1.5, HERO.z + 0.875], look: [HERO.x, 0.96, HERO.z + 0.875], fov: 30 },
      pairFace: { pos: [HERO.x + 2.9, 1.74, HERO.z + 0.875], look: [HERO.x, 1.66, HERO.z + 0.875], fov: 24 },
      aiBody: { pos: [HERO.x + 3.9, 1.3, HERO.z + 3.1], look: [HERO.x, 0.95, HERO.z + 1.75], fov: 30 },
      aiFace: { pos: [HERO.x + 1.75, 1.76, HERO.z + 2.3], look: [HERO.x, 1.7, HERO.z + 1.75], fov: 22 },
      aiBack: { pos: [HERO.x - 2.9, 1.5, HERO.z + 3.3], look: [HERO.x, 1.0, HERO.z + 1.75], fov: 30 },
      // 阵容:左边三个英雄、右边两只怪。lineup 从侧面看两边对峙;lineupFront 从怪物身后看过去,能看到英雄的正脸
      lineup: { pos: [HERO.x + 2.7, 2.0, HERO.z + 7.3], look: [HERO.x + 2.55, 0.9, HERO.z - 0.3], fov: 36 },
      lineupFront: { pos: [HERO.x + 7.6, 2.3, HERO.z + 5.4], look: [HERO.x + 1.4, 0.95, HERO.z - 0.2], fov: 30 },
      // 只看三个英雄的正面(怪物正好挡在这个方向上,这个机位把它们藏起来)
      heroesFront: { pos: [HERO.x + 6.4, 1.55, HERO.z + 0.9], look: [HERO.x + 0.6, 1.0, HERO.z], fov: 32, only: ['sorcerer', 'wukong', 'nyx'] },
    };
    const p = presets[name] ?? presets.battle;
    for (const c of this.chars) {          // 回到预设机位:被单人特写藏起来的角色全部放出来(机位自己指定了只看谁的除外)
      c.node.active = !p.only || p.only.indexOf(c.name) >= 0;
    }
    cam.fov = p.fov;
    this.camBase.set(p.pos[0], p.pos[1], p.pos[2]);
    cam.node.setPosition(this.camBase);
    if (p.look) {
      this.camLook.set(p.look[0], p.look[1], p.look[2]);
      cam.node.lookAt(this.camLook);
    } else {
      cam.node.setRotationFromEuler(-PITCH, 0, 0);
    }
    this.placeOverlays();
    return name;
  }

  private placeOverlays(): void {
    const cam = this.cam;
    if (!cam) {
      return;
    }
    const aspect = cam.camera ? cam.camera.aspect : 16 / 9;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    const bq = cam.node.getChildByName('ShowBackdrop');
    if (bq) {
      const D = 300;
      const fh = 2 * D * tanH;
      const bh = fh * (Math.abs(cam.fov - FOV) < 0.01 && cam.node.eulerAngles.x < -25 ? 0.46 : 0.8);
      bq.setPosition(0, fh / 2 - bh / 2 + fh * 0.012, -D);
      bq.setScale(fh * aspect * 1.08, bh, 1);
    }
    const vq = cam.node.getChildByName('ShowVignette');
    if (vq) {
      const D = 1.6;
      const fh = 2 * D * tanH;
      vq.setPosition(0, 0, -D);
      vq.setScale(fh * aspect * 1.02, fh * 1.02, 1);
    }
  }

  // ───────────────────────── 接管画面 / 后期 ─────────────────────────
  private takeOver(): void {
    const scene = director.getScene()!;
    const canvas = scene.getComponentInChildren(Canvas);
    const uiCam = canvas?.cameraComponent ?? null;
    const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    const mainLight = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) ?? null;
    const amb = scene.globals.ambient;
    const sh = scene.globals.shadows;
    const sky = scene.globals.skybox;
    this.saved = { uiCam, uiCamOn: uiCam?.enabled ?? false, mainCam, mainCamOn: mainCam?.enabled ?? false, mainLight, mainLightOn: mainLight?.enabled ?? false,
      skyIllum: amb.skyIllum, sky: amb.skyLightingColor.clone(), ground: amb.groundLightingColor.clone(), shOn: sh.enabled, shType: sh.type, shSize: sh.shadowMapSize,
      envmap: sky.envmap, envType: sky.envLightingType };
    for (const c of [uiCam, mainCam]) {
      if (c) {
        c.enabled = false;
      }
    }
    if (mainLight) {
      mainLight.enabled = false;
    }
    amb.skyLightingColor = new Color(96, 118, 170, 255);
    amb.groundLightingColor = new Color(40, 34, 30, 255);
    amb.skyIllum = SHOW.ambient;
    // 环境反射:夜空 + 月亮 + 三处火盆 + 水晶 + 敌方火光(金属盔甲、湿石头靠它反光)
    try {
      const lobes = [
        { dir: [-MOON_DIR.x, -MOON_DIR.y, -MOON_DIR.z] as [number, number, number], color: [0.8, 0.9, 1.3] as [number, number, number], width: 0.24 },
        { dir: [CRYSTAL.x, 1.2, CRYSTAL.z + 0.5] as [number, number, number], color: [0.3, 0.85, 1.2] as [number, number, number], width: 0.32 },
        { dir: [12, 1.6, 0.8] as [number, number, number], color: [1.3, 0.42, 0.14] as [number, number, number], width: 0.34 },
        { dir: [-8.5, 3.4, 8] as [number, number, number], color: [1.0, 0.7, 0.45] as [number, number, number], width: 0.3 },
        { dir: [7.5, 3.4, 8.4] as [number, number, number], color: [1.0, 0.6, 0.35] as [number, number, number], width: 0.3 },
        ...BRAZIERS.map((b) => ({ dir: [b.x, 2.4, b.z] as [number, number, number], color: [1.1, 0.58, 0.22] as [number, number, number], width: 0.18 })),
      ];
      const cube = buildEnvCube(lobes, [0.09, 0.12, 0.2], [0.15, 0.18, 0.25], [0.035, 0.035, 0.04], 64);
      sky.envmap = cube;
      (sky as any).envLightingType = 1;   // 半球漫反射 + 环境反射
    } catch (error) {
      console.warn('[g3dshow] env cube', error);
    }
    this.applyShadow();
    this.applyPost();
    this.applyReflection();
    this.world!.active = true;
  }

  applyShadow(): void {
    const sh = director.getScene()!.globals.shadows;
    const moon = this.moon!;
    if (SHOW.shadow > 0) {
      sh.enabled = true;
      sh.type = renderer.scene.ShadowType.ShadowMap;
      sh.shadowMapSize = SHOW.shadow;
      moon.shadowEnabled = true;
      moon.shadowPcf = renderer.scene.PCFType.SOFT_2X;
      moon.shadowBias = 0.0003;
      moon.shadowNormalBias = 0.02;
      moon.shadowFixedArea = true;
      moon.shadowNear = 1;
      moon.shadowFar = 110;
      moon.shadowOrthoSize = 21;
    } else {
      moon.shadowEnabled = false;
      sh.enabled = false;
    }
  }

  /** 高动态渲染 + 泛光 + 抗锯齿(+ 超采样)。后期的设置对象直接挂在相机上,内置管线每帧会读。 */
  applyPost(): void {
    const cam = this.cam!.camera;
    const ppl: any = director.root!.pipeline;
    const bloom = keptMaterial('g3d-bloom');
    const fxaa = keptMaterial('g3d-fxaa');
    if (!ppl.getMacroBool('CC_USE_FLOAT_OUTPUT')) {
      ppl.setMacroBool('CC_USE_FLOAT_OUTPUT', true);
      director.root!.onGlobalPipelineStateChanged();
    }
    (cam as any).pipelineSettings = {
      msaa: { enabled: false, sampleCount: 4 },
      enableShadingScale: SHOW.ss !== 1,
      shadingScale: SHOW.ss,
      bloom: { enabled: !!bloom && SHOW.bloom > 0, type: 0, material: bloom, kawaseFilterMaterial: bloom, mipmapFilterMaterial: null, enableAlphaMask: false, iterations: 4, threshold: SHOW.bloomThreshold, intensity: SHOW.bloom },
      toneMapping: { material: null },
      colorGrading: { enabled: false, material: null, contribute: 1, colorGradingMap: null },
      fsr: { enabled: false, material: null, sharpness: 0.8 },
      fxaa: { enabled: !!fxaa, material: fxaa },   // 超采样时也不能关:内置管线靠这一步把放大渲染的画面缩回窗口,关了只输出左下角一块
    };
    (rendering as any).forceResizeAllWindows?.();
  }

  /** 积水里的实时倒影:引擎自带的平面反射(把场景对着地面镜像再画一遍),只给地面那几块用。 */
  applyReflection(): void {
    const RP: any = js.getClassByName('cc.ReflectionProbe');
    if (!RP) {
      return;
    }
    if (SHOW.reflect && !this.probeNode) {
      const pn = new Node('ShowProbe');
      this.world!.addChild(pn);
      pn.setPosition(0, 0.0, 0);
      const probe: any = pn.addComponent(RP);
      probe.sourceCamera = this.cam;
      probe.probeType = renderer.scene.ProbeType.PLANAR;
      probe.visibility = Layers.Enum.DEFAULT;
      this.probeNode = pn;
    }
    if (this.probeNode) {
      this.probeNode.active = SHOW.reflect;
    }
    for (const n of this.groundNodes) {
      (n.getComponent(MeshRenderer) as any).bakeSettings.reflectionProbe = SHOW.reflect ? 2 : 0;
    }
  }

  // ───────────────────────── 每帧 ─────────────────────────
  pulse(x: number, y: number, z: number, color: [number, number, number], power: number, range: number, hold: number, tau: number): void {
    if (this.pulses.length > 24) {
      this.pulses.shift();
    }
    this.pulses.push({ x, y, z, r: color[0], g: color[1], b: color[2], peak: power, range, hold, tau, age: 0 });
  }

  private tick(): void {
    if (!this.opened || !this.world || !this.fx || !this.hero) {
      return;
    }
    const dt = this.fixedDt > 0 ? this.fixedDt : Math.min(0.05, game.deltaTime);
    this.time += dt;
    const t = this.time;
    const fx = this.fx;
    const R = (a = 0, b = 1): number => fx.rand(a, b);

    // ── 演出:蓄力 1.1 秒 → 落雷 → 连锁 → 收势 ──
    if (this.mode === 'loop' && this.castT < 0 && t >= this.nextCast) {
      this.castT = 0;
      this.struck = false;
      fx.decal('rune', 0, HERO.x, HERO.z, 0.5, 1.5, 3.4, [0.5, 0.82, 1], 0.75, 0.35, 2.3, 0.7, 0.085);
    }
    if (this.castT >= 0) {
      this.castT += dt;
      const c = this.castT;
      this.cast = c < 1.1 ? c / 1.1 : c < 1.7 ? 1 : Math.max(0, 1 - (c - 1.7) / 0.7);
      this.dim = Math.min(1, c / 0.8) * (c < 1.6 ? 1 : Math.max(0, 1 - (c - 1.6) / 0.9));
      if (!this.struck && c >= 1.12) {
        this.struck = true;
        this.strike = 1;
        this.castLightning();
      }
      if (c > 2.6) {
        this.castT = -1;
        this.cast = 0;
        this.dim = 0;
        this.nextCast = t + 4.6;
      }
    }
    this.strike = Math.max(0, this.strike - dt * 2.6);
    for (let i = this.chain.length - 1; i >= 0; i -= 1) {
      const ch = this.chain[i];
      if (t >= ch.at) {
        this.chain.splice(i, 1);
        this.hitKnight(ch.k, ch.from, false);
      }
    }

    // ── 术士 ──
    const hero = this.hero;
    const aim = poseSorcerer(hero, t, this.cast, this.strike);
    hero.snap = this.strike > 0.3 ? 30 : 12;
    Quat.fromEuler(_q, aim.pitch, 0, aim.roll);
    Quat.multiply(_q2, hero.root.worldRotation, _q);
    hero.aim.staff = _q2.clone();
    hero.update(dt);
    this.stepChars(dt);
    const staff = hero.joints.staff;
    Vec3.transformMat4(_v, _v2.set(0, 1.16, 0), staff.worldMatrix);   // 杖顶晶石
    const charge = this.cast;
    const glow = 1.1 + 9 * charge * charge + 14 * this.strike;
    this.staffMat().setProperty('colorScale', new Vec3(glow * 0.75, glow * 0.92, glow));
    this.staffLight!.node.setPosition(_v.x + 0.15, _v.y + 0.1, _v.z + 0.3);
    this.staffLight!.luminousFlux = this.heroHidden ? 0 : (0.6 + 16 * charge * charge + 30 * this.strike) * SHOW.fluxK;
    if (charge > 0.15 && !this.heroHidden) {
      // 蓄力:杖顶噼啪的小电弧 + 往上聚的光点
      if (R() < charge * 0.9) {
        const a = new Vec3(_v.x, _v.y, _v.z);
        const b = new Vec3(_v.x + R(-0.55, 0.55), _v.y + R(-0.3, 0.7), _v.z + R(-0.5, 0.5));
        fx.bolt(a, b, 0.03 + 0.03 * charge, 0.09, [0.62, 0.82, 1], 0.3, 1);
      }
      for (let i = 0; i < 2; i += 1) {
        const ang = R(0, 6.28);
        const rad = R(0.5, 1.3);
        fx.emit({ x: HERO.x + Math.cos(ang) * rad, y: 0.1, z: HERO.z + Math.sin(ang) * rad, vx: -Math.cos(ang) * 0.5, vy: R(1.2, 2.4), vz: -Math.sin(ang) * 0.5, life: R(0.6, 1.0), s0: 0.03, s1: 0.012, c0: [0.5, 0.8, 1], a: 0.7 * charge, cell: FX_CELL.mote, drag: 0.4, stretch: 0.8 });
      }
    }
    if (!this.heroHidden) {
      fx.blob(HERO.x, HERO.z, 0.75, 0.5);
    }
    for (const c of this.chars) {      // 带骨骼的角色脚下也垫一块接地的暗影
      if (c.node.active) {
        fx.blob(c.at.x, c.at.z, Math.max(0.55, c.span * 0.42), 0.45);
      }
    }

    // ── 骑士 ──
    for (const k of this.knights) {
      if (k.state === 'gone') {
        continue;
      }
      k.t += dt;
      let stride = 0;
      if (k.state === 'walk') {
        k.x -= k.speed * dt;
        k.walk += (k.speed * dt / 0.74) * Math.PI;
        stride = 1;
        if (k.x <= k.stopX) {
          k.state = 'fight';
          k.t = R(0, 1.2);
        }
      } else if (k.state === 'fight') {
        if (k.attack <= 0 && k.t > 2.3) {
          k.attack = 0.001;
          k.t = 0;
        }
      } else if (k.state === 'hit') {
        if (k.t > 0.55) {
          k.state = k.x <= k.stopX ? 'fight' : 'walk';
          k.t = 0;
        }
      } else if (k.state === 'dying') {
        k.dead = Math.min(1, k.dead + dt / 0.85);
        if (k.t > 1.0 && k.t < 2.4 && R() < 0.5) {
          fx.emit({ x: k.x + R(-0.5, 0.5), y: R(0.1, 0.5), z: k.z + R(-0.4, 0.4), vy: R(0.3, 0.9), vx: R(-0.2, 0.2), life: R(1.2, 2.2), s0: 0.22, s1: 0.7, c0: [0.3, 0.31, 0.34], a: 0.12, cell: R() < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: R(0, 6), spin: R(-0.4, 0.4), drag: 0.6 });
        }
        if (k.t > 3.2) {
          k.state = 'gone';
          k.actor.root.active = false;
          continue;
        }
      }
      if (k.attack > 0) {
        const before = k.attack;
        k.attack += dt / 1.15;
        if (before < 0.72 && k.attack >= 0.72) {
          // 剑劈到地上:溅一把火星 + 一下小的暖光
          for (let i = 0; i < 9; i += 1) {
            fx.emit({ x: k.x - 1.0, y: 0.12, z: k.z + 0.42, vx: R(-3.5, 0.5), vy: R(1, 4), vz: R(-1.5, 1.5), life: R(0.25, 0.55), s0: 0.022, s1: 0.008, c0: [1, 0.78, 0.4], c1: [1, 0.3, 0.08], cell: FX_CELL.streak, grav: 1, drag: 0.6, stretch: 2.2 });
          }
          this.pulse(k.x - 1.0, 0.5, k.z + 0.5, [1, 0.7, 0.4], 14, 4, 0.02, 0.08);
        }
        if (k.attack >= 1) {
          k.attack = 0;
        }
      }
      k.hit = Math.max(0, k.hit - dt * 2.4);
      poseKnight(k.actor, t + k.walk, k.walk, stride, k.attack, k.hit, k.dead);
      k.actor.snap = k.attack > 0.6 && k.attack < 0.8 ? 34 : 13;
      const sink = k.state === 'dying' && k.t > 1.6 ? (k.t - 1.6) * 0.42 : 0;
      k.actor.root.setPosition(k.x, k.actor.lift - sink, k.z);
      k.actor.update(dt);
      if (k.state !== 'dying' || k.t < 1.6) {
        fx.blob(k.x, k.z, 0.85, 0.5 * (1 - k.dead * 0.4));
      }
    }
    // 补人:保持场上有五六个
    const alive = this.knights.filter((k) => k.state === 'walk' || k.state === 'fight' || k.state === 'hit').length;
    if (this.mode === 'loop' && alive < 6 && R() < dt * 0.9) {
      this.spawnKnight(11.5 + R(0, 2));
    }

    // ── 火盆的火 / 火星、水晶周围的光点、光柱里的尘埃 ──
    const flick: number[] = [];
    for (let i = 0; i < BRAZIERS.length; i += 1) {
      const b = BRAZIERS[i];
      const y0 = TER_H + 0.09 + 1.3;
      const n = Math.sin(t * 7 + i * 9.1) * 0.5 + Math.sin(t * 16.1 + i * 15.5) * 0.3 + Math.sin(t * 35.7 + i * 5.5) * 0.2;
      flick.push(1 + 0.2 * n);
      for (let j = 0; j < 2; j += 1) {
        fx.emit({ x: b.x + R(-0.16, 0.16), y: y0 + R(0, 0.1), z: b.z + R(-0.1, 0.1), vx: R(-0.15, 0.15), vy: R(1.1, 2.0), life: R(0.42, 0.72), s0: R(0.26, 0.36), s1: 0.09, c0: [1, 0.74, 0.34], c1: [0.9, 0.16, 0.03], a: 0.5, cell: R() < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.25, 0.25), drag: 0.3, fadeIn: 0.15 });
      }
      if (R() < dt * 9) {
        fx.emit({ x: b.x + R(-0.15, 0.15), y: y0 + 0.2, z: b.z, vx: R(-0.5, 0.5), vy: R(1.5, 3.2), vz: R(-0.3, 0.6), life: R(1.2, 2.4), s0: 0.02, s1: 0.006, c0: [1, 0.62, 0.22], c1: [1, 0.2, 0.04], cell: FX_CELL.ember, grav: -0.04, drag: 0.5, stretch: 0.9 });
      }
    }
    if (this.crystalTips.length && R() < dt * 2.6) {
      // 晶尖上偶尔闪一下星芒
      const tp = this.crystalTips[Math.floor(R() * this.crystalTips.length)];
      fx.emit({ x: tp.x + R(-0.03, 0.03), y: tp.y - R(0, 0.12), z: tp.z + R(-0.03, 0.03), life: R(0.35, 0.6), s0: R(0.1, 0.2), s1: 0.02, c0: [0.8, 0.96, 1], a: 0.75, cell: FX_CELL.star, rot: R(0, 1.5), spin: R(-1.5, 1.5), fadeIn: 0.3 });
    }
    if (R() < dt * 14) {
      const ang = R(0, 6.28);
      fx.emit({ x: CRYSTAL.x + Math.cos(ang) * R(0.4, 1.3), y: R(0.4, 1.4), z: CRYSTAL.z + Math.sin(ang) * R(0.4, 1.3), vy: R(0.25, 0.7), life: R(1.6, 3), s0: 0.028, s1: 0.008, c0: [0.45, 0.85, 1], a: 0.6, cell: FX_CELL.mote, drag: 0.2 });
    }
    if (SHOW.rain > 0) {
      // 细雨:一道道被风带斜的雨丝;落在积水里的溅一圈涟漪
      const drops = Math.min(8, Math.round(SHOW.rain * 170 * dt));
      for (let i = 0; i < drops; i += 1) {
        fx.emit({ x: R(-13, 13), y: R(8.5, 11.5), z: R(-10, 7.5), vx: -1.4, vy: -15, vz: 0.7, life: 0.72, s0: 0.011, c0: [0.62, 0.72, 0.92], a: 0.2, cell: FX_CELL.streak, stretch: 12, fadeIn: 0.1 });
      }
      for (let i = 0; i < 3; i += 1) {
        const rx = R(-13, 13);
        const rz = R(-7.5, 6.5);
        if (wetValue(rx, rz) > puddleLevel(WET) + 0.05) {
          fx.decal('atlas', FX_CELL.ring, rx, rz, 0.02, R(0.12, 0.2), 0.55, [0.6, 0.72, 0.95], 0.2, 0.05, 0.1, 0, 0.012);
        }
      }
    }
    this.updateShaft(t, dt);
    fx.update(dt, this.cam!.node);

    // ── 灯 ──
    const dimK = 1 - 0.45 * this.dim;
    director.getScene()!.globals.ambient.skyIllum = SHOW.ambient * dimK;
    this.moon!.illuminance = SHOW.moon * (1 - 0.3 * this.dim);
    for (let i = 0; i < this.brazier.length; i += 1) {
      const L = this.brazier[i];
      L.node.active = SHOW.fillLights;
      L.luminousFlux = SHOW.brazier * SHOW.fluxK * flick[i];
    }
    this.enemyLight!.node.active = SHOW.fillLights;
    for (const L of this.fillLights) {
      L.luminousFlux = SHOW.fill * SHOW.fluxK;
    }
    this.enemyLight!.luminousFlux = SHOW.enemyFire * SHOW.fluxK * (1 + 0.12 * Math.sin(t * 5.3) + 0.08 * Math.sin(t * 13.7));
    const breathe = 1 + 0.12 * Math.sin(t * 1.3) + 0.5 * this.cast;
    this.crystalLight!.luminousFlux = SHOW.crystal * SHOW.fluxK * breathe;
    const e = SHOW.crystalGlow * breathe;
    this.crystalMat!.setProperty('emissiveScale', new Vec3(e, e, e));
    const el = SHOW.crystalEdge * (0.85 + 0.15 * Math.sin(t * 2.1)) * (1 + 0.6 * this.cast);
    this.crystalEdgeMat!.setProperty('colorScale', new Vec3(el, el, el));
    for (const b of this.crystalBits) {
      const ang = b.a + t * b.w;
      b.node.setPosition(CRYSTAL.x + Math.cos(ang) * b.r, b.h + 0.12 * Math.sin(t * 0.9 + b.a), CRYSTAL.z + Math.sin(ang) * b.r);
      b.node.setRotationFromEuler(18 + 10 * Math.sin(t * 0.5 + b.a), t * 28 * (b.w > 0 ? 1 : -1) + b.a * 57, 14);
    }
    const live: Array<{ p: Pulse; v: number }> = [];
    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const p = this.pulses[i];
      p.age += dt;
      const v = p.peak * Math.min(1, p.age / 0.025) * (p.age <= p.hold ? 1 : Math.exp(-(p.age - p.hold) / p.tau));
      if (p.age > p.hold && v < 0.5) {
        this.pulses.splice(i, 1);
        continue;
      }
      live.push({ p, v });
    }
    live.sort((a, b) => b.v - a.v);
    for (let i = 0; i < this.dyn.length; i += 1) {
      const L = this.dyn[i];
      const it = i < SHOW.dynLights ? live[i] : undefined;
      if (!it) {
        L.node.active = false;
        continue;
      }
      L.node.active = true;
      L.node.setPosition(it.p.x, it.p.y, it.p.z);
      L.color = new Color(Math.round(it.p.r * 255), Math.round(it.p.g * 255), Math.round(it.p.b * 255), 255);
      L.range = it.p.range;
      L.luminousFlux = it.v * SHOW.fluxK;
    }
    for (const h of this.hazes) {
      h.off += h.speed * dt;
      h.mat.setProperty('tilingOffset', new Vec4(1, 1, h.off, 0));
    }
    // 镜头震动(每帧都重设一次位置:引擎的平面反射只在相机动过的那一帧重画,这样倒影才跟得上会动的东西)
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const s = this.shake * this.shake * 0.3;
    this.cam!.node.setPosition(this.camBase.x + Math.sin(t * 91) * s, this.camBase.y + Math.sin(t * 77 + 1) * s, this.camBase.z);
  }

  private staffMatCache: Material | null = null;
  /** 杖顶晶石单独一份材质(亮度每帧在变,不能和别人共用)。 */
  private staffMat(): Material {
    if (!this.staffMatCache) {
      const node = this.hero!.joints.staff.children.find((c) => c.name.indexOf('staff_glow') === 0);
      const mr = node?.getComponent(MeshRenderer);
      this.staffMatCache = mr ? mr.getMaterialInstance(0)! : material('builtin-unlit', {});
    }
    return this.staffMatCache;
  }

  /** 落雷:主雷劈最靠前的那个,随后往附近的几个连锁。 */
  private castLightning(): void {
    const fx = this.fx!;
    const targets = this.knights.filter((k) => (k.state === 'walk' || k.state === 'fight' || k.state === 'hit') && k.x < 8.2).sort((a, b) => a.x - b.x);
    const first = targets[Math.min(1, targets.length - 1)] ?? null;
    const gx = first ? first.x : 2.5;
    const gz = first ? first.z : 0.4;
    // 天上劈下来的主雷(两道叠着:一粗一细)
    const top = new Vec3(gx + fx.rand(-1.5, 1.5) - 2.2, 17, gz - 6.5);
    const hitP = new Vec3(gx, first ? 1.5 : 0.05, gz);
    fx.bolt(top, hitP, 0.34, 0.32, [0.72, 0.86, 1], 0.1, 5);
    fx.bolt(top, new Vec3(gx + 0.1, 0.05, gz + 0.05), 0.14, 0.26, [0.9, 0.95, 1], 0.07, 2);
    this.groundBurst(gx, gz, 1);
    this.shake = 1;
    this.pulse(gx, 3.6, gz + 0.9, [0.72, 0.84, 1], 95, 26, 0.08, 0.2);
    this.pulse(gx, 1.0, gz + 0.3, [0.6, 0.78, 1], 60, 9, 0.5, 0.5);
    if (first) {
      this.hitKnight(first, hitP, true);
      // 连锁:离主目标近的再电三个
      const others = targets.filter((k) => k !== first && Math.hypot(k.x - first.x, k.z - first.z) < 5.2).slice(0, 3);
      let from = new Vec3(first.x, 1.3, first.z);
      others.forEach((k, i) => {
        this.chain.push({ at: this.time + 0.07 * (i + 1), k, from: from.clone() });
        from = new Vec3(k.x, 1.3, k.z);
      });
    }
  }

  private hitKnight(k: Knight, from: Vec3, main: boolean): void {
    const fx = this.fx!;
    const p = new Vec3(k.x, 1.25, k.z);
    if (!main) {
      fx.bolt(from, p, 0.16, 0.2, [0.7, 0.85, 1], 0.2, 1);
      this.groundBurst(k.x, k.z, 0.55);
      this.pulse(k.x, 1.8, k.z + 0.6, [0.7, 0.84, 1], 60, 10, 0.06, 0.16);
    }
    for (let i = 0; i < (main ? 26 : 12); i += 1) {
      fx.emit({ x: p.x + fx.rand(-0.2, 0.2), y: p.y + fx.rand(-0.5, 0.4), z: p.z + fx.rand(-0.2, 0.2), vx: fx.rand(-5, 5), vy: fx.rand(0.5, 6), vz: fx.rand(-4, 4), life: fx.rand(0.25, 0.7), s0: 0.024, s1: 0.006, c0: [0.8, 0.92, 1], c1: [0.4, 0.6, 1], cell: FX_CELL.streak, grav: 1, drag: 1.2, stretch: 2.4 });
    }
    fx.emit({ x: p.x, y: p.y, z: p.z + 0.2, life: 0.14, s0: main ? 0.9 : 0.55, s1: (main ? 0.9 : 0.55) * 1.7, c0: [0.8, 0.9, 1], a: 0.5, cell: FX_CELL.core, fadeIn: 0.02 });
    if (main || fx.rand() < 0.55) {
      k.state = 'dying';
      k.t = 0;
      k.attack = 0;
    } else if (k.state !== 'dying') {
      k.state = 'hit';
      k.t = 0;
      k.hit = 1;
      k.x += 0.25;
    }
  }

  /** 雷落地:冲击环、发红的裂纹、焦痕、烟、溅起的碎光。 */
  private groundBurst(x: number, z: number, k: number): void {
    const fx = this.fx!;
    fx.decal('scorch', 0, x, z, 0.9 * k, 1.5 * k, 14, [1, 1, 1], 0.85, 0.05, 9);
    fx.decal('atlas', FX_CELL.crack, x, z, 0.8 * k, 1.5 * k, 1.9, [0.5, 0.74, 1], 0.8, 0.03, 0.35, 0, 0.05);
    fx.decal('atlas', FX_CELL.shock, x, z, 0.4 * k, 3.4 * k, 0.5, [0.7, 0.86, 1], 0.15, 0.02, 0.05, 0, 0.06);
    fx.decal('atlas', FX_CELL.glow, x, z, 1.2 * k, 2.0 * k, 0.4, [0.75, 0.88, 1], 0.16, 0.02, 0.08, 0, 0.07);
    for (let i = 0; i < Math.round(7 * k); i += 1) {
      fx.emit({ x: x + fx.rand(-0.5, 0.5) * k, y: 0.2, z: z + fx.rand(-0.4, 0.4) * k, vx: fx.rand(-0.6, 0.6), vy: fx.rand(0.6, 1.6), vz: fx.rand(-0.4, 0.4), life: fx.rand(1.4, 2.6), s0: 0.35 * k, s1: 1.2 * k, c0: [0.34, 0.36, 0.4], c1: [0.2, 0.2, 0.22], a: 0.2, cell: fx.rand() < 0.5 ? FX_CELL.smokeA : FX_CELL.smokeB, add: false, rot: fx.rand(0, 6), spin: fx.rand(-0.5, 0.5), drag: 0.7 });
    }
    for (let i = 0; i < Math.round(22 * k); i += 1) {
      const a = fx.rand(0, 6.28);
      const sp = fx.rand(2, 7) * k;
      fx.emit({ x, y: 0.1, z, vx: Math.cos(a) * sp, vy: fx.rand(1, 5), vz: Math.sin(a) * sp, life: fx.rand(0.3, 0.8), s0: 0.026, s1: 0.006, c0: [0.85, 0.94, 1], c1: [1, 0.55, 0.25], cell: FX_CELL.streak, grav: 1, drag: 0.9, stretch: 2.2 });
    }
  }

  /** 光柱:三片叠着的光,从墙口方向斜着落到院子里;每帧按镜头方向重摆一次,让它总是「正对着看」。 */
  private updateShaft(t: number, dt: number): void {
    const sh = this.shaft!;
    const fx = this.fx!;
    const cp = this.cam!.node.worldPosition;
    sh.begin();
    const beams: Array<[number, number, number, number]> = [[0.6, -4.6, 2.6, 0.2], [2.9, -3.4, 1.9, 0.15], [-0.6, -3.0, 1.5, 0.11], [1.8, -5.6, 2.2, 0.13]];
    beams.forEach((b, i) => {
      const lx = b[0];
      const lz = b[1];
      const len = 13;
      const tx = lx - MOON_DIR.x * len;
      const ty = -MOON_DIR.y * len;
      const tz = lz - MOON_DIR.z * len;
      // 片子的横向 = 光的方向 × 视线方向(片子尽量正对镜头)
      _v.set(lx - tx, -ty, lz - tz);
      _v2.set(cp.x - (lx + tx) / 2, cp.y - ty / 2, cp.z - (lz + tz) / 2);
      const side = Vec3.cross(new Vec3(), _v, _v2).normalize().multiplyScalar(b[2] / 2);
      const a = b[3] * (0.82 + 0.18 * Math.sin(t * 0.7 + i * 2.1)) * (1 - 0.5 * this.dim);
      sh.quad(lx - side.x, -side.y, lz - side.z, lx + side.x, side.y, lz + side.z, tx + side.x * 0.55, ty + side.y * 0.55, tz + side.z * 0.55, tx - side.x * 0.55, ty - side.y * 0.55, tz - side.z * 0.55,
        0, 0, 1, 1, 0.62, 0.76, 1, a);
      if (fx.rand() < dt * 7) {
        const k = fx.rand(0.05, 0.75);
        fx.emit({ x: lx + (tx - lx) * k + fx.rand(-0.8, 0.8), y: ty * k + fx.rand(-0.3, 0.3), z: lz + (tz - lz) * k + fx.rand(-0.5, 0.5), vx: fx.rand(-0.06, 0.06), vy: fx.rand(-0.1, 0.02), vz: fx.rand(-0.05, 0.05), life: fx.rand(2.5, 5), s0: 0.018, s1: 0.018, c0: [0.7, 0.82, 1], a: 0.35, cell: FX_CELL.mote, fadeIn: 0.3 });
      }
    });
    sh.end();
  }

  // ───────────────────────── 调试 ─────────────────────────
  info(): Record<string, unknown> {
    return { opened: this.opened, built: !!this.world, time: +this.time.toFixed(2), mode: this.mode, castT: +this.castT.toFixed(2), stats: this.stats, fx: this.fx?.stats, knights: this.knights.map((k) => `${k.state}@${k.x.toFixed(1)}`),
      cfg: { ...SHOW }, kit: ['g3d-standard', 'g3d-bloom', 'g3d-fxaa'].filter((n) => !!keptMaterial(n)), lastError: this.lastError,
      chars: this.chars.map((c) => ({ clips: c.names, cur: c.cur, tris: c.tris, joints: c.joints, baked: c.anim ? c.anim.useBakedAnimation : null })) };
  }

  /** 现场调参。 */
  set(patch: Partial<ShowCfg>): Record<string, unknown> {
    Object.assign(SHOW, patch);
    if (this.opened) {
      this.applyShadow();
      this.applyPost();
      this.applyReflection();
    }
    return this.info();
  }

  /** 立刻放一次技能(不等循环)。 */
  castNow(): void {
    this.nextCast = this.time;
  }
}

export const stage = new Stage();

function param(name: string): string | null {
  try {
    const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  } catch (error) {
    return null;
  }
}

function boot(): void {
  const q = param('q');
  if (q && TIERS[q]) {
    Object.assign(SHOW, TIERS[q], { quality: q });
  } else if (sys.isMobile) {
    Object.assign(SHOW, TIERS.mid, { quality: 'mid' });
  }
  if (param('charbaked') === '1') {
    CHAR.baked = true;     // 测「预烘焙骨骼动画」的开销用
  }
  // 等主场景起来再接管(脚本加载时场景还没进)
  const timer = setInterval(() => {
    const scene = director.getScene();
    if (!scene || !director.root || !scene.getComponentInChildren(Canvas)) {
      return;
    }
    clearInterval(timer);
    stage.open();
  }, 120);
}

if (!EDITOR && sys.isBrowser) {
  (globalThis as any).__g3dshow = { stage, info: () => stage.info(), set: (p: Partial<ShowCfg>) => stage.set(p), cam: (n: string) => stage.setCam(n), cast: () => stage.castNow(), char: (n?: string) => stage.charPlay(n), knights: (on: boolean) => stage.showKnights(on), hero: (on: boolean) => stage.showHero(on),
    camOn: (who: string | number, kind?: string) => stage.camOn(who, kind), cfg: SHOW, charCfg: CHAR, charSpecs: CHAR_SPECS };
  if (param('g3dshow') === '1') {
    boot();
  }
}
