import { BlockInputEvents, Camera, Canvas, Color, DirectionalLight, director, Director, EventKeyboard, EventMouse, game, input, Input, js, KeyCode, Layers, Material, Mesh, MeshRenderer, Node, PointLight, Quat, renderer, SpotLight, sys, UITransform, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { charKeys, G3DChar, loadChar } from './G3DChar';
import { floorPbr, FloorPlan, masonryPbr, paintGlow, paintGrime, paintRunes } from './G3DDungeonTex';
import { ironPbr, Pbr, rockPbr, woodPbr } from './G3DFieldTex';
import { FxWorld } from './G3DFx';
import { addMesh, loadKit, material, tex } from './G3DKit';
import { MeshBatch, Tint } from './G3DMesh';
import { Sculpt, xform } from './G3DSculpt';
import { buildEnvCube, FX_CELL, paintCloth, paintShaft } from './G3DSkins';
import { mulberry32 } from './G3DTextures';
import { FieldPost, loadPost, POST_CFG, PostCfg } from './TownPost3D';

/**
 * 地宫小样(实验,2026-11-17;预览地址带 ?g3ddungeon=1 才启用,不带参数完全不加载场景)。
 *
 * 由来:野外自由视角和参考的那个 FPS(github.com/wquguru/fable52-fps-repro)并排一比差距很大 ——
 * 主要差在灯(它暗房间里十来盏彩色灯)、地面(湿地面有倒影)、同一个镜头里混着几种做法、题材(封闭室内硬表面)。
 * 用户选了「做地宫小样」:挑一间封闭的房间,整间按它的做法做,看在我们的引擎里能做到什么程度。只借鉴做法,代码全是自己写的。
 *
 * 这一间里有什么:
 * - 房间:24 × 12 米、高 6 米的石砌大厅,六根柱子、横梁、壁龛、西头的铁栅门、东头的石台、南墙一条侧廊;
 *   天花板上开一个天井,月光从铁栅里斜着照下来(唯一带投影的灯)。全部由代码拼的硬表面,不放任何纸片 / 手绘图。
 * - 材质:砌石墙、整间房的石板地(积水、嵌铜环)、岩石、铁、木头,全部由代码生成(G3DDungeonTex / G3DFieldTex)。
 * - 灯:月光 + 四盏冷色水晶壁灯 + 两个火盆 + 铁门后的红光 + 符文石板的绿光 + 侧廊的火把,加起来十盏;发光的灯芯、火、符文会泛光。
 * - 地面:积水的地方有实时倒影(引擎自带的平面反射,把场景对着地面镜像再画一遍)。
 * - 后期:沿用野外那套(高动态 + 环境光遮蔽 + 泛光 + 调色 + 暗角 + 按深度的雾)。
 * - 角色:AI 图转 3D 的主角和怪(模型不在仓库里,验证时临时拷进 assets/resources/g3d_char);没有模型时房间照样能看。
 *   主角 WASD 走、鼠标右键拖动转镜头、滚轮缩放、J 或鼠标左键出手;怪走近了会围上来,砍几下倒地,过一会儿重生。
 *
 * 只是样板:不接战斗数值、不登录、不改任何现有文件。调试接口 window.__g3dd。
 */

// ───────────────────────── 房间的尺寸 ─────────────────────────
const X0 = -12;
const X1 = 12;
const Z0 = -6;
const Z1 = 6;
const H = 6;                       // 天花板的高度
const ROOF = H + 1.6;              // 屋顶上表面(只为了挡月光:投影只认朝着光的那一面)
const PILLAR_X = [-6, 0, 6];
const PILLAR_Z = [-3.1, 3.1];
const RING = { x: -3, z: 0, r: 2.1 };
const MOON_DIR = new Vec3(0.2, -1, 0.1).normalize();
// 天井开在哪:让月光正好落在铜环上
const OC = { x: RING.x - (MOON_DIR.x / -MOON_DIR.y) * (H + 0.8), z: RING.z - (MOON_DIR.z / -MOON_DIR.y) * (H + 0.8), half: 1.25 };
const GATE = { half: 1.6, h: 3.9, depth: 2.6 };          // 西墙的铁栅门
const HALL = { x: 3, half: 1.15, h: 3.1, depth: 4.2 };   // 南墙的侧廊
const ALCOVES_N = [-9, -3, 3];                            // 北墙的壁龛
const ALCOVES_S = [-9, -3];
const ALCOVE = { half: 1.25, h: 3.3, depth: 0.85 };
const DAIS = { x: 8.4, h: 0.36 };
const BRAZIERS = [{ x: 7.6, z: -3.6 }, { x: 7.6, z: 3.6 }];
const LAMPS = [                                            // 水晶壁灯:贴在墙上的位置和朝向(nz = 墙朝房间里的方向)
  { x: -6, z: Z0, nz: 1 }, { x: 6, z: Z0, nz: 1 }, { x: 0, z: Z1, nz: -1 }, { x: -9, z: Z1, nz: -1 },
];
const UV_WALL = 0.25;              // 砌石墙:一张贴图 4 米
const UV_ROCK = 0.7;
const UV_WOOD = 0.9;
const UV_IRON = 1.6;
const GROUND_LAYER = 1 << 2;       // 地面:倒影相机不看(地面自己在采样倒影图)
const BAYS = 4;

export interface DungeonCfg {
  /** 月光 / 环境光的照度;点光的强度 × fluxK = 光通量。都是对着画面校的。 */
  moon: number;
  ambient: number;
  fluxK: number;
  lamp: number;
  /** 壁灯往下打的那一束(聚光):在地上打出一片亮区。聚光要的数比点光大二三十倍。 */
  lampSpot: number;
  /**
   * 这一束带不带投影(角色和柱子在灯下有影子)。默认不带:引擎里带投影的聚光是分多趟画的,
   * 实测开了之后半透明 / 叠加色的东西(火苗、光晕、光柱、光锥)整个不画。留着开关(地址 &dspot=1)以后再查。
   */
  spotShadow: boolean;
  brazier: number;
  gate: number;
  rune: number;
  torch: number;
  /** 每座烛台一盏很弱的暖色点光(烛火本身只是发光的片,照不亮东西)。 */
  candle: number;
  /** 技能 / 出手时临时亮一下的灯。 */
  hit: number;
  shadow: number;
  /** 地面贴图的宽(高 = 一半)。 */
  floor: number;
  reflect: boolean;
  wet: number;
  /** 石板地整体有多湿:粗糙度乘这个数(1 = 只有水洼反光,越小整片地面越像刚泼过水)。 */
  gloss: number;
  /** 石板地法线的强度(越小石面越平,倒影越清楚)。 */
  floorBump: number;
  /** 壁灯下面那片光锥的亮度。 */
  cone: number;
  post: number;
  env: number;
  shaft: number;
  glow: number;
  /** 跟着主角的一盏很弱的补光(镜头这一侧、头顶偏后):没有它,站在两盏灯之间的角色是一团黑。 */
  fill: number;
  /** 月光落在地上之后往四周弹的那点光(一盏放在光斑上方的冷色点光)。 */
  bounce: number;
}
export const DUNGEON: DungeonCfg = {
  moon: 1300000, ambient: 42, fluxK: 100, lamp: 11, lampSpot: 420, spotShadow: false, brazier: 17, gate: 17, rune: 9, torch: 14, candle: 3.2, hit: 9,
  shadow: 4096, floor: 4096, reflect: true, wet: 0.74, gloss: 0.3, floorBump: 0.55, post: 2, env: 1, shaft: 0.16, cone: 0.05, glow: 1, fill: 0.8, bounce: 8,
};

interface Mob {
  c: G3DChar; home: Vec3; x: number; z: number; yaw: number; hp: number; maxHp: number; speed: number; reach: number; radius: number;
  state: 'idle' | 'chase' | 'bite' | 'down' | 'gone'; t: number; cool: number; wander: number; tx: number; tz: number;
}
interface Flicker { light: PointLight; base: number; seed: number; amp: number }
interface Pulse { light: PointLight; age: number; life: number; peak: number }

const _v = new Vec3();
const _q = new Quat();

class Dungeon {
  world: Node | null = null;
  cam: Camera | null = null;
  moon: DirectionalLight | null = null;
  fx: FxWorld | null = null;
  post: FieldPost | null = null;
  opened = false;
  lastError = '';
  time = 0;
  /** > 0 时每帧固定走这么多秒(截图逐帧推用);frozen = 逻辑停住(只画)。 */
  fixedDt = 0;
  frozen = false;
  stats: Record<string, number> = {};
  // 镜头:绕着主角转(yaw / pitch 度、dist 米);free 给了就不跟主角,直接用这组位置和朝向(截图摆机位)
  view = { yaw: 62, pitch: 14, dist: 6.2, fov: 52 };
  free: { pos: Vec3; look: Vec3 } | null = null;
  private pull = 6.2;
  private look = new Vec3(-6.5, 1.2, 1.6);
  // 主角
  leader: G3DChar | null = null;
  private lx = -7.2;
  private lz = 1.6;
  private lyaw = 0;
  private attackT = -1;
  private attackHit = false;
  private moving = false;
  mobs: Mob[] = [];
  private followers: Array<{ c: G3DChar; x: number; z: number; yaw: number; moving: boolean; ox: number; oz: number }> = [];
  private keys = new Set<number>();
  private drag: { x: number; y: number } | null = null;
  private saved: any = null;
  private probeNode: Node | null = null;
  private groundNodes: Node[] = [];
  private halos: Node[] = [];
  private flickers: Flicker[] = [];
  private pulses: Pulse[] = [];
  private lights: Record<string, PointLight[]> = { lamp: [], brazier: [], gate: [], rune: [], torch: [], candle: [], hit: [], fill: [], bounce: [] };
  private shaftMat: Material | null = null;
  private floorMat: Material | null = null;
  private coneMat: Material | null = null;
  private spots: SpotLight[] = [];
  private candles: Vec3[] = [];
  private solids: Array<{ x: number; z: number; hx: number; hz: number; h: number }> = [];
  private blocker: Node | null = null;
  private rnd = mulberry32(417);

  open(done?: () => void): void {
    loadKit(['g3d-standard', 'g3d-fxaa'], (missing) => {
      if (missing.indexOf('g3d-standard') >= 0) {
        this.lastError = `missing ${missing.join(',')}`;
        return;
      }
      loadPost(() => {
        try {
          if (!this.world) {
            this.build();
          }
          this.takeOver();
          this.opened = true;
          director.on(Director.EVENT_BEFORE_UPDATE, this.tick, this);
          director.on(Director.EVENT_AFTER_UPDATE, this.afterUpdate, this);
          this.bindInput();
          done?.();
        } catch (error) {
          this.lastError = String((error as any)?.stack ?? error);
          console.warn('[g3dd] open failed', error);
        }
      });
    });
  }

  // ───────────────────────── 建场景 ─────────────────────────
  private build(): void {
    const t0 = performance.now();
    const scene = director.getScene()!;
    const world = new Node('G3DDungeon');
    scene.addChild(world);
    this.world = world;
    const rnd = mulberry32(91);
    // 每种材质一批;按「开间」(沿长边切成四段)分块 —— 点光是「每盏灯把它照得到的网格重画一遍」,切了块一盏灯只重画附近那一段
    const wall = new Sculpt();     // 砌石:墙、柱、梁、天花
    const rock = new Sculpt();     // 整块的石头:石台、石棺、柱础、碎石
    const iron = new Sculpt();
    const wood = new Sculpt();
    const bronze = new Sculpt();
    const dark = new Sculpt();     // 洞口后面看不清的地方(门后、侧廊尽头)的深色石面
    const batches = [wall, rock, iron, wood, bronze, dark];
    const jobs: Array<{ bay: number; run: () => void }> = [];
    const bayOf = (x: number): number => Math.max(0, Math.min(BAYS - 1, Math.floor(((x - X0) / (X1 - X0)) * BAYS)));
    const at = (x: number, run: () => void): void => {
      jobs.push({ bay: bayOf(x), run });
    };
    const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
    const WALL_T: Tint = [0.86, 0.87, 0.9];
    const CEIL_T: Tint = [0.5, 0.5, 0.53];
    /** 一块竖直 / 水平的矩形面(四个角按任意顺序,hint = 朝外的方向);贴近地面的一圈压暗。 */
    const face = (b: MeshBatch, p: Vec3[], hint: Vec3, tint: Tint, den: number, ground?: number): void => b.poly(p, hint, tint, den, 0, 0, ground);
    const NX = V(1, 0, 0);
    const PX = V(-1, 0, 0);
    const NZ = V(0, 0, 1);
    const PZ = V(0, 0, -1);
    const UP = V(0, 1, 0);
    const DOWN = V(0, -1, 0);

    // ── 长边的两面墙:按开间切,壁龛 / 侧廊的洞口留出来 ──
    const longWall = (z: number, inward: Vec3, holes: Array<{ x: number; half: number; h: number }>): void => {
      for (let b = 0; b < BAYS; b += 1) {
        const xa = X0 + ((X1 - X0) * b) / BAYS;
        const xb = X0 + ((X1 - X0) * (b + 1)) / BAYS;
        at((xa + xb) / 2, () => {
          let cur = xa;
          const mine = holes.filter((h) => h.x > xa && h.x < xb).sort((p, q) => p.x - q.x);
          for (const h of mine) {
            face(wall, [V(cur, 0, z), V(h.x - h.half, 0, z), V(h.x - h.half, H, z), V(cur, H, z)], inward, WALL_T, UV_WALL, 0);
            face(wall, [V(h.x - h.half, h.h, z), V(h.x + h.half, h.h, z), V(h.x + h.half, H, z), V(h.x - h.half, H, z)], inward, WALL_T, UV_WALL);
            cur = h.x + h.half;
          }
          face(wall, [V(cur, 0, z), V(xb, 0, z), V(xb, H, z), V(cur, H, z)], inward, WALL_T, UV_WALL, 0);
        });
      }
    };
    const holesN = ALCOVES_N.map((x) => ({ x, half: ALCOVE.half, h: ALCOVE.h }));
    const holesS = [...ALCOVES_S.map((x) => ({ x, half: ALCOVE.half, h: ALCOVE.h })), { x: HALL.x, half: HALL.half, h: HALL.h }];
    longWall(Z0, NZ, holesN);
    longWall(Z1, PZ, holesS);
    /** 墙上凹进去的一格:两侧、顶、底、背面。back = 背面用哪批(深色的看不清,省得做细)。 */
    const recess = (x: number, half: number, h: number, depth: number, z: number, dir: number, back: MeshBatch, tint: Tint): void => {
      const zb = z - dir * depth;      // dir = 墙朝房间里的方向(+1 / -1),凹进去是反方向
      at(x, () => {
        face(wall, [V(x - half, 0, z), V(x - half, 0, zb), V(x - half, h, zb), V(x - half, h, z)], NX, tint, UV_WALL, 0);
        face(wall, [V(x + half, 0, z), V(x + half, 0, zb), V(x + half, h, zb), V(x + half, h, z)], PX, tint, UV_WALL, 0);
        face(wall, [V(x - half, h, z), V(x + half, h, z), V(x + half, h, zb), V(x - half, h, zb)], DOWN, tint, UV_WALL);
        face(back, [V(x - half, 0, zb), V(x + half, 0, zb), V(x + half, h, zb), V(x - half, h, zb)], V(0, 0, dir), tint, UV_WALL, 0);
        face(rock, [V(x - half, 0.002, z), V(x + half, 0.002, z), V(x + half, 0.002, zb), V(x - half, 0.002, zb)], UP, [0.5, 0.5, 0.52], UV_ROCK);
        // 洞口上沿一条挑出来的石楣
        rock.box(half * 2 + 0.5, 0.32, 0.3, V(x, h + 0.16, z + dir * 0.1), V(0, 0, 0), [0.8, 0.8, 0.83], UV_ROCK, rnd, 0.03);
      });
    };
    for (const x of ALCOVES_N) {
      recess(x, ALCOVE.half, ALCOVE.h, ALCOVE.depth, Z0, 1, wall, [0.62, 0.63, 0.66]);
    }
    for (const x of ALCOVES_S) {
      recess(x, ALCOVE.half, ALCOVE.h, ALCOVE.depth, Z1, -1, wall, [0.62, 0.63, 0.66]);
    }
    recess(HALL.x, HALL.half, HALL.h, HALL.depth, Z1, -1, dark, [0.7, 0.7, 0.72]);

    // ── 短边:西墙(中间一道铁栅门)和东墙 ──
    at(X0, () => {
      const g = GATE;
      face(wall, [V(X0, 0, Z0), V(X0, 0, -g.half), V(X0, H, -g.half), V(X0, H, Z0)], NX, WALL_T, UV_WALL, 0);
      face(wall, [V(X0, 0, g.half), V(X0, 0, Z1), V(X0, H, Z1), V(X0, H, g.half)], NX, WALL_T, UV_WALL, 0);
      face(wall, [V(X0, g.h, -g.half), V(X0, g.h, g.half), V(X0, H, g.half), V(X0, H, -g.half)], NX, WALL_T, UV_WALL);
      // 门洞里面:两侧、顶、地面、尽头
      const xb = X0 - g.depth;
      face(wall, [V(X0, 0, -g.half), V(xb, 0, -g.half), V(xb, g.h, -g.half), V(X0, g.h, -g.half)], NZ, [0.6, 0.6, 0.63], UV_WALL, 0);
      face(wall, [V(X0, 0, g.half), V(xb, 0, g.half), V(xb, g.h, g.half), V(X0, g.h, g.half)], PZ, [0.6, 0.6, 0.63], UV_WALL, 0);
      face(wall, [V(X0, g.h, -g.half), V(X0, g.h, g.half), V(xb, g.h, g.half), V(xb, g.h, -g.half)], DOWN, [0.5, 0.5, 0.52], UV_WALL);
      face(dark, [V(xb, 0, -g.half), V(xb, 0, g.half), V(xb, g.h, g.half), V(xb, g.h, -g.half)], NX, [0.6, 0.6, 0.62], UV_WALL, 0);
      face(rock, [V(X0, 0.002, -g.half), V(X0, 0.002, g.half), V(xb, 0.002, g.half), V(xb, 0.002, -g.half)], UP, [0.45, 0.45, 0.47], UV_ROCK);
      // 门框:两根门柱 + 门楣 + 楣上三块托石
      for (const s of [-1, 1]) {
        rock.box(0.5, g.h, 0.5, V(X0 + 0.22, g.h / 2, s * (g.half + 0.25)), V(0, 0, 0), [0.78, 0.78, 0.82], UV_ROCK, rnd, 0.04, 0);
        rock.box(0.62, 0.3, 0.62, V(X0 + 0.24, 0.15, s * (g.half + 0.25)), V(0, 0, 0), [0.7, 0.7, 0.74], UV_ROCK, rnd, 0.04, 0);
      }
      rock.box(0.6, 0.6, g.half * 2 + 1.3, V(X0 + 0.24, g.h + 0.3, 0), V(0, 0, 0), [0.8, 0.8, 0.84], UV_ROCK, rnd, 0.05);
      for (const s of [-1, 0, 1]) {
        rock.box(0.42, 0.34, 0.5, V(X0 + 0.36, g.h + 0.74, s * 1.25), V(0, 0, 0), [0.74, 0.74, 0.78], UV_ROCK, rnd, 0.04);
      }
      // 铁栅:竖条 + 三道横条(横条压在竖条前面),底下一排尖
      const gx = X0 - 0.2;
      for (let i = 0; i <= 11; i += 1) {
        const z = -g.half + 0.12 + (i * (g.half * 2 - 0.24)) / 11;
        iron.cylinder(0.034, 0.034, g.h - 0.1, 8, V(gx, (g.h - 0.1) / 2 + 0.1, z), V(0, 0, 0), [0.55, 0.55, 0.58], UV_IRON, rnd, undefined, false);
        iron.cylinder(0.0, 0.05, 0.16, 6, V(gx, 0.08, z), V(180, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, undefined, false);
      }
      for (const y of [0.55, 1.95, 3.35]) {
        iron.box(0.05, 0.11, g.half * 2, V(gx + 0.045, y, 0), V(0, 0, 0), [0.6, 0.6, 0.62], UV_IRON, rnd, 0.008);
      }
    });
    at(X1, () => {
      face(wall, [V(X1, 0, Z0), V(X1, 0, Z1), V(X1, H, Z1), V(X1, H, Z0)], PX, WALL_T, UV_WALL, 0);
    });

    // ── 天花板(天井那一格空着)、屋顶上表面(挡月光用)、天井的井壁和铁栅 ──
    const ceilQuad = (xa: number, xb: number, za: number, zb: number): void => {
      if (xb - xa < 0.01 || zb - za < 0.01) {
        return;
      }
      at((xa + xb) / 2, () => {
        face(wall, [V(xa, H, za), V(xb, H, za), V(xb, H, zb), V(xa, H, zb)], DOWN, CEIL_T, UV_WALL);
        face(dark, [V(xa, ROOF, za), V(xb, ROOF, za), V(xb, ROOF, zb), V(xa, ROOF, zb)], UP, [0.3, 0.3, 0.3], UV_WALL);
      });
    };
    for (let b = 0; b < BAYS; b += 1) {
      const xa = X0 + ((X1 - X0) * b) / BAYS;
      const xb = X0 + ((X1 - X0) * (b + 1)) / BAYS;
      const ha = OC.x - OC.half;
      const hb = OC.x + OC.half;
      if (hb <= xa || ha >= xb) {
        ceilQuad(xa, xb, Z0, Z1);
      } else {
        ceilQuad(xa, Math.max(xa, ha), Z0, Z1);
        ceilQuad(Math.min(xb, hb), xb, Z0, Z1);
        ceilQuad(Math.max(xa, ha), Math.min(xb, hb), Z0, OC.z - OC.half);
        ceilQuad(Math.max(xa, ha), Math.min(xb, hb), OC.z + OC.half, Z1);
      }
    }
    // 屋顶往外再接一圈(月光是斜的,别从墙头漏进来)
    at(0, () => {
      const m = 8;
      face(dark, [V(X0 - m, ROOF, Z0 - m), V(X1 + m, ROOF, Z0 - m), V(X1 + m, ROOF, Z0), V(X0 - m, ROOF, Z0)], UP, [0.3, 0.3, 0.3], UV_WALL);
      face(dark, [V(X0 - m, ROOF, Z1), V(X1 + m, ROOF, Z1), V(X1 + m, ROOF, Z1 + m), V(X0 - m, ROOF, Z1 + m)], UP, [0.3, 0.3, 0.3], UV_WALL);
      face(dark, [V(X0 - m, ROOF, Z0), V(X0, ROOF, Z0), V(X0, ROOF, Z1), V(X0 - m, ROOF, Z1)], UP, [0.3, 0.3, 0.3], UV_WALL);
      face(dark, [V(X1, ROOF, Z0), V(X1 + m, ROOF, Z0), V(X1 + m, ROOF, Z1), V(X1, ROOF, Z1)], UP, [0.3, 0.3, 0.3], UV_WALL);
    });
    at(OC.x, () => {
      const a = OC.x - OC.half;
      const b = OC.x + OC.half;
      const c = OC.z - OC.half;
      const d = OC.z + OC.half;
      const T: Tint = [0.74, 0.76, 0.82];
      face(wall, [V(a, H, c), V(a, H, d), V(a, ROOF, d), V(a, ROOF, c)], NX, T, UV_WALL);
      face(wall, [V(b, H, c), V(b, H, d), V(b, ROOF, d), V(b, ROOF, c)], PX, T, UV_WALL);
      face(wall, [V(a, H, c), V(b, H, c), V(b, ROOF, c), V(a, ROOF, c)], NZ, T, UV_WALL);
      face(wall, [V(a, H, d), V(b, H, d), V(b, ROOF, d), V(a, ROOF, d)], PZ, T, UV_WALL);
      // 井口一圈石框 + 铁栅(五横五竖)
      for (const s of [-1, 1]) {
        rock.box(OC.half * 2 + 0.7, 0.3, 0.36, V(OC.x, H - 0.13, OC.z + s * (OC.half + 0.17)), V(0, 0, 0), [0.66, 0.67, 0.72], UV_ROCK, rnd, 0.04);
        rock.box(0.36, 0.3, OC.half * 2, V(OC.x + s * (OC.half + 0.17), H - 0.13, OC.z), V(0, 0, 0), [0.66, 0.67, 0.72], UV_ROCK, rnd, 0.04);
      }
      for (let i = 0; i < 5; i += 1) {
        const o = -OC.half + ((i + 0.5) * OC.half * 2) / 5;
        iron.box(0.06, 0.06, OC.half * 2, V(OC.x + o, H + 0.5, OC.z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.006);
        iron.box(OC.half * 2, 0.06, 0.06, V(OC.x, H + 0.56, OC.z + o), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.006);
      }
    });

    // ── 柱子(柱础、柱身分三段、柱头)、墙上的壁柱、横梁和纵梁 ──
    for (const px of PILLAR_X) {
      for (const pz of PILLAR_Z) {
        at(px, () => {
          rock.box(1.3, 0.34, 1.3, V(px, 0.17, pz), V(0, 0, 0), [0.74, 0.74, 0.78], UV_ROCK, rnd, 0.05, 0);
          rock.box(1.08, 0.2, 1.08, V(px, 0.44, pz), V(0, 0, 0), [0.8, 0.8, 0.84], UV_ROCK, rnd, 0.05);
          const drums = [1.55, 1.6, 1.61];
          let y = 0.54;
          drums.forEach((dh, i) => {
            wall.box(0.86 - (i === 1 ? 0.03 : 0), dh - 0.02, 0.86 - (i === 1 ? 0.03 : 0), V(px, y + dh / 2, pz), V(0, 0, 0), [0.92, 0.93, 0.97], UV_WALL, rnd, 0.045);
            y += dh;
          });
          rock.box(1.04, 0.16, 1.04, V(px, y + 0.08, pz), V(0, 0, 0), [0.82, 0.82, 0.86], UV_ROCK, rnd, 0.04);
          rock.box(1.28, 0.3, 1.28, V(px, y + 0.31, pz), V(0, 0, 0), [0.76, 0.76, 0.8], UV_ROCK, rnd, 0.06);
          // 柱身上一道铁箍 + 铁环
          iron.box(0.93, 0.09, 0.93, V(px, 2.2, pz), V(0, 0, 0), [0.6, 0.6, 0.62], UV_IRON, rnd, 0.01);
        });
        this.solids.push({ x: px, z: pz, hx: 0.66, hz: 0.66, h: H });
      }
      for (const [z, s] of [[Z0, 1], [Z1, -1]] as Array<[number, number]>) {
        at(px, () => {
          wall.box(1.0, H - 0.5, 0.42, V(px, (H - 0.5) / 2, z + s * 0.2), V(0, 0, 0), [0.9, 0.91, 0.95], UV_WALL, rnd, 0.04, 0);
          rock.box(1.2, 0.36, 0.56, V(px, 0.18, z + s * 0.26), V(0, 0, 0), [0.72, 0.72, 0.76], UV_ROCK, rnd, 0.05, 0);
        });
      }
      // 横梁:从北墙到南墙,压在柱头上
      at(px, () => {
        wall.box(0.78, 0.56, Z1 - Z0, V(px, H - 0.28, 0), V(0, 0, 0), [0.7, 0.71, 0.75], UV_WALL, rnd, 0.05);
      });
    }
    for (const pz of PILLAR_Z) {
      for (let b = 0; b < BAYS; b += 1) {
        const xa = X0 + ((X1 - X0) * b) / BAYS;
        const xb = X0 + ((X1 - X0) * (b + 1)) / BAYS;
        at((xa + xb) / 2, () => {
          wall.box(xb - xa, 0.44, 0.6, V((xa + xb) / 2, H - 0.22, pz), V(0, 0, 0), [0.66, 0.67, 0.71], UV_WALL, rnd, 0.05);
        });
      }
    }

    // ── 东头的石台:两级台阶,台上一口石棺、两块发光的符文石板(石板另挂材质,见后面)──
    at(DAIS.x + 1, () => {
      rock.box(X1 - DAIS.x + 0.5, 0.18, Z1 - Z0 - 1.6, V((X1 + DAIS.x) / 2 - 0.25, 0.09, 0), V(0, 0, 0), [0.78, 0.78, 0.82], UV_ROCK, rnd, 0.035, 0);
      rock.box(X1 - DAIS.x, 0.18, Z1 - Z0 - 2.6, V((X1 + DAIS.x) / 2 + 0.25, 0.27, 0), V(0, 0, 0), [0.84, 0.84, 0.88], UV_ROCK, rnd, 0.035);
      // 石棺:棺身 + 错开一点的棺盖 + 四角铜包角
      rock.box(2.5, 0.8, 1.15, V(10.3, DAIS.h + 0.4, 0), V(0, 0, 0), [0.7, 0.71, 0.76], UV_ROCK, rnd, 0.05, DAIS.h);
      rock.box(2.7, 0.22, 1.3, V(10.36, DAIS.h + 0.91, 0.12), V(0, 4, 0), [0.8, 0.8, 0.85], UV_ROCK, rnd, 0.06);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          bronze.box(0.2, 0.84, 0.2, V(10.3 + sx * 1.2, DAIS.h + 0.42, sz * 0.53), V(0, 0, 0), [0.62, 0.47, 0.25], 2.4, rnd, 0.015);
        }
      }
      // 符文石板的石座
      for (const sz of [-1, 1]) {
        rock.box(0.7, 0.3, 1.3, V(11.1, DAIS.h + 0.15, sz * 2.9), V(0, 0, 0), [0.66, 0.66, 0.7], UV_ROCK, rnd, 0.04, DAIS.h);
      }
    });
    this.solids.push({ x: 10.3, z: 0, hx: 1.4, hz: 0.75, h: 1.5 });

    // ── 火盆:三条腿的铁架 + 铁碗(碗里的炭和火另做)──
    for (const b of BRAZIERS) {
      at(b.x, () => {
        for (let i = 0; i < 3; i += 1) {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          iron.cylinder(0.028, 0.034, 1.02, 7, V(b.x + Math.cos(a) * 0.2, 0.5, b.z + Math.sin(a) * 0.2), V(Math.sin(a) * 13, 0, -Math.cos(a) * 13), [0.55, 0.55, 0.57], UV_IRON, rnd, 0, false);
        }
        iron.lathe([[0.1, 0.92], [0.3, 0.97], [0.44, 1.1], [0.48, 1.24], [0.44, 1.24], [0.4, 1.12], [0.1, 1.04]], 18, { den: UV_IRON, tint: [0.5, 0.5, 0.52], xf: xform([b.x, 0, b.z]) });
        iron.lathe([[0.2, 0.5], [0.23, 0.52], [0.2, 0.54]], 14, { den: UV_IRON, tint: [0.55, 0.55, 0.57], smooth: false, xf: xform([b.x, 0, b.z]) });
      });
      this.solids.push({ x: b.x, z: b.z, hx: 0.5, hz: 0.5, h: 1.4 });
    }

    // ── 水晶壁灯的铁托架(发光的晶条另做)──
    for (const L of LAMPS) {
      at(L.x, () => {
        const z = L.z + L.nz * 0.46;
        iron.box(1.5, 0.07, 0.16, V(L.x, 3.52, z + L.nz * 0.06), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.01);
        for (const s of [-1, 1]) {
          iron.box(0.07, 0.34, 0.2, V(L.x + s * 0.7, 3.66, z + L.nz * 0.05), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.01);
        }
      });
    }

    // ── 摆件:木箱、木桶、壁龛里的石座和陶瓮、天井下的铁篦子、几堆碎石 ──
    const crate = (x: number, y: number, z: number, s: number, yaw: number): void => {
      at(x, () => {
        const v = 0.7 + rnd() * 0.25;
        wood.box(s, s, s, V(x, y + s / 2, z), V(0, yaw, 0), [v, v * 0.96, v * 0.9], UV_WOOD, rnd, 0.012, y);
        // 四条竖边的铁包角 + 上下两道箍
        const c = Math.cos((yaw * Math.PI) / 180);
        const sn = Math.sin((yaw * Math.PI) / 180);
        for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const ox = (ax * s) / 2;
          const oz = (az * s) / 2;
          iron.box(0.07, s + 0.01, 0.07, V(x + ox * c + oz * sn, y + s / 2, z - ox * sn + oz * c), V(0, yaw, 0), [0.55, 0.55, 0.57], UV_IRON, rnd, 0.008);
        }
        for (const ky of [0.12, 0.88]) {
          iron.box(s + 0.02, 0.05, s + 0.02, V(x, y + s * ky, z), V(0, yaw, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.006);
        }
      });
      if (y < 0.1) {
        this.solids.push({ x, z, hx: s * 0.62, hz: s * 0.62, h: s });
      }
    };
    const barrel = (x: number, z: number, k = 1): void => {
      at(x, () => {
        const v = 0.62 + rnd() * 0.2;
        const tint: Tint = [v, v * 0.9, v * 0.78];
        wood.cylinder(0.37 * k, 0.3 * k, 0.5 * k, 16, V(x, 0.25 * k, z), V(0, rnd() * 360, 0), tint, UV_WOOD, rnd, 0);
        wood.cylinder(0.3 * k, 0.37 * k, 0.5 * k, 16, V(x, 0.75 * k, z), V(0, rnd() * 360, 0), tint, UV_WOOD, rnd);
        for (const [y, r] of [[0.14, 0.335], [0.5, 0.378], [0.86, 0.335]]) {
          iron.cylinder(r * k, r * k, 0.05 * k, 16, V(x, y * k, z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, undefined, false);
        }
      });
      this.solids.push({ x, z, hx: 0.42 * k, hz: 0.42 * k, h: k });
    };
    crate(-10.6, 0, 4.9, 1.0, 8);
    crate(-9.5, 0, 5.1, 0.82, -12);
    crate(-10.5, 1.0, 4.95, 0.74, 24);
    crate(-10.9, 0, 3.6, 0.7, 40);
    barrel(-8.5, 5.2);
    barrel(-11.1, -4.9, 1.1);
    barrel(-10.2, -5.1);
    crate(5.3, 0, -5.05, 0.9, 5);
    crate(4.4, 0, -5.2, 0.66, -20);
    barrel(1.3, 5.25);
    for (const x of ALCOVES_N) {
      at(x, () => {
        rock.box(1.5, 0.5, 0.6, V(x, 0.25, Z0 - 0.42), V(0, 0, 0), [0.7, 0.7, 0.74], UV_ROCK, rnd, 0.04, 0);
        bronze.lathe([[0.12, 0.5], [0.3, 0.62], [0.36, 0.95], [0.24, 1.3], [0.16, 1.42], [0.22, 1.5], [0.2, 1.52]], 20, { den: 2.2, tint: [0.42, 0.33, 0.2], xf: xform([x, 0, Z0 - 0.42]) });
      });
    }
    for (const x of ALCOVES_S) {
      at(x, () => {
        rock.box(2.0, 0.62, 0.66, V(x, 0.31, Z1 + 0.42), V(0, 0, 0), [0.68, 0.68, 0.72], UV_ROCK, rnd, 0.04, 0);
        rock.box(2.14, 0.14, 0.76, V(x, 0.69, Z1 + 0.42), V(0, 0, 0), [0.78, 0.78, 0.82], UV_ROCK, rnd, 0.04);
      });
    }
    at(RING.x, () => {
      // 铜环正中的铁篦子:一圈铁框 + 几根横条,盖在排水口上
      iron.lathe([[0.4, 0.004], [0.42, 0.03], [0.5, 0.03], [0.52, 0.004]], 24, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([RING.x, 0, RING.z]) });
      for (let i = -3; i <= 3; i += 1) {
        const len = 2 * Math.sqrt(0.42 * 0.42 - (i * 0.11) * (i * 0.11));
        iron.box(len, 0.024, 0.04, V(RING.x, 0.02, RING.z + i * 0.11), V(0, 0, 0), [0.45, 0.45, 0.47], UV_IRON, rnd, 0.004);
      }
    });
    for (const [x, z, n] of [[-11.2, -2.6, 6], [2.2, -5.3, 7], [11.2, 4.9, 5], [-4.6, 5.4, 5], [8.9, -5.2, 6]] as Array<[number, number, number]>) {
      at(x, () => {
        for (let i = 0; i < n; i += 1) {
          const v = 0.6 + rnd() * 0.25;
          const r = 0.1 + rnd() * 0.22;
          rock.rock(r, V(x + (rnd() - 0.5) * 1.3, r * 0.45, z + (rnd() - 0.5) * 0.8), [v, v, v * 1.04], UV_ROCK * 1.6, rnd, 0.7);
        }
      });
    }

    // ── 墙裙和腰线:沿两面长墙,让开壁龛、侧廊、壁柱 ──
    const SEG_N: Array<[number, number]> = [[-12, -10.25], [-7.75, -6.6], [-5.4, -4.25], [-1.75, -0.6], [0.6, 1.75], [4.25, 5.4], [6.6, DAIS.x - 0.3]];
    const SEG_S: Array<[number, number]> = [[-12, -10.25], [-7.75, -6.6], [-5.4, -4.25], [-1.75, -0.6], [0.6, HALL.x - HALL.half], [HALL.x + HALL.half, 5.4], [6.6, DAIS.x - 0.3]];
    const BAND: Array<[number, number]> = [[-12, -6.5], [-5.5, -0.5], [0.5, 5.5], [6.5, 12]];
    for (const [segs, z, s] of [[SEG_N, Z0, 1], [SEG_S, Z1, -1]] as Array<[Array<[number, number]>, number, number]>) {
      for (const [xa, xb] of segs) {
        at((xa + xb) / 2, () => {
          rock.box(xb - xa, 0.52, 0.2, V((xa + xb) / 2, 0.26, z + s * 0.1), V(0, 0, 0), [0.62, 0.63, 0.67], UV_ROCK, rnd, 0.035, 0);
        });
      }
      for (const [xa, xb] of BAND) {
        at((xa + xb) / 2, () => {
          rock.box(xb - xa, 0.2, 0.13, V((xa + xb) / 2, 4.42, z + s * 0.065), V(0, 0, 0), [0.66, 0.67, 0.71], UV_ROCK, rnd, 0.03);
        });
      }
    }
    // ── 烛台:柱子朝过道的一侧各立一座(铁架 + 三根蜡烛;火苗和光晕另做,不是真的灯)──
    const candleStand = (x: number, z: number): void => {
      at(x, () => {
        for (let i = 0; i < 3; i += 1) {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          iron.cylinder(0.014, 0.02, 0.34, 6, V(x + Math.cos(a) * 0.13, 0.13, z + Math.sin(a) * 0.13), V(-Math.sin(a) * 40, 0, Math.cos(a) * 40), [0.5, 0.5, 0.52], UV_IRON, rnd, 0, false);
        }
        iron.cylinder(0.018, 0.022, 1.25, 8, V(x, 0.86, z), V(0, 0, 0), [0.52, 0.52, 0.54], UV_IRON, rnd, undefined, false);
        iron.lathe([[0.02, 0.6], [0.05, 0.63], [0.02, 0.66]], 10, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([x, 0, z]) });
        iron.box(0.5, 0.025, 0.035, V(x, 1.44, z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.004);
        for (const o of [-0.23, 0, 0.23]) {
          const top = 1.48 + (o === 0 ? 0.2 : 0.06);
          iron.lathe([[0.02, 1.45], [0.05, 1.47], [0.045, 1.485]], 10, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([x + o, o === 0 ? 0.08 : 0, z]) });
          wax.cylinder(0.02, 0.022, top - 1.48 + (o === 0 ? 0.08 : 0) + 0.1, 8, V(x + o, (top + 1.48 + (o === 0 ? 0.08 : 0)) / 2 + 0.03, z), V(0, 0, 0), [0.86, 0.8, 0.66], 2, rnd);
          this.candles.push(new Vec3(x + o, top + (o === 0 ? 0.08 : 0) + 0.1, z));
        }
      });
      this.solids.push({ x, z, hx: 0.2, hz: 0.2, h: 1.6 });
    };
    const wax = new Sculpt();
    for (const [x, z] of [[-6, -2.15], [-6, 2.15], [0, -2.15], [0, 2.15], [6, -2.15], [6, 2.15]]) {
      candleStand(x + 0.75, z);
    }
    // ── 吊笼:从横梁上垂下一根铁链,挂一只空铁笼 ──
    at(2.9, () => {
      const cx = 2.9;
      const cz = -4.1;
      for (let i = 0; i < 9; i += 1) {
        iron.box(0.03, 0.2, 0.03, V(cx, H - 0.6 - i * 0.2, cz), V(0, i % 2 ? 90 : 0, 6 * (i % 2 ? 1 : -1)), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.004);
      }
      const y0 = 2.45;
      for (const y of [y0, y0 + 0.62, y0 + 1.24]) {
        iron.lathe([[0.4, y - 0.02], [0.43, y], [0.4, y + 0.02]], 18, { den: UV_IRON, tint: [0.5, 0.5, 0.52], smooth: false, xf: xform([cx, 0, cz]) });
      }
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        iron.cylinder(0.014, 0.014, 1.24, 6, V(cx + Math.cos(a) * 0.41, y0 + 0.62, cz + Math.sin(a) * 0.41), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, undefined, false);
      }
      iron.cylinder(0.02, 0.42, 0.34, 10, V(cx, y0 + 1.41, cz), V(0, 0, 0), [0.48, 0.48, 0.5], UV_IRON, rnd, undefined, false);
      iron.cylinder(0.43, 0.43, 0.025, 14, V(cx, y0 - 0.01, cz), V(0, 0, 0), [0.45, 0.45, 0.47], UV_IRON, rnd);
    });
    // ── 兵器架:北墙边,两根立柱两道横档,斜靠四杆长矛,旁边挂一面圆盾 ──
    at(-7.1, () => {
      const x0 = -7.6;
      const x1 = -6.72;
      const z = Z0 + 0.34;
      for (const x of [x0, x1]) {
        wood.box(0.08, 1.5, 0.08, V(x, 0.75, z), V(0, 0, 0), [0.6, 0.52, 0.42], UV_WOOD, rnd, 0.008, 0);
      }
      for (const y of [0.5, 1.36]) {
        wood.box(x1 - x0 + 0.16, 0.07, 0.06, V((x0 + x1) / 2, y, z + 0.02), V(0, 0, 0), [0.56, 0.48, 0.4], UV_WOOD, rnd, 0.008);
      }
      for (let i = 0; i < 4; i += 1) {
        const x = x0 + 0.12 + i * 0.215;
        wood.cylinder(0.016, 0.018, 2.1, 7, V(x, 1.04, z + 0.11), V(7, 0, (i - 1.5) * 1.5), [0.66, 0.56, 0.44], UV_WOOD, rnd, undefined, false);
        iron.cylinder(0.0, 0.03, 0.3, 6, V(x + (i - 1.5) * 0.028, 2.2, z - 0.02), V(7, 0, (i - 1.5) * 1.5), [0.72, 0.72, 0.76], UV_IRON, rnd, undefined, false);
      }
      bronze.lathe([[0.0, 0.1], [0.12, 0.09], [0.16, 0.04], [0.42, 0.02], [0.45, 0.0]], 24, { den: 2.4, tint: [0.5, 0.39, 0.22], xf: xform([-5.0, 1.75, Z0 + 0.03], [90, 0, 0]) });
    });
    // ── 倒下的一截柱子和碎块:北侧过道边 ──
    at(2.2, () => {
      wall.cylinder(0.43, 0.43, 1.45, 18, V(2.3, 0.43, -4.75), V(0, 28, 90), [0.86, 0.87, 0.9], UV_WALL * 2, rnd, 0);
      wall.cylinder(0.43, 0.4, 0.62, 18, V(0.95, 0.31, -5.1), V(6, -40, 4), [0.8, 0.81, 0.85], UV_WALL * 2, rnd, 0);
      for (let i = 0; i < 6; i += 1) {
        const v = 0.62 + rnd() * 0.2;
        const r = 0.09 + rnd() * 0.16;
        rock.rock(r, V(1.2 + rnd() * 2.2, r * 0.45, -4.2 + rnd() * 0.7), [v, v, v * 1.04], UV_ROCK * 1.6, rnd, 0.7);
      }
    });
    this.solids.push({ x: 2.3, z: -4.75, hx: 0.85, hz: 0.6, h: 0.9 }, { x: 0.95, z: -5.1, hx: 0.5, hz: 0.5, h: 0.7 });
    // ── 天井四角垂下的铁链(末端一只钩)──
    for (const [sx, sz, len] of [[-1, -1, 1.5], [1, -1, 1.1], [1, 1, 1.7], [-1, 1, 0.9]] as Array<[number, number, number]>) {
      at(OC.x, () => {
        const x = OC.x + sx * (OC.half - 0.08);
        const z = OC.z + sz * (OC.half - 0.08);
        const links = Math.round(len / 0.16);
        for (let i = 0; i < links; i += 1) {
          iron.box(0.026, 0.16, 0.026, V(x, H - 0.3 - i * 0.16, z), V(0, i % 2 ? 90 : 0, 5 * (i % 2 ? 1 : -1)), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.004);
        }
        iron.lathe([[0.0, 0], [0.045, 0.03], [0.03, 0.09], [0.012, 0.13]], 8, { den: UV_IRON, tint: [0.5, 0.5, 0.52], xf: xform([x, H - 0.3 - links * 0.16 - 0.1, z]) });
      });
    }
    // ── 旗幡:每根柱子朝过道的一面挂一幅(铁杆 + 旧布,下摆撕破)──
    const cloth = new Sculpt();
    for (const px of PILLAR_X) {
      for (const pz of PILLAR_Z) {
        const s = pz > 0 ? -1 : 1;
        const z = pz + s * 0.47;
        const seed = Math.round(px * 3 + pz * 7 + 40);
        at(px, () => {
          iron.box(0.8, 0.035, 0.035, V(px, 4.62, z), V(0, 0, 0), [0.5, 0.5, 0.52], UV_IRON, rnd, 0.005);
        });
        const rr = mulberry32(seed);
        const rag = [0, 1, 2, 3, 4, 5, 6].map(() => rr() * 0.3);
        const deep: Tint = seed % 2 ? [0.78, 0.13, 0.1] : [0.66, 0.1, 0.13];
        cloth.surf(6, 10, (u, v, out) => {
          const t = 1 - v;
          const tear = t > 0.99 ? rag[Math.round(u * 6)] : 0;
          out.set(px - 0.31 + u * 0.62, 4.6 - (2.2 - tear) * t, z + s * (0.012 + 0.03 * Math.sin(u * 6 + seed) * t + 0.02 * Math.sin(t * 7 + u * 3)));
        }, { den: 8, twoSided: true, tint: (u, v) => {
          const edge = u < 0.12 || u > 0.88 || v > 0.93;
          const mark = Math.abs(u - 0.5) < 0.1 && v > 0.42 && v < 0.74;          // 中间一道竖纹
          const k = 0.6 + 0.4 * v;
          return edge || mark ? [0.86 * k, 0.64 * k, 0.26 * k] : [deep[0] * k, deep[1] * k, deep[2] * k];
        } });
      }
    }

    // ── 按开间依次建:每个开间建完切一刀 ──
    for (let b = 0; b < BAYS; b += 1) {
      for (const j of jobs) {
        if (j.bay === b) {
          j.run();
        }
      }
      for (const batch of batches) {
        batch.split();
      }
    }

    // ── 材质(全部由代码生成)──
    const t1 = performance.now();
    const plan: FloorPlan = { x0: X0, z0: Z0, w: X1 - X0, d: Z1 - Z0, ring: RING, scorch: BRAZIERS.map((b) => ({ x: b.x, z: b.z, r: 1.3 })), wet: DUNGEON.wet };
    const floor = floorPbr(DUNGEON.floor, DUNGEON.floor / 2, plan);
    this.stats.floorMs = Math.round(performance.now() - t1);
    const std = (p: Pbr, repeat: boolean, aniso: number, vertexColor = true): Material => {
      const m = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true, USE_VERTEX_COLOR: vertexColor });
      m.setProperty('mainTexture', tex(p.albedo, repeat, aniso));
      m.setProperty('normalMap', tex(p.normal, repeat, aniso));
      m.setProperty('pbrMap', tex(p.orm, repeat, Math.min(4, aniso)));
      m.setProperty('occlusion', 1);
      m.setProperty('roughness', 1);
      m.setProperty('metallic', 1);
      return m;
    };
    const floorMat = std(floor, false, 16, false);
    floorMat.setProperty('normalStrength', DUNGEON.floorBump);
    floorMat.setProperty('roughness', DUNGEON.gloss);
    this.floorMat = floorMat;
    const wallMat = std(masonryPbr(1024), true, 8);
    const rockMat = std(rockPbr(512), true, 8);
    rockMat.setProperty('albedoScale', new Vec3(0.7, 0.72, 0.78));
    rockMat.setProperty('normalStrength', 0.6);
    const ironMat = std(ironPbr(256), true, 4);
    const woodMat = std(woodPbr(512), true, 8);
    woodMat.setProperty('albedoScale', new Vec3(0.78, 0.74, 0.7));
    const bronzeMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
    bronzeMat.setProperty('roughness', 0.38);
    bronzeMat.setProperty('metallic', 1);
    const darkMat = std(masonryPbr(256), true, 2);
    darkMat.setProperty('albedoScale', new Vec3(0.3, 0.3, 0.32));
    this.stats.texMs = Math.round(performance.now() - t1);

    // ── 网格 ──
    for (const m of MeshBatch.groundTiles(X0, Z0, X1 - X0, Z1 - Z0, 6, 3)) {
      const gn = addMesh(world, 'DgFloor', m, floorMat, false, true);
      gn.layer = GROUND_LAYER;
      this.groundNodes.push(gn);
    }
    let tris = 0;
    for (const [batch, mat, name] of [[wall, wallMat, 'DgWall'], [rock, rockMat, 'DgRock'], [iron, ironMat, 'DgIron'], [wood, woodMat, 'DgWood'], [bronze, bronzeMat, 'DgBronze'], [dark, darkMat, 'DgDark']] as Array<[MeshBatch, Material, string]>) {
      for (const m of batch.build()) {
        addMesh(world, name, m, mat, true, true);
      }
      tris += batch.triangles;
    }
    this.stats.sceneTris = tris;

    // ── 发光的东西:晶条、炭火、符文石板、门楣上的符文牌 ──
    const quad = MeshBatch.quad();
    const glowTex = tex(paintGlow(128, 2.2), false, 1);
    const halo = (x: number, y: number, z: number, size: number, color: Color, k: number): void => {
      const m = material('builtin-unlit', { USE_TEXTURE: true }, 2);
      m.setProperty('mainTexture', glowTex);
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      const n = addMesh(world, 'DgHalo', quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(size, size, 1);
      this.halos.push(n);
    };
    const emissive = (color: Color, k: number): Material => {
      const m = material('builtin-unlit', {});
      m.setProperty('mainColor', color);
      m.setProperty('colorScale', new Vec3(k, k, k));
      return m;
    };
    const rod = new Sculpt();
    for (const L of LAMPS) {
      rod.cylinder(0.045, 0.045, 1.24, 10, V(L.x, 3.66, L.z + L.nz * 0.52), V(0, 0, 90), [1, 1, 1], 1, rnd);
      halo(L.x, 3.66, L.z + L.nz * 0.56, 2.4, new Color(150, 200, 255, 255), 0.5);
    }
    const rodMat = emissive(new Color(190, 226, 255, 255), 7);
    for (const m of rod.build()) {
      addMesh(world, 'DgLampRod', m, rodMat, false, false);
    }
    const coal = new Sculpt();
    for (const b of BRAZIERS) {
      coal.cylinder(0.4, 0.42, 0.06, 14, V(b.x, 1.15, b.z), V(0, 0, 0), [1, 1, 1], 1, rnd);
      halo(b.x, 1.5, b.z, 2.6, new Color(255, 150, 70, 255), 0.55);
    }
    const coalMat = emissive(new Color(255, 96, 28, 255), 3.2);
    for (const m of coal.build()) {
      addMesh(world, 'DgCoal', m, coalMat, false, false);
    }
    const stele = (x: number, z: number, w: number, h: number, yaw: number, seed: number, color: Color, k: number, y0: number, rows: number): void => {
      const r = paintRunes(256, Math.round((256 * h) / w), seed, rows);
      const m = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_EMISSIVE_MAP: true });
      m.setProperty('mainTexture', tex(r.albedo, false, 4));
      m.setProperty('emissiveMap', tex(r.glow, false, 4));
      m.setProperty('emissive', color);
      m.setProperty('emissiveScale', new Vec3(k, k, k));
      m.setProperty('roughness', 0.5);
      m.setProperty('metallic', 0);
      const sc = new Sculpt();
      // 一块薄石板:正面按整张图贴,侧面和背面只取图的一个角(都是石面)
      const hw = w / 2;
      const t = 0.16;
      const P = (lx: number, ly: number, lz: number): Vec3 => {
        const c = Math.cos((yaw * Math.PI) / 180);
        const s = Math.sin((yaw * Math.PI) / 180);
        return new Vec3(x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c);
      };
      sc.facet([P(-hw, 0, t), P(hw, 0, t), P(hw, h, t), P(-hw, h, t)], [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1]);
      const side: Array<[number, number]> = [[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02]];
      sc.facet([P(hw, 0, -t), P(-hw, 0, -t), P(-hw, h, -t), P(hw, h, -t)], side, [1, 1, 1]);
      sc.facet([P(hw, 0, t), P(hw, 0, -t), P(hw, h, -t), P(hw, h, t)], side, [1, 1, 1]);
      sc.facet([P(-hw, 0, -t), P(-hw, 0, t), P(-hw, h, t), P(-hw, h, -t)], side, [1, 1, 1]);
      sc.facet([P(-hw, h, t), P(hw, h, t), P(hw, h, -t), P(-hw, h, -t)], side, [1, 1, 1]);
      for (const mesh of sc.build()) {
        addMesh(world, 'DgStele', mesh, m, true, true);
      }
    };
    // 石台两侧的符文石板(面朝大厅),绿光
    stele(11.1, -2.9, 1.0, 2.3, -90, 3, new Color(30, 255, 120, 255), 0.85, DAIS.h + 0.3, 5);
    stele(11.1, 2.9, 1.0, 2.3, -90, 8, new Color(30, 255, 120, 255), 0.85, DAIS.h + 0.3, 5);
    halo(10.8, DAIS.h + 1.5, -2.9, 3.0, new Color(60, 255, 140, 255), 0.2);
    halo(10.8, DAIS.h + 1.5, 2.9, 3.0, new Color(60, 255, 140, 255), 0.2);
    // 铁栅门上方的符文牌(面朝大厅),红光
    stele(X0 + 0.62, 0, 2.6, 0.62, 90, 5, new Color(255, 34, 22, 255), 1.3, GATE.h + 0.72, 1);
    halo(X0 - 0.9, 2.0, 0, 4.6, new Color(255, 50, 36, 255), 0.26);

    // ── 月光的光柱:沿光的方向从天井拉到地面的几片叠加色的面(横竖各三片,叠出体积感)──
    const shaft = new Sculpt();
    const sx = (MOON_DIR.x / -MOON_DIR.y) * H;
    const sz = (MOON_DIR.z / -MOON_DIR.y) * H;
    const sheet = (ax: number, az: number, bx: number, bz: number): void => {
      const p = [V(ax, H, az), V(bx, H, bz), V(bx + sx, 0, bz + sz), V(ax + sx, 0, az + sz)];
      const uv: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
      shaft.facet(p, uv, [1, 1, 1]);
      shaft.facet([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1]);
    };
    for (const o of [-0.72, 0, 0.72]) {
      sheet(OC.x - OC.half, OC.z + o, OC.x + OC.half, OC.z + o);
      sheet(OC.x + o, OC.z - OC.half, OC.x + o, OC.z + OC.half);
    }
    const sm = material('builtin-unlit', { USE_TEXTURE: true }, 2);
    sm.setProperty('mainTexture', tex(paintShaft(128, 256), false, 2));
    sm.setProperty('mainColor', new Color(150, 186, 255, 255));
    this.shaftMat = sm;
    for (const m of shaft.build()) {
      addMesh(world, 'DgShaft', m, sm, false, false);
    }

    // ── 旗幡、蜡烛 ──
    const cl = paintCloth(256, 48);
    const clothMat = material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    clothMat.setProperty('mainTexture', tex(cl.albedo, true, 4));
    clothMat.setProperty('normalMap', tex(cl.normal, true, 4));
    clothMat.setProperty('roughness', 0.88);
    clothMat.setProperty('metallic', 0);
    for (const m of cloth.build()) {
      addMesh(world, 'DgBanner', m, clothMat, true, true);
    }
    const waxMat = material('builtin-standard', { USE_VERTEX_COLOR: true });
    waxMat.setProperty('roughness', 0.55);
    waxMat.setProperty('metallic', 0);
    for (const m of wax.build()) {
      addMesh(world, 'DgWax', m, waxMat, true, true);
    }
    for (const c of this.candles) {
      halo(c.x, c.y + 0.06, c.z, 0.85, new Color(255, 176, 96, 255), 0.75);
    }
    // ── 墙上的污渍:墙脚往上一圈、天花板往下一圈(盖在墙面前的半透明暗色,不平铺出重复:每段取贴图的不同位置)──
    const grime = new Sculpt();
    const stain = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number, flip: boolean, off: number): void => {
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = off;
      const u1 = off + len / 4.5;
      const p = [V(ax, y0, az), V(bx, y0, bz), V(bx, y1, bz), V(ax, y1, az)];
      const uv: Array<[number, number]> = flip ? [[u0, 0], [u1, 0], [u1, 1], [u0, 1]] : [[u0, 1], [u1, 1], [u1, 0], [u0, 0]];
      grime.facet(p, uv, [1, 1, 1]);
      grime.facet([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1]);
    };
    const E = 0.014;
    let off = 0;
    for (const [segs, z, s] of [[SEG_N, Z0, 1], [SEG_S, Z1, -1]] as Array<[Array<[number, number]>, number, number]>) {
      for (const [xa, xb] of segs) {
        stain(xa, z + s * (0.2 + E), xb, z + s * (0.2 + E), 0, 0.52, false, off);       // 墙裙正面
        stain(xa, z + s * E, xb, z + s * E, 0.52, 2.3, false, off);
        off += 0.37;
      }
      for (const [xa, xb] of BAND) {
        stain(xa, z + s * E, xb, z + s * E, 4.56, H, true, off);
        off += 0.41;
      }
    }
    stain(X1 - E, Z0, X1 - E, Z1, DAIS.h, 2.4, false, 0.2);
    stain(X1 - E, Z0, X1 - E, Z1, 4.5, H, true, 0.6);
    stain(X0 + E, Z0, X0 + E, -GATE.half - 0.5, 0, 2.3, false, 0.9);
    stain(X0 + E, GATE.half + 0.5, X0 + E, Z1, 0, 2.3, false, 1.3);
    stain(X0 + E, Z0, X0 + E, Z1, 4.9, H, true, 1.7);
    const grimeMat = material('builtin-unlit', { USE_TEXTURE: true }, 3);
    grimeMat.setProperty('mainTexture', tex(paintGrime(256), true, 4));
    grimeMat.setProperty('mainColor', new Color(9, 8, 8, 120));
    for (const m of grime.build()) {
      addMesh(world, 'DgGrime', m, grimeMat, false, false);
    }
    // ── 壁灯下面的光锥:贴着墙往下、往外散开的两片叠加色的面 ──
    const cone = new Sculpt();
    for (const L of LAMPS) {
      const z0 = L.z + L.nz * 0.55;
      const fan = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): void => {
        const p = [V(ax, 3.62, az), V(bx, 3.62, bz), V(cx, 0.05, cz), V(dx, 0.05, dz)];
        const uv: Array<[number, number]> = [[0.2, 0.02], [0.8, 0.02], [1, 1], [0, 1]];
        cone.facet(p, uv, [1, 1, 1]);
        cone.facet([p[1], p[0], p[3], p[2]], [uv[1], uv[0], uv[3], uv[2]], [1, 1, 1]);
      };
      fan(L.x - 0.6, z0, L.x + 0.6, z0, L.x + 2.3, z0 + L.nz * 1.5, L.x - 2.3, z0 + L.nz * 1.5);
      fan(L.x, z0 - L.nz * 0.3, L.x, z0 + L.nz * 0.3, L.x, z0 + L.nz * 3.4, L.x, z0 - L.nz * 0.35);
    }
    const coneMat = material('builtin-unlit', { USE_TEXTURE: true }, 2);
    coneMat.setProperty('mainTexture', tex(paintShaft(128, 256), false, 2));
    coneMat.setProperty('mainColor', new Color(150, 200, 255, 255));
    this.coneMat = coneMat;
    for (const m of cone.build()) {
      addMesh(world, 'DgLampCone', m, coneMat, false, false);
    }

    // ── 灯 ──
    const point = (kind: string, x: number, y: number, z: number, color: Color, range: number): PointLight => {
      const n = new Node(`DgLight_${kind}`);
      world.addChild(n);
      n.setPosition(x, y, z);
      const L = n.addComponent(PointLight);
      L.color = color;
      L.range = range;
      L.luminousFlux = 0;
      this.lights[kind].push(L);
      return L;
    };
    for (const L of LAMPS) {
      // 一盏点光照亮灯周围的墙,一盏往下打的聚光(带投影)照地面
      point('lamp', L.x, 3.6, L.z + L.nz * 0.78, new Color(150, 204, 255, 255), 6.5);
      const sn = new Node('DgLampSpot');
      world.addChild(sn);
      sn.setPosition(L.x, 3.6, L.z + L.nz * 0.7);
      sn.lookAt(new Vec3(L.x, 0, L.z + L.nz * 3.3));
      const S = sn.addComponent(SpotLight);
      S.color = new Color(150, 204, 255, 255);
      S.range = 11;
      S.spotAngle = 112;
      S.luminousFlux = 0;
      this.spots.push(S);
    }
    BRAZIERS.forEach((b, i) => {
      const L = point('brazier', b.x, 1.9, b.z, new Color(255, 146, 72, 255), 7.5);
      this.flickers.push({ light: L, base: 1, seed: i * 3.7, amp: 0.16 });
    });
    point('gate', X0 - 0.9, 2.1, 0, new Color(255, 52, 38, 255), 9);
    point('rune', 10.2, DAIS.h + 1.5, 0, new Color(60, 255, 140, 255), 7);
    const torch = point('torch', HALL.x + 0.4, 1.9, Z1 + HALL.depth - 1.1, new Color(255, 132, 56, 255), 9);
    this.flickers.push({ light: torch, base: 1, seed: 9.1, amp: 0.22 });
    for (let i = 0; i < 2; i += 1) {
      const L = point('hit', 0, 1.2, 0, new Color(255, 214, 160, 255), 4.5);
      L.node.active = false;
    }
    point('fill', this.lx, 2.6, this.lz, new Color(214, 226, 255, 255), 4.6);
    point('bounce', RING.x, 1.4, RING.z, new Color(150, 190, 255, 255), 7.5);
    for (let i = 1; i < this.candles.length; i += 3) {
      const c = this.candles[i];      // 每座烛台三根蜡烛,取中间那根的位置
      const L = point('candle', c.x, c.y + 0.12, c.z, new Color(255, 170, 92, 255), 3.8);
      this.flickers.push({ light: L, base: 1, seed: i * 1.9, amp: 0.1 });
    }
    // 月光:投影的范围以房间正中为心,要罩住整间房 —— 范围外的东西不进投影图,会被月光直接照到
    const moonNode = new Node('DgMoon');
    world.addChild(moonNode);
    moonNode.setPosition(-MOON_DIR.x * 40, -MOON_DIR.y * 40, -MOON_DIR.z * 40);
    moonNode.lookAt(new Vec3(0, 0, 0));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.color = new Color(168, 198, 255, 255);
    moon.illuminance = DUNGEON.moon;
    this.moon = moon;

    // ── 相机、特效 ──
    const camNode = new Node('DgCamera');
    world.addChild(camNode);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fovAxis = Camera.FOVAxis.VERTICAL;
    cam.near = 0.12;
    cam.far = 90;
    cam.priority = -1;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(4, 5, 8, 255);
    cam.visibility = Layers.Enum.DEFAULT | GROUND_LAYER;
    this.cam = cam;
    this.fx = new FxWorld(world, { min: [X0 - 4, -1, Z0 - 5], max: [X1 + 1, ROOF, Z1 + 5] });
    this.loadChars();
    this.stats.buildMs = Math.round(performance.now() - t0);
  }

  // ───────────────────────── 角色 ─────────────────────────
  private loadChars(): void {
    const keys = charKeys();
    const spawn = (key: string, x: number, z: number, height: number, yaw: number, done: (c: G3DChar) => void, procWalk = false): void => {
      if (keys.indexOf(key) < 0) {
        return;
      }
      loadChar(key, (tpl) => {
        if (!tpl || !this.world || !this.world.isValid) {
          return;
        }
        const c = G3DChar.spawn(tpl, this.world, { at: new Vec3(x, 0, z), height, yaw, baked: false, albedo: 0.9, procWalk, inPlace: true });
        c.seed = x * 1.7 + z;
        this.stats.charTris = (this.stats.charTris ?? 0) + c.tris;
        done(c);
      });
    };
    spawn('hero_m', this.lx, this.lz, 1.78, 0, (c) => {
      this.leader = c;
      c.play(c.clip('idle'), 0);
    });
    spawn('hero_f', this.lx - 0.9, this.lz + 0.9, 1.68, 0, (c) => {
      this.followers.push({ c, x: this.lx - 0.9, z: this.lz + 0.9, yaw: 0, moving: false, ox: -0.9, oz: 0.9 });
      c.play(c.clip('idle'), 0);
    });
    const mob = (key: string, x: number, z: number, height: number, hp: number, speed: number, reach: number, radius: number, procWalk = false): void => {
      spawn(key, x, z, height, 180, (c) => {
        const m: Mob = { c, home: new Vec3(x, 0, z), x, z, yaw: 180, hp, maxHp: hp, speed, reach, radius, state: 'idle', t: this.rnd() * 3, cool: 0, wander: 1 + this.rnd() * 3, tx: x, tz: z };
        this.mobs.push(m);
        this.rest(m);
      }, procWalk);
    };
    mob('rat', -0.6, -1.6, 0.46, 2, 2.3, 0.9, 0.35);
    mob('rat', 0.5, -2.3, 0.42, 2, 2.4, 0.9, 0.35);
    mob('rat', 1.2, -1.2, 0.5, 2, 2.2, 0.9, 0.35);
    mob('wolf', 3.2, 1.9, 0.98, 4, 2.9, 1.2, 0.5);
    mob('wolf', 4.6, 0.6, 1.06, 4, 2.8, 1.2, 0.5);
    mob('spider2', 3.6, 4.4, 0.74, 3, 2.0, 1.1, 0.5);
    mob('bear', 6.4, -2.2, 1.62, 7, 1.7, 1.6, 0.8, true);
    mob('rotbear', 7.6, 0.4, 2.3, 12, 1.4, 1.9, 1.0);
  }

  /** 怪站着不动:有待机动作就播,没有就站在绑定姿势上(叠呼吸)。 */
  private rest(m: Mob): void {
    const idle = m.c.clip('idle');
    if (idle) {
      if (m.c.cur !== idle) {
        m.c.play(idle, 0.2);
      }
    } else if (!m.c.rest || m.c.pwalk) {
      m.c.toRest(false);
    }
  }

  private walk(m: Mob): void {
    const w = m.c.procWalk ? '' : m.c.clip('walk') || m.c.clip('run');
    if (w) {
      if (m.c.cur !== w) {
        m.c.play(w, 0.2);
      }
    } else if (!m.c.pwalk) {
      m.c.toRest(true);
    }
  }

  // ───────────────────────── 接管画面 ─────────────────────────
  private takeOver(): void {
    const scene = director.getScene()!;
    const canvas = scene.getComponentInChildren(Canvas);
    const uiCam = canvas?.cameraComponent ?? null;
    const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    const mainLight = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) ?? null;
    const amb = scene.globals.ambient;
    const sh = scene.globals.shadows;
    const sky = scene.globals.skybox;
    this.saved = { uiCam, mainCam, mainLight };
    for (const c of [uiCam, mainCam]) {
      if (c) {
        c.enabled = false;
      }
    }
    if (mainLight) {
      mainLight.enabled = false;
    }
    // 界面相机关了,但界面节点还在收点击(登录页的按钮):盖一层挡住
    if (canvas && !this.blocker) {
      const b = new Node('DgBlockInput');
      const ui = b.addComponent(UITransform);
      ui.setContentSize(8000, 8000);
      b.addComponent(BlockInputEvents);
      canvas.node.addChild(b);
      this.blocker = b;
    }
    amb.skyLightingColor = new Color(70, 92, 140, 255);
    amb.groundLightingColor = new Color(46, 36, 30, 255);
    amb.skyIllum = DUNGEON.ambient;
    try {
      // 环境反射:很暗的房间 + 几团灯的方向(铁、铜、湿石头靠它才有反光)
      const lobes = [
        { dir: [OC.x, 9, OC.z] as [number, number, number], color: [0.9, 1.1, 1.5] as [number, number, number], width: 0.2 },
        ...LAMPS.map((L) => ({ dir: [L.x, 2, L.z] as [number, number, number], color: [0.5, 0.75, 1.0] as [number, number, number], width: 0.18 })),
        ...BRAZIERS.map((b) => ({ dir: [b.x, 0.6, b.z] as [number, number, number], color: [1.2, 0.5, 0.16] as [number, number, number], width: 0.26 })),
        { dir: [X0, 1, 0] as [number, number, number], color: [1.1, 0.14, 0.08] as [number, number, number], width: 0.24 },
        { dir: [X1, 1, 0] as [number, number, number], color: [0.16, 0.9, 0.4] as [number, number, number], width: 0.22 },
      ];
      sky.envmap = buildEnvCube(lobes, [0.02, 0.025, 0.035], [0.03, 0.035, 0.045], [0.02, 0.02, 0.022], 64);
      (sky as any).envLightingType = 1;
    } catch (error) {
      console.warn('[g3dd] env cube', error);
    }
    sh.enabled = DUNGEON.shadow > 0;
    if (DUNGEON.shadow > 0) {
      const moon = this.moon!;
      sh.type = renderer.scene.ShadowType.ShadowMap;
      sh.shadowMapSize = DUNGEON.shadow;
      moon.shadowEnabled = true;
      moon.shadowPcf = renderer.scene.PCFType.SOFT_2X;
      moon.shadowBias = 0.0004;
      moon.shadowNormalBias = 0.02;
      moon.shadowFixedArea = true;
      moon.shadowNear = 1;
      moon.shadowFar = 90;
      moon.shadowOrthoSize = 17;
    }
    this.applyLights();
    // 后期:沿用野外那套,数值按「暗房间、亮灯」重新给
    const cfg: PostCfg = { ...POST_CFG,
      aoRadius: 0.55, aoIntensity: 1.9, aoStrength: 0.86, aoTint: [0.04, 0.05, 0.08],
      bloomThreshold: 1.0, bloomIntensity: 0.78, bloomScatter: 0.82,
      exposure: 0.96, contrast: 1.17, pivot: 0.18, toe: 0.05, saturation: 1.1, shoulder: 0.72,
      shadowTint: [0.94, 1.0, 1.08], highlightTint: [1.04, 1.0, 0.96],
      vignette: 0.34, vignetteStart: 0.45, vignetteEnd: 1.1,
      fog: true, fogColor: [0.055, 0.085, 0.14], fogAway: [0.055, 0.085, 0.14], fogStart: 2, fogDensity: 0.075, fogMax: 0.66, fogLobe: 0 };
    this.post = new FieldPost(this.cam!, cfg);
    if (DUNGEON.post > 0) {
      this.post.enable(DUNGEON.post);
    }
    this.applyReflection();
    this.syncCam(0);
  }

  applyLights(): void {
    const k = DUNGEON.fluxK;
    const set = (kind: string, v: number): void => {
      for (const L of this.lights[kind]) {
        L.luminousFlux = v * k;
      }
    };
    set('lamp', DUNGEON.lamp);
    set('brazier', DUNGEON.brazier);
    set('gate', DUNGEON.gate);
    set('rune', DUNGEON.rune);
    set('torch', DUNGEON.torch);
    set('candle', DUNGEON.candle);
    set('fill', DUNGEON.fill);
    set('bounce', DUNGEON.bounce);
    for (const S of this.spots) {
      S.luminousFlux = DUNGEON.lampSpot * k;
      S.shadowEnabled = DUNGEON.spotShadow;
      if (DUNGEON.spotShadow) {
        S.shadowPcf = renderer.scene.PCFType.SOFT_2X;
        S.shadowBias = 0.0005;
        S.shadowNormalBias = 0.02;
      }
    }
    this.coneMat?.setProperty('colorScale', new Vec3(DUNGEON.cone, DUNGEON.cone, DUNGEON.cone));
    this.floorMat?.setProperty('normalStrength', DUNGEON.floorBump);
    if (this.moon) {
      this.moon.illuminance = DUNGEON.moon;
    }
    director.getScene()!.globals.ambient.skyIllum = DUNGEON.ambient;
    this.shaftMat?.setProperty('colorScale', new Vec3(DUNGEON.shaft, DUNGEON.shaft, DUNGEON.shaft));
    this.floorMat?.setProperty('roughness', DUNGEON.gloss);
  }

  applyReflection(): void {
    const RP: any = js.getClassByName('cc.ReflectionProbe');
    if (!RP) {
      return;
    }
    if (DUNGEON.reflect && !this.probeNode) {
      const pn = new Node('DgProbe');
      this.world!.addChild(pn);
      pn.setPosition(0, 0, 0);
      const probe: any = pn.addComponent(RP);
      probe.sourceCamera = this.cam;
      probe.probeType = renderer.scene.ProbeType.PLANAR;
      probe.visibility = Layers.Enum.DEFAULT;
      this.probeNode = pn;
    }
    if (this.probeNode) {
      this.probeNode.active = DUNGEON.reflect;
    }
    for (const n of this.groundNodes) {
      (n.getComponent(MeshRenderer) as any).bakeSettings.reflectionProbe = DUNGEON.reflect ? 2 : 0;
    }
  }

  // ───────────────────────── 输入 ─────────────────────────
  private bindInput(): void {
    input.on(Input.EventType.KEY_DOWN, (e: EventKeyboard) => {
      this.keys.add(e.keyCode);
      if (e.keyCode === KeyCode.KEY_J) {
        this.attack();
      }
    });
    input.on(Input.EventType.KEY_UP, (e: EventKeyboard) => {
      this.keys.delete(e.keyCode);
    });
    input.on(Input.EventType.MOUSE_DOWN, (e: EventMouse) => {
      if (e.getButton() === EventMouse.BUTTON_RIGHT) {
        this.drag = { x: e.getLocationX(), y: e.getLocationY() };
      } else if (e.getButton() === EventMouse.BUTTON_LEFT) {
        this.attack();
      }
    });
    input.on(Input.EventType.MOUSE_UP, () => {
      this.drag = null;
    });
    input.on(Input.EventType.MOUSE_MOVE, (e: EventMouse) => {
      if (!this.drag) {
        return;
      }
      const k = 1920 / Math.max(640, game.canvas ? game.canvas.width : 1920);
      this.view.yaw -= (e.getLocationX() - this.drag.x) * 0.22 * k;
      this.view.pitch = Math.max(-4, Math.min(70, this.view.pitch - (e.getLocationY() - this.drag.y) * 0.16 * k));
      this.drag = { x: e.getLocationX(), y: e.getLocationY() };
    });
    input.on(Input.EventType.MOUSE_WHEEL, (e: EventMouse) => {
      this.view.dist = Math.max(1.6, Math.min(11, this.view.dist * (e.getScrollY() > 0 ? 0.9 : 1.1)));
    });
    try {
      game.canvas?.addEventListener('contextmenu', (ev) => ev.preventDefault());
    } catch (error) {
      // 没有画布(原生):不管
    }
  }

  attack(): boolean {
    if (!this.leader || this.attackT >= 0) {
      return false;
    }
    this.attackT = 0;
    this.attackHit = false;
    // 出手前转向最近的怪(2.8 米以内有的话)
    let best: Mob | null = null;
    let bd = 2.8;
    for (const m of this.mobs) {
      const d = Math.hypot(m.x - this.lx, m.z - this.lz) - m.radius;
      if (m.state !== 'down' && m.state !== 'gone' && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) {
      this.lyaw = (Math.atan2(-(best.z - this.lz), best.x - this.lx) * 180) / Math.PI;
      this.leader.place(this.lx, 0, this.lz, this.lyaw);
    }
    const clip = this.leader.clip('slash');
    if (clip) {
      this.leader.play(clip, 0.06, false);
    }
    return true;
  }

  // ───────────────────────── 每帧 ─────────────────────────
  private blocked(x: number, z: number, r: number): boolean {
    if (x < X0 + r || x > X1 - r || z < Z0 + r || z > Z1 - r) {
      // 侧廊和门洞不让进(小样只做了这一间)
      return true;
    }
    if (x > DAIS.x - r - 0.2) {
      return true;      // 石台不上
    }
    for (const s of this.solids) {
      if (Math.abs(x - s.x) < s.hx + r && Math.abs(z - s.z) < s.hz + r) {
        return true;
      }
    }
    return false;
  }

  /** 从 (ox, oy, oz) 沿方向 d 走,最远走多远不撞墙 / 柱子 / 天花板(米)。 */
  private reach(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    let t = max;
    const slab = (o: number, d: number, lo: number, hi: number): void => {
      if (d > 1e-5) {
        t = Math.min(t, (hi - o) / d);
      } else if (d < -1e-5) {
        t = Math.min(t, (lo - o) / d);
      }
    };
    slab(ox, dx, X0 + 0.35, X1 - 0.35);
    slab(oy, dy, 0.25, H - 0.75);
    slab(oz, dz, Z0 + 0.35, Z1 - 0.35);
    for (const s of this.solids) {
      // 射线和盒子(水平两个方向 + 高度)求交
      let t0 = 0;
      let t1 = t;
      const axis = (o: number, d: number, lo: number, hi: number): boolean => {
        if (Math.abs(d) < 1e-6) {
          return o > lo && o < hi;
        }
        let a = (lo - o) / d;
        let b = (hi - o) / d;
        if (a > b) {
          const c = a;
          a = b;
          b = c;
        }
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (axis(ox, dx, s.x - s.hx - 0.2, s.x + s.hx + 0.2) && axis(oz, dz, s.z - s.hz - 0.2, s.z + s.hz + 0.2) && axis(oy, dy, -1, s.h + 0.2)) {
        t = Math.min(t, t0);
      }
    }
    return Math.max(0, t);
  }

  private syncCam(dt: number): void {
    const cam = this.cam;
    if (!cam) {
      return;
    }
    cam.fov = this.view.fov;
    if (this.free) {
      cam.node.setPosition(this.free.pos);
      cam.node.lookAt(this.free.look);
      return;
    }
    const a = (this.view.yaw * Math.PI) / 180;
    const p = (this.view.pitch * Math.PI) / 180;
    this.look.set(this.lx, 1.25, this.lz);
    const dx = Math.sin(a) * Math.cos(p);
    const dy = Math.sin(p);
    const dz = Math.cos(a) * Math.cos(p);
    const can = this.reach(this.look.x, this.look.y, this.look.z, dx, dy, dz, this.view.dist);
    const want = Math.max(Math.min(1.2, this.view.dist), can - 0.15);
    this.pull = want < this.pull || dt <= 0 ? want : Math.min(want, this.pull + (want - this.pull) * (1 - Math.exp(-4 * dt)) + 0.001);
    const d = Math.min(this.view.dist, this.pull);
    cam.node.setPosition(this.look.x + dx * d, this.look.y + dy * d, this.look.z + dz * d);
    cam.node.lookAt(this.look);
  }

  private tick(): void {
    if (!this.opened || !this.world) {
      return;
    }
    const dt = this.frozen ? 0 : this.fixedDt > 0 ? this.fixedDt : Math.min(0.05, game.deltaTime);
    this.time += dt;
    const t = this.time;
    const R = (a: number, b: number): number => a + (b - a) * this.rnd();
    const fx = this.fx!;
    if (dt > 0) {
      this.stepLeader(dt);
      this.stepFollowers(dt);
      this.stepMobs(dt);
      // 火:火盆的火苗和火星、侧廊的火把
      for (const b of BRAZIERS) {
        for (let i = 0; i < 2; i += 1) {
          fx.emit({ x: b.x + R(-0.2, 0.2), y: 1.18 + R(0, 0.08), z: b.z + R(-0.2, 0.2), vx: R(-0.12, 0.12), vy: R(0.9, 1.7), life: R(0.4, 0.7), s0: R(0.26, 0.38), s1: 0.08,
            c0: [1, 0.72, 0.32], c1: [0.9, 0.16, 0.03], a: 0.5, cell: R(0, 1) < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.25, 0.25), drag: 0.3, fadeIn: 0.15 });
        }
        if (R(0, 1) < 0.2) {
          fx.emit({ x: b.x + R(-0.15, 0.15), y: 1.35, z: b.z + R(-0.15, 0.15), vx: R(-0.35, 0.35), vy: R(1.2, 2.6), vz: R(-0.35, 0.35), life: R(1.0, 2.0), s0: 0.018, s1: 0.006,
            c0: [1, 0.62, 0.22], c1: [1, 0.2, 0.04], cell: FX_CELL.ember, grav: -0.04, drag: 0.5, stretch: 0.9 });
        }
      }
      fx.emit({ x: HALL.x + 0.4 + R(-0.05, 0.05), y: 1.72, z: Z1 + HALL.depth - 0.5 + R(-0.05, 0.05), vy: R(0.7, 1.3), life: R(0.3, 0.55), s0: R(0.2, 0.3), s1: 0.06,
        c0: [1, 0.7, 0.3], c1: [0.9, 0.16, 0.03], a: 0.55, cell: R(0, 1) < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.25, 0.25), drag: 0.3, fadeIn: 0.15 });
      // 蜡烛的火苗(很小的一撮,每根隔几帧补一片)
      for (const c of this.candles) {
        if (R(0, 1) < 0.6) {
          fx.emit({ x: c.x + R(-0.004, 0.004), y: c.y + 0.03, z: c.z + R(-0.004, 0.004), vy: R(0.12, 0.22), life: R(0.28, 0.42), s0: R(0.075, 0.095), s1: 0.025,
            c0: [1, 0.8, 0.44], c1: [1, 0.32, 0.06], a: 0.9, cell: R(0, 1) < 0.5 ? FX_CELL.flameA : FX_CELL.flameB, rot: R(-0.15, 0.15), drag: 0.2, fadeIn: 0.2 });
        }
      }
      // 光柱里的浮尘
      if (R(0, 1) < 0.6) {
        const k = R(0, 1);
        const sx = (MOON_DIR.x / -MOON_DIR.y) * H * k;
        const sz = (MOON_DIR.z / -MOON_DIR.y) * H * k;
        fx.emit({ x: OC.x + sx + R(-1.1, 1.1), y: H * (1 - k), z: OC.z + sz + R(-1.1, 1.1), vx: R(-0.05, 0.05), vy: R(-0.12, 0.04), vz: R(-0.05, 0.05), life: R(3, 6), s0: R(0.012, 0.022), s1: 0.008,
          c0: [0.75, 0.86, 1], a: 0.5, cell: FX_CELL.mote, drag: 0.1, fadeIn: 0.3 });
      }
      for (const f of this.flickers) {
        const n = 0.5 * Math.sin(t * 9.7 + f.seed) + 0.3 * Math.sin(t * 23.1 + f.seed * 2.3) + 0.2 * Math.sin(t * 41.7 + f.seed * 5.1);
        const kind = this.lights.brazier.indexOf(f.light) >= 0 ? DUNGEON.brazier : this.lights.candle.indexOf(f.light) >= 0 ? DUNGEON.candle : DUNGEON.torch;
        f.light.luminousFlux = kind * DUNGEON.fluxK * (1 + f.amp * n);
      }
      for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
        const p = this.pulses[i];
        p.age += dt;
        const k = Math.max(0, 1 - p.age / p.life);
        p.light.luminousFlux = p.peak * k * k;
        if (p.age >= p.life) {
          p.light.node.active = false;
          this.pulses.splice(i, 1);
        }
      }
    }
    this.syncCam(dt);
    const camNode = this.cam!.node;
    // 补光跟着主角:放在镜头这一侧、头顶偏后
    const fill = this.lights.fill[0];
    if (fill) {
      camNode.getWorldPosition(_v);
      const fd = Math.max(0.5, Math.hypot(_v.x - this.lx, _v.z - this.lz));
      fill.node.setPosition(this.lx + ((_v.x - this.lx) / fd) * 1.4, 2.7, this.lz + ((_v.z - this.lz) / fd) * 1.4);
    }
    // 角色脚下的接地影(只有月光有投影,别的灯下靠这一团压住脚)
    if (this.leader) {
      fx.blob(this.lx, this.lz, 0.42, 0.55);
    }
    for (const f of this.followers) {
      fx.blob(f.x, f.z, 0.4, 0.55);
    }
    for (const m of this.mobs) {
      if (m.state !== 'gone') {
        fx.blob(m.x, m.z, m.radius * 1.25, 0.55);
      }
    }
    camNode.getWorldRotation(_q);
    for (const h of this.halos) {
      h.setWorldRotation(_q);
    }
    fx.update(dt, camNode);
  }

  private afterUpdate(): void {
    if (!this.opened) {
      return;
    }
    this.leader?.pose(this.time);
    for (const f of this.followers) {
      f.c.pose(this.time);
    }
    for (const m of this.mobs) {
      if (m.state !== 'gone') {
        m.c.pose(this.time);
      }
    }
  }

  private stepLeader(dt: number): void {
    const c = this.leader;
    if (!c) {
      return;
    }
    c.step(dt);
    const K = this.keys;
    let ix = (K.has(KeyCode.KEY_D) || K.has(KeyCode.ARROW_RIGHT) ? 1 : 0) - (K.has(KeyCode.KEY_A) || K.has(KeyCode.ARROW_LEFT) ? 1 : 0);
    let iy = (K.has(KeyCode.KEY_W) || K.has(KeyCode.ARROW_UP) ? 1 : 0) - (K.has(KeyCode.KEY_S) || K.has(KeyCode.ARROW_DOWN) ? 1 : 0);
    if (this.auto) {
      const ddx = this.auto.x - this.lx;
      const ddz = this.auto.z - this.lz;
      if (Math.hypot(ddx, ddz) < 0.15) {
        this.auto = null;
      }
    }
    let wx = 0;
    let wz = 0;
    if (this.auto) {
      wx = this.auto.x - this.lx;
      wz = this.auto.z - this.lz;
    } else if (ix || iy) {
      // 按镜头的朝向走:前 = 镜头看过去的方向
      const a = (this.view.yaw * Math.PI) / 180;
      wx = ix * Math.cos(a) - iy * Math.sin(a);
      wz = -ix * Math.sin(a) - iy * Math.cos(a);
    }
    const len = Math.hypot(wx, wz);
    const attacking = this.attackT >= 0;
    if (attacking) {
      this.attackT += dt;
      const clip = c.clip('slash');
      const dur = clip ? Math.min(1.1, c.anim?.getState(clip)?.duration ?? 0.8) : 0.6;
      if (!this.attackHit && this.attackT >= dur * 0.38) {
        this.attackHit = true;
        this.strike();
      }
      if (this.attackT >= dur * 0.86) {
        this.attackT = -1;
        this.moving = false;
        c.play(c.clip('idle'), 0.18);
      }
    }
    if (!attacking && len > 0.01) {
      const speed = 3.6;
      const nx = wx / len;
      const nz = wz / len;
      const tx = this.lx + nx * speed * dt;
      const tz = this.lz + nz * speed * dt;
      if (!this.blocked(tx, tz, 0.3)) {
        this.lx = tx;
        this.lz = tz;
      } else if (!this.blocked(tx, this.lz, 0.3)) {
        this.lx = tx;
      } else if (!this.blocked(this.lx, tz, 0.3)) {
        this.lz = tz;
      } else {
        this.auto = null;
      }
      const want = (Math.atan2(-nz, nx) * 180) / Math.PI;
      let d = ((want - this.lyaw + 540) % 360) - 180;
      this.lyaw += d * Math.min(1, dt * 14);
      if (!this.moving) {
        this.moving = true;
        c.play(c.clip('run') || c.clip('walk'), 0.15);
      }
    } else if (!attacking && this.moving) {
      this.moving = false;
      c.play(c.clip('idle'), 0.2);
    }
    c.place(this.lx, 0, this.lz, this.lyaw);
  }

  auto: { x: number; z: number } | null = null;

  private stepFollowers(dt: number): void {
    for (const f of this.followers) {
      f.c.step(dt);
      // 跟在主角侧后方:离得远了才动
      const a = (this.lyaw * Math.PI) / 180;
      const gx = this.lx + (-Math.cos(a) * 1.0 + Math.sin(a) * f.oz);
      const gz = this.lz + (Math.sin(a) * 1.0 + Math.cos(a) * f.oz);
      const dx = gx - f.x;
      const dz = gz - f.z;
      const d = Math.hypot(dx, dz);
      const go = f.moving ? d > 0.25 : d > 1.1;
      if (go) {
        const sp = Math.min(3.8, 1.5 + d * 2);
        const tx = f.x + (dx / d) * sp * dt;
        const tz = f.z + (dz / d) * sp * dt;
        if (!this.blocked(tx, tz, 0.28)) {
          f.x = tx;
          f.z = tz;
        }
        const want = (Math.atan2(-dz, dx) * 180) / Math.PI;
        f.yaw += ((((want - f.yaw + 540) % 360) - 180)) * Math.min(1, dt * 10);
        if (!f.moving) {
          f.moving = true;
          f.c.play(f.c.clip('run') || f.c.clip('walk'), 0.2);
        }
      } else if (f.moving) {
        f.moving = false;
        f.c.play(f.c.clip('idle'), 0.25);
      }
      f.c.place(f.x, 0, f.z, f.yaw);
    }
  }

  private stepMobs(dt: number): void {
    for (const m of this.mobs) {
      const c = m.c;
      m.t += dt;
      if (m.state === 'gone') {
        if (m.t > 9) {
          m.state = 'idle';
          m.hp = m.maxHp;
          m.x = m.home.x;
          m.z = m.home.z;
          c.down = 0;
          c.node.active = true;
          this.rest(m);
        }
        continue;
      }
      c.step(dt);
      if (m.state === 'down') {
        c.down = Math.min(1, c.down + dt * 2.2);
        if (m.t > 5) {
          m.state = 'gone';
          m.t = 0;
          c.node.active = false;
        }
        c.place(m.x, 0, m.z, m.yaw);
        continue;
      }
      const dx = this.lx - m.x;
      const dz = this.lz - m.z;
      const d = Math.hypot(dx, dz);
      m.cool = Math.max(0, m.cool - dt);
      const aware = !!this.leader && d < 6.5 && Math.hypot(m.x - m.home.x, m.z - m.home.z) < 9;
      let gx = 0;
      let gz = 0;
      let moving = false;
      if (aware) {
        if (d > m.reach) {
          gx = dx / d;
          gz = dz / d;
          moving = true;
          m.state = 'chase';
        } else {
          m.state = 'bite';
          if (m.cool <= 0) {
            m.cool = 1.5 + this.rnd() * 0.8;
            c.act = 'bite';
            c.actT = 0;
          }
        }
        const want = (Math.atan2(-dz, dx) * 180) / Math.PI;
        m.yaw += ((((want - m.yaw + 540) % 360) - 180)) * Math.min(1, dt * 7);
      } else {
        // 没发现人:在自己的地盘上隔一会儿挪两步
        m.state = 'idle';
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 2.5 + this.rnd() * 4;
          m.tx = m.home.x + (this.rnd() - 0.5) * 2.4;
          m.tz = m.home.z + (this.rnd() - 0.5) * 2.4;
        }
        const wx = m.tx - m.x;
        const wz = m.tz - m.z;
        const wd = Math.hypot(wx, wz);
        if (wd > 0.2) {
          gx = (wx / wd) * 0.45;
          gz = (wz / wd) * 0.45;
          moving = true;
          const want = (Math.atan2(-wz, wx) * 180) / Math.PI;
          m.yaw += ((((want - m.yaw + 540) % 360) - 180)) * Math.min(1, dt * 5);
        }
      }
      if (moving) {
        let tx = m.x + gx * m.speed * dt;
        let tz = m.z + gz * m.speed * dt;
        // 怪和怪之间别叠在一起
        for (const o of this.mobs) {
          if (o === m || o.state === 'gone' || o.state === 'down') {
            continue;
          }
          const ox = tx - o.x;
          const oz = tz - o.z;
          const od = Math.hypot(ox, oz);
          const min = m.radius + o.radius;
          if (od < min && od > 1e-4) {
            tx += (ox / od) * (min - od) * 0.5;
            tz += (oz / od) * (min - od) * 0.5;
          }
        }
        if (!this.blocked(tx, tz, m.radius * 0.7)) {
          m.x = tx;
          m.z = tz;
        }
        this.walk(m);
      } else {
        this.rest(m);
      }
      c.stand = moving ? Math.max(0, c.stand - dt * 4) : Math.min(1, c.stand + dt * 4);
      c.place(m.x, 0, m.z, m.yaw);
    }
  }

  /** 主角这一下砍中了谁:面前一个扇形里的怪掉血、受击、火星,亮一下灯。 */
  private strike(): void {
    const a = (this.lyaw * Math.PI) / 180;
    const fxn = Math.cos(a);
    const fzn = -Math.sin(a);
    const fx = this.fx!;
    let hitAny = false;
    for (const m of this.mobs) {
      if (m.state === 'down' || m.state === 'gone') {
        continue;
      }
      const dx = m.x - this.lx;
      const dz = m.z - this.lz;
      const d = Math.hypot(dx, dz);
      if (d > 2.0 + m.radius || (d > 0.4 && (dx * fxn + dz * fzn) / d < 0.25)) {
        continue;
      }
      hitAny = true;
      m.hp -= 1;
      m.c.hit = 1;
      const hy = Math.min(1.3, m.c.height * 0.6);
      for (let i = 0; i < 14; i += 1) {
        fx.emit({ x: m.x - (dx / Math.max(0.2, d)) * m.radius * 0.6, y: hy, z: m.z - (dz / Math.max(0.2, d)) * m.radius * 0.6, vx: fx.rand(-3.5, 3.5), vy: fx.rand(0.5, 4.5), vz: fx.rand(-3.5, 3.5),
          life: fx.rand(0.2, 0.5), s0: 0.022, s1: 0.006, c0: [1, 0.86, 0.6], c1: [1, 0.4, 0.1], cell: FX_CELL.streak, grav: 1, drag: 1.0, stretch: 2.2 });
      }
      fx.emit({ x: m.x, y: hy, z: m.z, life: 0.12, s0: 0.5, s1: 0.9, c0: [1, 0.9, 0.7], a: 0.45, cell: FX_CELL.core, fadeIn: 0.02 });
      if (m.hp <= 0) {
        m.state = 'down';
        m.t = 0;
        m.c.downSide = this.rnd() < 0.5 ? -1 : 1;
        const fall = m.c.clip('fall');
        if (fall) {
          m.c.play(fall, 0.1, false);
        }
      }
    }
    if (hitAny) {
      const L = this.lights.hit.find((x) => !x.node.active) ?? this.lights.hit[0];
      L.node.setPosition(this.lx + fxn * 1.0, 1.2, this.lz + fzn * 1.0);
      L.node.active = true;
      const peak = DUNGEON.hit * DUNGEON.fluxK;
      L.luminousFlux = peak;
      this.pulses = this.pulses.filter((p) => p.light !== L);
      this.pulses.push({ light: L, age: 0, life: 0.28, peak });
    }
  }

  // ───────────────────────── 调试 ─────────────────────────
  info(): Record<string, unknown> {
    const root: any = director.root;
    return { opened: this.opened, error: this.lastError, stats: this.stats, time: +this.time.toFixed(2), leader: this.leader ? [+this.lx.toFixed(2), +this.lz.toFixed(2), Math.round(this.lyaw)] : null,
      mobs: this.mobs.map((m) => `${m.c.name}:${m.state}:${m.hp}`), followers: this.followers.length, view: { ...this.view }, free: !!this.free,
      post: this.post?.info(), draws: root?.device?.numDrawCalls, tris: root?.device?.numTris, fx: this.fx?.stats, cfg: { ...DUNGEON },
      canvas: game.canvas ? [game.canvas.width, game.canvas.height] : null };
  }

  set(patch: Partial<DungeonCfg>): Record<string, unknown> {
    Object.assign(DUNGEON, patch);
    this.applyLights();
    if (patch.reflect !== undefined) {
      this.applyReflection();
    }
    if (patch.post !== undefined && this.post) {
      if (DUNGEON.post > 0) {
        this.post.enable(DUNGEON.post);
      } else {
        this.post.disable();
      }
    }
    return { ...DUNGEON };
  }

  /** 把主角放到某处(跟班跟过去)。 */
  tp(x: number, z: number, yaw?: number): void {
    this.lx = x;
    this.lz = z;
    if (yaw !== undefined) {
      this.lyaw = yaw;
    }
    this.leader?.place(x, 0, z, this.lyaw);
    for (const f of this.followers) {
      const a = (this.lyaw * Math.PI) / 180;
      f.x = x - Math.cos(a) * 1.0 + Math.sin(a) * f.oz;
      f.z = z + Math.sin(a) * 1.0 + Math.cos(a) * f.oz;
      f.yaw = this.lyaw;
      f.c.place(f.x, 0, f.z, f.yaw);
    }
  }

  setView(v: Partial<{ yaw: number; pitch: number; dist: number; fov: number }>): void {
    Object.assign(this.view, v);
    this.free = null;
    this.pull = this.view.dist;
    this.syncCam(0);
  }

  /** 镜头不跟主角,直接摆到某个位置看向某个点(截图用);不给参数 = 回到跟主角。 */
  shot(pos?: [number, number, number], look?: [number, number, number], fov?: number): void {
    this.free = pos && look ? { pos: new Vec3(pos[0], pos[1], pos[2]), look: new Vec3(look[0], look[1], look[2]) } : null;
    if (fov) {
      this.view.fov = fov;
    }
    this.syncCam(0);
  }
}

export const dungeon = new Dungeon();

function param(name: string): string | null {
  try {
    const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  } catch (error) {
    return null;
  }
}

function boot(): void {
  const post = param('dpost');
  if (post !== null && !Number.isNaN(Number(post))) {
    DUNGEON.post = Number(post);
  }
  if (param('dspot') === '1') {
    DUNGEON.spotShadow = true;
  }
  if (param('dreflect') === '0') {
    DUNGEON.reflect = false;
  }
  if (param('dfloor')) {
    DUNGEON.floor = Number(param('dfloor')) || DUNGEON.floor;
  }
  // 等主场景起来再接管(脚本加载时场景还没进)
  const timer = setInterval(() => {
    const scene = director.getScene();
    if (!scene || !director.root || !scene.getComponentInChildren(Canvas)) {
      return;
    }
    clearInterval(timer);
    dungeon.open();
  }, 120);
}

if (!EDITOR && sys.isBrowser) {
  (globalThis as any).__g3dd = { dungeon, cfg: DUNGEON, info: () => dungeon.info(), set: (p: Partial<DungeonCfg>) => dungeon.set(p),
    view: (v: any) => dungeon.setView(v), shot: (p?: any, l?: any, f?: number) => dungeon.shot(p, l, f), tp: (x: number, z: number, yaw?: number) => dungeon.tp(x, z, yaw),
    attack: () => dungeon.attack(), go: (x: number, z: number) => { dungeon.auto = { x, z }; },
    post: (p: Partial<PostCfg>) => { dungeon.post?.set(p); return dungeon.post?.info(); },
    freeze: (on: boolean) => { dungeon.frozen = on; }, pause: (on: boolean) => { if (on) { game.pause(); } else { game.resume(); } }, step: (dt: number, n = 1) => { dungeon.fixedDt = dt; for (let i = 0; i < n; i += 1) { game.step(); } dungeon.fixedDt = 0; return dungeon.time; } };
  if (param('g3ddungeon') === '1') {
    boot();
  }
}
