// 安卓 ASTC 贴图压缩(2026-10-14 安卓第二阶段):给所有图片 .meta 写 userData.compressSettings,
// 指向 settings/v2/packages/builder.json 里只配了 android 平台的预设 → 网页 / 其他平台构建照旧出 PNG,只有安卓包换成 .astc。
//   lc-android-astc4:ASTC 4x4(8bpp)——特效(柔光 / 渐变,6x6 会出暗色块晕)和界面图(1:1 显示,边框 / 图标细节)
//   lc-android-astc6:ASTC 6x6(3.56bpp)——角色 / 怪物骨骼图集、零散部件图、背景 jpg
// 没配 ETC2 / PNG 兜底:不支持 ASTC 的机器(2016 年前的 Adreno 3xx / Mali-T6xx)贴图会缺失,换来包体与显存都小一半以上。
// 用法:node scripts/android-texture-compress.mjs            (只统计,不写)
//       node scripts/android-texture-compress.mjs --apply    (写入 meta;build-android.mjs 出包前会自动跑一遍,新加的图也会补上)
//       node scripts/android-texture-compress.mjs --apply --only <路径片段>[,<路径片段>]  (只处理路径里含这些片段的图,抽样试编码用)
//       node scripts/android-texture-compress.mjs --clear    (全部去掉压缩设置)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const BUILDER_SETTINGS = path.join(ROOT, 'settings', 'v2', 'packages', 'builder.json');
export const PRESET_ASTC4 = 'lc-android-astc4';
export const PRESET_ASTC6 = 'lc-android-astc6';
const IMAGE_EXT = /\.(png|jpe?g)\.meta$/i;

/** 按路径分档;以后要单独调某张图,在这里加规则,别手改 meta(下次出包会被改回来)。 */
export function presetFor(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p.startsWith('assets/resources/spine/effect/') || p.startsWith('assets/resources/ui/')) {
    return PRESET_ASTC4;
  }
  return PRESET_ASTC6;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (IMAGE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function pngSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    return buf.toString('latin1', 12, 16) === 'IHDR' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null;
  } catch {
    return null;
  }
}

function checkPresets() {
  const settings = JSON.parse(fs.readFileSync(BUILDER_SETTINGS, 'utf8'));
  const presets = (settings.textureCompressConfig && settings.textureCompressConfig.userPreset) || {};
  for (const id of [PRESET_ASTC4, PRESET_ASTC6]) {
    const preset = presets[id];
    if (!preset || !preset.options || !preset.options.android) {
      throw new Error(`builder.json 缺少预设 ${id}(或没有 android 配置)`);
    }
    const platforms = Object.keys(preset.options).filter((k) => Object.keys(preset.options[k] || {}).length > 0);
    if (platforms.join() !== 'android') {
      throw new Error(`预设 ${id} 除 android 外还配了 ${platforms.join()}:网页包会跟着变,只允许 android`);
    }
  }
}

/** 返回 { changed, total, byPreset };apply=false 时只统计。 */
export function applyCompressSettings({ apply = false, clear = false, only = null, log = console.log } = {}) {
  if (!clear) {
    checkPresets();
  }
  const metas = walk(ASSETS, []);
  const byPreset = {};
  let changed = 0;
  let total = 0;
  for (const metaFile of metas) {
    const rel = path.relative(ROOT, metaFile).replace(/\\/g, '/');
    if (only && !only.some((frag) => rel.includes(frag))) {
      continue;
    }
    const raw = fs.readFileSync(metaFile, 'utf8');
    const meta = JSON.parse(raw);
    if (meta.importer !== 'image') {
      continue;
    }
    total += 1;
    const userData = meta.userData || (meta.userData = {});
    const presetId = presetFor(rel);
    const size = pngSize(metaFile.slice(0, -5));
    const stat = byPreset[clear ? 'clear' : presetId] || (byPreset[clear ? 'clear' : presetId] = { count: 0, mpx: 0 });
    stat.count += 1;
    stat.mpx += size ? (size[0] * size[1]) / 1e6 : 0;
    const want = clear ? undefined : { useCompressTexture: true, presetId };
    const cur = userData.compressSettings;
    if (JSON.stringify(cur) === JSON.stringify(want)) {
      continue;
    }
    changed += 1;
    if (!apply) {
      continue;
    }
    if (want) {
      userData.compressSettings = want;
    } else {
      delete userData.compressSettings;
    }
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const tail = /\r?\n$/.test(raw) ? eol : '';
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2).replace(/\n/g, eol) + tail);
  }
  for (const [id, s] of Object.entries(byPreset)) {
    log(`[astc] ${id}:${s.count} 张,${s.mpx.toFixed(1)} Mpx`);
  }
  log(`[astc] 图片 ${total} 张,${apply ? '已改' : '需改'} ${changed} 个 meta`);
  return { changed, total, byPreset };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',').filter(Boolean) : null;
  applyCompressSettings({ apply: args.includes('--apply') || args.includes('--clear'), clear: args.includes('--clear'), only });
}
