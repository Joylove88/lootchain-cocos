import { Camera, Canvas, Color, DirectionalLight, Director, director, EffectAsset, game, geometry, Graphics, ImageAsset, Material, Mesh, MeshRenderer, Node, PointLight, renderer, resources, sys, Texture2D, UITransform, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { LobbyGuardBattleRenderer } from '../LobbyGuardBattleRenderer';
import { MeshBatch, Tint } from './G3DMesh';
import { Contact, GD, GW, GX0, GZ0, mulberry32, paintBackdrop, paintGround, paintRock, paintWood, softDisc, TER_Z } from './G3DTextures';

/**
 * 守卫战 3D 光影层(技术验证,2026-11-12;默认关)。
 *
 * 用户看完网页小样(tools/proto3d/guard_battle)后要在引擎里验证:把守卫战那张 2D 背景换成一个真 3D 场景
 * (程序材质 + 带投影的月光 + 跟着技能走的点光),格子 / 英雄 / 怪物 / 特效 / 界面一律不动,还是原来那套 2D。
 *
 * 做法:
 * - 3D 相机垫在界面相机下面(主场景本来就有一台,这里换成自己的),界面相机只清深度,2D 层照旧盖在上面;
 * - 2D 布局不改:相机的高度和远近按「石坎线」「中央走道」这两条线反推,3D 的石平台前沿正好落在 2D 布局的石坎线上;
 * - 技能光:包住渲染器的命中爆闪 / 法术 / 战技几个出口,在对应的地面位置亮一盏点光(同时最多几盏,按强弱取);
 * - 不改任何现有文件:本模块加载时包一层 LobbyGuardBattleRenderer.prototype 上的方法,开关关着时只多一次函数调用。
 *
 * 打开:地址带 ?guard3d=1,或 localStorage.lcGuard3d = '1',或控制台 __g3d.toggle(true)(战斗中也能切)。
 * 只在网页端可用(程序贴图要画布)。自验:tools/proto3d/guard_battle/engine_shots.py。
 *
 * 2026-11-12 在预览里验证过的(WebGL1 + 3.8 内置管线):标准材质 + 法线贴图 + 主光阴影贴图 + 追加点光都能用;
 * 退出战斗后场景全局(环境光 / 阴影 / 主场景自带的相机和主光)原样还原。
 * 没验证的:正式包(builtin-standard 着色器要靠 resources/effects/g3d-standard.mtl 带进包)、真机、安卓原生包。
 */

const FOV = 19;            // 竖直视角(度):窄一点,近大远小不至于太夸张(2D 角色不随远近缩放)
const PITCH = 31;          // 俯角(度)
const CAM_X = -0.4;
const TER_H = 0.5;         // 石平台高
const TER_BACK = -10.3;    // 石平台后沿
const UVD = 1 / 2.2;       // 石面贴图每 2.2 米铺一遍
const BRAZIERS = [{ x: -9.05, z: -8.8 }, { x: -1.95, z: -8.78 }, { x: 7.55, z: -8.8 }];
const MOON_DIR = new Vec3(0.34, -0.55, 0.76).normalize();   // 月光从正后方偏左照过来(逆光):地面泛反光,影子朝镜头拉长

interface Cfg {
  /** 月光照度 / 环境光照度(场景是 HDR 光照单位:勒克斯,和主场景那盏 65000 的日光同一套曝光)。 */
  moon: number;
  ambient: number;
  /** 点光:网页小样里的强度 × 这个系数 = 引擎里的光通量。这几个数是在预览里对着画面校出来的(2026-11-12),不是按物理单位换算的。 */
  fluxK: number;
  /** 主光阴影贴图边长(0 = 不要投影)。 */
  shadow: number;
  /** 地面贴图宽(高 = 一半)。 */
  ground: number;
  /** 同时亮着的技能点光上限。每盏点光都要把它照到的地面块再画一遍,手机上少开。 */
  dynLights: number;
  /** 火盆是不是真的点光(否 = 只有贴地光斑)。 */
  brazierLights: boolean;
}
const CFG: Cfg = sys.isMobile
  ? { moon: 46000, ambient: 16000, fluxK: 100, shadow: 1024, ground: 2048, dynLights: 2, brazierLights: false }
  : { moon: 46000, ambient: 16000, fluxK: 100, shadow: 2048, ground: 2048, dynLights: 3, brazierLights: true };

interface Pulse { x: number; y: number; z: number; r: number; g: number; b: number; peak: number; range: number; hold: number; tau: number; age: number }

const _ray = new geometry.Ray();
const _w = new Vec3();
const _s = new Vec3();

class GuardScene3D {
  private world: Node | null = null;
  private cam: Camera | null = null;
  private moon: DirectionalLight | null = null;
  private dyn: PointLight[] = [];
  private brazier: PointLight[] = [];
  private pools: Node[] = [];
  private flames: Node[] = [];
  private pulses: Pulse[] = [];
  private owner: any = null;          // 当前这一局的 LobbyGuardBattleRenderer
  private root2d: Node | null = null;
  private uiCam: Camera | null = null;
  private attached = false;
  private saved: any = null;
  private time = 0;
  private stats = { buildMs: 0, texMs: 0, meshes: 0, triangles: 0, camH: 0, camZ: 0 };
  private lastError = '';
  private effectWaiters: Array<() => void> | null = null;
  private effectKeep: Material | null = null;

  /**
   * 3D 的内置标准材质(builtin-standard)这个项目平时用不到,运行时根本没加载。
   * resources/effects/g3d-standard.mtl 是一个只为「把它带进包里」而存在的材质:读它一次,着色器就注册好了。
   */
  private withEffect(done: () => void): void {
    if (EffectAsset.get('builtin-standard')) {
      done();
      return;
    }
    if (this.effectWaiters) {
      this.effectWaiters.push(done);
      return;
    }
    this.effectWaiters = [done];
    resources.load('effects/g3d-standard', Material, (error, mat) => {
      const waiters = this.effectWaiters ?? [];
      this.effectWaiters = null;
      if (error || !mat) {
        this.lastError = `load g3d-standard: ${error?.message ?? 'null'}`;
        console.warn('[g3d]', this.lastError);
        return;
      }
      mat.addRef();   // 别被回收(着色器会跟着卸掉)
      this.effectKeep = mat;
      waiters.forEach((w) => w());
    });
  }

  isOn(): boolean {
    return this.attached;
  }

  // ───────────────────────── 建场景(一次,之后复用)─────────────────────────
  private tex(cv: HTMLCanvasElement, repeat: boolean): Texture2D {
    const t = new Texture2D();
    const wrap = repeat ? Texture2D.WrapMode.REPEAT : Texture2D.WrapMode.CLAMP_TO_EDGE;
    t.setWrapMode(wrap, wrap);
    t.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
    t.setMipFilter(Texture2D.Filter.LINEAR);   // 要在第一次上传前设好,引擎才会生成多级渐远
    t.setAnisotropy(4);
    t.image = new ImageAsset(cv);
    return t;
  }

  private material(effect: string, defines: Record<string, boolean>, technique = 0): Material {
    const m = new Material();
    m.initialize({ effectName: effect, defines, technique });
    return m;
  }

  private addMesh(parent: Node, name: string, mesh: Mesh, mat: Material, cast: boolean, receive: boolean): Node {
    const n = new Node(name);
    parent.addChild(n);
    const mr = n.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = cast ? MeshRenderer.ShadowCastingMode.ON : MeshRenderer.ShadowCastingMode.OFF;
    mr.receiveShadow = receive ? MeshRenderer.ShadowReceivingMode.ON : MeshRenderer.ShadowReceivingMode.OFF;
    return n;
  }

  private build(): void {
    const t0 = performance.now();
    const scene = director.getScene()!;
    const world = new Node('G3DWorld');
    scene.addChild(world);
    this.world = world;
    const rnd = mulberry32(606);
    const stone = new MeshBatch();
    const wood = new MeshBatch();
    const iron = new MeshBatch();
    const contacts: Contact[] = [];
    const st = (dark = 1): Tint => {
      const v = dark * (0.8 + rnd() * 0.3);
      const w = rnd();
      return [v * (1 + (w - 0.5) * 0.05), v, v * (1.02 - (w - 0.5) * 0.06)];
    };
    const V = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
    const deg = (rad: number): number => (rad * 180) / Math.PI;

    // ── 后面的石平台:芯 + 立面条石 + 台面石板 + 两级台阶 ──
    stone.box(70, TER_H - 0.05, TER_Z - TER_BACK, V(0, (TER_H - 0.05) / 2, (TER_Z + TER_BACK) / 2 - 0.06), V(0, 0, 0), [0.42, 0.42, 0.43], UVD, rnd, 0, 0);
    for (let x = -27; x < 27;) {
      const w = 1.3 + rnd() * 1.4;
      stone.box(w - 0.03, TER_H + 0.04 + rnd() * 0.03, 0.62, V(x + w / 2, TER_H / 2 + 0.01, TER_Z - 0.3 + (rnd() - 0.5) * 0.04), V(0, deg((rnd() - 0.5) * 0.02), 0), st(0.92), UVD, rnd, 0.035, 0);
      x += w;
    }
    for (const [zc, dep] of [[-9.0, 0.95], [-9.9, 0.88]]) {
      for (let x = -27; x < 27;) {
        const w = 1.2 + rnd() * 0.9;
        stone.box(w - 0.035, 0.12, dep - 0.035, V(x + w / 2, TER_H + 0.035 + (rnd() - 0.5) * 0.02, zc), V(deg((rnd() - 0.5) * 0.012), 0, deg((rnd() - 0.5) * 0.012)), st(1.0), UVD, rnd, 0.025);
        x += w;
      }
    }
    for (let k = 0; k < 2; k += 1) {
      for (let x = 1.2; x < 6.1;) {
        const w = Math.min(1.3 + rnd() * 0.7, 6.2 - x);
        const dep = k === 0 ? 1.08 : 0.56;
        stone.box(w - 0.03, 0.172, dep, V(x + w / 2, 0.086 + k * 0.167, TER_Z + dep / 2 - 0.02), V(0, 0, 0), st(1.02), UVD, rnd, 0.03, k === 0 ? 0 : undefined);
        x += w;
      }
    }
    contacts.push({ x: 3.7, z: TER_Z + 1.15, r: 1.0 }, { x: 2.0, z: TER_Z + 1.15, r: 0.9 }, { x: 5.4, z: TER_Z + 1.15, r: 0.9 });
    stone.split();

    // ── 断墙:几段高的残垣(顶出画面)+ 一层矮墙根,正中整段塌了,远景从那里透出来 ──
    const bump = (x: number, c: number, w: number): number => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
    const wallH = (x: number): number => {
      if (Math.abs(x + 1.0) < 2.7) {
        return 0;
      }
      let rows = Math.max(Math.round(7.4 * bump(x, -8.4, 1.5)), Math.round(5.6 * bump(x, 5.7, 0.9)), Math.round(6.6 * bump(x, 12.8, 1.4)), Math.round(7 * bump(x, -15.6, 1.6)));
      if (rows < 1 && ((Math.sin(x * 1.7) + Math.sin(x * 0.53 + 2)) * 0.5 > 0.25)) {
        rows = 1;
      }
      return rows;
    };
    const BH = 0.45;
    const BD = 0.6;
    const wallY = TER_H + 0.095;
    const wallZ = TER_BACK + 0.36;
    for (let row = 0; row < 8; row += 1) {
      for (let x = -26 - rnd() * 0.8; x < 26;) {
        const bw = 0.62 + rnd() * 0.95;
        const top = wallH(x + bw / 2);
        if (row < top && !(row === top - 1 && row > 0 && rnd() < 0.3)) {
          const edge = row === top - 1;
          stone.box(bw - 0.02 - rnd() * 0.03, BH - 0.015, BD - rnd() * 0.1, V(x + bw / 2, wallY + BH / 2 + row * BH, wallZ + (rnd() - 0.5) * 0.09),
            V(deg((rnd() - 0.5) * (edge ? 0.06 : 0.01)), deg((rnd() - 0.5) * (edge ? 0.12 : 0.03)), deg((rnd() - 0.5) * (edge ? 0.09 : 0.012))), st(row === 0 ? 0.88 : 1.0), UVD, rnd, edge ? 0.06 : 0.04, row === 0 ? wallY : undefined);
        }
        x += bw;
      }
    }
    stone.split();
    // ── 石柱:两边各两根大的(顶出画面)、一根断柱,倒下的柱鼓滚在院子里 ──
    const pillar = (x: number, z: number, drums: number, r: number, tilt: boolean): void => {
      stone.box(r * 2.9, 0.42, r * 2.9, V(x, TER_H + 0.31, z), V(0, rnd() * 6, 0), st(0.95), UVD, rnd, 0.04, TER_H + 0.1);
      stone.cylinder(r * 1.2, r * 1.32, 0.22, 18, V(x, TER_H + 0.63, z), V(0, 0, 0), st(1.0), UVD, rnd);
      let y = TER_H + 0.74;
      for (let i = 0; i < drums; i += 1) {
        const hh = 0.95 + rnd() * 0.25;
        const last = i === drums - 1 && tilt;
        stone.cylinder(r * (last ? 0.9 : 1), r, hh, 18, V(x + (rnd() - 0.5) * 0.03 + (last ? 0.05 : 0), y + hh / 2, z + (rnd() - 0.5) * 0.03), V(last ? 4 : 0, rnd() * 360, last ? -5 : 0), st(1.0), UVD, rnd);
        y += hh + 0.012;
      }
    };
    pillar(-10.5, -9.42, 5, 0.5, false);
    pillar(9.9, -9.45, 5, 0.5, false);
    pillar(-14.6, -9.42, 5, 0.5, false);
    pillar(14.3, -9.45, 5, 0.5, false);
    pillar(-4.4, -9.5, 2, 0.4, true);
    stone.cylinder(0.4, 0.4, 1.05, 18, V(8.25, 0.4, -6.75), V(0, 29, 90), st(1.0), UVD, rnd, 0);
    stone.cylinder(0.4, 0.4, 0.9, 18, V(6.35, 0.4, -7.15), V(0, -20, 90), st(0.95), UVD, rnd, 0);
    stone.cylinder(0.4, 0.4, 0.8, 18, V(-9.9, 0.4, -6.9), V(0, 63, 90), st(0.95), UVD, rnd, 0);
    contacts.push({ x: 8.25, z: -6.75, r: 1.05 }, { x: 6.35, z: -7.15, r: 0.95 }, { x: -9.9, z: -6.9, r: 0.95 });
    stone.split();
    // ── 散落的碎块和石头 ──
    for (let i = 0; i < 16; i += 1) {
      const x = -14 + rnd() * 28;
      const z = TER_Z + 0.5 + rnd() * 1.5;
      const w = 0.4 + rnd() * 0.5;
      if (x > 0.8 && x < 6.6) {
        continue;
      }
      stone.box(w, 0.3 + rnd() * 0.14, 0.34 + rnd() * 0.24, V(x, 0.13 + rnd() * 0.06, z), V(deg((rnd() - 0.5) * 0.5), rnd() * 360, deg((rnd() - 0.5) * 0.5)), st(0.95), UVD, rnd, 0.035, 0);
      contacts.push({ x, z, r: w * 0.95 });
    }
    for (let i = 0; i < 60; i += 1) {
      const far = rnd() < 0.6;
      const x = far ? -15 + rnd() * 30 : 4 + rnd() * 11;
      const z = far ? TER_Z + 0.35 + rnd() * 1.9 : (rnd() < 0.5 ? -7.6 + rnd() * 3.4 : 2.6 + rnd() * 2.6);
      const r = 0.06 + rnd() * 0.16;
      if (far && x > 0.8 && x < 6.6) {
        continue;
      }
      stone.rock(r, V(x, r * 0.3, z), st(0.9), UVD * 2, rnd);
      if (r > 0.13) {
        contacts.push({ x, z, r: r * 2.2 });
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const r = 0.07 + rnd() * 0.12;
      stone.rock(r, V(-15 + rnd() * 30, TER_H + 0.1 + r * 0.3, -8.9 - rnd() * 0.9), st(0.9), UVD * 2, rnd);
    }
    // ── 火盆(石墩 + 铁盆)──
    for (const b of BRAZIERS) {
      const y0 = TER_H + 0.09;
      stone.box(0.46, 0.95, 0.46, V(b.x, y0 + 0.475, b.z), V(0, rnd() * 20, 0), st(0.9), UVD, rnd, 0.035, y0);
      stone.box(0.62, 0.12, 0.62, V(b.x, y0 + 1.0, b.z), V(0, rnd() * 20, 0), st(1.0), UVD, rnd, 0.03);
      iron.cylinder(0.46, 0.2, 0.26, 16, V(b.x, y0 + 1.19, b.z), V(0, 0, 0), [1, 1, 1], 1, rnd);
    }
    // ── 木栅 / 拒马 ──
    const wt = (): Tint => {
      const v = 0.7 + rnd() * 0.45;
      return [v, v * 0.97, v * 0.93];
    };
    const stake = (x: number, y: number, z: number, len: number, r: number, rx: number, rz: number): void => {
      // 身子 + 削尖的头:沿自身 y 轴,(rx, rz) 是歪的角度(度)
      const rot = V(rx, rnd() * 360, rz);
      const up = Vec3.transformQuat(new Vec3(), V(0, 1, 0), quatOf(rot));
      wood.cylinder(r * 0.86, r, len, 7, V(x + up.x * len / 2, y + up.y * len / 2, z + up.z * len / 2), rot, wt(), 0.9, rnd, y < 0.3 ? 0 : undefined);
      const tipLen = r * 3.2;
      wood.cylinder(0.001, r * 0.86, tipLen, 7, V(x + up.x * (len + tipLen / 2), y + up.y * (len + tipLen / 2), z + up.z * (len + tipLen / 2)), rot, wt(), 0.9, rnd, undefined, false);
    };
    const rail = (x0: number, z0: number, x1: number, z1: number, y: number, r: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      // 圆柱的轴是自身 y:先绕 z 放倒(轴指向 +x),再绕 y 转到 (x0,z0) → (x1,z1) 的方向
      wood.cylinder(r, r, len, 7, V((x0 + x1) / 2, y, (z0 + z1) / 2), V(0, -deg(Math.atan2(z1 - z0, x1 - x0)), 90), wt(), 0.9, rnd);
    };
    const palisade = (x0: number, z0: number, x1: number, z1: number, hgt: number): void => {
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.4);
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        if (rnd() < 0.06) {
          continue;
        }
        stake(x0 + (x1 - x0) * t + (rnd() - 0.5) * 0.05, -0.05, z0 + (z1 - z0) * t + (rnd() - 0.5) * 0.05, hgt * (0.86 + rnd() * 0.24), 0.085 + rnd() * 0.03, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8);
      }
      rail(x0, z0 + 0.13, x1, z1 + 0.13, hgt * 0.4, 0.06);
      rail(x0, z0 + 0.13, x1, z1 + 0.13, hgt * 0.74, 0.055);
      for (let t = 0; t <= 1; t += 0.2) {
        contacts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r: 0.75 });
      }
    };
    palisade(7.0, -6.3, 13.6, -5.5, 1.75);
    palisade(7.6, 5.0, 13.5, 4.75, 1.6);
    const frise = (x: number, z: number, ryDeg: number, len: number): void => {   // 拒马:一根横木上交叉穿着削尖的木桩
      const ry = (ryDeg * Math.PI) / 180;
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      rail(x - (c * len) / 2, z + (sn * len) / 2, x + (c * len) / 2, z - (sn * len) / 2, 0.55, 0.085);
      for (let i = 0; i < 6; i += 1) {
        const t = (i + 0.5) / 6 - 0.5;
        const sgn = i % 2 ? 1 : -1;
        // 木桩朝横木的两侧交替倾斜约 40 度
        stake(x + c * len * t - sn * 0.42 * sgn, 0, z - sn * len * t - c * 0.42 * sgn, 1.32, 0.06, c * 41 * sgn, sn * 41 * sgn);
      }
      contacts.push({ x, z, r: len * 0.62 });
    };
    frise(8.9, -4.15, 20, 2.3);
    frise(6.9, 3.95, -14, 2.1);

    // ── 贴图 / 材质 ──
    const t1 = performance.now();
    const ground = paintGround(CFG.ground, contacts);
    const rock = paintRock(512);
    const woodTex = paintWood(256);
    this.stats.texMs = Math.round(performance.now() - t1);
    const groundMat = this.material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_PBR_MAP: true });
    groundMat.setProperty('mainTexture', this.tex(ground.albedo, false));
    groundMat.setProperty('normalMap', this.tex(ground.normal, false));
    groundMat.setProperty('pbrMap', this.tex(ground.orm, false));
    groundMat.setProperty('occlusion', 1);
    groundMat.setProperty('roughness', 1);
    groundMat.setProperty('metallic', 1);
    const stoneMat = this.material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    stoneMat.setProperty('mainTexture', this.tex(rock.albedo, true));
    stoneMat.setProperty('normalMap', this.tex(rock.normal, true));
    stoneMat.setProperty('roughness', 0.82);
    stoneMat.setProperty('metallic', 0);
    const woodMat = this.material('builtin-standard', { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true, USE_VERTEX_COLOR: true });
    woodMat.setProperty('mainTexture', this.tex(woodTex.albedo, true));
    woodMat.setProperty('normalMap', this.tex(woodTex.normal, true));
    woodMat.setProperty('roughness', 0.86);
    woodMat.setProperty('metallic', 0);
    const ironMat = this.material('builtin-standard', {});
    ironMat.setProperty('mainColor', new Color(44, 39, 35, 255));
    ironMat.setProperty('roughness', 0.5);
    ironMat.setProperty('metallic', 1);

    // ── 网格 ──
    let meshes = 0;
    let tris = 0;
    for (const m of MeshBatch.groundTiles(GX0, GZ0, GW, GD, 8, 4)) {   // 地面切 8 × 4 块:一盏点光只重画它照到的那几块
      this.addMesh(world, 'G3DGround', m, groundMat, false, true);
      meshes += 1;
      tris += 2;
    }
    const apron = this.material('builtin-standard', {});
    apron.setProperty('mainColor', new Color(58, 48, 40, 255));
    apron.setProperty('roughness', 1);
    const big = MeshBatch.groundTiles(-80, TER_BACK + 0.2, 160, 40, 1, 1, -0.03);
    this.addMesh(world, 'G3DApron', big[0], apron, false, true);
    for (const [batch, mat, name] of [[stone, stoneMat, 'G3DStone'], [wood, woodMat, 'G3DWood'], [iron, ironMat, 'G3DIron']] as Array<[MeshBatch, Material, string]>) {
      for (const m of batch.build()) {
        this.addMesh(world, name, m, mat, true, true);
        meshes += 1;
      }
      tris += batch.triangles;
    }
    // ── 火盆:炭火 + 火苗(加色的柔光片)+ 地上的光斑;桌面端再各放一盏真的点光 ──
    const disc = this.tex(softDisc(128), false);
    const quad = MeshBatch.quad();
    const glow = (parent: Node, name: string, color: Color, x: number, y: number, z: number, sx: number, sy: number, flat: boolean): Node => {
      const m = this.material('builtin-unlit', { USE_TEXTURE: true }, 2);   // 2 = 加色
      m.setProperty('mainTexture', disc);
      m.setProperty('mainColor', color);
      const n = this.addMesh(parent, name, quad, m, false, false);
      n.setPosition(x, y, z);
      n.setScale(sx, sy, 1);
      n.setRotationFromEuler(flat ? -90 : -PITCH * 0.7, 0, 0);
      return n;
    };
    for (const b of BRAZIERS) {
      const y0 = TER_H + 0.09;
      glow(world, 'G3DCoal', new Color(255, 120, 40, 255), b.x, y0 + 1.33, b.z, 0.8, 0.8, true);
      this.flames.push(glow(world, 'G3DFlame', new Color(255, 150, 60, 255), b.x, y0 + 1.75, b.z, 0.95, 1.5, false));
      this.pools.push(glow(world, 'G3DPool', new Color(120, 52, 18, 255), b.x, TER_H + 0.115, b.z - 0.3, 5.6, 2.9, true));
      this.pools.push(glow(world, 'G3DPool', new Color(46, 20, 7, 255), b.x, 0.03, b.z + 2.5, 8.0, 5.4, true));
      const ln = new Node('G3DBrazierLight');
      world.addChild(ln);
      ln.setPosition(b.x, y0 + 2.2, b.z + 0.35);
      const L = ln.addComponent(PointLight);
      L.color = new Color(255, 163, 104, 255);
      L.range = 13;
      L.luminousFlux = 8.5 * CFG.fluxK;
      ln.active = CFG.brazierLights;
      this.brazier.push(L);
    }
    // ── 月光(带投影)、技能点光 ──
    const moonNode = new Node('G3DMoon');
    world.addChild(moonNode);
    moonNode.setPosition(-MOON_DIR.x * 48, -MOON_DIR.y * 48, -MOON_DIR.z * 48 - 1.5);
    moonNode.lookAt(new Vec3(0, 0, -1.5));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.color = new Color(205, 216, 244, 255);
    moon.illuminance = CFG.moon;
    this.moon = moon;
    for (let i = 0; i < 3; i += 1) {
      const ln = new Node('G3DSkillLight');
      world.addChild(ln);
      const L = ln.addComponent(PointLight);
      L.range = 10;
      L.luminousFlux = 0;
      ln.active = false;
      this.dyn.push(L);
    }
    // ── 相机 + 贴在相机上的远景 ──
    const camNode = new Node('G3DCamera');
    world.addChild(camNode);
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fovAxis = Camera.FOVAxis.VERTICAL;
    cam.fov = FOV;
    cam.near = 4;
    cam.far = 700;
    cam.priority = -1;                                   // 先画;界面相机只清深度,盖在上面
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(52, 62, 86, 255);
    camNode.setRotationFromEuler(-PITCH, 0, 0);
    camNode.setPosition(CAM_X, 16.8, 24.85);
    this.cam = cam;
    const back = this.material('builtin-unlit', { USE_TEXTURE: true });
    back.setProperty('mainTexture', this.tex(paintBackdrop(), false));
    const bq = this.addMesh(camNode, 'G3DBackdrop', quad, back, false, false);
    bq.name = 'G3DBackdrop';
    this.stats.meshes = meshes;
    this.stats.triangles = tris;
    this.stats.buildMs = Math.round(performance.now() - t0);
  }

  /** 远景贴图贴在相机上,占画面最上面 36%。 */
  private placeBackdrop(): void {
    const cam = this.cam;
    const bq = cam?.node.getChildByName('G3DBackdrop');
    if (!cam || !bq) {
      return;
    }
    const D = 300;
    const fh = 2 * D * Math.tan((cam.fov * Math.PI) / 360);
    const aspect = cam.camera ? cam.camera.aspect : 16 / 9;
    const bh = fh * 0.36;
    bq.setPosition(0, fh / 2 - bh / 2 + fh * 0.012, -D);
    bq.setScale(fh * aspect * 1.08, bh, 1);
  }

  // ───────────────────────── 接进 / 撤出一局守卫战 ─────────────────────────
  private static readonly BG_NODES = /^(GuardSceneBg|GuardSkyDrift|GuardFogFar|GuardFogNear|GuardSceneNear|GuardMote\d+)$/;

  private show2dBackground(root: Node | null, show: boolean): void {
    if (!root || !root.isValid) {
      return;
    }
    const g = root.getComponent(Graphics);   // 根节点上那层不透明的深色底
    if (g) {
      g.enabled = show;
    }
    for (const c of root.children) {
      if (GuardScene3D.BG_NODES.test(c.name)) {
        c.active = show;
      }
    }
  }

  /** 屏幕上一条横线(2D 节点里的 y)对应的视线往下看多少度。 */
  private lineAngle(node: Node, ly: number): number {
    const ui = node.getComponent(UITransform)!;
    ui.convertToWorldSpaceAR(_w.set(0, ly, 0), _w);
    this.uiCam!.worldToScreen(_w, _s);
    this.cam!.screenPointToRay(_s.x, _s.y, _ray);
    return Math.asin(Math.min(1, Math.max(-1, -_ray.d.y)));
  }

  /**
   * 按 2D 布局摆相机:俯角和视角固定,用「石坎线」和「中央走道」两条线反推相机的高度和远近 ——
   * 石平台前沿(世界 z = TER_Z)落在石坎线上,走道落在 z = 0。2D 那边一个像素都不用动。
   */
  private fitCamera(self: any, root: Node): void {
    const cam = this.cam!;
    cam.node.setRotationFromEuler(-PITCH, 0, 0);
    cam.camera.update(true);
    let h = 16.8;
    let z = 24.85;
    try {
      const aL = this.lineAngle(root, self.horizonPy());
      const aW = this.lineAngle(root, self.walkwayY() - self.layoutHeight * 0.03);   // 场地节点比根节点低 3%
      const k = 1 / Math.tan(aL) - 1 / Math.tan(aW);
      if (aL > 0.05 && aW > aL && k > 0.05) {
        h = Math.min(30, Math.max(9, -TER_Z / k));
        z = h / Math.tan(aW);
      }
    } catch (error) {
      console.warn('[g3d] fitCamera', error);
    }
    cam.node.setPosition(CAM_X, h, z);
    cam.camera.update(true);
    this.stats.camH = +h.toFixed(2);
    this.stats.camZ = +z.toFixed(2);
    this.placeBackdrop();
  }

  /** 接上 3D 层:着色器没到位就先等它(到位时这一局的场地可能已经换了,换了就不接)。 */
  attach(self: any, root: Node): void {
    this.withEffect(() => {
      if (root.isValid && self.root === root && flagOn()) {
        this.attachNow(self, root);
      }
    });
  }

  private attachNow(self: any, root: Node): void {
    try {
      if (self.isRaidStage && self.isRaidStage()) {
        return;   // 掠夺是另一套站位,这次只验证守卫战
      }
      let canvas: Canvas | null = null;
      for (let n: Node | null = root; n && !canvas; n = n.parent) {
        canvas = n.getComponent(Canvas);
      }
      this.uiCam = canvas?.cameraComponent ?? null;
      if (!this.uiCam) {
        return;
      }
      if (!this.world) {
        this.build();
      }
      const scene = director.getScene()!;
      if (!this.attached) {
        // 主场景自带的那台 3D 相机和主光先停掉(退出时还原);环境光 / 阴影换成这个场景要的
        const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
        const mainLight = scene.getChildByName('Main Light')?.getComponent(DirectionalLight) ?? null;
        const amb = scene.globals.ambient;
        const sh = scene.globals.shadows;
        this.saved = { mainCam, mainCamOn: mainCam?.enabled ?? false, mainLight, mainLightOn: mainLight?.enabled ?? false,
          skyIllum: amb.skyIllum, sky: amb.skyLightingColor.clone(), ground: amb.groundLightingColor.clone(), shOn: sh.enabled, shType: sh.type, shSize: sh.shadowMapSize };
        if (mainCam) {
          mainCam.enabled = false;
        }
        if (mainLight) {
          mainLight.enabled = false;
        }
        amb.skyLightingColor = new Color(142, 155, 185, 255);
        amb.groundLightingColor = new Color(61, 54, 47, 255);
        amb.skyIllum = CFG.ambient;
        this.applyShadow();
        director.on(Director.EVENT_BEFORE_UPDATE, this.tick, this);
      }
      this.world!.active = true;
      this.attached = true;
      this.owner = self;
      this.root2d = root;
      this.show2dBackground(root, false);
      this.fitCamera(self, root);
    } catch (error) {
      console.warn('[g3d] attach failed', error);
      this.lastError = String((error as any)?.stack ?? error);
      this.detach();
    }
  }

  private applyShadow(): void {
    const scene = director.getScene()!;
    const sh = scene.globals.shadows;
    const moon = this.moon!;
    if (CFG.shadow > 0) {
      sh.enabled = true;
      sh.type = renderer.scene.ShadowType.ShadowMap;
      sh.shadowMapSize = CFG.shadow;
      moon.shadowEnabled = true;
      moon.shadowPcf = renderer.scene.PCFType.SOFT;
      moon.shadowBias = 0.0003;
      moon.shadowNormalBias = 0.02;
      moon.shadowFixedArea = true;       // 战场就这么大:固定一块正交范围,不跟着相机算级联
      moon.shadowNear = 1;
      moon.shadowFar = 110;
      moon.shadowOrthoSize = 23;
    } else {
      moon.shadowEnabled = false;
      sh.enabled = false;
    }
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    director.off(Director.EVENT_BEFORE_UPDATE, this.tick, this);
    try {
      if (this.world && this.world.isValid) {
        this.world.active = false;
      }
      const s = this.saved;
      if (s) {
        const scene = director.getScene();
        if (scene) {
          const amb = scene.globals.ambient;
          const sh = scene.globals.shadows;
          amb.skyLightingColor = s.sky;
          amb.groundLightingColor = s.ground;
          amb.skyIllum = s.skyIllum;
          sh.type = s.shType;
          sh.shadowMapSize = s.shSize;
          sh.enabled = s.shOn;
        }
        if (s.mainCam && s.mainCam.isValid) {
          s.mainCam.enabled = s.mainCamOn;
        }
        if (s.mainLight && s.mainLight.isValid) {
          s.mainLight.enabled = s.mainLightOn;
        }
      }
      this.show2dBackground(this.root2d, true);
    } catch (error) {
      console.warn('[g3d] detach', error);
    }
    this.saved = null;
    this.owner = null;
    this.root2d = null;
    this.pulses.length = 0;
    for (const L of this.dyn) {
      L.node.active = false;
    }
  }

  // ───────────────────────── 技能光 ─────────────────────────
  /** 2D 场地坐标 → 3D 地面上的点:界面相机算出屏幕位置,3D 相机从那一点发一条射线,和地面求交。 */
  private fieldToGround(fx: number, fy: number, out: Vec3): boolean {
    const field: Node | null = this.owner?.fieldNode ?? null;
    if (!field || !field.isValid || !this.uiCam || !this.cam) {
      return false;
    }
    field.getComponent(UITransform)!.convertToWorldSpaceAR(_w.set(fx, fy, 0), _w);
    this.uiCam.worldToScreen(_w, _s);
    this.cam.screenPointToRay(_s.x, _s.y, _ray);
    if (_ray.d.y > -0.01) {
      return false;
    }
    const t = -_ray.o.y / _ray.d.y;
    out.set(_ray.o.x + _ray.d.x * t, 0, _ray.o.z + _ray.d.z * t);
    return true;
  }

  /**
   * 在 2D 场地坐标 (fx, fy) 脚下亮一下。power = 网页小样里那套强度(火球命中约 110、落雷约 170 往上),
   * range = 照多远(米);亮起后保持 hold 秒,再按 tau 秒的时间常数熄掉;height = 灯离地多高(米)。
   */
  pulse(fx: number, fy: number, color: [number, number, number], power: number, range: number, hold: number, tau: number, height = 2.0): void {
    if (!this.attached) {
      return;
    }
    if (!this.fieldToGround(fx, fy, _w)) {
      return;
    }
    if (this.pulses.length > 24) {
      this.pulses.shift();
    }
    this.pulses.push({ x: _w.x, y: height, z: _w.z + 0.3, r: color[0], g: color[1], b: color[2], peak: power, range, hold, tau, age: 0 });
  }

  private tick(): void {
    if (!this.attached) {
      return;
    }
    const owner = this.owner;
    if (!owner || !owner.root || !owner.root.isValid || owner.root !== this.root2d) {
      this.detach();   // 这一局的场地没了(退出 / 重建):撤掉;重建的话渲染器会再调一次 mountBackground 把它接回来
      return;
    }
    const dt = Math.min(0.1, game.deltaTime);
    this.time += dt;
    // 每个脉冲当前有多亮:两帧内亮起 → 保持 → 指数熄灭(暗到看不出就丢掉)
    const live: Array<{ p: Pulse; v: number }> = [];
    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const p = this.pulses[i];
      p.age += dt;
      const v = p.peak * Math.min(1, p.age / 0.03) * (p.age <= p.hold ? 1 : Math.exp(-(p.age - p.hold) / p.tau));
      if (p.age > p.hold && v < 1) {
        this.pulses.splice(i, 1);
        continue;
      }
      live.push({ p, v });
    }
    live.sort((a, b) => b.v - a.v);
    for (let i = 0; i < this.dyn.length; i += 1) {
      const L = this.dyn[i];
      const it = i < CFG.dynLights ? live[i] : undefined;
      if (!it || it.v < 0.5) {
        if (L.node.active) {
          L.node.active = false;
        }
        continue;
      }
      if (!L.node.active) {
        L.node.active = true;
      }
      L.node.setPosition(it.p.x, it.p.y, it.p.z);
      L.color = new Color(Math.round(it.p.r * 255), Math.round(it.p.g * 255), Math.round(it.p.b * 255), 255);
      L.range = it.p.range;
      L.luminousFlux = it.v * CFG.fluxK;
    }
    // 火盆:火苗和光斑一起摇
    for (let i = 0; i < BRAZIERS.length; i += 1) {
      const n = Math.sin(this.time * 7 + i * 9.1) * 0.5 + Math.sin(this.time * 16.1 + i * 15.5) * 0.3 + Math.sin(this.time * 35.7 + i * 5.5) * 0.2;
      const k = 1 + 0.16 * n;
      const f = this.flames[i];
      if (f) {
        f.setScale(0.95 * (1 + 0.06 * n), 1.5 * k, 1);
      }
      if (this.brazier[i] && this.brazier[i].node.active) {
        this.brazier[i].luminousFlux = 8.5 * CFG.fluxK * k;
      }
    }
  }

  // ───────────────────────── 调试 ─────────────────────────
  info(): Record<string, unknown> {
    return { on: this.attached, built: !!this.world, ...this.stats, cfg: { ...CFG }, pulses: this.pulses.length, lights: this.dyn.filter((L) => L.node.active).length, mobile: sys.isMobile, lastError: this.lastError };
  }

  /** 现场调参:改完立即生效(阴影 / 光强 / 点光上限)。 */
  set(patch: Partial<Cfg>): Record<string, unknown> {
    Object.assign(CFG, patch);
    if (this.moon) {
      this.moon.illuminance = CFG.moon;
    }
    if (this.attached) {
      director.getScene()!.globals.ambient.skyIllum = CFG.ambient;
      this.applyShadow();
    }
    for (const L of this.brazier) {
      L.node.active = CFG.brazierLights;
    }
    return this.info();
  }

  /** 战斗中直接开 / 关(对比同一帧用)。 */
  toggle(on: boolean): Record<string, unknown> {
    (globalThis as any).__LC_GUARD3D = on;
    const self = lastOwner;
    if (on && self && self.root && self.root.isValid) {
      this.attach(self, self.root);
    } else if (!on) {
      this.detach();
    }
    return this.info();
  }

  /** 把建好的场景和贴图彻底丢掉(下次进战场重建)。 */
  dispose(): void {
    this.detach();
    if (this.world && this.world.isValid) {
      this.world.destroy();
    }
    this.world = null;
    this.cam = null;
    this.moon = null;
    this.dyn = [];
    this.brazier = [];
    this.pools = [];
    this.flames = [];
  }
}

function quatOf(eulerDeg: Vec3) {
  const node = new Node();
  node.setRotationFromEuler(eulerDeg.x, eulerDeg.y, eulerDeg.z);
  return node.rotation.clone();
}

const g3d = new GuardScene3D();
let lastOwner: any = null;

function flagOn(): boolean {
  if (!sys.isBrowser) {
    return false;
  }
  const g = globalThis as any;
  if (g.__LC_GUARD3D !== undefined) {
    return !!g.__LC_GUARD3D;
  }
  try {
    return /[?&]guard3d=1\b/.test(location.search) || localStorage.getItem('lcGuard3d') === '1';
  } catch (error) {
    return false;
  }
}

/** 包一层渲染器原型上的方法:先跑原来的,再通知 3D 层;3D 层这边出任何错都不影响原来的流程。 */
function wrap(name: string, after: (self: any, args: any[], result: any) => void): void {
  const proto = LobbyGuardBattleRenderer.prototype as any;
  const orig = proto[name];
  if (typeof orig !== 'function' || orig.__g3d) {
    return;
  }
  const wrapped = function (this: any, ...args: any[]): any {
    const result = orig.apply(this, args);
    try {
      after(this, args, result);
    } catch (error) {
      console.warn('[g3d] hook', name, error);
    }
    return result;
  };
  (wrapped as any).__g3d = true;
  proto[name] = wrapped;
}

const rgbOf = (c: Color | null | undefined): [number, number, number] => (c ? [c.r / 255, c.g / 255, c.b / 255] : [1, 0.85, 0.6]);

function install(): void {
  // 背景建好之后:开关开着就把 3D 层接上(重排布局时渲染器会再调一次,正好重新对一遍相机)
  wrap('mountBackground', (self, args) => {
    lastOwner = self;
    if (flagOn()) {
      g3d.attach(self, args[0] as Node);
    }
  });
  // 普攻 / 弹道命中的爆闪:一下很短的小光
  wrap('spawnImpactFlash', (self, args) => {
    if (g3d.isOn()) {
      g3d.pulse(args[0], args[1] - self.unitSize() * 0.3, rgbOf(args[2] as Color), 30, 5, 0.02, 0.09, 1.4);
    }
  });
  // 召唤 / 合成 / 击杀的格位爆闪
  wrap('spawnCellBurst', (self, args) => {
    if (g3d.isOn()) {
      g3d.pulse(args[0], args[1] - self.unitSize() * 0.2, rgbOf(args[2] as Color), args[3] ? 120 : 70, args[3] ? 8 : 6, 0.05, 0.16, 1.8);
    }
  });
  // 英雄战技 / 大招:在目标(没有目标就在英雄身前)亮一盏,大招更亮更久
  wrap('spawnGuardSkillFx', (self, args, result) => {
    if (!g3d.isOn() || !result || args[1] === null || args[1] === undefined) {
      return;
    }
    const group = args[3];
    const ult = !group || !group.spec;
    const monster = args[2];
    const origin = self.cellCenter(args[1]);
    const at = monster ? { x: self.xToPx(monster.x), y: self.monsterY(monster.lane, monster.x) } : { x: origin.x + self.unitSize() * 1.6, y: origin.y };
    g3d.pulse(origin.x + self.unitSize() * 0.4, origin.y - self.unitSize() * 0.3, [1, 0.86, 0.62], 60, 6, 0.05, 0.12, 1.6);
    g3d.pulse(at.x, at.y - self.unitSize() * 0.3, ult ? [1, 0.8, 0.52] : [0.95, 0.82, 1], ult ? 220 : 130, ult ? 13 : 9, ult ? 0.9 : 0.25, ult ? 0.5 : 0.3, ult ? 2.6 : 2.0);
  });
  // 水晶法术:震荡(水晶处一圈蓝白)、神雷(落点一下很强的冷白)、冰封(落点一片持续的青光),其余给一下暖光
  wrap('playSpellFx', (self, args) => {
    if (!g3d.isOn()) {
      return;
    }
    const id = String(args[0]);
    const x = args[1] as number | null;
    const lane = args[2] as number;
    const unit = self.unitSize();
    const px = x === null || x === undefined ? self.xToPx(0.6) : self.xToPx(x);
    const py = (x === null || x === undefined ? self.walkwayY() : self.monsterY(lane, x)) - unit * 0.3;
    if (id === 'thunder') {
      g3d.pulse(px, py, [0.74, 0.84, 1], 300, 22, 0.1, 0.16, 3.0);
    } else if (id === 'frost') {
      g3d.pulse(px, py, [0.42, 0.8, 1], 120, 14, 1.6, 0.8, 1.9);
    } else if (id === 'quake') {
      g3d.pulse(self.xToPx(1.2), self.walkwayY() - unit * 0.3, [0.5, 0.74, 1], 150, 16, 0.6, 0.5, 2.2);
    } else {
      g3d.pulse(px, py, [1, 0.72, 0.4], 120, 12, 0.4, 0.4, 2.2);
    }
  });
  (globalThis as any).__g3d = { toggle: (on: boolean) => g3d.toggle(on), info: () => g3d.info(), set: (p: Partial<Cfg>) => g3d.set(p), dispose: () => g3d.dispose(), pulse: (...a: any[]) => (g3d.pulse as any)(...a) };
}

if (!EDITOR) {
  install();
}
