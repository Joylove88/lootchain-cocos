import { gfx, Graphics, Node, RenderingSubMesh, sp, Sprite } from 'cc';
import { HTML5, NATIVE } from 'cc/env';

/**
 * 引擎 Graphics 显存补丁(2026-10-07 用户「战斗一卡一卡的,流畅和极致都卡」)。
 *
 * 引擎 3.8.8 网页端:每个 Graphics 第一次绘制时 activeSubModel 直接按 65535 个顶点建缓冲
 * (顶点 65535×32B + 索引 65535×4B ≈ 2.25MB),画一根 6px 血条也一样,直到组件销毁才释放。
 * 守卫战每只怪有影子 + 血条两个 Graphics,车轮战几十只怪 → 手机性能面板 GFX Buffer Mem 294MB;
 * 更糟的是大招一次打中一群满血怪时,它们的血条在同一帧首次绘制,一帧里 gl.bufferData 几十 MB(手机上数百毫秒冻结)。
 *
 * 补丁:缓冲从 64 个顶点起步,上传前按实际顶点 / 索引数翻倍扩容(Buffer.resize 保留同一个 GL 缓冲对象,
 * 与引擎自己的 MeshBuffer.uploadBuffers 做法一致)。只在网页端生效;原生端走 native 代理,不经过这两个方法。
 */
const INITIAL_VERTICES = 64;
const FLOATS_PER_VERTEX = 8; // a_position RGB32F + a_color RGBA32F + a_dist R32F
const STRIDE = FLOATS_PER_VERTEX * 4;

let installed = false;

type GraphicsInternals = {
  model: { subModels: Array<{ inputAssembler: { vertexBuffers: gfx.Buffer[]; indexBuffer: gfx.Buffer | null } }>; initSubModel(idx: number, mesh: RenderingSubMesh, mat: unknown): void } | null;
  impl: { getRenderDataList(): Array<{ vertexStart: number; indexStart: number; lastFilledVertex: number }> } | null;
  node: { name: string };
  getMaterialInstance(idx: number): unknown;
  _graphicsUseSubMeshes: RenderingSubMesh[];
};

function nextCapacity(bytes: number, minBytes: number): number {
  let size = Math.max(minBytes, 64);
  while (size < bytes) {
    size *= 2;
  }
  return size;
}

export function installGraphicsBufferPatch(): void {
  if (installed || !HTML5) {
    return;
  }
  const proto = Graphics.prototype as unknown as Record<string, unknown>;
  const originalActive = proto.activeSubModel as ((this: GraphicsInternals, idx: number) => void) | undefined;
  const originalUpload = proto._uploadData as ((this: GraphicsInternals) => void) | undefined;
  if (typeof originalActive !== 'function' || typeof originalUpload !== 'function') {
    // 引擎升级后方法名变了:不打补丁,保持引擎原行为
    console.warn('[LootChain] Graphics buffer patch skipped: engine internals changed');
    return;
  }
  installed = true;
  const attributes = [
    new gfx.Attribute('a_position', gfx.Format.RGB32F),
    new gfx.Attribute('a_color', gfx.Format.RGBA32F),
    new gfx.Attribute('a_dist', gfx.Format.R32F),
  ];

  proto.activeSubModel = function activeSubModel(this: GraphicsInternals, idx: number): void {
    const model = this.model;
    if (!model) {
      originalActive.call(this, idx);
      return;
    }
    if (model.subModels.length > idx) {
      return;
    }
    const device = gfx.deviceManager.gfxDevice;
    const vertexBuffer = device.createBuffer(new gfx.BufferInfo(
      gfx.BufferUsageBit.VERTEX | gfx.BufferUsageBit.TRANSFER_DST,
      gfx.MemoryUsageBit.DEVICE,
      INITIAL_VERTICES * STRIDE,
      STRIDE,
    ));
    const indexBuffer = device.createBuffer(new gfx.BufferInfo(
      gfx.BufferUsageBit.INDEX | gfx.BufferUsageBit.TRANSFER_DST,
      gfx.MemoryUsageBit.DEVICE,
      INITIAL_VERTICES * 3 * Uint16Array.BYTES_PER_ELEMENT,
      Uint16Array.BYTES_PER_ELEMENT,
    ));
    const renderMesh = new RenderingSubMesh([vertexBuffer], attributes, gfx.PrimitiveMode.TRIANGLE_LIST, indexBuffer);
    renderMesh.subMeshIdx = 0;
    model.initSubModel(idx, renderMesh, this.getMaterialInstance(0));
    this._graphicsUseSubMeshes.push(renderMesh);
  };

  proto._uploadData = function uploadData(this: GraphicsInternals): void {
    const impl = this.impl;
    const model = this.model;
    if (impl && model) {
      const list = impl.getRenderDataList();
      const count = Math.min(list.length, model.subModels.length);
      for (let i = 0; i < count; i += 1) {
        const renderData = list[i];
        if (renderData.lastFilledVertex === renderData.vertexStart) {
          continue;
        }
        const ia = model.subModels[i].inputAssembler;
        const vertexBytes = renderData.vertexStart * STRIDE;
        const vb = ia.vertexBuffers[0];
        if (vb && vb.size < vertexBytes) {
          vb.resize(nextCapacity(vertexBytes, vb.size * 2));
        }
        const indexBytes = renderData.indexStart * Uint16Array.BYTES_PER_ELEMENT;
        const ib = ia.indexBuffer;
        if (ib && ib.size < indexBytes) {
          ib.resize(nextCapacity(indexBytes, ib.size * 2));
        }
      }
    }
    originalUpload.call(this);
  };
}

/**
 * 安卓原生:Graphics 节点停用再启用后不再绘制(2026-10-20 背包刷新后格子稀有度描边 / 遮罩 / 面板底色全部消失)。
 *
 * 根因(引擎 3.8.8 原生路径):UIRenderer.onDisable 一律调 destroyRenderData() ——
 * ① renderEntity.clearRenderDrawInfos() 把原生 RenderEntity 上的动态 drawInfo 弹掉;
 * ② RenderData.remove(_renderData) 把这份 MeshRenderData 的顶点 / 索引计数清零。
 * Sprite / Label 启用时会自己重建渲染数据,Graphics 不会:impl 里路径(pathLength)和 renderDataList 都还在,
 * 但原生实体上已没有 drawInfo,Batcher2d 遍历不到它,设 _isNeedUploadData / markForUpdateRenderData 都没用,
 * 只有 clear() 后重画(重新 requestRenderData)才恢复。网页端 Graphics 每帧走 _render → commitModel,不依赖 drawInfo,所以不复现。
 * 另外每次 onEnable 都会先设 ui-base 再设 ui-graphics 材质,旧材质实例被销毁,而 drawInfo / 子模型还指着旧实例。
 *
 * 触发场景:UiContentRootController 把可复用面板"摘下暂存"(节点停用)再挂回;任何 active=false→true 的 Graphics 同理。
 *
 * 补丁(只在原生生效):停用时不销毁 Graphics 的渲染数据(实体 enabled=false 已足够让它不画,销毁路径 onDestroy → impl.clear()
 * 照常回收);启用时把 renderData / 子模型的材质换成当前实例并标记重新上传,保留的顶点数据原样再提交。
 */
type NativeGraphicsInternals = {
  impl: { _renderDataList?: Array<{ material: unknown }> } | null;
  model: { subModels?: unknown[]; setSubModelMaterial?: (idx: number, mat: unknown) => void } | null;
  _isNeedUploadData?: boolean;
  destroyRenderData?: () => void;
  getMaterialInstance(idx: number): unknown;
  markForUpdateRenderData(enable?: boolean): void;
};

export function installNativeGraphicsReenablePatch(): void {
  const proto = Graphics.prototype as unknown as Record<string, unknown>;
  if (!NATIVE || proto.__lcNativeReenablePatched) {
    return;
  }
  const originalDisable = proto.onDisable as ((this: NativeGraphicsInternals) => void) | undefined;
  const originalEnable = proto.onEnable as ((this: NativeGraphicsInternals) => void) | undefined;
  if (typeof originalDisable !== 'function' || typeof originalEnable !== 'function') {
    console.warn('[LootChain] native Graphics re-enable patch skipped: engine internals changed');
    return;
  }
  proto.__lcNativeReenablePatched = true;
  const keepRenderData = (): void => { /* 停用期间保留渲染数据 */ };

  proto.onDisable = function onDisable(this: NativeGraphicsInternals): void {
    // 只屏蔽这一次调用里的 destroyRenderData(实例上临时遮住原型方法),其余停用逻辑照旧
    this.destroyRenderData = keepRenderData;
    try {
      originalDisable.call(this);
    } finally {
      delete this.destroyRenderData;
    }
  };

  proto.onEnable = function onEnable(this: NativeGraphicsInternals): void {
    originalEnable.call(this);
    // 注意不能调 impl.getRenderDataList():列表为空时它会顺手 requestRenderData
    const list = this.impl?._renderDataList;
    if (!list || list.length === 0) {
      return;
    }
    const material = this.getMaterialInstance(0);
    for (const renderData of list) {
      renderData.material = material;
    }
    const model = this.model;
    const subModelCount = model?.subModels?.length ?? 0;
    if (model && typeof model.setSubModelMaterial === 'function') {
      for (let i = 0; i < subModelCount; i += 1) {
        model.setSubModelMaterial(i, material);
      }
    }
    this._isNeedUploadData = true;
    this.markForUpdateRenderData();
  };
}

/**
 * 引擎 sp.Skeleton 每次设置 skeletonData 都会为挂点功能给全部骨骼建"路径名 → 序号"索引(_indexBoneSockets):
 * 逐骨骼向上走到根拼字符串,每一级都是几次 wasm 边界调用。满屏大招骨骼 600~980 根骨头,一次几万次调用、50~130ms。
 * 本项目目前不用挂点:没有挂点时推迟建索引,等真正需要(querySockets / 设置挂点)时再按原逻辑建,功能不变。
 */
type SocketHost = { _sockets?: unknown[]; _cachedSockets?: Map<string, number> };

export function installSpineSocketIndexPatch(): void {
  const proto = sp.Skeleton.prototype as unknown as Record<string, unknown>;
  const original = proto._indexBoneSockets as ((this: SocketHost) => void) | undefined;
  const originalQuery = proto.querySockets as ((this: SocketHost) => string[]) | undefined;
  const originalBindings = proto._updateSocketBindings as ((this: SocketHost) => void) | undefined;
  if (typeof original !== 'function' || typeof originalQuery !== 'function' || typeof originalBindings !== 'function' || proto.__lcSocketPatched) {
    return;
  }
  proto.__lcSocketPatched = true;
  proto._indexBoneSockets = function indexBoneSockets(this: SocketHost): void {
    this._cachedSockets?.clear();
    if (this._sockets && this._sockets.length > 0) {
      original.call(this);
    }
  };
  const ensureIndex = (host: SocketHost): void => {
    if (host._cachedSockets && host._cachedSockets.size === 0) {
      original.call(host);
    }
  };
  proto.querySockets = function querySockets(this: SocketHost): string[] {
    ensureIndex(this);
    return originalQuery.call(this);
  };
  proto._updateSocketBindings = function updateSocketBindings(this: SocketHost): void {
    if (this._sockets && this._sockets.length > 0) {
      ensureIndex(this);
    }
    originalBindings.call(this);
  };
}

/**
 * 兜底:引擎 UITransform 在每帧 AFTER_UPDATE 给"新增过子节点"的父节点重排兄弟顺序,
 * 父节点若在排队后、排序前被真正销毁(子节点表为 null),Node._updateSiblingIndex 直接抛异常,
 * 同一帧事件里后面的监听全部中断(2026-10-07 正式包实测战斗画面冻住)。已销毁的节点跳过即可。
 */
export function installSiblingIndexGuard(): void {
  const proto = Node.prototype as unknown as Record<string, unknown>;
  const original = proto._updateSiblingIndex as ((this: unknown) => void) | undefined;
  if (typeof original !== 'function' || proto.__lcSiblingGuard) {
    return;
  }
  proto.__lcSiblingGuard = true;
  proto._updateSiblingIndex = function updateSiblingIndex(this: { _children?: unknown[] | null }): void {
    if (!this._children) {
      return;
    }
    original.call(this);
  };
}

/**
 * 兜底:图片组件引用了已释放的贴图(SpriteFrame 被销毁后 uv 为空)时,引擎每帧 updateUVs 读 null 抛异常,
 * 同一帧后面的渲染全部中断(2026-10-10 用户手机控制台 1463 条 "reading '0'":画面停住,点「确认退出」看起来没反应)。
 * 画之前发现贴图已失效就把它摘掉(这张图不画,其余照常),并兜住个别组件的异常不让它拖垮整帧。
 */
export function installSpriteReleasedFrameGuard(): void {
  const proto = Sprite.prototype as unknown as Record<string, unknown>;
  const original = proto.updateRenderer as ((this: Sprite) => void) | undefined;
  if (typeof original !== 'function' || proto.__lcReleasedFrameGuard) {
    return;
  }
  proto.__lcReleasedFrameGuard = true;
  let reported = 0;
  proto.updateRenderer = function updateRenderer(this: Sprite): void {
    const frame = this.spriteFrame as (Sprite['spriteFrame'] & { uv?: number[] | null }) | null;
    if (frame && (!frame.isValid || !frame.uv)) {
      if (reported < 5) {
        reported += 1;
        console.warn(`[LootChain] sprite on ${this.node?.name ?? '?'} referenced a released frame; cleared`);
      }
      this.spriteFrame = null;
    }
    try {
      original.call(this);
    } catch (error) {
      if (reported < 5) {
        reported += 1;
        console.warn(`[LootChain] sprite render failed on ${this.node?.name ?? '?'}`, error);
      }
    }
  };
}

/** 启动时调用:Graphics 显存按需增长 + 原生 Graphics 停用重启后保持绘制 + 跳过无用的骨骼挂点索引 + 兄弟排序空保护 + 已释放贴图保护。 */
export function installEnginePerfPatches(): void {
  installGraphicsBufferPatch();
  installNativeGraphicsReenablePatch();
  installSpineSocketIndexPatch();
  installSiblingIndexGuard();
  installSpriteReleasedFrameGuard();
}
