import { HttpClient } from '../net/HttpClient';
import type { LobbyNoticeVO } from '../types/LobbyNoticeTypes';
import { isRecord, readDateText, readInteger, readText } from './ApiValueGuards';

const MAX_NOTICE_COUNT = 12;
const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 700;

/** 大厅公告只读 API。 */
export class LobbyNoticeApi {
  constructor(private readonly http: HttpClient) {}

  lobbyNotices(): Promise<LobbyNoticeVO[]> {
    // 只允许读取玩家大厅公告列表；按钮行为仍由大厅本地面板控制，不在这里产生业务动作。
    return this.http.get<unknown>('/api/player/lobby/notices').then(validateLobbyNotices);
  }
}

function validateLobbyNotices(data: unknown): LobbyNoticeVO[] {
  if (!Array.isArray(data)) {
    throw new Error('大厅公告响应格式错误：data 不是数组');
  }
  if (data.length > MAX_NOTICE_COUNT) {
    throw new Error('大厅公告响应格式错误：公告数量超过上限');
  }
  return data.map((item, index) => normalizeNotice(item, index));
}

function normalizeNotice(item: unknown, index: number): LobbyNoticeVO {
  if (!isRecord(item)) {
    throw new Error(`大厅公告响应格式错误：第 ${index + 1} 条不是对象`);
  }
  return {
    noticeNo: readText(item, 'noticeNo', 64, `notice-${index + 1}`),
    noticeType: readText(item, 'noticeType', 32, 'lobby'),
    title: readText(item, 'title', MAX_TITLE_LENGTH, '未命名公告'),
    content: readText(item, 'content', MAX_CONTENT_LENGTH, '公告内容暂未填写。'),
    priority: readInteger(item.priority, 0, 9999),
    startTime: readDateText(item.startTime),
    endTime: readDateText(item.endTime),
    publishTime: readDateText(item.publishTime),
  };
}

