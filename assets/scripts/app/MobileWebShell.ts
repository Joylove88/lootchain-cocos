import { EditBox, sys } from 'cc';
import { HTML5 } from 'cc/env';

/**
 * 手机网页外壳(2026-10-05 用户:「竖屏应该要有提示横屏的动画,强制横屏」「横屏后浏览器的标头会占用上面一部分空间」):
 * - 竖握时盖一层"请横屏"提示(手机图标转 90° 的循环动画),横过来自动消失;
 * - 点一下屏幕就请求全屏(隐藏地址栏 / 标签栏)并锁定横屏——安卓 Chrome / Edge / 三星等支持;
 *   登录 / 注册 / 起名等有输入框的界面不触发(2026-10-05 用户实测:进全屏时视口变化会把刚弹出的输入法收掉,
 *   浏览器自带的「如需退出全屏…」提示也会盖住登录按钮好几秒——该提示是浏览器强制的,网页无法移除);
 *   iPhone Safari 不支持网页全屏,只能靠提示层 + 「添加到主屏幕」(index.ejs 已声明 apple-mobile-web-app-capable);
 * - 引擎 EditBox 聚焦 0.4s 后会对输入框 DOM 调 scrollIntoView,输入框在这 0.4s 内被销毁(界面重建)时引擎直接报错
 *   「Cannot read properties of null (reading 'scrollIntoView')」并弹红屏——这里给它补空值判断。
 * 只在浏览器运行;电脑端只装 EditBox 补丁。
 */
const OVERLAY_ID = 'lc-rotate-tip';
const STYLE_ID = 'lc-rotate-style';
const FULLSCREEN_RETRY_MS = 1500;

let installed = false;
let lastFullscreenTry = 0;
/** 由游戏设置:当前界面是否允许自动进全屏(登录 / 输入中返回 false)。 */
let fullscreenGate: () => boolean = () => true;

export function setFullscreenGate(gate: () => boolean): void {
  fullscreenGate = gate;
}

function inputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

export function installMobileWebShell(): void {
  if (installed || !HTML5 || typeof document === 'undefined') {
    return;
  }
  installed = true;
  patchEditBoxScroll();
  if (!sys.isMobile) {
    return;
  }
  mountRotateOverlay();
  const sync = (): void => syncRotateOverlay();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', () => setTimeout(sync, 120));
  sync();
  // 用户手势里才能请求全屏(手势后约 5 秒内都有效):触摸抬起后等 0.3s,确认这一下没有点开输入框、当前界面允许,再请求
  const tryFullscreen = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    setTimeout(() => {
      if (!inputFocused() && fullscreenGate()) {
        requestLandscapeFullscreen();
      }
    }, 300);
  };
  document.addEventListener('touchend', tryFullscreen, { capture: true, passive: true });
  document.addEventListener('click', tryFullscreen, { capture: true, passive: true });
}

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

function fullscreenSupported(): boolean {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

function isFullscreen(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(document.fullscreenElement || doc.webkitFullscreenElement);
}

/**
 * 请求全屏 + 锁横屏(须在用户手势后约 5 秒内调用)。手机端才生效;已全屏 / 不支持 / 1.5s 内重复调用时忽略。
 * 游戏在「登录」「注册」按钮里主动调用:浏览器的退出全屏提示随后落在加载 / 进大厅过程里,不挡登录按钮。
 */
export function requestLandscapeFullscreen(): void {
  if (!installed || !sys.isMobile) {
    return;
  }
  const now = Date.now();
  if (isFullscreen() || now - lastFullscreenTry < FULLSCREEN_RETRY_MS || !fullscreenSupported()) {
    return;
  }
  lastFullscreenTry = now;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = (): void => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
    if (orientation && typeof orientation.lock === 'function') {
      orientation.lock('landscape').catch(() => undefined);
    }
  };
  try {
    if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => undefined);
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
      setTimeout(lock, 200);
    }
  } catch (error) {
    void error;
  }
}

function mountRotateOverlay(): void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${OVERLAY_ID}{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;display:none;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 42%,#2a1d10 0%,#0b0805 62%,#000 100%);color:#f5d27a;font-family:"PingFang SC","Microsoft YaHei",sans-serif;
  -webkit-user-select:none;user-select:none;touch-action:none}
#${OVERLAY_ID}.show{display:flex}
#${OVERLAY_ID} .lc-phone{position:relative;width:64px;height:112px;border:5px solid #f5d27a;border-radius:14px;box-shadow:0 0 18px rgba(245,180,80,.45);
  animation:lc-rotate 2.4s ease-in-out infinite;margin-bottom:48px}
#${OVERLAY_ID} .lc-phone:before{content:"";position:absolute;left:50%;top:7px;width:16px;height:3px;margin-left:-8px;border-radius:2px;background:#f5d27a;opacity:.8}
#${OVERLAY_ID} .lc-phone:after{content:"";position:absolute;left:8px;right:8px;top:16px;bottom:16px;border-radius:4px;background:linear-gradient(135deg,rgba(245,210,122,.35),rgba(245,210,122,.08))}
#${OVERLAY_ID} .lc-arc{position:absolute;width:150px;height:150px;border:3px dashed rgba(245,210,122,.35);border-radius:50%;margin-top:-48px;animation:lc-spin 6s linear infinite}
#${OVERLAY_ID} .lc-title{font-size:22px;font-weight:bold;letter-spacing:2px;text-shadow:0 2px 6px rgba(0,0,0,.8)}
#${OVERLAY_ID} .lc-sub{margin-top:10px;font-size:14px;color:rgba(230,205,160,.75)}
@keyframes lc-rotate{0%,18%{transform:rotate(0deg)}48%,70%{transform:rotate(-90deg)}100%{transform:rotate(0deg)}}
@keyframes lc-spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);
  }
  if (!document.getElementById(OVERLAY_ID)) {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    const tip = fullscreenSupported() ? '横屏后登录即自动全屏' : '建议关闭竖排方向锁定后横屏游玩';
    overlay.innerHTML = `<div class="lc-arc"></div><div class="lc-phone"></div><div class="lc-title">请将手机横过来</div><div class="lc-sub">${tip}</div>`;
    // 点提示层不进全屏:转过来后正好落在登录页,浏览器的「如需退出全屏…」提示会挡住登录按钮(2026-10-05 用户)
    document.body.appendChild(overlay);
  }
}

function syncRotateOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    return;
  }
  overlay.classList.toggle('show', isPortrait());
}

/** 引擎 EditBoxImpl._adjustWindowScroll 补空值判断(延时回调里输入框 DOM 可能已被销毁)。 */
function patchEditBoxScroll(): void {
  try {
    const implClass = (EditBox as unknown as { _EditBoxImpl?: { prototype: Record<string, unknown> } })._EditBoxImpl;
    const proto = implClass?.prototype as {
      _adjustWindowScroll?: () => void;
      _isElementInViewport?: () => boolean;
      _edTxt?: HTMLElement | null;
      __lcPatched?: boolean;
    } | undefined;
    if (!proto || typeof proto._adjustWindowScroll !== 'function' || proto.__lcPatched) {
      return;
    }
    proto.__lcPatched = true;
    proto._adjustWindowScroll = function adjustWindowScroll(this: typeof proto): void {
      setTimeout(() => {
        const el = this?._edTxt;
        if (!el || !el.isConnected) {
          return;
        }
        if (window.scrollY < 40 && !(this?._isElementInViewport?.() ?? true)) {
          el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
        }
      }, 400);
    };
  } catch (error) {
    void error;
  }
}
