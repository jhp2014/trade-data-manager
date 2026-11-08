# 대신 원천 분봉 수집 실행기. 어느 PowerShell 에서든 부른다 — 32비트·관리자 PowerShell 로 dump.ps1 을 띄우고(UAC 1회) 끝날 때까지 기다린다.
# 종료 코드 = dump.ps1 의 것(0 다 받음 · 2 미접속 · 3 중단 · 4 다 돌았지만 실패 있음).
# 전제: CYBOS Plus 를 **관리자 권한으로** 로그인해 둔다(호출 프로세스와 권한이 같아야 IsConnect=1). 대상 목록은 ingest daishin-targets 가 만든다.
#   powershell -File infra/daishin/collector/collect.ps1            # RawDir = infra/daishin/.env 의 DAISHIN_RAW_DIR
#   powershell -File infra/daishin/collector/collect.ps1 -RawDir D:\x
param([string]$RawDir)
$ErrorActionPreference = 'Stop'
if (-not $RawDir) {
  $envFile = Join-Path $PSScriptRoot '..\.env'
  $m = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*DAISHIN_RAW_DIR\s*=' } | Select-Object -First 1
  if (-not $m) { throw "DAISHIN_RAW_DIR 이 없다 — $envFile" }
  $RawDir = ($m -split '=', 2)[1].Trim().Trim('"')
}
# 관리자로 띄운 프로세스의 cwd 는 System32 라 절대 경로로 넘긴다. 끝 역슬래시는 "...\" 가 따옴표를 먹으니 뗀다.
$RawDir = (Resolve-Path -LiteralPath $RawDir).Path.TrimEnd([char]92)
if (-not (Test-Path (Join-Path $RawDir 'targets.csv'))) { throw "대상 목록이 없다 — $RawDir\targets.csv (ingest daishin-targets 먼저)" }
$ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
$dump = Join-Path $PSScriptRoot 'dump.ps1'
$p = Start-Process -FilePath $ps32 -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$dump`" -RawDir `"$RawDir`"" -Verb RunAs -WindowStyle Hidden -PassThru -Wait
Get-Content (Join-Path $RawDir 'collect.log') -Encoding UTF8 -Tail 5
exit $p.ExitCode
