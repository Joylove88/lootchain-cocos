# -*- coding: utf-8 -*-
"""主城(月夜)自动寻路离线模拟:把游戏里的寻路 + 沿路走位逻辑原样搬过来(LobbyTownPathfinder.find / clear、
LobbyTownRenderer.autoPathVector / stepLeader 的分轴碰撞与沿墙滑 / watchAutoWalk 卡住重寻路),
在可走栅格上随机抽起终点跑,找「走着走着卡住 / 被兜底放弃」的地方。实机一轮只走得了十来段,这个几分钟能跑几百段。

  python tools/qa/city_moon_walk_sim.py [对数=300] [--fps=60,30,20] [--one=x0,y0,x1,y1] [--no-los]

输出:每档帧率 成功 / 放弃 / 超时 的段数;失败的段打印起终点(世界坐标)和卡住时所在的格子,
可以拿去喂 city_moon_web.py --debug-walk=x0,y0,x1,y1 在实机里复现。
改了 autoPathVector / stepLeader / Pathfinder 的逻辑,这里要跟着改,否则模拟就不作数了。
"""
import heapq
import io
import json
import math
import os
import random
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UNIT = 2240 / 1672
SPEED = 475.0          # 队长跑速(世界单位 / 秒;实机逐帧位移反推)
# --no-los:关掉「换折点前先判直线可达」(= 修正前的行为),用来确认模拟能复现实机卡住
LOS_RULE = '--no-los' not in sys.argv
DIRS = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)), (-1, -1, math.sqrt(2))]


def load():
    s = io.open(os.path.join(ROOT, 'assets', 'scripts', 'scenes', 'lobby', 'LobbyCityMoonData.ts'), encoding='utf-8').read()
    d, _ = json.JSONDecoder().raw_decode(s[s.index('= {"px"') + 2:])
    return d


class Sim:
    def __init__(self, d):
        self.W, self.H = d['px']
        self.cpx = d['cell']
        self.cols = d['cols']
        self.rows = len(d['walk'])
        self.bits = [[(int(row[c >> 2], 16) >> (3 - (c & 3))) & 1 for c in range(self.cols)] for row in d['walk']]
        self.map_w = round(self.W * UNIT)
        self.map_h = round(self.H * UNIT)
        self.bound = (-self.map_w / 2 + 12, self.map_w / 2 - 12, -self.map_h / 2 + 12, self.map_h / 2 - 12)
        # 寻路网格(LobbyTownRenderer.makePathfinder):和可走栅格一一对应,行从下往上数
        self.cell = self.cpx * UNIT
        self.left = (-self.W / 2) * UNIT
        self.bottom = (self.H / 2 - self.rows * self.cpx) * UNIT
        self.pc = max(1, math.ceil(self.cols * self.cell / self.cell - 1e-9))
        self.pr = max(1, math.ceil(self.rows * self.cell / self.cell - 1e-9))
        self.grid = [[1 if self.walkable(self.cx(c), self.cy(r)) else 0 for c in range(self.pc)] for r in range(self.pr)]

    # ── 可走判定(sceneWalkable + 地图外框)──
    def walkable(self, x, y):
        l, r, b, t = self.bound
        if x < l or x > r or y < b or y > t:
            return False
        c = math.floor((x / UNIT + self.W / 2) / self.cpx)
        rr = math.floor((self.H / 2 - y / UNIT) / self.cpx)
        return 0 <= c < self.cols and 0 <= rr < self.rows and self.bits[rr][c] == 1

    # ── 寻路器 ──
    def col(self, x):
        return math.floor((x - self.left) / self.cell)

    def row(self, y):
        return math.floor((y - self.bottom) / self.cell)

    def cx(self, c):
        return self.left + (c + 0.5) * self.cell

    def cy(self, r):
        return self.bottom + (r + 0.5) * self.cell

    def open(self, c, r):
        return 0 <= c < self.pc and 0 <= r < self.pr and self.grid[r][c] == 1

    def nearest_open(self, c, r):
        rings = math.ceil(12 * 80 / self.cell)
        for d in range(rings + 1):
            for dr in range(-d, d + 1):
                for dc in range(-d, d + 1):
                    if max(abs(dc), abs(dr)) != d:
                        continue
                    if self.open(c + dc, r + dr):
                        return (c + dc, r + dr)
        return None

    def line_open(self, a, b):
        steps = math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / (self.cell * 0.5))
        for k in range(1, steps + 1):
            t = k / steps
            if not self.open(self.col(a[0] + (b[0] - a[0]) * t), self.row(a[1] + (b[1] - a[1]) * t)):
                return False
        return True

    def clear(self, ax, ay, bx, by):
        ln = math.hypot(bx - ax, by - ay)
        steps = max(1, math.ceil(ln / (self.cell * 0.25)))
        ox = (-(by - ay) / ln) * self.cell * 0.25 if ln > 0 else 0
        oy = ((bx - ax) / ln) * self.cell * 0.25 if ln > 0 else 0
        for k in range(steps + 1):
            t = k / steps
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            if not self.open(self.col(x), self.row(y)) or not self.open(self.col(x + ox), self.row(y + oy)) or not self.open(self.col(x - ox), self.row(y - oy)):
                return False
        return True

    def find(self, sx, sy, tx, ty):
        start = self.nearest_open(self.col(sx), self.row(sy))
        goal = self.nearest_open(self.col(tx), self.row(ty))
        if start is None or goal is None:
            return None
        if start == goal:
            return [(tx, ty)]
        g = {start: 0.0}
        frm = {}
        closed = set()
        heap = [(math.hypot(start[0] - goal[0], start[1] - goal[1]), start)]
        while heap:
            _f, cur = heapq.heappop(heap)
            if cur == goal:
                break
            if cur in closed:
                continue
            closed.add(cur)
            c0, r0 = cur
            for dc, dr, cost in DIRS:
                c, r = c0 + dc, r0 + dr
                if not self.open(c, r) or (c, r) in closed:
                    continue
                if dc != 0 and dr != 0 and (not self.grid[r0][c] or not self.grid[r][c0]):
                    continue
                ng = g[cur] + cost
                if ng < g.get((c, r), 1e18):
                    g[(c, r)] = ng
                    frm[(c, r)] = cur
                    heapq.heappush(heap, (ng + math.hypot(c - goal[0], r - goal[1]), (c, r)))
        if goal not in frm:
            return None
        cells = []
        i = goal
        while i != start:
            cells.append(i)
            i = frm[i]
        cells.reverse()
        raw = [(self.cx(c), self.cy(r)) for c, r in cells]
        if self.open(self.col(tx), self.row(ty)):
            raw[-1] = (tx, ty)
        out = []
        anchor = (sx, sy)
        i = 0
        while i < len(raw):
            j = len(raw) - 1
            while j > i and not self.line_open(anchor, raw[j]):
                j -= 1
            out.append(raw[j])
            anchor = raw[j]
            i = j + 1
        return out

    # ── 沿路走(一帧)──
    def walk(self, sx, sy, tx, ty, fps):
        dt = 1.0 / fps
        step = SPEED * dt
        near = self.cell * 1.2
        path = self.find(sx, sy, tx, ty)
        if not path:
            return 'nopath', (sx, sy), 0
        x, y = sx, sy
        probe = [x, y, 0.0, 0]
        now = 0.0
        limit = int(sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip([(sx, sy)] + path, path)) / step * 3 + 600)
        for frame in range(limit):
            now += dt
            # watchAutoWalk
            if now - probe[2] >= 0.6:
                moved = math.hypot(x - probe[0], y - probe[1])
                probe[0], probe[1], probe[2] = x, y, now
                if moved >= 12:
                    probe[3] = 0
                else:
                    probe[3] += 1
                    if probe[3] > 3:
                        return 'gaveup', (x, y), frame
                    path = self.find(x, y, tx, ty)
                    if not path:
                        return 'gaveup', (x, y), frame
            # autoPathVector
            while path:
                dist = math.hypot(path[0][0] - x, path[0][1] - y)
                if dist >= (near if len(path) > 1 else 48):
                    break
                if LOS_RULE and len(path) > 1 and dist > 10 and not self.clear(x, y, path[1][0], path[1][1]):
                    break
                path.pop(0)
            if not path:
                return 'ok', (x, y), frame
            dx = path[0][0] - x
            dy = (path[0][1] - y) / 0.8
            ln = max(1.0, math.hypot(dx, dy))
            vx, vy = dx / ln, dy / ln
            # stepLeader:分轴碰撞 + 两个轴都挡住时沿墙滑
            nx, ny = x + vx * step, y + vy * step * 0.8
            ox, oy = x, y
            if self.walkable(nx, y):
                x = nx
            if self.walkable(x, ny):
                y = ny
            if x == ox and y == oy:
                for sxd, syd in ((-vy, vx), (vy, -vx)):
                    px, py = ox + sxd * step * 0.7, oy + syd * step * 0.56
                    if (sxd * vx + syd * vy) > -0.01 and self.walkable(px, py):
                        x, y = px, py
                        break
        return 'timeout', (x, y), limit

    def cell_of(self, x, y):
        return (round((x / UNIT + self.W / 2) / self.cpx, 2), round((self.H / 2 - y / UNIT) / self.cpx, 2))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    pairs = int(args[0]) if args else 300
    fps_list = [int(v) for v in next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--fps=')), '60,30,20').split(',')]
    sim = Sim(load())
    one = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--one=')), '')
    if one:
        # --one=x0,y0,x1,y1:只跑这一段(世界坐标)
        x0, y0, x1, y1 = [float(v) for v in one.split(',')]
        for fps in fps_list:
            res, at, frames = sim.walk(x0, y0, x1, y1, fps)
            print('fps', fps, res, 'frames', frames, 'at', (round(at[0], 1), round(at[1], 1)), 'cell', sim.cell_of(*at))
        return
    open_cells = [(c, r) for r in range(sim.pr) for c in range(sim.pc) if sim.grid[r][c]]
    print('grid', sim.pc, 'x', sim.pr, 'open cells', len(open_cells), 'cell', round(sim.cell, 3))
    rnd = random.Random(20261111)
    jobs = []
    for _ in range(pairs):
        (c0, r0), (c1, r1) = rnd.choice(open_cells), rnd.choice(open_cells)
        # 起点不在格子正中(实机里人站哪儿都有可能):格内随机偏一点
        jobs.append((sim.cx(c0) + rnd.uniform(-0.45, 0.45) * sim.cell, sim.cy(r0) + rnd.uniform(-0.45, 0.45) * sim.cell,
                     sim.cx(c1), sim.cy(r1)))
    for fps in fps_list:
        stats = {'ok': 0, 'gaveup': 0, 'timeout': 0, 'nopath': 0}
        bad = []
        for sx, sy, tx, ty in jobs:
            if not sim.walkable(sx, sy):
                sx, sy = sim.cx(sim.col(sx)), sim.cy(sim.row(sy))
            res, at, frames = sim.walk(sx, sy, tx, ty, fps)
            stats[res] += 1
            if res != 'ok':
                bad.append((res, round(sx), round(sy), round(tx), round(ty), sim.cell_of(*at)))
        print('fps', fps, stats)
        for item in bad[:12]:
            print('   ', item)


if __name__ == '__main__':
    main()
