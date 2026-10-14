import { assetManager, Camera, Color, director, native, resources, sys, VideoClip } from 'cc';
import { NATIVE } from 'cc/env';

/**
 * 安卓原生垫底视频(第二阶段,2026-10-14):登录背景 / 召唤视频。
 * 引擎原生 VideoPlayer 写死在最上层,会盖住整个界面;这里由 AppActivity 用 MediaPlayer 在游戏画面下面播,
 * 游戏画面空白处透明露出视频(与网页 stayOnBottom 同一套)。同一时间只有一个视频,后播的顶掉先播的。
 *
 * 状态:playing = 首帧已出(可以淡出海报);completed = 播完(非循环);error = 打不开 / 播放出错;
 * stopped = 切后台等原因被系统收掉(回前台需要的话重新 play)。
 *
 * 注意:原生上别 resources.load 视频 —— 引擎 .mp4 下载器是网页那套(建 <video> + XHR 读整个文件),原生上加载失败。
 * 这里只按资源路径查 uuid 算出包内文件位置,交给 MediaPlayer 直接读。
 *
 * 主相机按天空盒清屏(天空盒着色器 alpha = 1),整帧不透明会把视频盖死;播放期间把会清颜色的相机临时改成
 * 全透明纯色清屏,停了再还原。
 */
export type NativeUnderlayVideoState = 'playing' | 'completed' | 'error' | 'stopped';

const ACTIVITY = 'com/cocos/game/AppActivity';
const EVENT = 'lcVideo';

let listener: ((state: NativeUnderlayVideoState) => void) | null = null;
/** 正在播的视频(同一路径 + 同一回调重复 play 时不重开,避免登录页多处触发导致反复从头播)。 */
let currentPath = '';
let bridged = false;
/** 被临时改成透明清屏的相机及其原设置。 */
let clearBackup: { camera: Camera; flags: number; color: Color }[] = [];

function setTransparentClear(on: boolean): void {
  if (!on) {
    for (const item of clearBackup) {
      if (item.camera.isValid) {
        item.camera.clearFlags = item.flags;
        item.camera.clearColor = item.color;
      }
    }
    clearBackup = [];
    return;
  }
  if (clearBackup.length > 0) {
    return;
  }
  const scene = director.getScene();
  if (!scene) {
    return;
  }
  for (const camera of scene.getComponentsInChildren(Camera)) {
    if (camera.clearFlags === Camera.ClearFlag.DEPTH_ONLY || camera.clearFlags === Camera.ClearFlag.DONT_CLEAR) {
      continue;
    }
    clearBackup.push({ camera, flags: camera.clearFlags, color: camera.clearColor.clone() });
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 0);
  }
}

export function nativeUnderlayVideoSupported(): boolean {
  return NATIVE && sys.os === sys.OS.ANDROID;
}

function ensureBridge(): void {
  if (bridged) {
    return;
  }
  bridged = true;
  native.jsbBridgeWrapper.addNativeEventListener(EVENT, (arg?: string) => {
    const state = String(arg ?? '').split(':')[1] as NativeUnderlayVideoState;
    if (state !== 'playing') {
      currentPath = '';
      setTransparentClear(false);
    }
    listener?.(state);
  });
}

/** resources 包内视频(路径不带扩展名,如 'video/gacha/call1')→ 原生文件路径;找不到返回空串。 */
function resolveVideoFile(resourcePath: string): string {
  const info = resources.getInfoWithPath(resourcePath, VideoClip);
  if (!info) {
    return '';
  }
  const url = assetManager.utils.getUrlWithUuid(info.uuid, { isNative: true, nativeExt: '.mp4' });
  return url ? native.fileUtils.fullPathForFilename(url) : '';
}

/** 播放 resources 包内的 mp4;返回 false 表示本平台不支持或启动失败(调用方保留海报 / 走兜底)。 */
export function playNativeUnderlayVideo(resourcePath: string, loop: boolean, onState: (state: NativeUnderlayVideoState) => void): boolean {
  if (!nativeUnderlayVideoSupported()) {
    return false;
  }
  try {
    ensureBridge();
    const path = resolveVideoFile(resourcePath);
    if (!path) {
      console.warn(`[NativeUnderlayVideo] video not found: ${resourcePath}`);
      return false;
    }
    if (currentPath === path && listener === onState) {
      return true;
    }
    listener = onState;
    currentPath = path;
    setTransparentClear(true);
    native.reflection.callStaticMethod(ACTIVITY, 'playUnderlayVideo', '(Ljava/lang/String;Z)V', path, loop);
    return true;
  } catch (error) {
    console.warn('[NativeUnderlayVideo] play failed:', error);
    listener = null;
    currentPath = '';
    return false;
  }
}

/** 停止;只有 owner 还是当前回调持有者时才停(避免登录页收尾时把召唤视频停掉)。不传 owner 则无条件停。 */
export function stopNativeUnderlayVideo(owner?: (state: NativeUnderlayVideoState) => void): void {
  if (!nativeUnderlayVideoSupported()) {
    return;
  }
  if (owner && listener !== owner) {
    return;
  }
  listener = null;
  currentPath = '';
  setTransparentClear(false);
  try {
    native.reflection.callStaticMethod(ACTIVITY, 'stopUnderlayVideo', '()V');
  } catch (error) {
    console.warn('[NativeUnderlayVideo] stop failed:', error);
  }
}
