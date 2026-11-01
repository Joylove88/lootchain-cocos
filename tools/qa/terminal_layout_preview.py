"""终端自适应版式离线预览(与 LobbyTerminalPanelRenderer 同一套切段 / 拉伸逻辑):python tools/qa/terminal_layout_preview.py <宽> <高> <输出.jpg>"""
import sys
from PIL import Image

SW, SH, OUT = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
W, H = 1870, 841
TOP, BOT, SPLIT = 104, 733, 619
ROWS = {'card': [320, 500, 527, 714], 'tile': [124, 294, 342, 503, 554, 712]}
D = 'assets/resources/ui/town/terminal/'
u = min(SW / W, SH / H)
extra = max(0, SH / u - H)
p = Image.open(D + 'panels_b.png')
bg = Image.open(D + 'bg_b.jpg').convert('RGBA')
kc = max(SW / bg.width, SH / bg.height)
b2 = bg.resize((round(bg.width * kc), round(bg.height * kc)))
can = Image.new('RGBA', (SW, SH))
can.paste(b2, ((SW - b2.width) // 2, (SH - b2.height) // 2))
ox = (SW - W * u) / 2
oy = (SH - (H + extra) * u) / 2


def m(col, py):
    if py < TOP or col == 'other':
        return py + extra if py >= BOT else py
    each = extra / len(ROWS[col])
    s = py
    for r in ROWS[col]:
        if py >= r + 1:
            s += each
        elif py > r:
            s += each * (py - r)
    return s


def piece(x, y, w, h, col):
    t, b = m(col, y), m(col, y + h)
    crop = p.crop((x, y, x + w, y + h)).resize((max(1, round(w * u)), max(1, round(b * u) - round(t * u))), Image.BILINEAR)
    can.alpha_composite(crop, (round(ox + x * u), round(oy + t * u)))


piece(0, 0, W, TOP, 'other')
piece(0, BOT, W, H - BOT, 'other')
for col, x, w in [('card', 0, SPLIT), ('tile', SPLIT, W - SPLIT)]:
    y = TOP
    for r in ROWS[col]:
        piece(x, y, w, r - y, col)
        piece(x, r, w, 1, col)
        y = r + 1
    piece(x, y, w, BOT - y, col)
can.convert('RGB').save(OUT, quality=90)
print(OUT, 'extra', round(extra))
