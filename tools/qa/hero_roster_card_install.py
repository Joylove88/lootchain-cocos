# 名册原型 B 卡面入库(2026-10-23):GPT 横版半身插画(1672×941)→ 原图备份 → 768×432 jpg → assets/resources/ui/hero/roster/<英雄码>.jpg + meta
# (sprite-frame,trim none,ASTC 预设沿用 enh_bg_smoke.jpg.meta)。用法:python tools/qa/hero_roster_card_install.py <raw 目录> [英雄码...]
import io, json, os, shutil, sys, uuid
from PIL import Image, ImageEnhance

ROOT = r'D:\project\lootchain-cocos'
DST = os.path.join(ROOT, r'assets\resources\ui\hero\roster')
BACKUP = os.path.join(ROOT, r'素材原始备份\hero-roster-card-20261023')
TPL = os.path.join(ROOT, r'assets\resources\ui\forge\ref\enh_bg_smoke.jpg.meta')
W, H = 768, 432


def write_meta(path, name, w, h):
    meta_path = path + '.meta'
    if os.path.exists(meta_path):
        m = json.load(io.open(meta_path, encoding='utf-8'))
    else:
        tpl = io.open(TPL, encoding='utf-8').read()
        old = json.loads(tpl)['uuid']
        m = json.loads(tpl.replace(old, str(uuid.uuid4())))
        for sub in m['subMetas'].values():
            sub['displayName'] = name
    m['userData']['hasAlpha'] = False
    sf = m['subMetas']['f9941']['userData']
    sf['trimType'] = 'none'
    for key, v in (('width', w), ('height', h), ('rawWidth', w), ('rawHeight', h), ('trimX', 0), ('trimY', 0), ('offsetX', 0), ('offsetY', 0)):
        sf[key] = v
    if 'vertices' in sf:
        hw, hh = w // 2, h // 2
        sf['vertices']['rawPosition'] = [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0]
        sf['vertices']['minPos'] = [-hw, -hh, 0]
        sf['vertices']['maxPos'] = [hw, hh, 0]
        sf['vertices']['uv'] = [0, h, w, h, 0, 0, w, 0]
    io.open(meta_path, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')


def main():
    raw = sys.argv[1]
    only = set(sys.argv[2:])
    os.makedirs(DST, exist_ok=True)
    os.makedirs(BACKUP, exist_ok=True)
    done = []
    for f in sorted(os.listdir(raw)):
        code, ext = os.path.splitext(f)
        if ext.lower() != '.png' or not code[:2] in ('R_', 'SR', 'SS', 'UR') or (only and code not in only):
            continue
        src = os.path.join(raw, f)
        shutil.copy2(src, os.path.join(BACKUP, f))
        im = Image.open(src).convert('RGB')
        # 16:9 → 768×432;去 AI 感:轻降饱和
        im = im.resize((W, H), Image.LANCZOS)
        im = ImageEnhance.Color(im).enhance(0.9)
        dst = os.path.join(DST, code + '.jpg')
        im.save(dst, quality=88)
        write_meta(dst, code, W, H)
        done.append(code)
    print(len(done), 'installed:', ' '.join(done))


if __name__ == '__main__':
    main()
