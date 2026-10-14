#!/usr/bin/env node
/**
 * 安卓模拟器(第二阶段,2026-10-14):本机多机型测试,不用每次连手机。
 *
 *   npm run emu -- setup            建全部测试机型(已存在的跳过)
 *   npm run emu -- list             列机型 + 当前在跑的模拟器
 *   npm run emu -- start <机型>     起一台(一次只起一台,电脑扛不住多开)
 *   npm run emu -- install          装 build/release 最新 APK + 端口反代 + 启动游戏
 *   npm run emu -- cutout <on|off>  打开 / 关闭模拟刘海(测安全区)
 *   npm run emu -- stop             关掉在跑的模拟器
 *
 * 系统镜像 system-images;android-34;google_apis;x86_64(包里要带 x86_64 ABI,build-config/android.json 已加)。
 * 加速走 Windows 虚拟机监控程序平台(WHPX)。
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK = 'D:/android-sdk';
const JAVA_HOME = 'C:/Program Files/Eclipse Adoptium/jdk-21.0.10.7-hotspot';
const IMAGE = 'system-images;android-34;google_apis;x86_64';
const ADB = path.join(SDK, 'platform-tools', 'adb.exe');
const EMULATOR = path.join(SDK, 'emulator', 'emulator.exe');
const AVDMANAGER = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'avdmanager.bat');
const AVD_HOME = path.join(os.homedir(), '.android', 'avd');
const PACKAGE = 'com.lootchain.silentgods';

/** 测试机型:覆盖主流屏幕比例 + 低端小屏 + 平板。 */
const DEVICES = [
  { name: 'LC_Phone_20x9', device: 'pixel_7', note: '全面屏 20:9(2400×1080),主力机型', ram: 4096 },
  { name: 'LC_Phone_16x9', device: 'pixel_2', note: '老款 16:9(1920×1080)', ram: 3072 },
  { name: 'LC_Small_720p', device: 'small_phone', note: '低端小屏 720p', ram: 3072 },
  { name: 'LC_Tablet_16x10', device: 'pixel_tablet', note: '平板 16:10(2560×1600)', ram: 4096 },
];

const env = { ...process.env, JAVA_HOME, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK };

function adb(args, opts = {}) {
  return execFileSync(ADB, args, { encoding: 'utf8', env, ...opts }).trim();
}

function runningEmulators() {
  return adb(['devices'])
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(/\s+/))
    .filter(([serial, state]) => serial && serial.startsWith('emulator-') && state === 'device')
    .map(([serial]) => serial);
}

function emulatorSerial() {
  const list = runningEmulators();
  if (list.length === 0) {
    throw new Error('没有在跑的模拟器,先 npm run emu -- start <机型>');
  }
  return list[0];
}

function setup() {
  fs.mkdirSync(AVD_HOME, { recursive: true });
  for (const d of DEVICES) {
    const ini = path.join(AVD_HOME, `${d.name}.ini`);
    if (fs.existsSync(ini)) {
      console.log(`[emu] 已存在 ${d.name}`);
      continue;
    }
    execFileSync(AVDMANAGER, ['create', 'avd', '-n', d.name, '-k', IMAGE, '-d', d.device, '--force'], {
      env, input: 'no\n', stdio: ['pipe', 'inherit', 'inherit'], shell: true,
    });
    // 内存 / 存储 / GPU / 实体键盘(电脑键盘 Esc 可当返回键用)
    const cfg = path.join(AVD_HOME, `${d.name}.avd`, 'config.ini');
    const lines = fs.readFileSync(cfg, 'utf8').split(/\r?\n/).filter((l) => !/^(hw\.ramSize|disk\.dataPartition\.size|hw\.gpu\.enabled|hw\.gpu\.mode|hw\.keyboard|showDeviceFrame|vm\.heapSize)\s*=/.test(l));
    lines.push(`hw.ramSize=${d.ram}`, 'disk.dataPartition.size=8G', 'hw.gpu.enabled=yes', 'hw.gpu.mode=angle_indirect', 'hw.keyboard=yes', 'showDeviceFrame=no', 'vm.heapSize=512');
    fs.writeFileSync(cfg, lines.filter(Boolean).join('\n') + '\n');
    console.log(`[emu] 已创建 ${d.name} — ${d.note}`);
  }
}

function list() {
  for (const d of DEVICES) {
    const ok = fs.existsSync(path.join(AVD_HOME, `${d.name}.ini`));
    console.log(`${ok ? '✓' : '·'} ${d.name.padEnd(17)} ${d.note}`);
  }
  const running = runningEmulators();
  console.log(running.length ? `在跑:${running.join(', ')}` : '没有在跑的模拟器');
}

async function start(name) {
  const d = DEVICES.find((x) => x.name === name) ?? DEVICES[0];
  if (runningEmulators().length > 0) {
    throw new Error('已有模拟器在跑,先 npm run emu -- stop(一次只开一台)');
  }
  // GPU 用 angle_indirect(D3D):host(OpenGL 直通)在平板 2560×1600 上整屏停止刷新,换 angle 正常(2026-10-14 实测)
  const child = spawn(EMULATOR, ['-avd', d.name, '-no-snapshot-save', '-no-boot-anim', '-gpu', 'angle_indirect'], {
    env, detached: true, stdio: 'ignore',
  });
  child.unref();
  console.log(`[emu] 启动 ${d.name},等开机…`);
  adb(['wait-for-device'], { timeout: 180000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    try {
      if (adb(['-s', emulatorSerial(), 'shell', 'getprop', 'sys.boot_completed']) === '1') {
        console.log(`[emu] 开机完成(${Math.round((Date.now() - t0) / 1000)}s)`);
        return;
      }
    } catch {
      // 开机早期 adb 还没就绪
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('等开机超时');
}

function latestApk() {
  const dir = path.join(ROOT, 'build', 'release');
  const apks = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.apk')) : [];
  if (apks.length === 0) {
    throw new Error('build/release 下没有 APK,先 npm run build:android');
  }
  return apks.map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function install() {
  const serial = emulatorSerial();
  const apk = latestApk();
  console.log(`[emu] 安装 ${path.basename(apk)} → ${serial}`);
  execFileSync(ADB, ['-s', serial, 'install', '-r', apk], { env, stdio: 'inherit' });
  // 模拟器里的 localhost 是它自己,反代到本机游戏服 8081
  adb(['-s', serial, 'reverse', 'tcp:8081', 'tcp:8081']);
  adb(['-s', serial, 'shell', 'am', 'start', '-n', `${PACKAGE}/com.cocos.game.AppActivity`]);
  console.log('[emu] 已启动游戏');
}

function cutout(mode) {
  const serial = emulatorSerial();
  const overlay = 'com.android.internal.display.cutout.emulation.tall';
  adb(['-s', serial, 'shell', 'cmd', 'overlay', mode === 'off' ? 'disable' : 'enable', overlay]);
  console.log(`[emu] 模拟刘海 ${mode === 'off' ? '关闭' : '打开'}(重启游戏生效)`);
}

function stop() {
  for (const serial of runningEmulators()) {
    adb(['-s', serial, 'emu', 'kill']);
    console.log(`[emu] 已关闭 ${serial}`);
  }
}

const [cmd, arg] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'setup': setup(); break;
    case 'start': await start(arg); break;
    case 'install': install(); break;
    case 'cutout': cutout(arg); break;
    case 'stop': stop(); break;
    default: list();
  }
} catch (error) {
  console.error(`[emu] ${error.message}`);
  process.exit(1);
}
