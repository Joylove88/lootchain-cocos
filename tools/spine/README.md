# tools/spine —— 技能特效 Spine 批量转换与入库

项目引擎:Cocos Creator 3.8.8,**Spine 运行时 4.2**(`settings/v2/packages/engine.json` → `spine-4.2`),
仓库里所有骨骼(英雄 / 怪物 / 特效)都是 **4.2.43** 二进制。
新买的特效不管原来是什么版本(3.8.x / 4.0 / 4.1 / 混着来),**都必须先用 Spine 编辑器 4.2.x 的命令行统一转成 4.2.43**,
不能直接丢进项目(4.2 运行时读不了旧数据;3.8 时代那套"改版本串字节"的办法对 4.2 运行时无效)。

前置:一台装了 **Spine 编辑器 4.2.x**(专业版,命令行导出需要授权)的电脑,`Spine.com` 一般在
`C:\Program Files\Spine\Spine.com`。

## 口径(2026-09-27 起):转换在素材机做,产物拷回开发机,整批不进 git

新批次上千套、版本各异,整批产物动辄数 GB。**转换产物不提交 git**,放仓库外素材库(开发机 `D:\骨骼动画素材\fx_pack_v2\`),
开发机上**按需**用 `fx_install.ps1 -ListFile` 把要用的套装进 `assets/resources/spine/effect/`,随功能提交。

## 素材机:全量转换 + 打包

```powershell
cd D:\project\lootchain-cocos
git pull

# 1. 看素材包结构。多层目录、多个包混放都行:-Recurse 会递归找"直接含 .spine / .skel / 骨骼 .json 的目录"当一套
#    (images\ 目录会跳过);重名套自动改成 <上级目录>__<套名>
Get-ChildItem D:\新特效包 -Recurse -Include *.spine,*.skel | Select-Object -First 10 FullName

# 2. 先试几套不同版本的(-Only 用套名,重名套用加前缀后的名字)
powershell -ExecutionPolicy Bypass -File tools\spine\fx_convert_batch.ps1 `
  -PackRoot D:\新特效包 -OutRoot D:\fx_out -Recurse -Only 套名1,套名2,套名3
Import-Csv D:\fx_out\report.tsv -Delimiter "`t" | Format-Table name,src_version,route,result,version,note

# 3. 全量(-SkipDone 断点续跑:中断后原命令再跑一遍,已转好的套会跳过)
powershell -ExecutionPolicy Bypass -File tools\spine\fx_convert_batch.ps1 `
  -PackRoot D:\新特效包 -OutRoot D:\fx_out -Recurse -SkipDone

# 4. 汇总
$r = Import-Csv D:\fx_out\report.tsv -Delimiter "`t"
$r | Group-Object result | Select-Object Name,Count
$r | Where-Object result -ne 'ok' | Group-Object src_version | Select-Object Name,Count
$r | Where-Object note -like '*reuse original*' | Measure-Object | Select-Object Count

# 5. 打包传输(不要用 Compress-Archive,超 2GB 会坏;Win10+ 自带 tar)
tar -a -c -f D:\fx_out_4243.zip -C D:\fx_out fx42 fx42json report.tsv manifest.tsv
```

产物目录:

| 路径 | 内容 |
|---|---|
| `fx42\<套名>\<套名>.skel/.atlas/.png` | 4.2.43 二进制 + 图集,直接入库用 |
| `fx42json\<套名>\*.json` | 同一套的 json 数据,供清单 / 查动画名 |
| `report.tsv` | 套名 / 来源目录 / 源版本 / 路线 / 结果 / 输出版本 / 备注 |
| `manifest.tsv` | 套名 / 动画名列表 / png 张数 / 大小 KB,挑选特效用 |
| `logs\NNNN.out/.err` | Spine 命令行输出,排查失败看这里 |

失败的套:看 `report.tsv` 的 `note` 列与 `logs\NNNN.err`。常见几种:
- **重打包失败**(工程里散图路径写死原作者的绝对盘符):脚本已自动回退沿用原始 atlas/png,skel 数据正常;
  但原图集的预乘状态未知,进游戏前目视核对颜色边缘有没有黑边/白边。
- **无 .spine 且无 images/**:路线 B 只能沿用原 atlas,同上需目视校验。
- **源版本过老(2.x / 3.0~3.5)**:4.2 编辑器导入可能失败,按 `src_version` 分组汇报,单独处理。

## 开发机:解包 + 按需入库

```powershell
# 解到仓库外素材库
New-Item -ItemType Directory -Force D:\骨骼动画素材\fx_pack_v2 | Out-Null
tar -x -f D:\fx_out_4243.zip -C D:\骨骼动画素材\fx_pack_v2

# 把要用的套名一行一个写进 names.txt,入库(会校验 4.2 版本与图集 png 是否齐)
powershell -ExecutionPolicy Bypass -File tools\spine\fx_install.ps1 -From D:\骨骼动画素材\fx_pack_v2\fx42 -ListFile D:\names.txt

# 让 Creator 导入生成 .meta(预览服务在跑时)
curl http://localhost:7456/asset-db/refresh

# 校验:每套都有 .skel.meta
Get-ChildItem assets\resources\spine\effect -Directory | Where-Object { -not (Test-Path (Join-Path $_.FullName "$($_.Name).skel.meta")) } | Select-Object Name
```

入库的套随用到它的功能一起提交(只推 GitHub 远端)。**不要 `-All` 整批入库**:`assets/resources` 全量进 Web 包,
上一批 550 套就有 1.2 GB,整批入库会让 git 仓库和正式包都暴涨。

## 转换产物怎么用

- 目录与文件名口径:`assets/resources/spine/effect/<effect_code>/<effect_code>.skel + .atlas + .png`,
  `effect_code` = 素材包子目录名(重名时带上级目录前缀,可溯源);代码里按 `spine/effect/<effect>/<effect>` 加载
  (`resolveAttackSpineFxResource` / `resolveBattleSkillEffectResource`)。
- 代码里 `skeleton.premultipliedAlpha = false`,与导出模板 `premultiplyAlpha: false` 匹配;沿用原 atlas 的套要目视核对。
- 特效 setup pose 通常无可见附件 → 包围盒为 0 属正常;大号/爆发类特效要用无头探针实拍包围盒写进
  `LobbyBattleSkillEffectConfig.ts` 的 `BATTLE_FX_MEASURED_BOUNDS`(见 docs/29、memory)。
- 同一个 effect 在运行时就绪表里只登记一个动画(按 effect 键),两个动画要分两套素材。

## 文件说明

| 文件 | 用途 |
|---|---|
| `fx_convert_batch.ps1` | 批量转换(任意旧版本 → 4.2.43;-Recurse 递归找套、重名加前缀、-SkipDone 续跑;写 report.tsv / manifest.tsv) |
| `fx_install.ps1` | 把转换产物入库到 `assets/resources/spine/effect`,校验版本与图集引用 |
| `fx42_binary_pack.export.json` | 二进制 + 重打包图集(2048、stripWhitespace、premultiplyAlpha=false) |
| `fx42_json_data.export.json` | 数据 json(不打包),供清单 / 校验 |
| `fx42_reuse_atlas.export.json` | 只升级数据不打包(沿用原 atlas/png) |
| `fx38to42_batch.ps1` | 2026-08-17 首批用的老脚本(只认 .spine 源工程),保留作参考 |
