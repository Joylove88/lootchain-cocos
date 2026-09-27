# Spine 特效批量转换(新批次 3.8.75 → 4.2.43,2026-09-27;沿用 docs/29 管线)
# 用法(PowerShell 5.1 注意:本文件含中文,必须保持 UTF-8 with BOM 编码):
#   powershell -ExecutionPolicy Bypass -File fx_convert_batch.ps1 -PackRoot <素材包根目录> -OutRoot <输出目录> [-Spine <Spine.com>] [-Only a,b,c]
# 每个子目录 = 一套特效。自动选路线:
#   A. 目录里有 .spine 源工程(取最大的那个)→ 一次启动导两份:二进制 skel + 重打包图集(premultiplyAlpha=false)、数据 json(供清单/校验);
#   B. 只有 .skel / .json 数据 → 直接以数据文件为输入升级导出(同 tools/spine-upgrade 的 run_upgrade.bat 用法),
#      能找到散图(images/ 目录)就重打包,找不到就沿用原 atlas/png(fx42_reuse_atlas.export.json)。
# 产物:<OutRoot>/fx42/<套名>/<套名>.skel + .atlas + .png(文件名统一改成套名,和 assets/resources/spine/effect/<套名>/<套名>.skel 口径一致)
#       <OutRoot>/fx42json/<套名>/<套名>.json(路线 A 才有)
#       <OutRoot>/logs/、<OutRoot>/report.tsv(套名 / 路线 / 结果 / 版本 / 备注)
# 已知坑:
#   - Start-Process 必须先取 $p.Handle,否则 ExitCode 恒为 null;
#   - 工程内图片路径写死绝对盘符的套(J:\...)重打包会失败(skel 正常)→ 自动回退沿用原 atlas/png;
#   - 特效骨骼 setup pose 无可见附件 → 导出 json 的 skeleton.width/height=0 属正常。
param(
    [Parameter(Mandatory = $true)][string]$PackRoot,
    [Parameter(Mandatory = $true)][string]$OutRoot,
    [string]$Spine = 'C:\Program Files\Spine\Spine.com',
    [string]$SpineVersion = '4.2.43',
    [string[]]$Only = @()
)
$ErrorActionPreference = 'Continue'
if (-not (Test-Path $Spine)) {
    foreach ($cand in @('C:\Program Files\Spine\Spine.com', 'C:\Program Files (x86)\Spine\Spine.com', 'D:\spine\Spine.com', "$env:LOCALAPPDATA\Spine\Spine.com")) {
        if (Test-Path $cand) { $Spine = $cand; break }
    }
}
if (-not (Test-Path $Spine)) { Write-Error "找不到 Spine.com,请用 -Spine 指定(Spine 编辑器安装目录下)"; exit 1 }
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$expPack  = Join-Path $toolDir 'fx42_binary_pack.export.json'
$expJson  = Join-Path $toolDir 'fx42_json_data.export.json'
$expReuse = Join-Path $toolDir 'fx42_reuse_atlas.export.json'
$outBin  = Join-Path $OutRoot 'fx42'
$outJson = Join-Path $OutRoot 'fx42json'
$logDir  = Join-Path $OutRoot 'logs'
New-Item -ItemType Directory -Force $outBin, $outJson, $logDir | Out-Null
$report = Join-Path $OutRoot 'report.tsv'
"name`troute`tresult`tversion`tnote" | Set-Content -Encoding UTF8 $report

function Run-Spine([string[]]$spineArgs, [string]$outFile, [string]$errFile) {
    $quoted = $spineArgs | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }
    $p = Start-Process -FilePath $Spine -ArgumentList $quoted -NoNewWindow -PassThru `
         -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $null = $p.Handle
    if (-not $p.WaitForExit(300000)) { try { $p.Kill() } catch {}; return -999 }
    if ($null -eq $p.ExitCode) { return -1 }
    return $p.ExitCode
}

# 读 .skel 头部版本串(4.2 二进制:8 字节 hash + 长度前缀字符串)
function Skel-Version([string]$path) {
    try {
        $b = [System.IO.File]::ReadAllBytes($path)
        $n = [int]$b[8] - 1
        if ($n -le 0 -or $n -gt 16) { return '?' }
        return [System.Text.Encoding]::ASCII.GetString($b, 9, $n)
    } catch { return '?' }
}

# 产物文件名统一成套名:<name>.skel / <name>.atlas;png 名字在 atlas 里引用,不改
function Normalize-Output([string]$dir, [string]$name) {
    $skel = Get-ChildItem $dir -Filter *.skel -File | Select-Object -First 1
    if ($skel -and $skel.BaseName -ne $name) { Move-Item -Force $skel.FullName (Join-Path $dir "$name.skel") }
    $atlas = Get-ChildItem $dir -Filter *.atlas -File | Select-Object -First 1
    if ($atlas -and $atlas.BaseName -ne $name) { Move-Item -Force $atlas.FullName (Join-Path $dir "$name.atlas") }
}

$dirs = Get-ChildItem $PackRoot -Directory | Sort-Object Name
if ($Only.Count -gt 0) { $dirs = $dirs | Where-Object { $Only -contains $_.Name } }
$i = 0
$failed = @()
foreach ($d in $dirs) {
    $i++
    $name = $d.Name
    $tag = '{0:d3}' -f $i
    $oB = Join-Path $outBin $name
    New-Item -ItemType Directory -Force $oB | Out-Null
    $src = Get-ChildItem $d.FullName -Filter *.spine -File | Sort-Object Length -Descending | Select-Object -First 1
    $route = 'A'
    $note = ''
    if ($src) {
        $oJ = Join-Path $outJson $name
        New-Item -ItemType Directory -Force $oJ | Out-Null
        $code = Run-Spine @('-u', $SpineVersion, '-i', $src.FullName, '-o', $oB, '-e', $expPack, '-i', $src.FullName, '-o', $oJ, '-e', $expJson) (Join-Path $logDir "$tag.out") (Join-Path $logDir "$tag.err")
        $packed = @(Get-ChildItem $oB -Filter *.atlas).Count -gt 0
        if ($code -eq 0 -and -not $packed) {
            # 重打包失败(散图路径写死):沿用原始 atlas/png
            Get-ChildItem $d.FullName -Include *.atlas, *.png -File -Recurse -Depth 0 | Copy-Item -Destination $oB -Force
            $note = 'repack failed, reuse original atlas/png (PMA unknown, check visually)'
        }
    } else {
        $route = 'B'
        $data = Get-ChildItem $d.FullName -Include *.skel, *.json -File -Recurse -Depth 0 | Sort-Object Length -Descending | Select-Object -First 1
        if (-not $data) { $failed += "${name}: no .spine/.skel/.json"; "$name`t-`tFAILED`t-`tno data file" | Add-Content -Encoding UTF8 $report; Write-Output "[$tag/$($dirs.Count)] FAILED  $name (no data)"; continue }
        $hasImages = Test-Path (Join-Path $d.FullName 'images')
        $exp = $(if ($hasImages) { $expPack } else { $expReuse })
        $code = Run-Spine @('-u', $SpineVersion, '-i', $data.FullName, '-o', $oB, '-e', $exp) (Join-Path $logDir "$tag.out") (Join-Path $logDir "$tag.err")
        if ($code -eq 0 -and @(Get-ChildItem $oB -Filter *.atlas).Count -eq 0) {
            Get-ChildItem $d.FullName -Include *.atlas, *.png -File -Recurse -Depth 0 | Copy-Item -Destination $oB -Force
            $note = $(if ($hasImages) { 'repack failed, reuse original atlas/png' } else { 'reuse original atlas/png (PMA unknown, check visually)' })
        }
    }
    Normalize-Output $oB $name
    $skelOut = Join-Path $oB "$name.skel"
    $ver = $(if (Test-Path $skelOut) { Skel-Version $skelOut } else { '-' })
    $ok = ($code -eq 0) -and (Test-Path $skelOut) -and ($ver -like '4.2*') -and @(Get-ChildItem $oB -Filter *.atlas).Count -and @(Get-ChildItem $oB -Filter *.png).Count
    if (-not $ok) { $failed += "${name}: exit=$code ver=$ver" }
    "$name`t$route`t$(if ($ok) { 'ok' } else { 'FAILED' })`t$ver`t$note" | Add-Content -Encoding UTF8 $report
    Write-Output ("[{0}/{1}] {2}  {3}  route={4} ver={5} {6}" -f $tag, $dirs.Count, ($(if ($ok) { 'ok' } else { 'FAILED' })), $name, $route, $ver, $note)
}
Write-Output "DONE. total=$($dirs.Count) failed=$($failed.Count)  report: $report"
$failed | ForEach-Object { Write-Output "  $_" }
