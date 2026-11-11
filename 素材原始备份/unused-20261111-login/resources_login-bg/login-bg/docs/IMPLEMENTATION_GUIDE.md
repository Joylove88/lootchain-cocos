# LootChain 横向旋涡天空 + 龙/披风/烟雾最终实现方案

## 关键原则
- 不再用“整张云图竖向自转”。
- 天空使用“多个粒子发射器沿横向椭圆轨道运动”，形成横向环流。
- 三张 support 图只做极低透明度的结构底，不是主动态。
- 真正动态来自粒子系统。

## 1. 节点结构
Canvas
 ├── BG_Base
 ├── Sky_Mask
 │    └── Sky_Vortex_Root
 │         ├── Sky_Support_Back
 │         ├── Sky_Support_Mid
 │         ├── Sky_Support_Front
 │         ├── Vortex_Emitter_Back_A
 │         ├── Vortex_Emitter_Back_B
 │         ├── Vortex_Emitter_Mid_A
 │         ├── Vortex_Emitter_Mid_B
 │         ├── Vortex_Emitter_Front_A
 │         └── Vortex_Emitter_Front_B
 ├── FG_Architecture
 ├── Dragon_Layer
 ├── Cloak_Wind
 └── Ground_Fog

## 2. BG / FG
BG_Base 使用 base/bg_base_final.png。
FG_Architecture 使用 base/FG_Architecture_fixed_v3_clean.png。
如果边缘太硬，换 base/FG_Architecture_fixed_v3_soft.png。

## 3. Sky_Mask
Position X=0, Y=300
Content Size W=1280, H=540
Anchor=0.5,0.5

## 4. Sky_Vortex_Root
Root 对准圆球中心。公式：
Sky_Vortex_Root.Y = 圆球中心Y - Sky_Mask.Y
例如圆球中心 Y=265，Mask Y=300，则 Root Y=-35。

## 5. Support 图
Support 图是低透明结构层，不是主动态。
Sky_Support_Back:
  SpriteFrame sky/sky_vortex_horizontal_back.png
  Content Size 1500x760, Opacity 35, script SupportVortexLayerMotion rotationSpeed=0.3
Sky_Support_Mid:
  Content Size 1400x720, Opacity 45, rotationSpeed=-0.45
Sky_Support_Front:
  Content Size 1280x660, Opacity 55, rotationSpeed=0.65

## 6. 横向旋涡粒子发射器
每个 emitter 是一个 ParticleSystem2D + VortexEmitterOrbit.ts。
核心是 emitter 节点沿椭圆轨道运动，粒子形成真实“横向转动”的云。

### Back Emitters
SpriteFrame particles/p_cloud_streak_soft.png 或 p_smoke_soft_gray.png
Total Particles 180
Emission Rate 18
Life 7, Life Var 2.5
Start Size 160, Var 70
End Size 380, Var 130
Speed 10, Var 6
Pos Var X 40, Y 20
Start Color 80,15,18,42
End Color 20,0,5,0
Orbit:
  radiusX=500, radiusY=125, angularSpeed=0.10
  两个 emitter phase 分别 0 和 3.14

### Mid Emitters
SpriteFrame particles/p_cloud_streak_soft.png
Total Particles 220
Emission Rate 26
Life 6, Var 2
Start Size 170, Var 80
End Size 430, Var 160
Speed 14, Var 8
Start Color 130,20,28,55
End Color 50,0,8,0
Orbit:
  radiusX=430, radiusY=105, angularSpeed=0.16
  phase 0.8 和 3.9

### Front Emitters
SpriteFrame particles/p_smoke_dark_red.png
Total Particles 160
Emission Rate 18
Life 4.5, Var 1.6
Start Size 100, Var 45
End Size 280, Var 110
Speed 18, Var 10
Start Color 180,25,32,70
End Color 70,0,8,0
Orbit:
  radiusX=350, radiusY=85, angularSpeed=0.24
  phase 1.4 和 4.6

## 7. 地面烟雾
Ground_Fog_Back / Mid / Front 使用 p_ground_fog_strip_01 / 02 做 Sprite + GroundFogStripMotion。
再叠 ParticleSystem2D，SpriteFrame p_smoke_soft_gray：
Total 140, Emission 5, Life 10, Size 420->760, PosVarX=900 PosVarY=160。

## 8. 披风随风飘动
如果披风没有单独图层，使用“披风边缘烟雾”模拟：
Left_Cloak_Wind / Right_Cloak_Wind:
SpriteFrame particles/p_cloak_wind_dark.png
Emission Rate 4
Life 4, Var 1.5
Start Size 100, Var 45
End Size 260, Var 90
Speed 10, Var 6
Start Color 20,22,28,45
End Color 0,0,0,0
位置放人物披风边缘，方向朝外。

如果有 cloak_layer.png，再额外挂 CloakWindMotion.ts。

## 9. 龙动态
龙必须是单独透明层：
dragon_body.png
dragon_head.png
dragon_tail.png
分别挂 DragonBreathMotion.ts。
Body: speed=0.45 scaleStrength=0.006 moveX=1.5 moveY=1
Head: speed=0.65 scaleStrength=0.01 moveX=2 moveY=1.5
Tail: speed=0.35 scaleStrength=0.005 moveX=2.5 moveY=0.8

## 10. 重要
不要只靠 support 图旋转。主动态必须靠 VortexEmitterOrbit 粒子。
