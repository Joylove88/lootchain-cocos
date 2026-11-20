import { gfx, rendering } from 'cc';

/**
 * 月光阴影图双缓冲(2026-11-21,实时 3D 低端兼容)。
 *
 * Arc 140V(浏览器把 WebGL 翻成 D3D11)上实测:阴影那一遍不管画多少、多大、什么格式,只要「同一帧里刚画完就被主画面拿去读」,
 * 显卡就要停下来等,固定多花约 9 毫秒(换 OpenGL 翻译就没有)。
 * 这里改成两张阴影图轮流:这一帧往 A 里画,主画面读上一帧画好的 B;下一帧反过来。同一帧里不再「画完马上读」。
 * 只在固定范围的月光上启用(灯和阴影范围都不动,上一帧的阴影图和这一帧只差会动的东西挪了一帧);
 * 静止画面逐像素和原来一样,移动的角色影子晚 1 帧(1/60 ~ 1/30 秒)。刚开 / 阴影图尺寸变了的第一帧照旧「画完就读」。
 * 补丁打在内置管线「画月光阴影图」那一步和「绑定 cc_shadowMap」上,shadowPP.on = false 完全回到原做法。
 */

const { LoadOp, StoreOp } = gfx;

export const shadowPP = {
  on: false,
  frame: 0,
  warm: 0,
  key: '',
  /** 这一帧主画面该读哪张(空 = 不改,照引擎原来的名字)。 */
  readName: '',
};

let installed = false;
const WHITE = new gfx.Color(1, 1, 1, 1);
const vp = new gfx.Viewport();

export function installShadowPingPong(): boolean {
  if (installed) {
    return true;
  }
  const builder: any = (rendering as any).getCustomPipeline?.('Builtin');
  const fp = builder?._forwardPass;
  const proto = fp ? Object.getPrototypeOf(fp) : null;
  const orig = proto?._addCascadedShadowMapPass;
  if (typeof orig !== 'function') {
    console.warn('[g3dpp] 找不到内置管线画阴影图那一步,双缓冲不开');
    return false;
  }
  let texPatched = false;
  proto._addCascadedShadowMapPass = function patched(this: any, ppl: any, pplConfigs: any, id: number, light: any, camera: any): void {
    if (!shadowPP.on || !light.shadowFixedArea) {
      shadowPP.readName = '';
      orig.call(this, ppl, pplConfigs, id, light, camera);
      return;
    }
    const size = ppl.pipelineSceneData.shadows.size;
    const w = size.x;
    const h = size.y;
    const fmt = pplConfigs.shadowMapFormat;
    const A = `LcShadowA${id}`;
    const B = `LcShadowB${id}`;
    const key = `${id}:${fmt}:${w}x${h}`;
    for (const n of [A, B]) {
      if (!ppl.containsResource(n)) {
        ppl.addRenderTarget(n, fmt, w, h, rendering.ResourceResidency.PERSISTENT);
      } else if (shadowPP.key !== key) {
        ppl.updateRenderTarget(n, w, h, fmt);
      }
    }
    if (shadowPP.key !== key) {
      shadowPP.key = key;
      shadowPP.warm = 0;
    }
    shadowPP.frame += 1;
    const write = shadowPP.frame & 1 ? A : B;
    const prev = shadowPP.frame & 1 ? B : A;
    // 刚开 / 尺寸变了:上一张还是空的,这一帧先读刚画的(和原来一样)
    shadowPP.readName = shadowPP.warm < 1 ? write : prev;
    shadowPP.warm += 1;

    // 以下同内置管线 _addCascadedShadowMapPass(固定范围 = 只有一级、整张图一个视口),只是画进 write
    const pass = ppl.addRenderPass(w, h, 'default');
    pass.name = 'CascadedShadowMap';
    pass.addRenderTarget(write, LoadOp.CLEAR, StoreOp.STORE, WHITE);
    pass.addDepthStencil(`ShadowDepth${id}`, LoadOp.CLEAR, StoreOp.DISCARD);
    vp.left = 0;
    vp.top = 0;
    vp.width = Math.trunc(w);
    vp.height = Math.trunc(h);
    const queue = pass.addQueue(rendering.QueueHint.NONE, 'shadow-caster');
    if (!pplConfigs.isWebGPU) {
      queue.setViewport(vp);
    }
    queue.addScene(camera, rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER).useLightFrustum(light, 0);

    if (!texPatched) {
      texPatched = true;
      const pp = Object.getPrototypeOf(pass);
      const origAdd = pp.addTexture;
      pp.addTexture = function patchedAdd(this: unknown, name: string, slotName: string, ...rest: unknown[]): unknown {
        if (slotName === 'cc_shadowMap' && shadowPP.readName && /^ShadowMap\d+$/.test(name)) {
          name = shadowPP.readName;
        }
        return origAdd.call(this, name, slotName, ...rest);
      };
    }
  };
  installed = true;
  return true;
}
