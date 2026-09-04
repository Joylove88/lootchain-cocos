/** 后端登录成功返回的 token 名和值，HttpClient 会按 tokenName 动态设置请求头。 */
export interface PlayerTokenVO {
  tokenName: string;
  tokenValue: string;
  /** 账号登录/注册返回(2026-09-04 账号体系);dev-login 同样回传。 */
  userId?: number | null;
}
