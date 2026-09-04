/** 任务/成就/邮件 P1(2026-09-04,后端 /api/player/quests|mails)。 */

export interface QuestRewardItemVO {
  type: string;
  code: string;
  name: string;
  amount: number;
}

export interface PlayerQuestVO {
  questCode: string;
  questName: string;
  questDesc: string | null;
  questType: 'DAILY' | 'ACHIEVE';
  progress: number;
  targetCount: number;
  claimed: boolean;
  claimable: boolean;
  rewards: QuestRewardItemVO[];
}

export interface PlayerQuestSummaryVO {
  daily: PlayerQuestVO[];
  achievements: PlayerQuestVO[];
  claimableCount: number;
}

export interface PlayerMailVO {
  mailId: number;
  title: string;
  content: string;
  attachments: QuestRewardItemVO[];
  read: boolean;
  claimed: boolean;
  expireTime: string | null;
  createTime: string | null;
}
