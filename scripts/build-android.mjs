// 安卓调试包一键出包(2026-10-14 安卓第一阶段):Creator 命令行按 build-config/android.json 生成原生工程,
// 再用 Gradle 编出 APK,拷到 build/release/lootchain-android-<日期>-<commit>-debug.apk。
// 用法:npm run build:android                 (完整构建)
//       npm run build:android -- --skip-build  (只重跑 Gradle,改了原生工程 / 只想重编时用)
//       npm run build:android -- --install     (编完用 adb 装到已连接的手机,并做 8081 反向端口转发)
//       npm run build:android -- --release     (正式版:JS 压缩、无性能面板 / 图形校验层 / 脚本调试器,原生引擎优化编译;
//                                               测性能、给人试玩一律用它。签名用 Creator 自带 keystore,与调试包签名不同,
//                                               手机上从调试包换正式包要先卸载)
// 前提:Creator 编辑器已关闭;D:/android-sdk 装有 platform-tools / platforms;android-36 / build-tools;36.0.0 / ndk;23.2.8568313。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCompressSettings } from './android-texture-compress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREATOR_EXE = process.env.COCOS_CREATOR_EXE || 'D:/office app/cocos/editors/Creator/3.8.8/CocosCreator.exe';
const CREATOR_BUILD_OK = 36;
const CONFIG = path.join(ROOT, 'build-config', 'android.json');
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const SDK = config.packages.android.sdkPath;
const JAVA_HOME = config.packages.android.javaHome;
const PROJ = path.join(ROOT, 'build', config.outputName || 'android', 'proj');
const RELEASE_DIR = path.join(ROOT, 'build', 'release');
const skipBuild = process.argv.includes('--skip-build');
const install = process.argv.includes('--install');
// 2026-10-16 用户「安卓端整体都很卡顿」:此前只出调试包(debug: true + assembleDebug),原生引擎不优化、开着图形校验层与性能面板
const release = process.argv.includes('--release');
const variant = release ? 'release' : 'debug';
// 正式版:Creator 构建用 debug:false 的临时配置(其余与 build-config/android.json 一致)
const BUILD_CONFIG = release ? path.join(ROOT, 'build', 'android-release.config.json') : CONFIG;
if (release) {
  fs.mkdirSync(path.dirname(BUILD_CONFIG), { recursive: true });
  fs.writeFileSync(BUILD_CONFIG, JSON.stringify({ ...config, debug: false }, null, 2));
}

function step(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message) {
  console.error(`\n[android] 失败:${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false, ...options });
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
  const result = spawnSync('tasklist', ['/FI', 'IMAGENAME eq CocosCreator.exe', '/NH'], { encoding: 'utf8' });
  return /CocosCreator\.exe/i.test(result.stdout || '');
}

step('0/4 环境检查');
for (const need of ['platform-tools/adb.exe', 'platforms/android-36', 'build-tools/36.0.0', 'ndk/23.2.8568313']) {
  if (!fs.existsSync(path.join(SDK, need))) {
    fail(`缺少 ${path.join(SDK, need)}(用 sdkmanager 安装)`);
  }
}
if (!fs.existsSync(JAVA_HOME)) {
  fail(`找不到 JDK:${JAVA_HOME}`);
}
if (!skipBuild && editorRunning()) {
  fail('Cocos Creator 编辑器还开着,请先关闭(命令行构建与编辑器同时操作同一工程会互相覆盖)');
}
const commit = git(['rev-parse', '--short', 'HEAD']) || 'nogit';

if (!skipBuild) {
  // ASTC 贴图(只配安卓的预设,网页仍出 PNG):新加的图 meta 里没有压缩设置,出包前补上;改了 meta 记得一起提交
  const { changed } = applyCompressSettings({ apply: true, log: (line) => console.log(line) });
  if (changed > 0) {
    console.log(`[android] 给 ${changed} 张新图补了 ASTC 压缩设置,记得提交这些 .meta`);
  }
  step('1/4 Creator 命令行生成安卓原生工程');
  const code = run(CREATOR_EXE, ['--project', ROOT, '--build', `configPath=${BUILD_CONFIG}`]);
  if (code !== CREATOR_BUILD_OK) {
    fail(`构建退出码 ${code}(成功应为 ${CREATOR_BUILD_OK}),看上面的构建日志`);
  }
} else {
  step('1/4 跳过 Creator 构建(--skip-build)');
}
// 关 Cocos 自带启动图(同网页出包 release-web.mjs disableSplashScreen):原生包读 data/src/settings.json
{
  const settingsFile = path.join(ROOT, 'build', config.outputName || 'android', 'data', 'src', 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (settings.splashScreen && settings.splashScreen.totalTime !== 0) {
      settings.splashScreen.totalTime = 0;
      fs.writeFileSync(settingsFile, JSON.stringify(settings));
      console.log('[android] 启动图已关闭:data/src/settings.json splashScreen.totalTime = 0');
    }
  }
}
if (!fs.existsSync(path.join(PROJ, 'gradlew.bat'))) {
  fail(`没找到原生工程 ${PROJ}(Creator 构建没生成 proj 目录)`);
}

step(`2/4 Gradle 编译 APK(${variant})`);
// 调试包是增量打包:旧 APK 在时只改动变化的条目,删掉的旧条目留成空洞不回收(2026-10-15 换 ASTC 后 APK 内容 434MB、文件却 760MB)。
// 先删旧 APK 逼它整包重写,出来的就是紧凑大小。
for (const dir of [path.join(PROJ, 'build', config.name || 'LootChain', 'outputs', 'apk', variant), path.join(PROJ, 'app', 'build', 'outputs', 'apk', variant)]) {
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.apk'))) {
      fs.rmSync(path.join(dir, name));
    }
  }
}
fs.writeFileSync(path.join(PROJ, 'local.properties'), `sdk.dir=${SDK.replace(/\\/g, '/')}\n`);
const gradleEnv = { ...process.env, JAVA_HOME, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK };
// cmd 在部分环境不搜当前目录(NoDefaultCurrentDirectoryInExePath),gradlew.bat 必须给完整路径
const gradleCode = run('cmd.exe', ['/c', path.join(PROJ, 'gradlew.bat'), release ? 'assembleRelease' : 'assembleDebug', '--no-daemon'], { cwd: PROJ, env: gradleEnv });
if (gradleCode !== 0) {
  fail(`Gradle 退出码 ${gradleCode},看上面的编译日志`);
}

step('3/4 拷出 APK');
// Creator 3.8 的 gradle 工程把产物放在 proj/build/<应用名>/outputs/apk/<debug|release>
const outDirs = [path.join(PROJ, 'build', config.name || 'LootChain', 'outputs', 'apk', variant), path.join(PROJ, 'app', 'build', 'outputs', 'apk', variant), path.join(ROOT, 'build', config.outputName || 'android', 'publish', variant)];
let apk = null;
for (const dir of outDirs) {
  if (fs.existsSync(dir)) {
    const found = fs.readdirSync(dir).filter((name) => name.endsWith('.apk')).map((name) => path.join(dir, name));
    if (found.length > 0) {
      apk = found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      break;
    }
  }
}
if (!apk) {
  fail('Gradle 成功但没找到 APK');
}
fs.mkdirSync(RELEASE_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
const target = path.join(RELEASE_DIR, `lootchain-android-${stamp}-${commit}-${variant}.apk`);
fs.copyFileSync(apk, target);
console.log(`[android] APK:${target}(${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);

if (install) {
  step('4/4 安装到手机 + 8081 反向端口转发');
  const adb = path.join(SDK, 'platform-tools', 'adb.exe');
  if (run(adb, ['install', '-r', target]) !== 0) {
    fail('adb install 失败(手机连上了吗?adb devices 看一下)');
  }
  run(adb, ['reverse', 'tcp:8081', 'tcp:8081']);
  run(adb, ['shell', 'monkey', '-p', config.packages.android.packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
} else {
  step('4/4 跳过安装(加 --install 自动装到手机)');
}
console.log('[android] 完成');
