import { ImageAsset, Material, Mesh, MeshRenderer, Node, resources, Texture2D, utils } from 'cc';

/**
 * 守卫战全 3D 样板 · 公共小件:贴图 / 材质 / 挂网格、把内置着色器带进运行时、每帧重写的动态网格。
 */

export function tex(cv: HTMLCanvasElement, repeat: boolean, aniso = 4): Texture2D {
  const t = new Texture2D();
  const wrap = repeat ? Texture2D.WrapMode.REPEAT : Texture2D.WrapMode.CLAMP_TO_EDGE;
  t.setWrapMode(wrap, wrap);
  t.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  t.setMipFilter(Texture2D.Filter.LINEAR);   // 要在第一次上传前设好,引擎才会生成多级渐远
  t.setAnisotropy(aniso);
  t.image = new ImageAsset(cv);
  return t;
}

export function material(effect: string, defines: Record<string, boolean | number>, technique = 0): Material {
  const m = new Material();
  m.initialize({ effectName: effect, defines, technique });
  return m;
}

export function addMesh(parent: Node, name: string, mesh: Mesh, mat: Material, cast: boolean, receive: boolean): Node {
  const n = new Node(name);
  parent.addChild(n);
  const mr = n.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = cast ? MeshRenderer.ShadowCastingMode.ON : MeshRenderer.ShadowCastingMode.OFF;
  mr.receiveShadow = receive ? MeshRenderer.ShadowReceivingMode.ON : MeshRenderer.ShadowReceivingMode.OFF;
  return n;
}

/**
 * 项目平时用不到的内置着色器(3D 标准材质、泛光、抗锯齿)运行时根本没加载。
 * resources/effects/g3d-*.mtl 是一组只为「把它们带进包里」而存在的材质:读一次,着色器就注册好了;
 * 泛光 / 抗锯齿那两张还直接拿来当后期材质用。
 */
const kept: Record<string, Material> = {};

export function keptMaterial(name: string): Material | null {
  return kept[name] ?? null;
}

export function loadKit(names: string[], done: (missing: string[]) => void): void {
  const missing: string[] = [];
  let left = names.length;
  if (!left) {
    done(missing);
    return;
  }
  for (const name of names) {
    if (kept[name]) {
      left -= 1;
      if (!left) {
        done(missing);
      }
      continue;
    }
    resources.load(`effects/${name}`, Material, (error, mat) => {
      if (error || !mat) {
        missing.push(name);
        console.warn('[g3d] load', name, error?.message);
      } else {
        mat.addRef();   // 别被回收(着色器会跟着卸掉)
        kept[name] = mat;
      }
      left -= 1;
      if (!left) {
        done(missing);
      }
    });
  }
}

/**
 * 每帧重写的网格(粒子、闪电、披风):顶点直接写进定长数组,一次上传、一次绘制。
 * 引擎的动态网格按「位置 / 法线 / 贴图坐标 / 切线 / 颜色」的固定顺序对缓冲,所以每次更新都要把建的时候有的那几路全给上。
 */
export class DynMesh {
  readonly node: Node;
  readonly mesh: Mesh;
  readonly mr: MeshRenderer;
  readonly pos: Float32Array;
  readonly nrm: Float32Array | null;
  readonly uv: Float32Array;
  readonly tan: Float32Array | null;
  readonly col: Float32Array;
  readonly idx: Uint16Array;
  nv = 0;
  ni = 0;
  private readonly maxV: number;
  private readonly maxI: number;

  constructor(parent: Node, name: string, mat: Material, maxVerts: number, maxIndices: number, lit = false, cast = false) {
    this.maxV = Math.min(65000, maxVerts);
    this.maxI = maxIndices;
    this.pos = new Float32Array(this.maxV * 3);
    this.nrm = lit ? new Float32Array(this.maxV * 3) : null;
    this.uv = new Float32Array(this.maxV * 2);
    this.tan = lit ? new Float32Array(this.maxV * 4) : null;
    this.col = new Float32Array(this.maxV * 4);
    this.idx = new Uint16Array(this.maxI);
    // 建的时候先给一个退化三角:各路缓冲的属性靠「数组非空」来声明
    this.nv = 3;
    this.ni = 3;
    this.idx[1] = 1;
    this.idx[2] = 2;
    this.mesh = utils.MeshUtils.createDynamicMesh(0, this.geometry(true), undefined, { maxSubMeshes: 1, maxSubMeshVertices: this.maxV, maxSubMeshIndices: this.maxI });
    this.node = new Node(name);
    parent.addChild(this.node);
    this.mr = this.node.addComponent(MeshRenderer);
    this.mr.mesh = this.mesh;
    this.mr.setSharedMaterial(mat, 0);
    this.mr.shadowCastingMode = cast ? MeshRenderer.ShadowCastingMode.ON : MeshRenderer.ShadowCastingMode.OFF;
    this.mr.receiveShadow = lit ? MeshRenderer.ShadowReceivingMode.ON : MeshRenderer.ShadowReceivingMode.OFF;
    this.mr.onGeometryChanged();
  }

  private geometry(withBounds: boolean): any {
    const g: any = {
      positions: this.pos.subarray(0, this.nv * 3),
      uvs: this.uv.subarray(0, this.nv * 2),
      colors: this.col.subarray(0, this.nv * 4),
      indices16: this.idx.subarray(0, this.ni),
    };
    if (this.nrm && this.tan) {
      g.normals = this.nrm.subarray(0, this.nv * 3);
      g.tangents = this.tan.subarray(0, this.nv * 4);
    }
    if (withBounds) {
      // 包围盒给一个罩住整个战场的大盒子:不做视锥剔除,也就不用每帧重算
      g.minPos = { x: -60, y: -4, z: -60 };
      g.maxPos = { x: 60, y: 40, z: 60 };
    }
    return g;
  }

  begin(): void {
    this.nv = 0;
    this.ni = 0;
  }

  /** 还放得下这么多顶点 / 索引吗。 */
  room(verts: number, indices: number): boolean {
    return this.nv + verts <= this.maxV && this.ni + indices <= this.maxI;
  }

  vert(x: number, y: number, z: number, u: number, v: number, r: number, g: number, b: number, a: number): number {
    const i = this.nv;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = v;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.nv = i + 1;
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx[this.ni] = a;
    this.idx[this.ni + 1] = b;
    this.idx[this.ni + 2] = c;
    this.ni += 3;
  }

  /** 四个角(逆时针)各带自己的贴图坐标,同一个颜色。 */
  quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    u0: number, v0: number, u1: number, v1: number, r: number, g: number, b: number, a: number): void {
    if (!this.room(4, 6)) {
      return;
    }
    const i = this.vert(ax, ay, az, u0, v1, r, g, b, a);
    this.vert(bx, by, bz, u1, v1, r, g, b, a);
    this.vert(cx, cy, cz, u1, v0, r, g, b, a);
    this.vert(dx, dy, dz, u0, v0, r, g, b, a);
    this.tri(i, i + 1, i + 2);
    this.tri(i, i + 2, i + 3);
  }

  end(): void {
    if (this.nv < 3 || this.ni < 3) {
      // 空的时候留一个看不见的退化三角(顶点数给 0 的话,有的驱动会对空缓冲报警告)
      this.nv = 0;
      this.ni = 0;
      for (let k = 0; k < 3; k += 1) {
        this.vert(0, -50, 0, 0, 0, 0, 0, 0, 0);
      }
      this.tri(0, 1, 2);
    }
    this.mesh.updateSubMesh(0, this.geometry(false));
    this.mr.onGeometryChanged();   // 顶点 / 索引数变了要通知渲染那边,否则还按建的时候那 3 个顶点画
  }
}
