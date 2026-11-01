import { HttpClient } from '../net/HttpClient';
import type { HeroSkinInfo } from '../scenes/lobby/HeroSkins';
import { isRecord, readArray, readNumber, readText, type UnknownRecord } from './ApiValueGuards';

export interface HeroSkinCatalog {
  skins: HeroSkinInfo[];
  diamond: number;
}

export interface HeroSkinActionResult {
  skin: HeroSkinInfo | null;
  diamond: number;
  /** 穿脱后该英雄最新战力(没有该英雄 = null)。 */
  heroPower: number | null;
  message: string;
}

function readSkin(value: unknown): HeroSkinInfo | null {
  if (!isRecord(value)) {
    return null;
  }
  const r = value as UnknownRecord;
  const skinCode = readText(r, 'skinCode', 64, '').toUpperCase();
  if (!skinCode) {
    return null;
  }
  return {
    skinCode,
    heroCode: readText(r, 'heroCode', 64, '').toUpperCase(),
    skinName: readText(r, 'skinName', 64, skinCode),
    tag: readText(r, 'tag', 32, ''),
    attackPct: readNumber(r.attackPct, 0, 10),
    hpPct: readNumber(r.hpPct, 0, 10),
    priceDiamond: readNumber(r.priceDiamond, 0, 1e9),
    description: readText(r, 'description', 255, ''),
    owned: r.owned === true,
    equipped: r.equipped === true,
    powerBonus: readNumber(r.powerBonus, 0, 1e12),
  };
}

function readResult(value: unknown): HeroSkinActionResult {
  const r = isRecord(value) ? value : {};
  return {
    skin: readSkin(r.skin),
    diamond: readNumber(r.diamond, 0, 1e15),
    heroPower: typeof r.heroPower === 'number' ? r.heroPower : null,
    message: readText(r, 'message', 128, ''),
  };
}

/** 英雄皮肤(docs/56):目录 / 商店购买 / 穿戴。 */
export class HeroSkinApi {
  constructor(private readonly http: HttpClient) {}

  catalog(): Promise<HeroSkinCatalog> {
    return this.http.get<unknown>('/api/player/hero-skins').then((value) => {
      const r = isRecord(value) ? value : {};
      return {
        skins: readArray(r, 'skins', 200).map(readSkin).filter((skin): skin is HeroSkinInfo => !!skin),
        diamond: readNumber(r.diamond, 0, 1e15),
      };
    });
  }

  buy(skinCode: string): Promise<HeroSkinActionResult> {
    return this.http.post<unknown>('/api/player/hero-skins/buy', { skinCode }).then(readResult);
  }

  /** skinCode = null 换回默认外观。 */
  equip(heroCode: string, skinCode: string | null): Promise<HeroSkinActionResult> {
    return this.http.post<unknown>('/api/player/hero-skins/equip', { heroCode, skinCode }).then(readResult);
  }
}
