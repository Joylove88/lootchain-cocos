# 主城 NPC 骨骼转换(2026-11-11):把素材包里的几套角色骨骼(4.1.x,带 .spine 工程、没带散图)转成 4.2.43,
# 沿用原图集(不重打包)。前提是 Spine 命令行能启动:它启动时要连授权服务器(euapi.esotericsoftware.com),
# 11-11 在本机实测只成功过一次(Audrey 的 json),之后一直报「无法访问服务器」——本机防火墙里有拦 Spine 联网的出站规则。
# 那是系统安全设置,脚本和 Claude 都不去动;Spine 能正常启动时再跑本脚本。失败的套隔一会儿重试 -Tries 轮。
# 转完用 tools/qa/npc_spine_install.py 入库(会打印要贴进 LobbyCityMoon.ts NPC_SPINE 的配置)。
# 用法(本文件含中文,必须保持 UTF-8 with BOM):
#   powershell -ExecutionPolicy Bypass -File tools\qa\npc_spine_convert.ps1 [-Tries 12] [-Wait 20]
# 产物:D:\骨骼动画素材\ls_npc_42\out\<套名>\<骨骼名>.skel + 原 .atlas / .png,json\<套名>\*.json(看动作名 / 尺寸用)
param([int]$Tries = 12, [int]$Wait = 20)
$ErrorActionPreference = 'Continue'
$spine = 'D:\spine\Spine.com'
$tool = 'D:\project\lootchain-cocos\tools\spine'
$outRoot = 'D:\骨骼动画素材\ls_npc_42'
# 套名 = 源目录(D:\ls_npc = 失落之剑\怪NPC,D:\ls_sd = 失落之剑\小人,都是目录链接)
$sets = @(
    @{ name = 'Citizen_female'; dir = 'D:\ls_npc\Citizen_female' },
    @{ name = 'Audrey'; dir = 'D:\ls_npc\Audrey' },
    @{ name = 'Harman'; dir = 'D:\ls_npc\Harman' },
    @{ name = 'Talin'; dir = 'D:\ls_npc\Talin' },
    @{ name = 'Ria_npc'; dir = 'D:\ls_npc\Ria_npc' },
    @{ name = 'Soldier_1_sword'; dir = 'D:\ls_sd\Soldier_1_sword' },
    @{ name = 'Soldier_1_crossbow'; dir = 'D:\ls_sd\Soldier_1_crossbow' },
    @{ name = 'Soldier_1_Cavalry'; dir = 'D:\ls_sd\Soldier_1_Cavalry' }
)
function Export-One([string]$proj, [string]$dst, [string]$settings) {
    New-Item -ItemType Directory -Force $dst | Out-Null
    $r = & $spine -u 4.2.43 -i $proj -o $dst -e $settings 2>&1
    return ($LASTEXITCODE -eq 0)
}
foreach ($round in 1..$Tries) {
    $left = 0
    foreach ($s in $sets) {
        $bin = Join-Path $outRoot ("out\" + $s.name)
        $json = Join-Path $outRoot ("json\" + $s.name)
        $proj = Get-ChildItem -LiteralPath $s.dir -Filter *.spine | Sort-Object Length -Descending | Select-Object -First 1
        if (-not $proj) { "{0}: 没有 .spine 工程" -f $s.name; continue }
        if (-not (Get-ChildItem -LiteralPath $bin -Filter *.skel -ErrorAction SilentlyContinue)) {
            if (Export-One $proj.FullName $bin (Join-Path $tool 'fx42_reuse_atlas.export.json')) {
                Get-ChildItem -LiteralPath $s.dir -File | Where-Object { $_.Extension -in '.atlas', '.png' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $bin -Force }
                "{0}: skel ok (round {1})" -f $s.name, $round
            } else { $left++ }
        }
        if (-not (Get-ChildItem -LiteralPath $json -Filter *.json -ErrorAction SilentlyContinue)) {
            if (Export-One $proj.FullName $json (Join-Path $tool 'fx42_json_data.export.json')) { "{0}: json ok (round {1})" -f $s.name, $round } else { $left++ }
        }
    }
    if ($left -eq 0) { "ALL DONE in round $round"; break }
    "round {0}: {1} exports still failing, wait {2}s" -f $round, $left, $Wait
    Start-Sleep -Seconds $Wait
}
Get-ChildItem (Join-Path $outRoot 'out') -ErrorAction SilentlyContinue | ForEach-Object { $_.Name + ': ' + ((Get-ChildItem $_.FullName | ForEach-Object { $_.Name + '(' + [int]($_.Length / 1024) + 'K)' }) -join ' ') }
