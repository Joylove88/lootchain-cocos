import { sys } from 'cc';

/**
 * 充值支付窗口(docs/34 §5.3)。
 * 浏览器只允许在点击回调里同步 window.open,而支付地址要等下单接口返回才知道:所以点档位时先同步开一个空白窗口占位,
 * 下单成功后把它导航到后端收银台中转页(/api/pay/cashier/…,沙箱隔离地呈现链接/表单/二维码)。
 * 游戏页绝不把三方支付内容写进自己的窗口(about:blank 与游戏同源,三方脚本就能读到登录令牌)。
 */
export class PaymentWindow {
  private constructor(private win: Window | null) {}

  /** 在点击回调里同步调用;被拦截时返回的实例 blocked=true,navigate 会再尝试直接打开一次。 */
  static openPlaceholder(): PaymentWindow {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return new PaymentWindow(null);
    }
    let win: Window | null = null;
    try {
      win = window.open('', '_blank');
      if (win) {
        // 只写本站自己的静态占位文案,不涉及任何三方内容。
        win.document.title = '正在前往支付…';
        win.document.body.style.cssText = 'margin:0;background:#16131a;color:#f3e6c8;font-family:sans-serif;text-align:center;padding-top:80px';
        win.document.body.textContent = '正在创建订单,请稍候…';
      }
    } catch {
      win = null;
    }
    return new PaymentWindow(win);
  }

  get blocked(): boolean {
    return !this.win;
  }

  /** 导航到支付地址;占位窗被拦截 / 被关掉时再直接开一次(可能仍被拦),返回是否已打开。 */
  navigate(url: string): boolean {
    if (this.win && !this.win.closed) {
      try {
        this.win.location.href = url;
        return true;
      } catch {
        // 跌到下面的兜底
      }
    }
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      const opened = window.open(url, '_blank');
      if (opened) {
        this.win = opened;
        return true;
      }
      return false;
    }
    // 原生端:交给系统浏览器。
    sys.openURL(url);
    return true;
  }

  close(): void {
    try {
      if (this.win && !this.win.closed) {
        this.win.close();
      }
    } catch {
      // ignore
    }
    this.win = null;
  }
}
