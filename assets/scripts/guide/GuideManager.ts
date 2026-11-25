import { sys } from 'cc';

/**
 * 守卫战局内引导「出过」的记录(2026-10-25 策划审核 P1-22,docs/45 §15):第 1 层教合成、第 2 层教战术三选一、第 3 层教法术,各出一次。
 * 按 userId 存本机 localStorage(lootchain.guide.<uid>.<flag>)。
 *
 * 2026-11-26 docs/57 §7:旧硬引导链(打首战 → 召唤 → 抽卡 → 英雄 → 升级 → 任务 → 领奖)和局外软引导(穿装备 / 水晶 / 每日副本 / 布阵)已下线 ——
 * 新手引导改由剧情任务带路(docs/57 §3 强 / 弱引导,LobbyHudRenderer.resolveStoryGuide、LobbyWeakGuide)、功能说明卡(§4)、情境提示(§5)承担;
 * 这里只留守卫战局内 3 条(docs/57 §7「保留给特殊玩法 · 守卫战第一次进入时用」)。
 */
export type GuideFlag = 'battleMerge' | 'battlePerk' | 'battleSpell';

class LobbyGuideManager {
  private userId = 0;

  bind(userId: number): void {
    if (Number.isFinite(userId) && userId > 0) {
      this.userId = userId;
    }
  }

  markVisited(flag: GuideFlag): void {
    if (this.userId <= 0) {
      return;
    }
    try {
      sys.localStorage.setItem(this.key(flag), '1');
    } catch (error) {
      void error;
    }
  }

  /** 局内引导是否已出过(未绑定玩家时按已完成,不打扰)。 */
  isDone(flag: GuideFlag): boolean {
    return this.userId <= 0 || this.visited(flag);
  }

  private visited(flag: GuideFlag): boolean {
    try {
      return sys.localStorage.getItem(this.key(flag)) === '1';
    } catch (error) {
      void error;
      return true;
    }
  }

  private key(flag: GuideFlag): string {
    return `lootchain.guide.${this.userId}.${flag}`;
  }
}

export const lobbyGuide = new LobbyGuideManager();
