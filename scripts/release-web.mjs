// 一键出 Web 正式包(docs/31、LootChain docs/35):
//   检查编辑器已关 → loose 展开检查 → 命令行构建(md5Cache) → 修正 Service Worker 文件名 → PNG 压缩 → 打 tar.gz。
// 用法:npm run release:web            (完整流程)
//       npm run release:web -- --skip-build   (只对现有 build/web-mobile 做后处理并打包)
// 产物:build/release/lootchain-web-<日期时间>-<commit>.tar.gz,服务器上解压到站点目录即可(见 docs/35)。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, 'build', 'web-mobile');
const RELEASE_DIR = path.join(ROOT, 'build', 'release');
const CREATOR_EXE = process.env.COCOS_CREATOR_EXE || 'D:/office app/cocos/editors/Creator/3.8.8/CocosCreator.exe';
// Creator 命令行构建成功时退出码是 36(不是 0)。
const CREATOR_BUILD_OK = 36;
const skipBuild = process.argv.includes('--skip-build');

function step(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message) {
  console.error(`\n[release] 失败:${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) {
    fail(`${cmd} 启动失败:${result.error.message}`);
  }
  return result.status;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return (result.stdout || '').trim();
}

function editorRunning() {
  if (process.platform !== 'win32') {
    return false;
  }
  const result = spawnSync('tasklist', ['/FI', 'IMAGENAME eq CocosCreator.exe', '/NH'], { encoding: 'utf8' });
  return /CocosCreator\.exe/i.test(result.stdout || '');
}

/** md5Cache 会把根目录的 sw.js 也改名成 sw.<md5>.js,而游戏脚本注册的是固定的 sw.js——必须改回来,否则离线缓存整个失效。 */
function fixServiceWorkerName() {
  const target = path.join(BUILD_DIR, 'sw.js');
  const hashed = fs.readdirSync(BUILD_DIR).filter((name) => /^sw\.[0-9a-f]{5}\.js$/i.test(name));
  if (hashed.length > 1) {
    fail(`根目录有多个 Service Worker 文件:${hashed.join(', ')}`);
  }
  if (hashed.length === 1) {
    if (fs.existsSync(target)) {
      fs.rmSync(target);
    }
    fs.renameSync(path.join(BUILD_DIR, hashed[0]), target);
    console.log(`[release] ${hashed[0]} → sw.js`);
  }
  if (!fs.existsSync(target)) {
    fail('构建包里没有 sw.js(build-templates/web-mobile/sw.js 没被拷进来?)');
  }
}

function checkBuildLayout() {
  const indexHtml = path.join(BUILD_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    fail(`找不到 ${indexHtml}`);
  }
  const settings = fs.readdirSync(path.join(BUILD_DIR, 'src')).filter((name) => /^settings\.[0-9a-f]{5}\.json$/.test(name));
  if (settings.length === 0) {
    fail('src/ 下没有带 md5 的 settings.json——构建没开 md5Cache,Service Worker 不会缓存优先');
  }
  if (fs.existsSync(path.join(BUILD_DIR, 'png-compress-report.json')) && !skipBuild) {
    console.warn('[release] 注意:构建目录里已有压缩报告,可能不是全新构建');
  }
}

step('0/5 环境检查');
const commit = git(['rev-parse', '--short', 'HEAD']) || 'nogit';
const dirty = git(['status', '--porcelain', '--untracked-files=no']);
if (dirty) {
  console.warn('[release] 注意:工作区有未提交改动,包里会带上这些改动:\n' + dirty);
}
if (!skipBuild && editorRunning()) {
  fail('Cocos Creator 编辑器还开着。命令行构建与编辑器同时操作同一工程会互相覆盖,请先关闭编辑器。');
}

step('1/5 正式包 loose 展开检查');
if (run(process.execPath, [path.join(ROOT, 'scripts', 'check-loose-spread.cjs')]) !== 0) {
  fail('存在非数组展开,正式包会出错(改成 Array.from 后重试)');
}

if (!skipBuild) {
  step('2/5 命令行构建 web-mobile(md5Cache)');
  if (!fs.existsSync(CREATOR_EXE)) {
    fail(`找不到 Creator:${CREATOR_EXE}(可用环境变量 COCOS_CREATOR_EXE 指定)`);
  }
  const code = run(CREATOR_EXE, [
    '--project', ROOT,
    '--build', 'platform=web-mobile;debug=false;sourceMaps=false;md5Cache=true',
  ]);
  if (code !== CREATOR_BUILD_OK) {
    fail(`构建退出码 ${code}(成功应为 ${CREATOR_BUILD_OK}),看上面的构建日志`);
  }
} else {
  step('2/5 跳过构建(--skip-build)');
}
checkBuildLayout();
fixServiceWorkerName();

step('3/5 PNG 压缩(libimagequant,达不到画质下限的保原图)');
const python = process.env.PYTHON || 'python';
if (run(python, [path.join(ROOT, 'scripts', 'compress-build-png.py'), BUILD_DIR]) !== 0) {
  fail('压缩脚本失败(需要 pip install pillow imagequant)');
}

step('4/5 写版本信息');
const stamp = new Date();
const pad = (n) => String(n).padStart(2, '0');
const tag = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;
fs.writeFileSync(
  path.join(BUILD_DIR, 'version.json'),
  JSON.stringify({ commit, dirty: !!dirty, builtAt: stamp.toISOString() }, null, 2),
);

step('5/5 打包');
fs.mkdirSync(RELEASE_DIR, { recursive: true });
const archive = path.join(RELEASE_DIR, `lootchain-web-${tag}-${commit}.tar.gz`);
// Windows 10+ 自带 bsdtar;tar.gz 在 Linux 服务器上直接 tar -xzf 解压。
const tarExe = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
if (run(tarExe, ['-czf', archive, '--exclude', './png-compress-report.json', '-C', BUILD_DIR, '.']) !== 0) {
  fail('打包失败');
}
const sizeMb = (fs.statSync(archive).size / 1024 / 1024).toFixed(1);
console.log(`\n[release] 完成:${archive}(${sizeMb} MB)`);
console.log('[release] 上传到服务器后按 docs/35 的"发版"步骤解压并切换 current 链接。');
