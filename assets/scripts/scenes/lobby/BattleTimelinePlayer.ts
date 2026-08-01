import { tween, Vec3, Node } from 'cc';
import type { BattlePresentationUnitSnapshot } from './LobbyBattlePresentationSnapshot';

// Stage 13E 行动时间线播放器：按行动顺序播放移动/攻击前摇/命中飘字/受击/返回/缓冲。
// 节奏：开场0.5s入场，移动0.25-0.45s，攻击前摇0.2-0.4s，命中飘字，受击0.2s，返回0.25-0.45s，缓冲0.2s。

export interface BattleTimelineAction {
  seq: number;
  actorKey: string;
  targetKey: string;
  kind: 'melee_move' | 'ranged_projectile' | 'basic_attack' | 'skill' | 'hit' | 'heal' | 'buff' | 'dead' | 'victory';
  animationName: string | null;
  displayValue: string;
  advanceRatio: number;
}

export interface BattleTimelinePlayerHost {
  onActionStart(action: BattleTimelineAction): void;
  onActionHit(action: BattleTimelineAction): void;
  onActionEnd(action: BattleTimelineAction): void;
  onComplete(): void;
  getActorNode(unitKey: string): Node | null;
}

export class BattleTimelinePlayer {
  private playing = false;
  private cancelled = false;

  constructor(private readonly host: BattleTimelinePlayerHost) {}

  async play(actions: BattleTimelineAction[]): Promise<void> {
    this.playing = true;
    this.cancelled = false;
    // 开场入场 0.5s
    await this.delay(500);
    if (this.cancelled) return;
    for (const action of actions) {
      if (this.cancelled) return;
      this.host.onActionStart(action);
      // 移动 0.25-0.45s
      const moveDuration = 250 + Math.random() * 200;
      await this.delay(moveDuration);
      if (this.cancelled) return;
      // 攻击前摇 0.2-0.4s
      const windupDuration = 200 + Math.random() * 200;
      await this.delay(windupDuration);
      if (this.cancelled) return;
      // 命中点
      this.host.onActionHit(action);
      // 受击 0.2s
      await this.delay(200);
      if (this.cancelled) return;
      // 返回 0.25-0.45s
      const returnDuration = 250 + Math.random() * 200;
      await this.delay(returnDuration);
      if (this.cancelled) return;
      this.host.onActionEnd(action);
      // 缓冲 0.2s
      await this.delay(200);
    }
    this.playing = false;
    this.host.onComplete();
  }

  cancel(): void {
    this.cancelled = true;
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const safeMs = Math.max(0, ms);
      setTimeout(() => resolve(), safeMs);
    });
  }
}
