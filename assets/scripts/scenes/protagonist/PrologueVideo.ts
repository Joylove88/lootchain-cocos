import { ImageAsset, resources, SpriteFrame, sys, Texture2D, VideoClip } from 'cc';
import { lootChainI18n } from '../../i18n/LootChainI18n';

/** 字幕时间轴(秒,对齐即梦正片的四个镜头:0-4 斩潮 / 4-7 背刺 / 7-11 伤口 / 11-15 碎裂)。文字走多语言表。 */
const CUES: Array<{ start: number; end: number; speaker: string; portrait: string; text: string }> = [
  { start: 4.3, end: 8.4, speaker: '天枢', portrait: 'ui/protagonist/b/portrait_tianshu/spriteFrame', text: '兄长,长夜你挡不住的。圣契……就交给我吧。' },
  { start: 11.2, end: 15.2, speaker: '夜帝', portrait: 'ui/protagonist/b/portrait_yedi/spriteFrame', text: '……天枢。我会回来的。' },
];

const SEEN_PREFIX = 'lootchain.prologue.seen.';

export function prologueSeen(userId: number): boolean {
  try {
    return sys.localStorage.getItem(`${SEEN_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function markSeen(userId: number): void {
  try {
    sys.localStorage.setItem(`${SEEN_PREFIX}${userId}`, '1');
  } catch {
    // 无痕 / 禁用存储:下次登录再播一次
  }
}

function urlOfFrame(path: string): Promise<string> {
  return new Promise((resolve) => {
    resources.load(path, SpriteFrame, (error, frame) => {
      const image = !error && frame ? (frame.texture as Texture2D | null)?.image as ImageAsset | undefined : undefined;
      resolve(image?.nativeUrl ?? '');
    });
  });
}

/**
 * docs/60 序幕「神庭陨落」(即梦参考生成的 15 秒正片,用户 11-03 认可):新号建主角之前播一次,播完 / 跳过进选择主角。
 * 网页:原生 <video> 覆盖在游戏容器上(挂 #GameDiv 内,手机竖握旋转时跟着转),字幕卡 / 跳过 / 标题是同层 DOM ——
 * Cocos VideoPlayer 在网页上是盖在画布之上的独立元素,画布里的字幕叠不上去。原生包暂不播,直接 onDone(后续单独做)。
 * 视频只有画面 + 原声;字幕按语言设置走 lootChainI18n。
 */
export function playPrologueVideo(userId: number, onDone: () => void): void {
  let finished = false;
  const done = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    markSeen(userId);
    onDone();
  };
  if (!sys.isBrowser || typeof document === 'undefined') {
    done();
    return;
  }
  resources.load('video/prologue', VideoClip, (error, clip) => {
    const src = !error && clip ? clip.nativeUrl : '';
    if (!src) {
      console.warn('[Prologue] video missing', error);
      done();
      return;
    }
    void Promise.all(CUES.map((cue) => urlOfFrame(cue.portrait))).then((portraits) => mount(src, portraits, done));
  });
}

function mount(src: string, portraits: string[], done: () => void): void {
  const host = document.getElementById('GameDiv') ?? document.body;
  const t = (text: string): string => lootChainI18n.text(text);
  const root = document.createElement('div');
  root.id = 'lootchain-prologue';
  root.style.cssText = 'position:absolute;inset:0;z-index:9999;background:#000;overflow:hidden;font-family:"PingFang SC","Microsoft YaHei",sans-serif;user-select:none;';
  const video = document.createElement('video');
  video.src = src;
  video.preload = 'auto';
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;';
  root.appendChild(video);

  // 上下电影黑边 + 左上标题(前 3 秒)
  const bar = (top: boolean): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:0;right:0;${top ? 'top' : 'bottom'}:0;height:6%;background:#000;`;
    return el;
  };
  root.appendChild(bar(true));
  root.appendChild(bar(false));
  const title = document.createElement('div');
  title.style.cssText = 'position:absolute;left:4%;top:9%;color:#F2F2F2;font-size:clamp(16px,2.4vh,26px);letter-spacing:2px;text-shadow:0 1px 4px #000;transition:opacity .8s;';
  title.innerHTML = `<span style="color:#E3C48A">${t('序幕')}</span>&nbsp;&nbsp;${t('神庭陨落')}`;
  root.appendChild(title);

  // 跳过(右上,黑边里)
  const skip = document.createElement('button');
  skip.textContent = t('跳过 ›');
  skip.style.cssText = 'position:absolute;right:3%;top:1.2%;height:4%;min-height:26px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.18);'
    + 'background:rgba(255,255,255,.08);color:#E6E8EE;font-size:clamp(13px,1.9vh,18px);cursor:pointer;';
  root.appendChild(skip);

  // 字幕卡(原型:毛玻璃深色卡 + 圆头像 + 香槟色说话人 + 白字)
  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:min(62%,1160px);display:flex;align-items:center;gap:2%;'
    + 'padding:1.4vh 2vw;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(20,24,33,.82);backdrop-filter:blur(8px);'
    + 'opacity:0;transition:opacity .35s;pointer-events:none;';
  const face = document.createElement('img');
  face.style.cssText = 'width:clamp(48px,9vh,96px);height:clamp(48px,9vh,96px);border-radius:50%;border:1px solid rgba(255,255,255,.25);object-fit:cover;flex:none;';
  const textBox = document.createElement('div');
  textBox.style.cssText = 'flex:1;min-width:0;text-align:left;';
  const speaker = document.createElement('div');
  speaker.style.cssText = 'color:#E3C48A;font-weight:600;font-size:clamp(13px,2vh,22px);margin-bottom:.4vh;';
  const line = document.createElement('div');
  line.style.cssText = 'color:#F2F2F2;font-size:clamp(15px,2.8vh,28px);line-height:1.4;';
  textBox.appendChild(speaker);
  textBox.appendChild(line);
  card.appendChild(face);
  card.appendChild(textBox);
  root.appendChild(card);
  host.appendChild(root);

  let shown = -1;
  const onTime = (): void => {
    const now = video.currentTime;
    if (now > 3) {
      title.style.opacity = '0';
    }
    const index = CUES.findIndex((cue) => now >= cue.start && now < cue.end);
    if (index === shown) {
      return;
    }
    shown = index;
    if (index < 0) {
      card.style.opacity = '0';
      return;
    }
    const cue = CUES[index];
    face.src = portraits[index] || '';
    face.style.display = portraits[index] ? '' : 'none';
    speaker.textContent = t(cue.speaker);
    line.textContent = t(cue.text);
    card.style.opacity = '1';
  };
  let closed = false;
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    video.pause();
    video.removeAttribute('src');
    video.load();
    root.style.transition = 'opacity .4s';
    root.style.opacity = '0';
    setTimeout(() => root.remove(), 450);
    done();
  };
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('ended', close);
  video.addEventListener('error', close);
  skip.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
  });
  // 有声自动播放被拦(没有用户手势)→ 静音再播;还不行就跳过,不卡开场
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(close);
  });
}
