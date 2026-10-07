import { gfx, Graphics, Node, RenderingSubMesh, sp } from 'cc';
import { HTML5 } from 'cc/env';

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

/** 启动时调用:Graphics 显存按需增长 + 跳过无用的骨骼挂点索引 + 兄弟排序空保护。 */
export function installEnginePerfPatches(): void {
  installGraphicsBufferPatch();
  installSpineSocketIndexPatch();
  installSiblingIndexGuard();
}
