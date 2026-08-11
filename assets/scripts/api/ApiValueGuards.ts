/**
 * API 响应边界共享校验件(2026-08-12 复用重构批4)。
 * 收编此前散落在 BattleApi/IdleApi/LobbyAdventureApi/LobbyHeroApi/LobbyNoticeApi/
 * LobbyCodexApi/ProtagonistApi/LobbyTeamApi 里的等价副本(isRecord/readText/readInteger 系)。
 * 只做类型判定/裁剪/夹取;领域规则(关卡码合法性、英雄ID正数约束等)留在各自 Api 文件。
 */
export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readArray(record: UnknownRecord, key: string, maxLength: number): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value.slice(0, maxLength) : [];
}

export function readText(record: UnknownRecord, key: string, maxLength: number, fallback = ''): string {
  const value = record[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

export function readOptionalText(record: UnknownRecord, key: string, maxLength: number): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function readRequiredText(record: UnknownRecord, key: string, maxLength: number, errorMessage: string): string {
  const value = readText(record, key, maxLength, '');
  if (!value) {
    throw new Error(errorMessage);
  }
  return value;
}

export function readInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

export function readNullableInteger(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return readInteger(value, min, max);
}

export function readNumber(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, numeric));
}

export function readNullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return readNumber(value, min, max);
}

/** 可空有效属性(英雄/敌人 stat):非数字→null,负数归零,四舍五入取整。 */
export function readOptionalStat(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.round(numeric));
}

/** 日期字符串透传(只裁长度,不解析;空值→null)。 */
export function readDateText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return typeof value === 'string' ? value.slice(0, 32) : null;
}

// ── 形状断言(裸透传 Api 的最小边界):只保证"对象/数组"形状与限长,字段仍信任服务端类型。
// 拦截的是 HTML 错误页/null/字符串借 http.get<VO> 类型断言直通 UI 的故障类。

export function expectRecord<T>(label: string): (data: unknown) => T {
  return (data: unknown): T => {
    if (!isRecord(data)) {
      throw new Error(`${label}响应格式错误：data 不是对象`);
    }
    return data as unknown as T;
  };
}

export function expectRecordArray<T>(label: string, maxLength: number): (data: unknown) => T[] {
  return (data: unknown): T[] => {
    if (!Array.isArray(data)) {
      throw new Error(`${label}响应格式错误：data 不是数组`);
    }
    return data.slice(0, maxLength).filter(isRecord) as unknown as T[];
  };
}
