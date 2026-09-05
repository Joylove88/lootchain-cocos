import { sys } from 'cc';

/**
 * 新手引导 P2(完整闭环,2026-09-05):硬引导链带玩家走完一整套核心体验,每一步资源都有保证:
 *
 * TOWER(打首战)→ SUMMON(去召唤)→ DRAW(免费单抽,后端每日免费保证)
 * → HERO(去英雄页)→ HERO_CARD(点开英雄)→ LEVEL_UP(升一级,注册送经验书+金币保证)
 * → QUEST(去任务页)→ CLAIM(领一次奖励,登录任务必可领)→ DONE。
 *
 * - 首战完成 = 主线推荐关卡已不是 MAIN_1_1(服务端进度权威,防本地作弊/换端丢失)。
 * - 其余步骤以"到访/动作完成"为准(localStorage 按 userId 记 flag):
 *   summon/hero/quest=到访目标页,draw=抽卡成功,herocard=打开英雄详情,levelup=升级成功,claim=领取成功。
 * - 老玩家豁免:主线进度已过第 5 关 → 全部视为完成,不打扰。
 */
export type GuideStep =
  | 'TOWER'
  | 'SUMMON'
  | 'DRAW'
  | 'HERO'
  | 'HERO_CARD'
  | 'LEVEL_UP'
  | 'QUEST'
  | 'CLAIM'
  | 'DONE';

type GuideFlag = 'summon' | 'draw' | 'hero' | 'herocard' | 'levelup' | 'quest' | 'claim';

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
    if (!this.visited('draw')) {
      return 'DRAW';
    }
    if (!this.visited('hero')) {
      return 'HERO';
    }
    if (!this.visited('herocard')) {
      return 'HERO_CARD';
    }
    if (!this.visited('levelup')) {
      return 'LEVEL_UP';
    }
    if (!this.visited('quest')) {
      return 'QUEST';
    }
    if (!this.visited('claim')) {
      return 'CLAIM';
    }
    return 'DONE';
  }

  /** 当前是否处于免费单抽引导步(gacha 页自动选中免费池用)。 */
  isDrawStep(firstBattleDone: boolean, veteran: boolean): boolean {
    return this.resolveStep(firstBattleDone, veteran) === 'DRAW';
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
