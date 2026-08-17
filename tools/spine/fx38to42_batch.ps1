# Spine 特效批量转换 3.8 → 4.2(2026-08-17,docs/29)
# 用法(PowerShell 5.1 注意:本文件含中文,必须保持 UTF-8 with BOM 编码,否则中文路径变乱码):
#   powershell -File fx38to42_batch.ps1 -PackRoot <素材包effect_skill目录> -OutRoot <输出目录> [-Spine <Spine.com>]
# 每套:取目录内最大的 .spine 源工程,用 Spine 4.2.43 一次启动导两份:
#   ① 二进制 skel + 重打包图集(fx42_binary_pack.export.json,premultiplyAlpha=false)
#   ② 数据 json(fx42_json_data.export.json,不打包,供清单/校验)
# 已知坑:
#   - Start-Process 必须先取 $p.Handle,否则 ExitCode 恒为 null;
#   - 工程内图片路径写死绝对盘符的套(J:\...)重打包会失败(skel 正常),沿用原始 atlas/png 兜底;
#   - 特效骨骼 setup pose 无可见附件 → 导出 json 的 skeleton.width/height=0 属正常。
param(
    [Parameter(Mandatory = $true)][string]$PackRoot,
    [Parameter(Mandatory = $true)][string]$OutRoot,
    [string]$Spine = 'D:\spine\Spine.com',
    [string]$SpineVersion = '4.2.43'
)
$ErrorActionPreference = 'Continue'
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$expBin  = Join-Path $toolDir 'fx42_binary_pack.export.json'
$expJson = Join-Path $toolDir 'fx42_json_data.export.json'
$outBin  = Join-Path $OutRoot 'fx42'
$outJson = Join-Path $OutRoot 'fx42json'
$logDir  = Join-Path $OutRoot 'logs'
New-Item -ItemType Directory -Force $outBin, $outJson, $logDir | Out-Null

function Run-Spine([string[]]$spineArgs, [string]$outFile, [string]$errFile) {
    $quoted = $spineArgs | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }
    $p = Start-Process -FilePath $Spine -ArgumentList $quoted -NoNewWindow -PassThru `
         -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $null = $p.Handle
    if (-not $p.WaitForExit(300000)) { try { $p.Kill() } catch {}; return -999 }
    if ($null -eq $p.ExitCode) { return -1 }
    return $p.ExitCode
}

$dirs = Get-ChildItem $PackRoot -Directory | Sort-Object Name
$i = 0
$failed = @()
foreach ($d in $dirs) {
    $i++
    $src = Get-ChildItem $d.FullName -Filter *.spine -File | Sort-Object Length -Descending | Select-Object -First 1
    if (-not $src) { $failed += "$($d.Name): no .spine"; continue }
    $oB = Join-Path $outBin $d.Name; $oJ = Join-Path $outJson $d.Name
    New-Item -ItemType Directory -Force $oB, $oJ | Out-Null
    $tag = '{0:d3}' -f $i
    $code = Run-Spine @('-u', $SpineVersion, '-i', $src.FullName, '-o', $oB, '-e', $expBin, '-i', $src.FullName, '-o', $oJ, '-e', $expJson) (Join-Path $logDir "$tag.out") (Join-Path $logDir "$tag.err")
    $ok = ($code -eq 0) -and @(Get-ChildItem $oB -Filter *.skel).Count -and @(Get-ChildItem $oB -Filter *.atlas).Count -and @(Get-ChildItem $oB -Filter *.png).Count
    if (-not $ok) { $failed += "$($d.Name): exit=$code" }
    Write-Output ("[{0}/{1}] {2}  {3}" -f $tag, $dirs.Count, ($(if ($ok) { 'ok' } else { 'FAILED' })), $d.Name)
}
Write-Output "DONE. failed: $($failed.Count)"
$failed | ForEach-Object { Write-Output "  $_" }
