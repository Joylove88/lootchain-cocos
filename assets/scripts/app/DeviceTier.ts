/**
 * 设备档位(2026-11-11 主城「按 2 倍重绘」):电脑端用高清一套主城图,手持设备(手机 / 平板 / 原生安装包)和内存偏小的电脑保留标准版,省显存和流量。
 * 这里不依赖引擎('cc'):地图定义(LobbyCityMoon)在 node 里编译导出坐标表 / 可走图时也要能加载——node 里没有 navigator,
 * 按「不是手持设备」算(工具看到的是高清一套的素材路径,几何两套完全一样)。
 */
interface DeviceGlobals {
  navigator?: { userAgent?: string; maxTouchPoints?: number; deviceMemory?: number };
  jsb?: unknown;
  location?: { search?: string };
}

/** 手持设备?原生安装包一律算;网页按浏览器标识判断(iPad 的桌面版标识靠触点数认)。 */
export function isHandheldDevice(): boolean {
  const g = globalThis as unknown as DeviceGlobals;
  if (typeof g.jsb !== 'undefined') {
    return true;
  }
  const ua = g.navigator?.userAgent ?? '';
  if (!ua) {
    return false;
  }
  if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony/i.test(ua)) {
    return true;
  }
  return /Macintosh/i.test(ua) && (g.navigator?.maxTouchPoints ?? 0) > 1;
}

/**
 * 电脑端但内存偏小(浏览器报的设备内存 ≤ 4GB,多半是集成显卡的老办公机)?高清一套主城图要多占约 200MB 显存,这类机器也用标准版。
 * 只有 Chromium 系浏览器报这个数;不报的(Safari / Firefox)按够用算。
 */
export function isLowMemoryDesktop(): boolean {
  const g = globalThis as unknown as DeviceGlobals;
  const memory = g.navigator?.deviceMemory;
  return typeof memory === 'number' && memory > 0 && memory <= 4;
}

/** 主城用不用高清一套。预览 / 自验可用地址参数强制:?cityHd=1 用高清,?cityHd=0 用标准版。 */
export function useHdCityArt(): boolean {
  const g = globalThis as unknown as DeviceGlobals;
  const query = g.location?.search ?? '';
  if (/[?&]cityHd=1(&|$)/.test(query)) {
    return true;
  }
  if (/[?&]cityHd=0(&|$)/.test(query)) {
    return false;
  }
  return !isHandheldDevice() && !isLowMemoryDesktop();
}

/**
 * 这台设备用不到的素材(资源路径前缀):分层下载按它把清单里的文件拿掉,不下载、不计入进度。
 * 电脑端 = 标准版主城的底图 / 遮罩 / 抠图(鸟瞰图、光点这些两套共用的不在内);手持设备 = 整套高清主城图。
 */
export function unusedArtPrefixes(): string[] {
  return useHdCityArt()
    ? ['ui/world/citymoon/base_', 'ui/world/citymoon/mask_', 'ui/world/citymoon/tree_', 'ui/world/citymoon/cloth_', 'ui/world/citymoon/water_']
    : ['ui/world/citymoon_hd/'];
}
