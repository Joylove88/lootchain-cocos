/**
 * 跑图自动寻路(2026-10-30 用户:「点击后可自动寻路」):
 * 把地图可走区(LobbyTownRenderer.walkable:外框 / 走廊 / 建筑 / 挡块)按 CELL 网格采样缓存,A* 找格子路径,
 * 再按视线拉直成少量折点交给队长沿路走。目的地不可走时就近找可走格。
 */
/** 默认格子边长(世界单位);整图场景的小巷 / 拱门比它窄,建寻路器时传更小的格子。 */
const CELL = 80;
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

  constructor(
    private readonly left: number, private readonly bottom: number, width: number, height: number, walkable: (x: number, y: number) => boolean,
    private readonly cell: number = CELL,
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
    const start = this.nearestOpen(this.col(sx), this.row(sy));
    const goal = this.nearestOpen(this.col(tx), this.row(ty));
    if (start < 0 || goal < 0) {
      return null;
    }
    if (start === goal) {
      return [{ x: tx, y: ty }];
    }
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
      for (const [dc, dr, cost] of DIRS) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
          continue;
        }
        const i = r * this.cols + c;
        // 斜走不切墙角
        if (!this.grid[i] || closed[i] || (dc !== 0 && dr !== 0 && (!this.grid[r0 * this.cols + c] || !this.grid[r * this.cols + c0]))) {
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
    cells.reverse();
    const raw: PathPoint[] = cells.map((i) => ({ x: this.cx(i % this.cols), y: this.cy(Math.floor(i / this.cols)) }));
    raw[raw.length - 1] = this.open(this.col(tx), this.row(ty)) ? { x: tx, y: ty } : raw[raw.length - 1];
    return this.smooth({ x: sx, y: sy }, raw);
  }

  /** 视线拉直:从当前点尽量直连到更远的折点。 */
  private smooth(start: PathPoint, raw: PathPoint[]): PathPoint[] {
    const out: PathPoint[] = [];
    let anchor = start;
    let i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !this.lineOpen(anchor, raw[j])) {
        j -= 1;
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

  /** 最近的可走格(螺旋外扩,最多 12 圈);没有返回 -1。 */
  private nearestOpen(c: number, r: number): number {
    const rings = Math.ceil((12 * CELL) / this.cell);
    for (let d = 0; d <= rings; d += 1) {
      for (let dr = -d; dr <= d; dr += 1) {
        for (let dc = -d; dc <= d; dc += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) {
            continue;
          }
          if (this.open(c + dc, r + dr)) {
            return (r + dr) * this.cols + (c + dc);
          }
        }
      }
    }
    return -1;
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
