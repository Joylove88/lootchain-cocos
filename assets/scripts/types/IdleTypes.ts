/** 挂机收益类型。数值全部由服务端权威计费,客户端只读展示与领取。 */

export interface PlayerIdleSummaryVO {
  farmingFloor: number;
  stageCode: string;
  goldPerHour: number;
  expBookIntervalSeconds: number;
  accruedSeconds: number;
  capSeconds: number;
  pendingGold: number;
  pendingExpBook: number;
  claimable: boolean;
}

export interface PlayerIdleClaimVO {
  claimNo: string;
  replayed: boolean;
  accruedSeconds: number;
  goldAmount: number;
  expBookCount: number;
  farmingFloor: number;
  message: string;
}
