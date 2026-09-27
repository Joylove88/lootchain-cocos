# 把转换好的 4.2 特效入库到 assets/resources/spine/effect/<套名>/(2026-09-27)
# 用法(UTF-8 with BOM):
#   powershell -ExecutionPolicy Bypass -File fx_install.ps1 -From <OutRoot>\fx42 [-All] [-Only a,b,c] [-ListFile names.txt]
# 不带 -All 时必须给 -Only 或 -ListFile(只入选用的套,resources 目录全量进包,docs/29 口径);
# -All = 整批全部入库(包体与 git 都会大很多,见 README 第 4 步的取舍)。
# 每套校验:<名>.skel 头部版本 4.2.x、.atlas 存在、atlas 引用的 png 都在;已存在的同名目录会被覆盖(先 git 提交好再跑)。
param(
    [Parameter(Mandatory = $true)][string]$From,
    [switch]$All,
    [string[]]$Only = @(),
    [string]$ListFile = ''
)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..')
$dest = Join-Path $repo 'assets\resources\spine\effect'
if (-not (Test-Path $dest)) { Write-Error "目标目录不存在: $dest"; exit 1 }
$names = @()
if ($All) {
    $names = Get-ChildItem $From -Directory | ForEach-Object { $_.Name }
} else {
    if ($ListFile -and (Test-Path $ListFile)) { $names += Get-Content $ListFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') } }
    $names += $Only
    if ($names.Count -eq 0) { Write-Error "请给 -All,或用 -Only / -ListFile 指定要入库的套名"; exit 1 }
}
function Skel-Version([string]$path) {
    $b = [System.IO.File]::ReadAllBytes($path)
    $n = [int]$b[8] - 1
    if ($n -le 0 -or $n -gt 16) { return '?' }
    return [System.Text.Encoding]::ASCII.GetString($b, 9, $n)
}
$ok = 0; $bad = @()
foreach ($name in ($names | Sort-Object -Unique)) {
    $src = Join-Path $From $name
    $skel = Join-Path $src "$name.skel"
    $atlas = Join-Path $src "$name.atlas"
    if (-not (Test-Path $skel) -or -not (Test-Path $atlas)) { $bad += "${name}: 缺 $name.skel 或 $name.atlas"; continue }
    $ver = Skel-Version $skel
    if ($ver -notlike '4.2*') { $bad += "${name}: skel 版本 $ver 不是 4.2"; continue }
    $pngs = Get-Content $atlas | Where-Object { $_ -match '\.png\s*$' } | ForEach-Object { $_.Trim() }
    $missing = $pngs | Where-Object { -not (Test-Path (Join-Path $src $_)) }
    if ($missing) { $bad += "${name}: atlas 引用的图缺失 $($missing -join ',')"; continue }
    $to = Join-Path $dest $name
    if (Test-Path $to) { Remove-Item -Recurse -Force $to }
    New-Item -ItemType Directory -Force $to | Out-Null
    Copy-Item $skel, $atlas -Destination $to -Force
    foreach ($png in $pngs) { Copy-Item (Join-Path $src $png) -Destination $to -Force }
    $ok++
    Write-Output "installed  $name  ($ver, $($pngs.Count) png)"
}
Write-Output "DONE. installed=$ok  skipped=$($bad.Count)"
$bad | ForEach-Object { Write-Output "  SKIP $_" }
Write-Output "下一步:打开 Cocos Creator 让它导入(或预览服务在跑时 curl http://localhost:7456/asset-db/refresh),然后 git add assets/resources/spine/effect 提交。"
