// build/release 只留最近几个包(2026-10-20 用户「build 为啥这么大」):安卓出包、网页出包每次都新存一份(APK 0.5~0.8GB、
// 网页包 0.47GB),从不清理,一周积了 133 个 APK + 10 个网页包共 65GB。出包脚本拷出新包后调用,按修改时间只留最近 keep 个
// 匹配 pattern 的文件;asset-content-index.json 等别的文件不动。删不掉(被占用)只告警,不让出包失败。
import fs from 'node:fs';
import path from 'node:path';

export const KEEP_RELEASE_PACKAGES = 3;

/** 返回删掉的文件名。 */
export function pruneOldPackages(dir, pattern, keep = KEEP_RELEASE_PACKAGES) {
  const packages = fs
    .readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const removed = [];
  for (const { name } of packages.slice(keep)) {
    try {
      fs.rmSync(path.join(dir, name));
      removed.push(name);
    } catch (error) {
      console.warn(`[prune] 删不掉旧包 ${name}:${error.message}`);
    }
  }
  return removed;
}
