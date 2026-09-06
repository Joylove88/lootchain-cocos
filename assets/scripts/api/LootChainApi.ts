import { AppConfig } from '../app/AppConfig';
import { HttpClient } from '../net/HttpClient';
import { TokenStore } from '../store/TokenStore';
import { BagApi } from './BagApi';
import { EquipmentApi } from './EquipmentApi';
import { BattleApi } from './BattleApi';
import { GachaApi } from './GachaApi';
import { GiftApi } from './GiftApi';
import { HeroApi } from './HeroApi';
import { IdleApi } from './IdleApi';
import { LobbyCodexApi } from './LobbyCodexApi';
import { LobbyAdventureApi } from './LobbyAdventureApi';
import { LobbyHeroApi } from './LobbyHeroApi';
import { LobbyTeamApi } from './LobbyTeamApi';
import { LobbyNoticeApi } from './LobbyNoticeApi';
import { MailApi } from './MailApi';
import { PlayerAuthApi } from './PlayerAuthApi';
import { QuestApi } from './QuestApi';
import { PlayerProfileApi } from './PlayerProfileApi';
import { ProtagonistApi } from './ProtagonistApi';
import { TokenApi } from './TokenApi';

/**
 * 前端 API 聚合入口。
 *
 * 当前 Cocos 登录/大厅阶段实际使用 auth、profile、protagonist、lobbyNotice、lobbyCodex、lobbyHero、lobbyAdventure、battle、gacha、hero 和 bag。
 * bag 仅允许只读列表/来源；hero 开放 level-up 与 star-up(2026-07-18)，awaken、bag use/sell、gacha exchange/reissue 等写入口仍不能开放。
 */
export class LootChainApi {
  readonly tokenStore = new TokenStore();
  readonly http = new HttpClient(AppConfig.apiBaseUrl, this.tokenStore);
  readonly auth = new PlayerAuthApi(this.http, this.tokenStore);
  readonly profile = new PlayerProfileApi(this.http);
  readonly protagonist = new ProtagonistApi(this.http);
  readonly lobbyNotice = new LobbyNoticeApi(this.http);
  readonly lobbyCodex = new LobbyCodexApi(this.http);
  readonly lobbyHero = new LobbyHeroApi(this.http);
  readonly lobbyTeam = new LobbyTeamApi(this.http);
  readonly lobbyAdventure = new LobbyAdventureApi(this.http);
  readonly battle = new BattleApi(this.http);
  readonly gacha = new GachaApi(this.http);
  readonly hero = new HeroApi(this.http);
  readonly bag = new BagApi(this.http);
  readonly equipment = new EquipmentApi(this.http);
  readonly idle = new IdleApi(this.http);
  readonly token = new TokenApi(this.http);
  readonly quest = new QuestApi(this.http);
  readonly mail = new MailApi(this.http);
  readonly gift = new GiftApi(this.http);

  setApiBaseUrl(baseUrl: string): void {
    this.http.setBaseUrl(baseUrl);
  }
}

export const lootChainApi = new LootChainApi();
