import { sys } from 'cc';

/**
 * 新手引导 P1(上线冲刺,2026-09-05):软引导(不挡输入),步骤由真实进度推导,零后端依赖。
 *
 * 步骤链:TOWER(打首战 MAIN_1_1)→ SUMMON(去召唤)→ HERO(看英雄)→ QUEST(看任务)→ DONE。
 * - 首战完成 = 主线推荐关卡已不是 MAIN_1_1(服务端进度权威,防本地作弊/换端丢失)。
 * - SUMMON/HERO/QUEST 以"到访过目标页"为完成(localStorage 按 userId 记 flag)。
 * - 老玩家豁免:主线进度已过第 5 关 → 全部视为完成,不打扰。
 */
export type GuideStep = 'TOWER' | 'SUMMON' | 'HERO' | 'QUEST' | 'DONE';

type GuideFlag = 'summon' | 'hero' | 'quest';

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

  resolveStep(firstBattleDone: boolean, veteran: boolean): GuideStep {
    if (this.userId <= 0 || veteran) {
      return 'DONE';
    }
    if (!firstBattleDone) {
      return 'TOWER';
    }
    if (!this.visited('summon')) {
      return 'SUMMON';
    }
    if (!this.visited('hero')) {
      return 'HERO';
    }
    if (!this.visited('quest')) {
      return 'QUEST';
    }
    return 'DONE';
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
