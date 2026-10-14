// 原生包贴图显存账(配合 tools/qa/native_eval.py @tools/qa/native_texmem.js):
// 引擎 gfx 统计的显存 + 已加载 Texture2D 按像素格式汇总(ASTC 4x4 = 1 B/px,6x6 = 16/36 B/px,RGBA8 = 4 B/px)。
(() => {
  const cc = globalThis.cc;
  const ms = cc.director.root.device.memoryStatus;
  const bpp = (fmt) => {
    const F = cc.Texture2D.PixelFormat;
    if (fmt === F.RGBA_ASTC_4x4) return 1;
    if (fmt === F.RGBA_ASTC_6x6) return 16 / 36;
    if (fmt === F.RGB_ETC2 || fmt === F.RGB_ETC1) return 0.5;
    if (fmt === F.RGBA_ETC2) return 1;
    if (fmt === F.RGB888) return 3;
    return 4;
  };
  const byFmt = {};
  let count = 0;
  let rgbaEquiv = 0; // 同一批贴图若是未压缩 RGBA8 的显存(压缩前的对照)
  cc.assetManager.assets.forEach((a) => {
    if (!(a instanceof cc.Texture2D)) return;
    const fmt = a.getPixelFormat ? a.getPixelFormat() : a._format;
    const name = Object.keys(cc.Texture2D.PixelFormat).find((k) => cc.Texture2D.PixelFormat[k] === fmt) || String(fmt);
    const s = byFmt[name] || (byFmt[name] = { n: 0, mb: 0 });
    s.n += 1;
    s.mb += (a.width * a.height * bpp(fmt)) / 1048576;
    count += 1;
    rgbaEquiv += a.width * a.height * 4;
  });
  Object.values(byFmt).forEach((s) => { s.mb = Math.round(s.mb * 10) / 10; });
  return { gfxTexMB: Math.round(ms.textureSize / 1048576), gfxBufMB: Math.round(ms.bufferSize / 1048576), textures: count, rgbaEquivMB: Math.round(rgbaEquiv / 1048576), byFmt, scene: cc.director.getScene() && cc.director.getScene().name };
})()
