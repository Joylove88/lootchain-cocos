# 图鉴系统素材生成指令(2026-09-15)

只需 3 张图:里程碑宝箱三态。生成后放到 `assets/resources/ui/codex/ai/`(目录不存在就新建),文件名必须完全一致,代码已按这三个路径读取;缺图时会自动退回程序手绘占位,所以可以分批放。

## 通用约束(三张共用)

- 尺寸 **512×512**,PNG,**透明背景**(不要任何底板、阴影地面、边框、文字、水印)。
- 视角:正面略俯视(约 15°),宝箱居中,占画面 80% 左右,四边留白均匀。
- 风格:与游戏现有 UI 一致——哥特暗黑幻想、黑石 + 做旧金属雕花、暗红衬底的点缀,写实厚涂质感,不要卡通/Q 版,不要赛博霓虹。
- 光源统一从左上方来,阴影只在宝箱自身上,不要投到地面。
- 三张宝箱的造型、比例、材质要是**同一个箱子**的三个状态,只改状态元素。

## 1. `chest_locked.png` —— 未达成(灰暗锁定)

> A closed ornate gothic treasure chest, dark iron and black stone with tarnished, desaturated silver-grey metal trim, heavy chains wrapped around it and a large padlock on the front, dusty and unlit, muted low-saturation grey tones, no glow, front view slightly from above, centered, transparent background, no ground shadow, no text, game UI icon, realistic painterly fantasy style, 512x512

中文要点:同一个箱子,关着,缠铁链 + 正面大挂锁,整体灰暗去饱和、无发光。

## 2. `chest_ready.png` —— 可领取(金光待开)

> The same closed ornate gothic treasure chest, now polished gold and black stone with crimson red inlay, no chains, no padlock, warm golden light leaking from the lid seam, soft golden rim glow and small floating sparkles around it, rich saturated colors, front view slightly from above, centered, transparent background, no ground shadow, no text, game UI icon, realistic painterly fantasy style, 512x512

中文要点:同一个箱子,关着,去掉铁链和锁,金色 + 暗红镶嵌,盖缝漏金光、周围少量金色光点。

## 3. `chest_opened.png` —— 已领取(打开清空)

> The same ornate gothic treasure chest, lid fully open, interior empty and dark, gold and black stone with crimson inlay, calm and unlit, no glow, no sparkles, no loot inside, slightly desaturated compared to the glowing version, front view slightly from above, centered, transparent background, no ground shadow, no text, game UI icon, realistic painterly fantasy style, 512x512

中文要点:同一个箱子,盖子完全打开,里面空的、暗的,无发光无光点,饱和度略低。

## 落位与检查

1. 三张放到 `D:\project\lootchain-cocos\assets\resources\ui\codex\ai\`。
2. 放完告诉我一声,我把 `.meta` 翻成 `sprite-frame` 并截图核对(宝箱在进度条上约 60px 高、弹框里约 200px 高,两种尺寸都会看)。
3. 原图我会先备份到 `素材原始备份/codex-chest-20260915/` 再入库。
