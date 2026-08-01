import {
  Node,
  Size,
  UITransform,
} from 'cc';
import type { UiLayout } from './lobby/LobbyHudTypes';

export interface UiContentRootHost {
  node: Node;
}

/**
 * 管理 Cocos UI 根节点的创建、清空和尺寸。
 *
 * Root 通过这里创建所有运行时 UI 节点，避免多个模块各自持有 contentRoot，
 * 也方便后续排查“节点没有被清理”或“重绘后节点丢失”的问题。
 *
 * 场景页复用：注册为 reusable 的顶层节点，在 clear()/clearExcept()/removeNode() 触发销毁时，
 * 会被“摘下暂存”（detach 不 destroy）而非销毁；再次进入且内容签名一致时由调用方 restoreNodes() 原样挂回，
 * 避免整棵树重建造成的开面板卡顿。所有销毁路径都汇聚到这三个原语，故只需在此集中处理。
 */
export class UiContentRootController {
  private contentRoot: Node | null = null;
  private readonly reusableNames = new Set<string>();
  private readonly stashedNodes = new Map<string, Node>();

  constructor(private readonly host: UiContentRootHost) {}

  applyRootSize(layout: UiLayout): void {
    const transform = this.host.node.getComponent(UITransform) ?? this.host.node.addComponent(UITransform);
    transform.setContentSize(new Size(layout.width, layout.height));
  }

  /** 登记可复用顶层节点名：这些节点被销毁时改为摘下暂存，供 restoreNodes() 复用。 */
  registerReusableNodes(names: readonly string[]): void {
    for (const name of names) {
      this.reusableNames.add(name);
    }
  }

  createNode(name: string): Node {
    const node = new Node(name);
    node.layer = this.host.node.layer;
    this.ensure().addChild(node);
    return node;
  }

  removeNode(name: string): void {
    const node = this.contentRoot?.getChildByName(name);
    if (!node) {
      return;
    }
    if (this.reusableNames.has(name)) {
      this.stashNode(node);
      return;
    }
    node.removeFromParent();
    node.destroy();
  }

  clear(): void {
    // 整页切换时必须销毁旧节点，避免按钮事件、Tween 和视频节点脱离父节点后继续存活；
    // 但可复用节点改为摘下暂存，不销毁。
    const root = this.ensure();
    const children = [...root.children];
    for (const child of children) {
      this.disposeChild(child);
    }
  }

  clearExcept(preservedNodeNames: readonly string[]): void {
    const preserved = new Set(preservedNodeNames);
    const root = this.ensure();
    const children = [...root.children];
    for (const child of children) {
      if (preserved.has(child.name)) {
        continue;
      }
      this.disposeChild(child);
    }
  }

  /** 把一组暂存节点原样挂回 content 根；任一未暂存或已失效则整组作废并返回 false（调用方随后走重建）。 */
  restoreNodes(names: readonly string[]): boolean {
    const nodes = names.map((name) => this.stashedNodes.get(name));
    if (nodes.some((node) => !node || !node.isValid)) {
      return false;
    }
    const root = this.ensure();
    for (const node of nodes) {
      node!.active = true;
      root.addChild(node!);
      this.stashedNodes.delete(node!.name);
    }
    return true;
  }

  /** 销毁指定暂存节点（内容签名不匹配、需重建时调用）。 */
  dropStashed(names: readonly string[]): void {
    for (const name of names) {
      const node = this.stashedNodes.get(name);
      if (!node) {
        continue;
      }
      if (node.isValid) {
        node.destroy();
      }
      this.stashedNodes.delete(name);
    }
  }

  /** 销毁所有暂存节点（登录/加载等会话级切换时调用，避免跨会话复用到失效或旧数据节点）。 */
  dropAllStashed(): void {
    for (const node of this.stashedNodes.values()) {
      if (node.isValid) {
        node.destroy();
      }
    }
    this.stashedNodes.clear();
  }

  private disposeChild(child: Node): void {
    if (this.reusableNames.has(child.name)) {
      this.stashNode(child);
      return;
    }
    child.removeFromParent();
    child.destroy();
  }

  private stashNode(node: Node): void {
    const previous = this.stashedNodes.get(node.name);
    if (previous && previous !== node && previous.isValid) {
      previous.destroy();
    }
    node.removeFromParent();
    this.stashedNodes.set(node.name, node);
  }

  ensure(): Node {
    if (this.contentRoot?.isValid) {
      return this.contentRoot;
    }
    const root = new Node('LootChainCocosLoginUIRoot');
    root.layer = this.host.node.layer;
    this.host.node.addChild(root);
    this.contentRoot = root;
    return root;
  }
}
