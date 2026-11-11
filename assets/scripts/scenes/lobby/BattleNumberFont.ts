import { BitmapFont, HorizontalTextAlignment, Label, resources, SpriteFrame, VerticalTextAlignment } from 'cc';
import { BATTLE_NUM_FONT_DATA } from './BattleNumberFontData';

/**
 * 战斗伤害数字位图字(2026-11-11 战斗画面精致化,用户确认样片):粗斜体 + 描边 + 竖向渐变,四套配色打在一张图里。
 *
 * 原先的伤害数字是系统字体 Arial 16~24 号、细、字距松,各手机字体还不一样;换成位图字后所有设备同一副字形,
 * 而且所有数字共用一张贴图,连续绘制时合成一批。
 * - 图:resources/ui/battle/font/battle_num(tools/qa/battle_num_font_gen.py 生成,度量表在 BattleNumberFontData.ts)。
 * - 不走编辑器的 .fnt 导入:运行时拿精灵帧 + 度量表直接拼一个 BitmapFont。
 * - 四套配色按字符码区分(normal = ASCII,其余加偏移),一个标签里只用一套:用 battleNumberString 转码。
 * 只认 0-9 . + - 和单位后缀 K M B T Q a i,别的字符不显示(中文飘字仍走系统字体)。
 */
export type BattleNumberStyle = 'normal' | 'crit' | 'hurt' | 'heal';

export const BATTLE_NUMBER_FONT_FRAME_PATH = 'ui/battle/font/battle_num/spriteFrame';

let font: BitmapFont | null = null;
let loading = false;
const waiters: Array<() => void> = [];

function fontUsable(): boolean {
  const frame = font?.spriteFrame ?? null;
  return !!(font && frame && frame.isValid && frame.texture && frame.texture.isValid);
}

function build(frame: SpriteFrame): BitmapFont {
  const data = BATTLE_NUM_FONT_DATA;
  const dictionary: Record<number, { rect: { x: number; y: number; width: number; height: number }; xOffset: number; yOffset: number; xAdvance: number }> = {};
  for (const [code, x, y, width, height, xOffset, yOffset, xAdvance] of data.glyphs) {
    dictionary[code] = { rect: { x, y, width, height }, xOffset, yOffset, xAdvance };
  }
  const bitmap = new BitmapFont();
  bitmap.fontSize = data.size;
  bitmap.spriteFrame = frame;
  bitmap.fntConfig = { commonHeight: data.size, fontSize: data.size, atlasName: 'battle_num', fontDefDictionary: dictionary, kerningDict: {} };
  bitmap.onLoaded();
  return bitmap;
}

/** 位图字(已就绪才返回);没就绪时顺手发起加载,调用方先用系统字体兜底。 */
export function battleNumberFont(): BitmapFont | null {
  if (fontUsable()) {
    return font;
  }
  // 贴图已在缓存(开战加载门读过)就同步拼好:resources.load 命中缓存也是异步的,等回调的话头几个数字会走兜底字体
  const cached = resources.get(BATTLE_NUMBER_FONT_FRAME_PATH, SpriteFrame);
  if (cached && cached.isValid) {
    try {
      font = build(cached);
      return font;
    } catch (error) {
      console.warn('[LootChain] battle number font build failed', error);
      font = null;
    }
  }
  preloadBattleNumberFont();
  return null;
}

/** 预读(开战加载门里调):贴图到了就拼好字体。 */
export function preloadBattleNumberFont(done?: () => void): void {
  if (fontUsable()) {
    done?.();
    return;
  }
  if (done) {
    waiters.push(done);
  }
  if (loading) {
    return;
  }
  loading = true;
  resources.load(BATTLE_NUMBER_FONT_FRAME_PATH, SpriteFrame, (error, frame) => {
    loading = false;
    if (!error && frame) {
      try {
        font = build(frame);
      } catch (buildError) {
        console.warn('[LootChain] battle number font build failed', buildError);
        font = null;
      }
    }
    for (const waiter of waiters.splice(0)) {
      waiter();
    }
  });
}

/** 把 "1.2K" 这样的文本转成指定配色那一套的字符码。 */
export function battleNumberString(style: BattleNumberStyle, text: string): string {
  const base = BATTLE_NUM_FONT_DATA.styleBase[style];
  if (!base) {
    return text;
  }
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    out += String.fromCharCode(base + text.charCodeAt(i));
  }
  return out;
}

let advances: Map<number, number> | null = null;

/** 这串数字按 digitPx 字高显示时大约多宽(设计像素,含描边):落位时用来判断会不会压到旁边的数字。 */
export function battleNumberWidth(text: string, digitPx: number): number {
  if (!advances) {
    advances = new Map<number, number>();
    for (const glyph of BATTLE_NUM_FONT_DATA.glyphs) {
      if (glyph[0] < 0x100) {
        advances.set(glyph[0], glyph[7]);
      }
    }
  }
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += advances.get(text.charCodeAt(i)) ?? 0;
  }
  // 两侧描边 + 斜体探出去的部分,合计约 0.3 个字高
  return ((width + BATTLE_NUM_FONT_DATA.digitHeight * 0.3) * digitPx) / BATTLE_NUM_FONT_DATA.digitHeight;
}

/** 想让数字字高显示成 digitPx(设计像素)时,标签该设的字号。 */
export function battleNumberFontSize(digitPx: number): number {
  return (digitPx * BATTLE_NUM_FONT_DATA.size) / BATTLE_NUM_FONT_DATA.digitHeight;
}

/**
 * 把标签切成伤害数字位图字并填好文本;字体没就绪返回 false(调用方走系统字体)。
 * 位图字自带颜色,标签颜色保持纯白,透明度由节点上的 UIOpacity 管。
 */
export function applyBattleNumber(label: Label, style: BattleNumberStyle, text: string, digitPx: number): boolean {
  const bitmap = battleNumberFont();
  if (!bitmap) {
    return false;
  }
  const size = battleNumberFontSize(digitPx);
  if (label.font !== bitmap) {
    label.cacheMode = Label.CacheMode.NONE;
    label.enableOutline = false;
    label.font = bitmap;
    label.overflow = Label.Overflow.NONE;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
  }
  label.fontSize = size;
  label.lineHeight = size;
  label.string = battleNumberString(style, text);
  return true;
}
