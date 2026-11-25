import { sys } from 'cc';
import { GUIDE_FLAG_BATCH, GUIDE_FLAG_PATTERN } from '../../api/GuideApi';
import { ApiError } from '../../net/HttpClient';

/**
 * docs/57 §9 第 1 条「进度存服务端」/ §10「老号 / 换端以服务端为准,本机只作离线兜底」/ §12(11-25):
 * 新手引导的「看过 / 跳过」记录同步到服务端(user_guide_flag),换设备 / 清缓存不再重放。
 *
 * - 各记录点照旧写本机(离线兜底),同时 mark() 异步上报;
 * - 登录进大厅 pull() 一次:拉服务端全部标记 → 各记录点按 version 合进本机;
 *   再把「本机有、服务端没有」的一次批量补报(老号上线前只存本机的记录 / 以前断网没报上的);
 * - 上报没成功(断网 / 超时 / 服务端重启中)的留在本机待发队列(lc_guide_outbox_<uid>),下次登录 pull 时再发;
 *   服务端明确拒绝的(业务错误)直接丢,不无限重试。
 *
 * 标记码:intro:<功能> 说明卡看过 / skip:<剧情码> 强引导跳过 / new:<功能> 终端「新」角标挂上 /
 * newseen:<功能> 角标点掉 / tracker_walk 追踪条「点这里自动寻路」用过 / tip:<键> §5 情境提示出过。
 */
export interface GuideFlagApi {
  flags(): Promise<string[]>;
  mark(flags: string[]): Promise<string[]>;
}

/** 标记码(docs/57 §12;新引导加新码照这个格式:前缀:键,只用字母数字 _ : . -)。 */
export const GuideFlags = {
  /** 功能说明卡看过。 */
  intro: (key: string): string => `intro:${key}`,
  /** 剧情强引导跳过(完成看剧情进度,不记)。 */
  skip: (code: string): string => `skip:${code}`,
  /** 终端「新」角标挂上(功能新开放)。 */
  fresh: (key: string): string => `new:${key}`,
  /** 「新」角标点掉。 */
  freshSeen: (key: string): string => `newseen:${key}`,
  /** 追踪条「点这里自动寻路」用过。 */
  trackerWalk: 'tracker_walk',
  /** docs/57 §5 情境提示出过(equip / crystal / stamina / near_hidden / near_chest / near_gather)。 */
  tip: (key: string): string => `tip:${key}`,
} as const;

export class GuideFlagSync {
  private uid = 0;
  /** 服务端已有的(拉到的 + 已发出 / 待发的,乐观记上)。 */
  private readonly known = new Set<string>();
  private outbox = new Set<string>();
  private pulledUid = 0;
  /** 正在拉哪个账号(按账号记:拉的途中切号,新账号照样能拉)。 */
  private pullingUid = 0;
  private flushing = false;
  /** 每合进一批服务端标记 +1;记录点看到变化就重新合并一次。 */
  version = 0;

  constructor(private readonly api: () => GuideFlagApi) {}

  /** 当前绑定的账号(记录点只在账号一致时合并,防切号串数据)。 */
  boundUid(): number {
    return this.uid;
  }

  /** 登录 / 切换账号:换绑 + 忘掉「已拉过」(同账号重登也重新拉一次)。 */
  resetForLogin(uid: number): void {
    this.pulledUid = 0;
    this.bind(uid);
  }

  has(flag: string): boolean {
    return this.known.has(flag);
  }

  /** 所有以 prefix 开头的标记(去掉前缀),例 prefix = 'skip:' → ['V04']。 */
  withPrefix(prefix: string): string[] {
    return Array.from(this.known).filter((flag) => flag.startsWith(prefix)).map((flag) => flag.slice(prefix.length));
  }

  /**
   * 登录进大厅时调(同账号只拉一次;失败下次再拉)。localFlags = 本机已有的全部记录(补报用)。
   * @returns 拉成功了没有(成功后调用方把服务端标记合进本机 / 收掉已经画出来的提示)。
   */
  async pull(uid: number, localFlags: () => string[]): Promise<boolean> {
    this.bind(uid);
    if (!uid || this.pulledUid === uid || this.pullingUid === uid) {
      return false;
    }
    this.pullingUid = uid;
    try {
      const remote = await this.api().flags();
      if (this.uid !== uid) {
        return false;
      }
      const remoteSet = new Set(remote);
      remote.forEach((flag) => this.known.add(flag));
      for (const flag of localFlags()) {
        if (!remoteSet.has(flag) && GUIDE_FLAG_PATTERN.test(flag)) {
          this.known.add(flag);
          this.outbox.add(flag);
        }
      }
      this.pulledUid = uid;
      this.version += 1;
      this.saveOutbox();
      void this.flush();
      return true;
    } catch {
      // 拉不到(断网 / 老后端没有这个接口):照本机记录走,下次登录再拉
      return false;
    } finally {
      if (this.pullingUid === uid) {
        this.pullingUid = 0;
      }
    }
  }

  /** 记一个标记(本机记录点写完本机后调);已有的不重复报。 */
  mark(flag: string): void {
    if (!this.uid || !GUIDE_FLAG_PATTERN.test(flag) || this.known.has(flag)) {
      return;
    }
    this.known.add(flag);
    this.outbox.add(flag);
    this.saveOutbox();
    void this.flush();
  }

  private bind(uid: number): void {
    if (uid === this.uid) {
      return;
    }
    this.uid = uid;
    this.known.clear();
    this.outbox = new Set(this.loadOutbox());
    this.outbox.forEach((flag) => this.known.add(flag));
    this.flushing = false;
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.outbox.size === 0 || !this.uid) {
      return;
    }
    const uid = this.uid;
    const batch = Array.from(this.outbox).slice(0, GUIDE_FLAG_BATCH);
    this.flushing = true;
    let again = false;
    try {
      await this.api().mark(batch);
      again = true;
      this.dropFromOutbox(uid, batch);
    } catch (error) {
      // 断网 / 超时 / 网关 5xx / 登录过期:留着下次登录再发;服务端明确拒绝(业务错误)的丢掉,免得每次都卡在这一批
      const code = error instanceof ApiError ? error.code : -1;
      const transient = code < 0 || code === 401 || (code >= 500 && code < 600);
      if (!transient) {
        this.dropFromOutbox(uid, batch);
      }
    } finally {
      if (this.uid === uid) {
        this.flushing = false;
      }
    }
    // 成功一批、还有剩的(超过一批上限)接着发;失败的等下次登录
    if (again && this.uid === uid && this.outbox.size > 0) {
      void this.flush();
    }
  }

  private dropFromOutbox(uid: number, batch: string[]): void {
    if (this.uid !== uid) {
      return;
    }
    batch.forEach((flag) => this.outbox.delete(flag));
    this.saveOutbox();
  }

  private outboxKey(): string {
    return `lc_guide_outbox_${this.uid}`;
  }

  private loadOutbox(): string[] {
    if (!this.uid) {
      return [];
    }
    try {
      const raw = sys.localStorage.getItem(this.outboxKey());
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((flag): flag is string => typeof flag === 'string' && GUIDE_FLAG_PATTERN.test(flag)) : [];
    } catch {
      return [];
    }
  }

  private saveOutbox(): void {
    if (!this.uid) {
      return;
    }
    try {
      if (this.outbox.size === 0) {
        sys.localStorage.removeItem(this.outboxKey());
      } else {
        sys.localStorage.setItem(this.outboxKey(), JSON.stringify(Array.from(this.outbox)));
      }
    } catch {
      // 本地存储不可用:待发队列只在本次会话里
    }
  }
}
