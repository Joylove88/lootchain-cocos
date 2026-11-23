/**
 * 跑图自动寻路(2026-10-30 用户:「点击后可自动寻路」):
 * 把地图可走区(LobbyTownRenderer.walkable:外框 / 走廊 / 建筑 / 挡块)按 CELL 网格采样缓存,A* 找格子路径,
 * 再按视线拉直成少量折点交给队长沿路走。目的地不可走时就近找可走格。
 *
 * 11-22 策划通玩:晨风村训练场一圈栅栏 / 武器棚比格子细(格子只采中心点),网格看不见,A* 和拉直都会直接穿过去,
 * 队长顶在栅栏上原地抖、三次后放弃。现在:A* 先在粗网格上找路,再沿路逐段用真实碰撞(walkable)细查,
 * 不通的边记成堵死再找(只查候选路上的边,开销小,结果按图缓存);拉直也改用真实碰撞细查。
 * 有可进入场地的图还要用 40 的细格子(见 LobbyTownRenderer.makePathfinder):训练场门口通道只有一格多宽,80 的格子连不上。
 */
/** 默认格子边长(世界单位);整图场景的小巷 / 拱门比它窄,建寻路器时传更小的格子。 */
const CELL = 80;
/** 真实碰撞细查的步长(世界单位):栅栏带子约 20~30 宽,12 一步漏不掉。 */
const PROBE_STEP = 12;
const DIRS: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export interface PathPoint {
  x: number;
  y: number;
}

export class TownPathfinder {
  private readonly cols: number;
  private readonly rows: number;
  private readonly grid: Uint8Array;
  /** 相邻格之间的边:0 没查过 / 1 通 / 2 堵(按格子序号 × 8 + 方向),整张图寿命内缓存。 */
  private edges: Uint8Array | null = null;

  constructor(
    private readonly left: number, private readonly bottom: number, width: number, height: number, private readonly walkable: (x: number, y: number) => boolean,
    private readonly cell: number = CELL,
    /** 哪些边要在搜索时就用真实碰撞细查(细障碍所在的范围,如训练场一圈栅栏);不传 = 只在找到路后逐段查。 */
    private readonly probe: ((ax: number, ay: number, bx: number, by: number) => boolean) | null = null,
  ) {
    this.cols = Math.max(1, Math.ceil(width / this.cell));
    this.rows = Math.max(1, Math.ceil(height / this.cell));
    this.grid = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        this.grid[r * this.cols + c] = walkable(this.cx(c), this.cy(r)) ? 1 : 0;
      }
    }
  }

  /** 从 (sx, sy) 到 (tx, ty) 的折点(不含起点);走不到返回 null。 */
  find(sx: number, sy: number, tx: number, ty: number): PathPoint[] | null {
    // 起止格各有几个候选(见 anchorCells):首选格在网格上走不通(落进一小块和外面不连的格子)就换下一个再找
    const starts = this.anchorCells(sx, sy);
    const goals = this.anchorCells(tx, ty);
    for (let a = 0; a < Math.min(3, starts.length); a += 1) {
      for (let b = 0; b < Math.min(2, goals.length); b += 1) {
        const path = this.route(sx, sy, tx, ty, starts[a], goals[b]);
        if (path) {
          return path;
        }
      }
    }
    return null;
  }

  private route(sx: number, sy: number, tx: number, ty: number, start: number, goal: number): PathPoint[] | null {
    if (start === goal) {
      const s = { x: sx, y: sy };
      const t = { x: tx, y: ty };
      const c = this.center(goal);
      return !this.rawLine(s, t) && this.rawLine(s, c) && this.rawLine(c, t) ? [c, t] : [t];
    }
    // 粗网格找路 → 沿路逐段细查真实碰撞 → 有堵死的边就记下来再找(一般几轮收敛)
    for (let attempt = 0; attempt < 48; attempt += 1) {
      const cells = this.search(start, goal);
      if (!cells) {
        return null;
      }
      let ok = true;
      for (let k = 1; k < cells.length; k += 1) {
        if (!this.edgeOpen(cells[k - 1], cells[k])) {
          ok = false;
        }
      }
      if (ok) {
        return this.buildPath(sx, sy, tx, ty, cells);
      }
    }
    return null;
  }

  /** 粗网格 A*:返回从 start 到 goal 的格子序号(含两端);不通返回 null。已查出堵死的边不走。 */
  private search(start: number, goal: number): number[] | null {
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    // 二叉堆(f 值小顶)
    const heap: number[] = [];
    const f = new Float32Array(n).fill(Infinity);
    const gc = goal % this.cols;
    const gr = Math.floor(goal / this.cols);
    const h = (i: number): number => Math.hypot((i % this.cols) - gc, Math.floor(i / this.cols) - gr);
    const push = (i: number): void => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) {
          break;
        }
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const a = 2 * k + 1;
          const b = a + 1;
          let m = k;
          if (a < heap.length && f[heap[a]] < f[heap[m]]) m = a;
          if (b < heap.length && f[heap[b]] < f[heap[m]]) m = b;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    g[start] = 0;
    f[start] = h(start);
    push(start);
    while (heap.length > 0) {
      const cur = pop();
      if (cur === goal) {
        break;
      }
      if (closed[cur]) {
        continue;
      }
      closed[cur] = 1;
      const c0 = cur % this.cols;
      const r0 = Math.floor(cur / this.cols);
      for (let d = 0; d < DIRS.length; d += 1) {
        const [dc, dr, cost] = DIRS[d];
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
          continue;
        }
        const i = r * this.cols + c;
        // 斜走不切墙角;已查出堵死的边不走
        if (!this.grid[i] || closed[i] || (dc !== 0 && dr !== 0 && (!this.grid[r0 * this.cols + c] || !this.grid[r * this.cols + c0]))
          || (this.edges && this.edges[cur * 8 + d] === 2)) {
          continue;
        }
        // 细障碍范围(训练场)里的边当场细查(结果缓存),整圈栅栏不用靠「找到再堵」一轮轮试
        if (this.probe && this.probe(this.cx(c0), this.cy(r0), this.cx(c), this.cy(r)) && !this.edgeOpen(cur, i)) {
          continue;
        }
        const ng = g[cur] + cost;
        if (ng < g[i]) {
          g[i] = ng;
          f[i] = ng + h(i);
          from[i] = cur;
          push(i);
        }
      }
    }
    if (from[goal] < 0) {
      return null;
    }
    const cells: number[] = [];
    for (let i = goal; i !== start && i >= 0; i = from[i]) {
      cells.push(i);
    }
    cells.push(start);
    cells.reverse();
    return cells;
  }

  /** 格子路 → 折点:去掉起点格,终点格可走就落到确切目标点,再用真实碰撞拉直。 */
  private buildPath(sx: number, sy: number, tx: number, ty: number, cells: number[]): PathPoint[] {
    const raw: PathPoint[] = cells.slice(1).map((i) => this.center(i));
    // 终点:从终点格中心直线走得到目标就落到确切目标点;目标本身站不了人(建筑脚底等)时照旧按格子判
    const target = { x: tx, y: ty };
    if (this.rawLine(raw[raw.length - 1], target) || (!this.walkable(tx, ty) && this.open(this.col(tx), this.row(ty)))) {
      raw[raw.length - 1] = target;
    }
    // 人站在起点格边上时,直接去下一格中心可能隔着栅栏:先回本格中心
    const start = { x: sx, y: sy };
    const startCenter = this.center(cells[0]);
    if (!this.rawLine(start, raw[0]) && this.rawLine(start, startCenter)) {
      raw.unshift(startCenter);
    }
    return this.smooth(start, raw);
  }

  /** 相邻两格中心之间的直线用真实碰撞细查(两个方向一起缓存)。 */
  private edgeOpen(a: number, b: number): boolean {
    const dc = (b % this.cols) - (a % this.cols);
    const dr = Math.floor(b / this.cols) - Math.floor(a / this.cols);
    const d = DIRS.findIndex(([x, y]) => x === dc && y === dr);
    if (d < 0) {
      return true;
    }
    if (!this.edges) {
      this.edges = new Uint8Array(this.cols * this.rows * 8);
    }
    const known = this.edges[a * 8 + d];
    if (known) {
      return known === 1;
    }
    const open = this.rawLine({ x: this.cx(a % this.cols), y: this.cy(Math.floor(a / this.cols)) }, { x: this.cx(b % this.cols), y: this.cy(Math.floor(b / this.cols)) });
    const back = DIRS.findIndex(([x, y]) => x === -dc && y === -dr);
    this.edges[a * 8 + d] = open ? 1 : 2;
    this.edges[b * 8 + back] = open ? 1 : 2;
    return open;
  }

  /** a → b 直线上每 PROBE_STEP 一个点都能站(和队长移动同一套真实碰撞)。 */
  private rawLine(a: PathPoint, b: PathPoint): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PROBE_STEP));
    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      if (!this.walkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) {
        return false;
      }
    }
    return true;
  }

  /** 视线拉直:从当前点往前尽量直连到更远的折点(网格先粗筛,再用真实碰撞细查,栅栏这种细障碍不会被拉直穿过去)。 */
  private smooth(start: PathPoint, raw: PathPoint[]): PathPoint[] {
    const out: PathPoint[] = [];
    let anchor = start;
    let i = 0;
    while (i < raw.length) {
      let j = i;
      while (j + 1 < raw.length && this.lineOpen(anchor, raw[j + 1]) && this.rawLine(anchor, raw[j + 1])) {
        j += 1;
      }
      out.push(raw[j]);
      anchor = raw[j];
      i = j + 1;
    }
    return out;
  }

  private lineOpen(a: PathPoint, b: PathPoint): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (this.cell * 0.5));
    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      if (!this.open(this.col(a.x + (b.x - a.x) * t), this.row(a.y + (b.y - a.y) * t))) {
        return false;
      }
    }
    return true;
  }

  /**
   * 从 a 到 b 的直线(连同左右各 1/4 格的余量)上全是可走格。比 lineOpen 采样密、还留了身位:
   * 沿路走的时候判断「现在能不能直接去下一个折点」用——只按距离提前换折点,人还没绕过墙角就会顶在墙角上。
   */
  clear(ax: number, ay: number, bx: number, by: number): boolean {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.25)));
    const ox = len > 0 ? (-(by - ay) / len) * this.cell * 0.25 : 0;
    const oy = len > 0 ? ((bx - ax) / len) * this.cell * 0.25 : 0;
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if (!this.open(this.col(x), this.row(y)) || !this.open(this.col(x + ox), this.row(y + oy)) || !this.open(this.col(x - ox), this.row(y - oy))) {
        return false;
      }
    }
    return true;
  }

  /**
   * 起点 / 终点落在哪一格的候选,按优先级:离这个点最近、且从这个点直线走得到格子中心(真实碰撞)的可走格在前,
   * 然后是不管直线、只按远近的最近可走格(= 11-23 前的选法)。都没有返回空数组。
   * 11-23 策划通玩:原先只按螺旋顺序取第一个可走格 —— 人贴着细墙站、本格中心落在墙带里(或本格中心在墙另一侧)时,
   * 取到的常是墙那边的格子,算出的路第一步就穿墙,队长顶着墙原地抖。但直线走得到的那格有时落在一小块和外面不连的格子里
   * (窄缝里格子之间的边被细查判堵),所以旧选法留作后备,find 走不通时换着试。
   * 直线只在 3 圈内找;3 圈内一个可走格都没有就接着外扩(最多约 12 个默认格)找最近的。
   */
  private anchorCells(x: number, y: number): number[] {
    const c0 = this.col(x);
    const r0 = this.row(y);
    const here = { x, y };
    const rings = Math.ceil((12 * CELL) / this.cell);
    const reach: number[] = [];
    const near: number[] = [];
    for (let d = 0; d <= rings; d += 1) {
      const ring: Array<{ i: number; dist: number }> = [];
      for (let dr = -d; dr <= d; dr += 1) {
        for (let dc = -d; dc <= d; dc += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) === d && this.open(c0 + dc, r0 + dr)) {
            ring.push({ i: (r0 + dr) * this.cols + (c0 + dc), dist: Math.hypot(this.cx(c0 + dc) - x, this.cy(r0 + dr) - y) });
          }
        }
      }
      ring.sort((a, b) => a.dist - b.dist);
      for (const { i } of ring) {
        if (near.length < 2) {
          near.push(i);
        }
        if (d <= 3 && reach.length < 2 && this.rawLine(here, this.center(i))) {
          reach.push(i);
        }
      }
      if (d >= 3 && near.length > 0) {
        break;
      }
    }
    // 顺序:直线首选 → 最近(旧选法)→ 直线次选 → 最近次选,去重
    const out: number[] = [];
    for (const i of [reach[0], near[0], reach[1], near[1]]) {
      if (i !== undefined && out.indexOf(i) < 0) {
        out.push(i);
      }
    }
    return out;
  }

  private center(i: number): PathPoint {
    return { x: this.cx(i % this.cols), y: this.cy(Math.floor(i / this.cols)) };
  }

  private open(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.grid[r * this.cols + c] === 1;
  }

  private col(x: number): number {
    return Math.floor((x - this.left) / this.cell);
  }

  private row(y: number): number {
    return Math.floor((y - this.bottom) / this.cell);
  }

  private cx(c: number): number {
    return this.left + (c + 0.5) * this.cell;
  }

  private cy(r: number): number {
    return this.bottom + (r + 0.5) * this.cell;
  }
}

/** 玩家可读坐标:左上角起每 100 世界单位一格(正整数)。 */
export function townCoordText(x: number, y: number, mapW: number, mapH: number): string {
  return `${Math.max(0, Math.round((x + mapW / 2) / 100))} , ${Math.max(0, Math.round((mapH / 2 - y) / 100))}`;
}
