import { director } from 'cc';

/**
 * 修 Cocos 3.8.8 网页版自定义管线的一个缺陷(2026-11-21,实时 3D 低端兼容)。
 *
 * 执行器每帧开头会把「这一帧没用到」的托管(MANAGED)渲染贴图释放掉(executor._removeDeviceResource),
 * 但「用到了哪些」只在编译阶段记了一部分(只有带场景的那几遍),后期十几遍、场景深度、阴影深度都没算进去 ——
 * 结果这些贴图每帧被释放、下一帧重建,挂在上面的画布目标(framebuffer)也跟着每帧重建,
 * 每建一个都要调一次 checkFramebufferStatus(Chrome 里是同步等显卡进程回话)。
 * 实测地宫 / 主城每帧 16 次,本机核显打斗时每帧 48 → 24 毫秒、空闲 −24~29%;同帧逐像素一致。
 *
 * 改法:换成按「最后一次被某一遍用到」计时 —— 连续 300 帧没被任何一遍用到才释放(不再用的贴图照样会还回去)。
 * 「用到」= 某个渲染遍的 resetResource 里列出了它(给 DeviceRenderPass 原型补一刀记下名字)。
 */

const KEEP_FRAMES = 300;
let installed = false;
let frame = 0;
const lastUse = new Map<string, number>();

export function installKeepManagedPatch(): boolean {
  if (installed) {
    return true;
  }
  try {
    const ex: any = (director.root!.pipeline as any)._executor;
    const ctx = ex?._context;
    const first = ctx?.devicePasses?.values?.().next?.().value;
    const proto = first ? Object.getPrototypeOf(first) : null;
    if (!ex || typeof ex._removeDeviceResource !== 'function' || !proto || typeof proto.resetResource !== 'function') {
      return false;          // 执行器还没画过一帧,下次再试
    }
    const origReset = proto.resetResource;
    proto.resetResource = function patchedReset(this: unknown, id: number, pass: { rasterViews?: Map<string, unknown> }): unknown {
      if (pass?.rasterViews) {
        for (const name of pass.rasterViews.keys()) {
          lastUse.set(name, frame);
        }
      }
      return origReset.call(this, id, pass);
    };
    ex._removeDeviceResource = function patchedRemove(): void {
      frame += 1;
      const ppl: any = ctx.pipeline;
      const rg = ctx.resourceGraph;
      const sweep = (map: Map<string, { release(): void }>): void => {
        const dead: string[] = [];
        for (const name of map.keys()) {
          const seen = lastUse.get(name);
          if (seen === undefined) {
            lastUse.set(name, frame);
            continue;
          }
          if (frame - seen <= KEEP_FRAMES) {
            continue;
          }
          const traits = rg.getTraits(rg.vertex(name));
          if (traits && traits.residency === 0) {          // 只管 MANAGED;持久 / 外部的照旧不动
            dead.push(name);
          }
        }
        for (const name of dead) {
          map.get(name)!.release();
          map.delete(name);
          lastUse.delete(name);
        }
      };
      sweep(ctx.deviceTextures);
      sweep(ctx.deviceBuffers);
      ppl.resourceUses.length = 0;
    };
    installed = true;
    return true;
  } catch (error) {
    console.warn('[g3dfix] keep-managed patch', error);
    return false;
  }
}
