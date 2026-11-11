Architecture edge shadow assets for Cocos

用途：
让建筑边缘出现视频里那种黑色压边/遮挡阴影，使云层看起来在建筑后面，而不是糊在建筑前面。

使用：
1. architecture_edge_shadow_soft.png 放在动态云层上方，FG_Architecture 下方。
2. architecture_edge_shadow_tight.png 可选，放在 soft 上方，进一步加强塔尖和建筑边缘压暗。

推荐层级：
BG_Base
Sky_Mask / Sky_Vortex_Root
Architecture_Edge_Shadow_Soft
Architecture_Edge_Shadow_Tight
FG_Architecture
其他前景特效

推荐参数：
Soft:
  Opacity = 100~150
  Content Size / Scale 与 BG_Base 一致

Tight:
  Opacity = 60~100
  Content Size / Scale 与 BG_Base 一致
