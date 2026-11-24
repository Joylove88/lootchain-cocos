/**
 * 大厅统一弹窗队列(11-24 策划通玩 P1:隐藏点发现 + 任务完成 + NPC 对话三层叠在一起、Lv.2 / Lv.3 连弹进化抉择)。
 *
 * 自动弹出的东西(隐藏点「发现」卡、石碑阅读、进化抉择、契约之选、英雄契约、功能开放播报……)一律先进队列,
 * 由 GameRoot 每帧 pump:玩家正开着的对话 / 面板 / 别的弹窗优先,大厅上什么都没开时才按优先级弹下一张,一次只弹一张。
 *
 * - key 去重:同一个 key 再入队 = 替换旧的(例如进化状态刷新后重排);
 * - show() 在真正弹的那一刻才调用,返回 false = 条件已经不成立(例如已经选完了),直接丢掉看下一条;
 * - combatOk = false 的条目战斗中不弹(打完再弹);
 * - holdMs > 0 的是不挡操作的横幅类:弹出后这段时间里不再弹下一条,免得两张横幅叠在一起;
 * - expireMs > 0 的条目排太久就作废(例如功能开放播报,过了那个时机就别补了)。
 */
export interface LobbyPopupEntry {
  key: string;
  /** 越大越先弹;同级先来先弹。 */
  priority: number;
  show: () => boolean;
  combatOk?: boolean;
  holdMs?: number;
  expireMs?: number;
}

interface QueuedPopup extends LobbyPopupEntry {
  seq: number;
  at: number;
}

export class LobbyPopupQueue {
  private items: QueuedPopup[] = [];
  private seq = 0;
  private holdUntil = 0;

  push(entry: LobbyPopupEntry): void {
    this.items = this.items.filter((item) => item.key !== entry.key);
    this.items.push({ ...entry, seq: ++this.seq, at: Date.now() });
  }

  has(key: string): boolean {
    return this.items.some((item) => item.key === key);
  }

  remove(key: string): void {
    this.items = this.items.filter((item) => item.key !== key);
  }

  clear(): void {
    this.items = [];
    this.holdUntil = 0;
  }

  get size(): number {
    return this.items.length;
  }

  /**
   * busy = 大厅上已经开着对话 / 面板 / 弹窗(或在加载、演出中);inCombat = 野外交战中。
   * 能弹就弹最高优先级的一条;返回这次是否弹出了东西。
   */
  pump(busy: boolean, inCombat: boolean): boolean {
    if (busy || this.items.length === 0) {
      return false;
    }
    const now = Date.now();
    if (now < this.holdUntil) {
      return false;
    }
    this.items = this.items.filter((item) => !item.expireMs || now - item.at <= item.expireMs);
    const ready = this.items
      .filter((item) => item.combatOk || !inCombat)
      .sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    for (const item of ready) {
      this.items = this.items.filter((other) => other !== item);
      let shown = false;
      try {
        shown = item.show();
      } catch (error) {
        console.warn('[PopupQueue] show failed', item.key, error);
      }
      if (shown) {
        if (item.holdMs && item.holdMs > 0) {
          this.holdUntil = now + item.holdMs;
        }
        return true;
      }
    }
    return false;
  }
}
