import { ImageAsset, resources, SpriteFrame, sys, Texture2D, VideoClip } from 'cc';
import { gameAudio } from '../../audio/GameAudio';
import { lootChainI18n } from '../../i18n/LootChainI18n';

/**
 * 字幕时间轴(秒,对齐即梦正片的四个镜头:0-4 斩潮 / 4-7 背刺 / 7-11 伤口 / 11-15 碎裂)。文字走多语言表。
 * intro = 人物出场介绍(头像 + 名字 + 身份),line = 台词,narration = 旁白(无头像)。
 * 11-03 用户线上试玩「一开始分不清谁是谁、没看懂」→ 人物出场先报身份,背刺后补一句旁白点明因果,前后加黑场旁白。
 */
type CueKind = 'intro' | 'line' | 'narration';
const CUES: Array<{ start: number; end: number; kind: CueKind; speaker: string; role: string; portrait: string; text: string }> = [
  { start: 0.4, end: 3.9, kind: 'intro', speaker: '夜帝', role: '至尊境 · 神庭的守护者', portrait: 'ui/protagonist/b/portrait_yedi/spriteFrame', text: '诸神沉默时,只有他敢以长夜之力对抗长夜。' },
  { start: 4.3, end: 8.4, kind: 'line', speaker: '天枢', role: '神庭之主 · 夜帝的结义兄弟', portrait: 'ui/protagonist/b/portrait_tianshu/spriteFrame', text: '兄长,长夜你挡不住的。圣契……就交给我吧。' },
  { start: 8.6, end: 11.0, kind: 'narration', speaker: '', role: '', portrait: '', text: '为了夺走圣契,天枢在决战中背刺了自己的兄长。' },
  { start: 11.2, end: 15.2, kind: 'line', speaker: '夜帝', role: '至尊境', portrait: 'ui/protagonist/b/portrait_yedi/spriteFrame', text: '……天枢。我会回来的。' },
];

/** 片头黑场旁白(视频前):交代世界与夜帝是谁。 */
const OPENING = ['万界之上,有神庭。', '长夜之潮吞噬诸天,诸神沉默。', '唯有至尊「夜帝」,独守神庭最后一道防线。'];
/** 片尾黑场旁白(视频后):残魂下界 → 接晨风村觉醒。 */
const CLOSING = ['夜帝肉身陨灭,神魂破碎。', '最后一缕残魂带着「圣契」坠入下界,循着魂印寻找他的转世——', '晨风村的你。'];

const SEEN_PREFIX = 'lootchain.prologue.seen.';

export function prologueSeen(userId: number): boolean {
  try {
    return sys.localStorage.getItem(`${SEEN_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

/** 序幕正在播(片头 / 视频 / 片尾任一段):觉醒演出要等它结束。 */
export function prologuePlaying(): boolean {
  return typeof document !== 'undefined' && !!document.getElementById('lootchain-prologue');
}

function markSeen(userId: number): void {
  try {
    sys.localStorage.setItem(`${SEEN_PREFIX}${userId}`, '1');
  } catch {
    // 无痕 / 禁用存储:下次登录再播一次
  }
}

function urlOfFrame(path: string): Promise<string> {
  if (!path) {
    return Promise.resolve('');
  }
  return new Promise((resolve) => {
    resources.load(path, SpriteFrame, (error, frame) => {
      const image = !error && frame ? (frame.texture as Texture2D | null)?.image as ImageAsset | undefined : undefined;
      resolve(image?.nativeUrl ?? '');
    });
  });
}

/**
 * docs/60 序幕「神庭陨落」(即梦参考生成的 15 秒正片,1080p30):新号选完主角、建号成功后播一次(大厅在后面加载),
 * 片头黑场旁白 → 视频(人物身份卡 + 台词 + 旁白字幕)→ 片尾黑场旁白「晨风村的你」→ 接晨风村觉醒演出。
 * 网页:原生 <video> 覆盖在游戏容器上(挂 #GameDiv 内,手机竖握旋转时跟着转),字幕卡 / 跳过 / 旁白是同层 DOM ——
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
  if (prologuePlaying()) {
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
  if (prologuePlaying()) {
    return;
  }
  const host = document.getElementById('GameDiv') ?? document.body;
  const t = (text: string): string => lootChainI18n.text(text);
  const root = document.createElement('div');
  root.id = 'lootchain-prologue';
  root.style.cssText = 'position:absolute;inset:0;z-index:9999;background:#000;overflow:hidden;font-family:"PingFang SC","Microsoft YaHei",sans-serif;user-select:none;cursor:pointer;';
  const video = document.createElement('video');
  video.src = src;
  video.preload = 'auto';
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;opacity:0;transition:opacity .8s;';
  root.appendChild(video);

  // 上下电影黑边
  const bar = (top: boolean): HTMLDivElement => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:0;right:0;${top ? 'top' : 'bottom'}:0;height:6%;background:#000;`;
    return el;
  };
  root.appendChild(bar(true));
  root.appendChild(bar(false));

  // 片头 / 片尾黑场旁白:居中,逐句淡入
  const story = document.createElement('div');
  story.style.cssText = 'position:absolute;left:8%;right:8%;top:50%;transform:translateY(-50%);text-align:center;pointer-events:none;transition:opacity .6s;';
  root.appendChild(story);

  // 跳过(右上,黑边里):整段序幕直接结束
  const skip = document.createElement('button');
  skip.textContent = t('跳过 ›');
  skip.style.cssText = 'position:absolute;right:3%;top:1.2%;height:4%;min-height:26px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.18);'
    + 'background:rgba(255,255,255,.08);color:#E6E8EE;font-size:clamp(13px,1.9vh,18px);cursor:pointer;';
  root.appendChild(skip);

  // 字幕卡(原型:毛玻璃深色卡 + 圆头像 + 香槟色说话人 + 灰色身份 + 白字)
  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:min(62%,1160px);display:flex;align-items:center;gap:2%;'
    + 'padding:1.4vh 2vw;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(20,24,33,.82);backdrop-filter:blur(8px);'
    + 'opacity:0;transition:opacity .35s;pointer-events:none;';
  const face = document.createElement('img');
  face.style.cssText = 'width:clamp(48px,9vh,96px);height:clamp(48px,9vh,96px);border-radius:50%;border:1px solid rgba(255,255,255,.25);object-fit:cover;flex:none;';
  const textBox = document.createElement('div');
  textBox.style.cssText = 'flex:1;min-width:0;text-align:left;';
  const head = document.createElement('div');
  head.style.cssText = 'margin-bottom:.5vh;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const speaker = document.createElement('span');
  speaker.style.cssText = 'color:#E3C48A;font-weight:600;font-size:clamp(14px,2.3vh,24px);';
  const role = document.createElement('span');
  role.style.cssText = 'color:#9AA3B2;font-size:clamp(12px,1.8vh,18px);margin-left:.8em;';
  head.appendChild(speaker);
  head.appendChild(role);
  const line = document.createElement('div');
  line.style.cssText = 'color:#F2F2F2;font-size:clamp(15px,2.8vh,28px);line-height:1.4;';
  textBox.appendChild(head);
  textBox.appendChild(line);
  card.appendChild(face);
  card.appendChild(textBox);
  root.appendChild(card);
  host.appendChild(root);
  // 视频自带原声:播放期间压住游戏 BGM / 音效(新号此时大厅在后台加载,大厅 BGM 结束后补播)
  gameAudio.setHold(true);

  let closed = false;
  let phase: 'opening' | 'video' | 'closing' = 'opening';
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clearTimers = (): void => {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  };
  const later = (ms: number, fn: () => void): void => {
    timers.push(setTimeout(fn, ms));
  };
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimers();
    video.pause();
    video.removeAttribute('src');
    video.load();
    root.style.transition = 'opacity .5s';
    root.style.opacity = '0';
    setTimeout(() => root.remove(), 550);
    gameAudio.setHold(false);
    done();
  };

  /** 逐句淡入一组旁白(可带金色小标题),全部出完停 holdMs 后回调。 */
  const showStory = (lines: string[], title: string, holdMs: number, next: () => void): void => {
    story.innerHTML = '';
    const rows: HTMLDivElement[] = [];
    if (title) {
      const el = document.createElement('div');
      el.style.cssText = 'color:#E3C48A;font-size:clamp(14px,2.4vh,24px);letter-spacing:.4em;margin-bottom:3.6vh;opacity:0;transition:opacity 1s;';
      el.textContent = title;
      rows.push(el);
    }
    lines.forEach((text, i) => {
      const last = i === lines.length - 1;
      const el = document.createElement('div');
      el.style.cssText = `color:${last ? '#F4E6C6' : '#E6E8EE'};font-size:clamp(16px,${last ? 3.8 : 3.3}vh,${last ? 38 : 32}px);line-height:1.5;`
        + 'margin:1.4vh 0;letter-spacing:.06em;text-shadow:0 2px 8px #000;opacity:0;transform:translateY(8px);transition:opacity 1.1s,transform 1.1s;';
      el.textContent = t(text);
      rows.push(el);
    });
    rows.forEach((el) => story.appendChild(el));
    story.style.opacity = '1';
    rows.forEach((el, i) => later(300 + i * 1500, () => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }));
    later(300 + (rows.length - 1) * 1500 + 1100 + holdMs, next);
  };

  const startClosing = (): void => {
    if (closed || phase === 'closing') {
      return;
    }
    phase = 'closing';
    clearTimers();
    card.style.opacity = '0';
    video.style.opacity = '0';
    later(800, () => {
      video.pause();
      showStory(CLOSING, '', 1800, close);
    });
  };
  const startVideo = (): void => {
    if (closed || phase !== 'opening') {
      return;
    }
    phase = 'video';
    clearTimers();
    story.style.opacity = '0';
    video.style.opacity = '1';
    // 有声自动播放被拦 → 静音再播;还不行就跳到片尾旁白,不卡开场
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(startClosing);
    });
  };

  let shown = -1;
  const onTime = (): void => {
    if (phase !== 'video') {
      return;
    }
    const now = video.currentTime;
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
    const narration = cue.kind === 'narration';
    face.src = portraits[index] || '';
    face.style.display = !narration && portraits[index] ? '' : 'none';
    head.style.display = narration ? 'none' : '';
    speaker.textContent = cue.speaker ? t(cue.speaker) : '';
    role.textContent = cue.role ? t(cue.role) : '';
    line.textContent = t(cue.text);
    line.style.color = cue.kind === 'line' ? '#F2F2F2' : '#D6CFC0';
    line.style.fontStyle = cue.kind === 'line' ? 'normal' : 'italic';
    textBox.style.textAlign = narration ? 'center' : 'left';
    card.style.opacity = '1';
  };
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('ended', startClosing);
  video.addEventListener('error', startClosing);
  skip.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
  });
  // 点屏:片头 → 直接开视频;片尾 → 直接结束(视频中点屏不打断)
  root.addEventListener('click', () => {
    if (phase === 'opening') {
      startVideo();
    } else if (phase === 'closing') {
      close();
    }
  });
  showStory(OPENING, `${t('序幕')}  ·  ${t('神庭陨落')}`, 1400, startVideo);
}
