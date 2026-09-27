# Spine 特效批量转换(任意旧版本 → 4.2.43,2026-09-27 v2;沿用 docs/29 管线)
# 用法(PowerShell 5.1 注意:本文件含中文,必须保持 UTF-8 with BOM 编码):
#   powershell -ExecutionPolicy Bypass -File fx_convert_batch.ps1 -PackRoot <素材根目录> -OutRoot <输出目录> [-Spine <Spine.com>] [-Only a,b,c] [-Recurse] [-SkipDone]
# 每个子目录 = 一套特效;-Recurse 时递归找"直接含 .spine / .skel / 骨骼 .json 的目录"作为一套(多层目录、多个素材包混放时用),
# 同名冲突自动加上级目录名前缀(<上级>__<套名>),并记在 report.tsv 备注。-SkipDone 跳过输出里已经转好的套(断点续跑)。
# 输入版本不限(3.x / 4.0 / 4.1 / 4.2 混着都行),全部统一导出成 -SpineVersion(默认 4.2.43)。自动选路线:
#   A. 目录里有 .spine 源工程(取最大的那个)→ 一次启动导两份:二进制 skel + 重打包图集(premultiplyAlpha=false)、数据 json;
#   B. 只有 .skel / .json 数据 → 直接以数据文件为输入升级导出(同 tools/spine-upgrade 的 run_upgrade.bat 用法),
#      有散图(images/ 目录)就重打包,没有就沿用原 atlas/png(fx42_reuse_atlas.export.json)。
# 产物:<OutRoot>/fx42/<套名>/<套名>.skel + .atlas + .png(文件名统一成套名,和 assets/resources/spine/effect/<套名>/<套名>.skel 口径一致)
#       <OutRoot>/fx42json/<套名>/*.json(数据 json,两条路线都导,供清单 / 校验)
#       <OutRoot>/logs/、<OutRoot>/report.tsv(套名 / 来源目录 / 源版本 / 路线 / 结果 / 输出版本 / 备注)
#       <OutRoot>/manifest.tsv(套名 / 动画名列表 / png 张数 / 大小 KB,挑选特效用)
# 已知坑:
#   - Start-Process 必须先取 $p.Handle,否则 ExitCode 恒为 null;
#   - 工程内图片路径写死绝对盘符的套(J:\...)重打包会失败(skel 正常)→ 自动回退沿用原 atlas/png;
#   - 特效骨骼 setup pose 无可见附件 → 导出 json 的 skeleton.width/height=0 属正常;
#   - 字符串里 "$name:" 会被当成盘符变量,一律写 "${name}:"。
param(
    [Parameter(Mandatory = $true)][string]$PackRoot,
    [Parameter(Mandatory = $true)][string]$OutRoot,
    [string]$Spine = 'C:\Program Files\Spine\Spine.com',
    [string]$SpineVersion = '4.2.43',
    [string[]]$Only = @(),
    [switch]$Recurse,
    [switch]$SkipDone
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
if (-not ($SkipDone -and (Test-Path $report))) {
    "name`tsource`tsrc_version`troute`tresult`tversion`tnote" | Set-Content -Encoding UTF8 $report
}

function Run-Spine([string[]]$spineArgs, [string]$outFile, [string]$errFile) {
    $quoted = $spineArgs | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }
    $p = Start-Process -FilePath $Spine -ArgumentList $quoted -NoNewWindow -PassThru `
         -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $null = $p.Handle
    if (-not $p.WaitForExit(300000)) { try { $p.Kill() } catch {}; return -999 }
    if ($null -eq $p.ExitCode) { return -1 }
    return $p.ExitCode
}

# 输出 .skel 头部版本串(4.2 二进制:8 字节 hash + 长度前缀字符串)
function Skel-Version([string]$path) {
    try {
        $b = [System.IO.File]::ReadAllBytes($path)
        $n = [int]$b[8] - 1
        if ($n -le 0 -or $n -gt 16) { return '?' }
        return [System.Text.Encoding]::ASCII.GetString($b, 9, $n)
    } catch { return '?' }
}

# 源数据版本:.skel 在头部 64 字节里找 x.y.z;json 看 skeleton.spine
function Source-Version([string]$path) {
    try {
        if ($path -like '*.json') {
            $raw = [System.IO.File]::ReadAllText($path)
            $head = $raw.Substring(0, [Math]::Min(600, $raw.Length))
            if ($head -match '"spine"\s*:\s*"([^"]+)"') { return $Matches[1] }
            return '?'
        }
        $b = [System.IO.File]::ReadAllBytes($path)
        $text = [System.Text.Encoding]::ASCII.GetString($b, 0, [Math]::Min(64, $b.Length))
        if ($text -match '(\d\.\d+\.\d+)') { return $Matches[1] }
        return '?'
    } catch { return '?' }
}

function Is-SkeletonJson([string]$path) {
    try {
        $raw = [System.IO.File]::ReadAllText($path)
        return ($raw.Substring(0, [Math]::Min(400, $raw.Length)) -match '"skeleton"\s*:')
    } catch { return $false }
}

function Is-SetDir([System.IO.DirectoryInfo]$dir) {
    if (@(Get-ChildItem $dir.FullName -File | Where-Object { $_.Extension -eq '.spine' -or $_.Extension -eq '.skel' }).Count -gt 0) { return $true }
    foreach ($j in (Get-ChildItem $dir.FullName -File -Filter *.json)) { if (Is-SkeletonJson $j.FullName) { return $true } }
    return $false
}

# 产物文件名统一成套名:<name>.skel / <name>.atlas;png 名字在 atlas 里引用,不改
function Normalize-Output([string]$dir, [string]$name) {
    $skel = Get-ChildItem $dir -Filter *.skel -File | Select-Object -First 1
    if ($skel -and $skel.BaseName -ne $name) { Move-Item -Force $skel.FullName (Join-Path $dir "$name.skel") }
    $atlas = Get-ChildItem $dir -Filter *.atlas -File | Select-Object -First 1
    if ($atlas -and $atlas.BaseName -ne $name) { Move-Item -Force $atlas.FullName (Join-Path $dir "$name.atlas") }
}

function Copy-OriginalAtlas([string]$from, [string]$to) {
    Get-ChildItem $from -File | Where-Object { $_.Extension -eq '.atlas' -or $_.Extension -eq '.png' } | Copy-Item -Destination $to -Force
}

# ── 找出所有套 ──
if ($Recurse) {
    $dirs = @(Get-ChildItem $PackRoot -Directory -Recurse | Where-Object { $_.Name -ne 'images' -and $_.FullName -notmatch '\\images\\' } | Where-Object { Is-SetDir $_ } | Sort-Object FullName)
} else {
    $dirs = @(Get-ChildItem $PackRoot -Directory | Sort-Object Name)
}
$count = @{}
foreach ($d in $dirs) { $count[$d.Name] = 1 + [int]$count[$d.Name] }
$nameOf = @{}
foreach ($d in $dirs) {
    $n = $d.Name
    if ($count[$n] -gt 1) { $n = "$($d.Parent.Name)__$($d.Name)" }
    $nameOf[$d.FullName] = $n
}
if ($Only.Count -gt 0) { $dirs = @($dirs | Where-Object { ($Only -contains $nameOf[$_.FullName]) -or ($Only -contains $_.Name) }) }
Write-Output "found $($dirs.Count) sets under $PackRoot (recurse=$Recurse)"

$i = 0
$failed = @()
foreach ($d in $dirs) {
    $i++
    $name = $nameOf[$d.FullName]
    $tag = '{0:d4}' -f $i
    $oB = Join-Path $outBin $name
    $oJ = Join-Path $outJson $name
    $skelOut = Join-Path $oB "$name.skel"
    if ($SkipDone -and (Test-Path $skelOut) -and ((Skel-Version $skelOut) -like '4.2*')) {
        Write-Output "[$tag/$($dirs.Count)] skip(done)  $name"
        continue
    }
    New-Item -ItemType Directory -Force $oB, $oJ | Out-Null
    $src = Get-ChildItem $d.FullName -Filter *.spine -File | Sort-Object Length -Descending | Select-Object -First 1
    $data = Get-ChildItem $d.FullName -File | Where-Object { $_.Extension -eq '.skel' -or ($_.Extension -eq '.json' -and (Is-SkeletonJson $_.FullName)) } | Sort-Object Length -Descending | Select-Object -First 1
    $srcVer = $(if ($data) { Source-Version $data.FullName } else { '?' })
    $route = 'A'
    $note = ''
    $code = -1
    if ($src) {
        $code = Run-Spine @('-u', $SpineVersion, '-i', $src.FullName, '-o', $oB, '-e', $expPack, '-i', $src.FullName, '-o', $oJ, '-e', $expJson) (Join-Path $logDir "$tag.out") (Join-Path $logDir "$tag.err")
        if ($code -eq 0 -and @(Get-ChildItem $oB -Filter *.atlas).Count -eq 0) {
            Copy-OriginalAtlas $d.FullName $oB
            $note = 'repack failed, reuse original atlas/png (PMA unknown, check visually)'
        }
    } else {
        $route = 'B'
        if (-not $data) {
            $failed += "${name}: no .spine/.skel/.json"
            "$name`t$($d.FullName)`t-`t-`tFAILED`t-`tno data file" | Add-Content -Encoding UTF8 $report
            Write-Output "[$tag/$($dirs.Count)] FAILED  $name (no data)"
            continue
        }
        $hasImages = Test-Path (Join-Path $d.FullName 'images')
        $exp = $(if ($hasImages) { $expPack } else { $expReuse })
        $code = Run-Spine @('-u', $SpineVersion, '-i', $data.FullName, '-o', $oB, '-e', $exp, '-i', $data.FullName, '-o', $oJ, '-e', $expJson) (Join-Path $logDir "$tag.out") (Join-Path $logDir "$tag.err")
        if ($code -eq 0 -and @(Get-ChildItem $oB -Filter *.atlas).Count -eq 0) {
            Copy-OriginalAtlas $d.FullName $oB
            $note = $(if ($hasImages) { 'repack failed, reuse original atlas/png (PMA unknown, check visually)' } else { 'reuse original atlas/png (PMA unknown, check visually)' })
        }
    }
    Normalize-Output $oB $name
    $ver = $(if (Test-Path $skelOut) { Skel-Version $skelOut } else { '-' })
    $ok = ($code -eq 0) -and (Test-Path $skelOut) -and ($ver -like '4.2*') -and (@(Get-ChildItem $oB -Filter *.atlas).Count -gt 0) -and (@(Get-ChildItem $oB -Filter *.png).Count -gt 0)
    if (-not $ok) {
        $failed += "${name}: exit=$code src=$srcVer out=$ver"
        if (-not (Test-Path $skelOut)) { Remove-Item -Recurse -Force $oB, $oJ -ErrorAction SilentlyContinue }
    }
    if ($name -ne $d.Name) { $note = ("renamed (duplicate dir name); " + $note).Trim().TrimEnd(';') }
    "$name`t$($d.FullName)`t$srcVer`t$route`t$(if ($ok) { 'ok' } else { 'FAILED' })`t$ver`t$note" | Add-Content -Encoding UTF8 $report
    Write-Output ("[{0}/{1}] {2}  {3}  src={4} route={5} out={6} {7}" -f $tag, $dirs.Count, ($(if ($ok) { 'ok' } else { 'FAILED' })), $name, $srcVer, $route, $ver, $note)
}

# ── 清单:每套动画名(读数据 json)、png 张数、体积 ──
$manifest = Join-Path $OutRoot 'manifest.tsv'
"name`tanimations`tpng_count`tsize_kb" | Set-Content -Encoding UTF8 $manifest
foreach ($setDir in (Get-ChildItem $outBin -Directory | Sort-Object Name)) {
    $anims = ''
    $json = Get-ChildItem (Join-Path $outJson $setDir.Name) -Filter *.json -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($json) {
        try { $anims = (@((Get-Content -Raw -Encoding UTF8 $json.FullName | ConvertFrom-Json).animations.PSObject.Properties | ForEach-Object { $_.Name })) -join ',' } catch { $anims = '?' }
    }
    $files = @(Get-ChildItem $setDir.FullName -File)
    $kb = [Math]::Round((($files | Measure-Object Length -Sum).Sum) / 1KB)
    "$($setDir.Name)`t$anims`t$(@($files | Where-Object { $_.Extension -eq '.png' }).Count)`t$kb" | Add-Content -Encoding UTF8 $manifest
}
Write-Output "DONE. total=$($dirs.Count) failed=$($failed.Count)"
Write-Output "report:   $report"
Write-Output "manifest: $manifest"
$failed | ForEach-Object { Write-Output "  $_" }
