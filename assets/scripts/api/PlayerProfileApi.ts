import { HttpClient } from '../net/HttpClient';
import type { PlayerLobbyProfileVO } from '../types/PlayerTypes';
import { expectRecord } from './ApiValueGuards';

/** 改昵称状态(与后端 PlayerRenameInfoVO 对齐)。 */
export interface PlayerRenameInfoVO {
  currentName: string;
  freeAvailable: boolean;
  diamondCost: number;
  renameCount: number;
}

/** 改昵称结果。 */
export interface PlayerRenameResultVO {
  displayName: string;
  diamondSpent: number;
  replayed: boolean;
  next: PlayerRenameInfoVO;
}

export class PlayerProfileApi {
  constructor(private readonly http: HttpClient) {}

  lobbyProfile(): Promise<PlayerLobbyProfileVO> {
    // 大厅阶段只读玩家展示资料，不提供任何修改或领取类写入口。
    return this.http.get<unknown>('/api/player/me/lobby').then(expectRecord<PlayerLobbyProfileVO>('大厅资料'));
  }

  // 改昵称(2026-09-25):第一次免费,之后按服务端价格扣钻石;重复提交同名按幂等处理。
  renameInfo(): Promise<PlayerRenameInfoVO> {
    return this.http.get<unknown>('/api/player/me/rename').then(expectRecord<PlayerRenameInfoVO>('改名状态'));
  }

  rename(nickname: string): Promise<PlayerRenameResultVO> {
    return this.http.post<unknown>('/api/player/me/rename', { nickname }).then(expectRecord<PlayerRenameResultVO>('修改昵称'));
  }
}
