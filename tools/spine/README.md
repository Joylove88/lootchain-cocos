# tools/spine —— 技能特效 Spine 批量转换与入库

项目引擎:Cocos Creator 3.8.8,**Spine 运行时 4.2**(`settings/v2/packages/engine.json` → `spine-4.2`),
仓库里所有骨骼(英雄 / 怪物 / 特效)都是 **4.2.43** 二进制。
新买的特效如果是 3.8.x(3.8.75 / 3.8.84 / 3.8.99 都一样),**必须先用 Spine 编辑器 4.2.43 的命令行转成 4.2**,
不能直接丢进项目(4.2 运行时读不了 3.8 数据;3.8 时代那套"改版本串字节"的办法对 4.2 运行时无效)。

前置:一台装了 **Spine 编辑器 4.2.x**(专业版,命令行导出需要授权)的电脑,`Spine.com` 一般在
`C:\Program Files\Spine\Spine.com`。

## 一次完整流程(在装 Spine 的那台电脑上)

```powershell
# 0. 拉最新代码,拿到本目录脚本
cd D:\project\lootchain-cocos
git pull

# 1. 看素材包结构:每套一个子目录;有 .spine 源工程走路线 A(重打包),只有 .skel/.json 走路线 B
dir D:\新特效包\effect_skill | select -first 5
dir D:\新特效包\effect_skill\<任一套>

# 2. 先试 2 套(确认 Spine.com 路径、授权、导出设置都没问题)
powershell -ExecutionPolicy Bypass -File tools\spine\fx_convert_batch.ps1 `
  -PackRoot D:\新特效包\effect_skill -OutRoot D:\骨骼动画素材\fx_pack_v2 -Only fx_xxx_a,fx_xxx_b
type D:\骨骼动画素材\fx_pack_v2\report.tsv

# 3. 全量转换(550 套约 40~60 分钟;日志在 <OutRoot>\logs,汇总在 report.tsv)
powershell -ExecutionPolicy Bypass -File tools\spine\fx_convert_batch.ps1 `
  -PackRoot D:\新特效包\effect_skill -OutRoot D:\骨骼动画素材\fx_pack_v2

# 4. 入库到 assets/resources/spine/effect/(二选一,见下面"取舍")
#   4a 只入选用的套(推荐):把要用的套名一行一个写进 names.txt
powershell -ExecutionPolicy Bypass -File tools\spine\fx_install.ps1 -From D:\骨骼动画素材\fx_pack_v2\fx42 -ListFile D:\names.txt
#   4b 整批全部入库
powershell -ExecutionPolicy Bypass -File tools\spine\fx_install.ps1 -From D:\骨骼动画素材\fx_pack_v2\fx42 -All

# 5. 让 Creator 导入生成 .meta:打开 Cocos Creator 载入本工程等资源库扫描完(或预览服务在跑时执行下面这句)
curl http://localhost:7456/asset-db/refresh

# 6. 校验:每套目录下应有 <套名>.skel/.atlas/.png 各自的 .meta;控制台不应出现 spine 版本警告
Get-ChildItem assets\resources\spine\effect -Directory | Where-Object { -not (Test-Path (Join-Path $_.FullName "$($_.Name).skel.meta")) } | Select-Object Name

# 7. 提交推送(只推 GitHub 远端 origin)
git add assets/resources/spine/effect
git status --short | Measure-Object -Line
git commit -m "feat(特效): 新批次技能特效 3.8.75 → 4.2.43 批量转换入库(N 套,来源 <包名>)"
git push origin main
```

失败的套:看 `report.tsv` 的 `note` 列与 `logs\NNN.err`。常见两种:
- **重打包失败**(工程里散图路径写死原作者的绝对盘符):脚本已自动回退沿用原始 atlas/png,skel 数据正常;
  但原图集的预乘状态未知,进游戏前在编辑器里看一眼颜色边缘有没有黑边/白边。
- **无 .spine 且无 images/**:路线 B 只能沿用原 atlas,同上需目视校验。

## 取舍:全部入库还是按需入库

`assets/resources` 目录**全量进 Web 包**。上一批 550 套 4.2 产物共 **1.2 GB**,所以 docs/29 的口径是:
全量产物放仓库外素材库(`D:\骨骼动画素材\fx_pack`,zip 传网盘留档),**只把代码里用到的套入库**(目前 200 套左右)。
新批次如果整批入库:git 仓库和正式包各多 1 GB 以上,首屏预载与 CDN 流量都会明显变差。
建议仍按需入库;真要全部入库,用 `-All`,并在 `npm run release:web` 后核对包体大小。

## 转换产物怎么用

- 目录与文件名口径:`assets/resources/spine/effect/<effect_code>/<effect_code>.skel + .atlas + .png`,
  `effect_code` = 素材包子目录名(可溯源);代码里按 `spine/effect/<effect>/<effect>` 加载
  (`resolveAttackSpineFxResource` / `resolveBattleSkillEffectResource`)。
- 代码里 `skeleton.premultipliedAlpha = false`,与导出模板 `premultiplyAlpha: false` 匹配;沿用原 atlas 的套要目视核对。
- 特效 setup pose 通常无可见附件 → 包围盒为 0 属正常;大号/爆发类特效要用无头探针实拍包围盒写进
  `LobbyBattleSkillEffectConfig.ts` 的 `BATTLE_FX_MEASURED_BOUNDS`(见 docs/29、memory)。
- 同一个 effect 在运行时就绪表里只登记一个动画(按 effect 键),两个动画要分两套素材。

## 文件说明

| 文件 | 用途 |
|---|---|
| `fx_convert_batch.ps1` | 新批次转换(自动选路线 A/B,产物文件名统一成套名,写 report.tsv) |
| `fx_install.ps1` | 把转换产物入库到 `assets/resources/spine/effect`,校验版本与图集引用 |
| `fx42_binary_pack.export.json` | 二进制 + 重打包图集(2048、stripWhitespace、premultiplyAlpha=false) |
| `fx42_json_data.export.json` | 数据 json(不打包),供清单 / 校验 |
| `fx42_reuse_atlas.export.json` | 只升级数据不打包(沿用原 atlas/png) |
| `fx38to42_batch.ps1` | 2026-08-17 首批用的老脚本(只认 .spine 源工程),保留作参考 |

## 给 Claude Code 的提示词(如那台电脑也装了)

> 按 tools/spine/README.md 把 D:\新特效包\effect_skill 全量转成 4.2.43 到 D:\骨骼动画素材\fx_pack_v2,
> 先 -Only 试 2 套再全量;转换完读 report.tsv 汇报失败清单;然后用 fx_install.ps1 按我给的 names.txt 入库,
> 打开 Creator 导入后确认每套 .skel.meta 都生成,git 只提交 assets/resources/spine/effect,推 origin main。
