// 安卓安装包剔除手持设备用不到的素材(2026-11-11 主城有两套图:电脑端高清 / 手持设备标准版,判断在 assets/scripts/app/DeviceTier.ts)。
// 原生包一律走标准版,高清一套(ui/world/citymoon_hd)打进安装包纯属白占几十 MB。Creator 构建没法按平台排除 resources 里的目录,
// 所以构建完按素材编号把贴图文件(各资源包 native 目录下的 <编号>.*)删掉;资源表里的条目留着——没人加载它,万一被加载会明确报缺文件。
// build-android.mjs 在 Creator 构建之后、Gradle 打包之前调用。
import fs from 'node:fs';
import path from 'node:path';

/** 手持设备用不到的素材目录(相对工程根)。要和 DeviceTier.unusedArtPrefixes() 里手持设备那一支保持一致。 */
export const HANDHELD_UNUSED_ART = ['assets/resources/ui/world/citymoon_hd'];

const IMAGE_META = /\.(png|jpe?g)\.meta$/i;

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, visit);
    } else {
      visit(full, entry.name);
    }
  }
}

/** 这些目录下所有图片的素材编号(.meta 里的 uuid)。目录不存在就跳过。 */
export function collectImageUuids(root, dirs = HANDHELD_UNUSED_ART) {
  const uuids = new Set();
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) {
      continue;
    }
    walk(full, (file, name) => {
      if (!IMAGE_META.test(name)) {
        return;
      }
      const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof meta.uuid === 'string' && meta.uuid.length > 0) {
        uuids.add(meta.uuid);
      }
    });
  }
  return uuids;
}

/**
 * 在构建产物的 assets 目录里删掉这些编号的贴图文件:只动各资源包 native 目录下的文件,
 * 文件名形如 <编号>.astc / <编号>.png / <编号>.<校验>.astc / <编号>@xxxxx.astc。返回删掉的文件数和字节数。
 */
export function pruneNativeArt(buildAssetsDir, uuids) {
  let files = 0;
  let bytes = 0;
  if (uuids.size === 0 || !fs.existsSync(buildAssetsDir)) {
    return { files, bytes };
  }
  walk(buildAssetsDir, (file, name) => {
    const parts = path.relative(buildAssetsDir, file).split(path.sep);
    if (!parts.includes('native')) {
      return;
    }
    if (!uuids.has(name.split(/[.@]/)[0])) {
      return;
    }
    bytes += fs.statSync(file).size;
    fs.rmSync(file);
    files += 1;
  });
  return { files, bytes };
}
