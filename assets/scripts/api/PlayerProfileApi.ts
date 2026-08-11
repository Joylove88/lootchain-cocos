import { HttpClient } from '../net/HttpClient';
import type { PlayerLobbyProfileVO } from '../types/PlayerTypes';
import { expectRecord } from './ApiValueGuards';

export class PlayerProfileApi {
  constructor(private readonly http: HttpClient) {}

  lobbyProfile(): Promise<PlayerLobbyProfileVO> {
    // 大厅阶段只读玩家展示资料，不提供任何修改或领取类写入口。
    return this.http.get<unknown>('/api/player/me/lobby').then(expectRecord<PlayerLobbyProfileVO>('大厅资料'));
  }
}
