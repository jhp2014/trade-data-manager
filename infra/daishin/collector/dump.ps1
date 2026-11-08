# 대신 StockChart 1분봉 → 원천 파일. collect.ps1 이 32비트·관리자 PowerShell 로 띄운다(직접 부르지 말 것).
# 입력 = <RawDir>\targets.csv (code,YYYY-MM-DD). 종목-날마다 KRX('K')·NXT('N') 를 따로 받아 <RawDir>\<날짜>\<코드>.csv 에 쓴다.
# 형식·의미 = src/rawFiles.ts. 파일이 이미 있으면 건너뛴다(재실행 = 이어받기). 진행·실패는 <RawDir>\collect.log.
# 입력 9 = '0'(원주가) · 10 = '3'(시간외 거래량 제외 — 키움 KRX 칸과 같다) · 12 = 거래소.
param([Parameter(Mandatory = $true)][string]$RawDir)
$ErrorActionPreference = 'Continue'
$log = [IO.StreamWriter]::new((Join-Path $RawDir 'collect.log'), $true, [Text.UTF8Encoding]::new($false)); $log.AutoFlush = $true
function Log($s) { $log.WriteLine((Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') + ' ' + $s) }

$cy = New-Object -ComObject CpUtil.CpCybos
if ($cy.IsConnect -ne 1) { Log 'IsConnect=0 — CYBOS Plus 를 관리자로 로그인했는지 확인'; $log.Close(); exit 2 }

$fields = [int[]](0, 1, 2, 3, 4, 5, 8, 9)   # 날짜·시각·시고저종·거래량·거래대금
$utf8 = [Text.UTF8Encoding]::new($false)
$items = [IO.File]::ReadAllLines((Join-Path $RawDir 'targets.csv')) | Where-Object { $_.Trim() }
$stats = @{ done = 0; skipped = 0; failed = 0 }
$streak = 0
Log ("start items=" + $items.Count)

function Fetch([string]$code, [int]$ymd, [string]$mkt, [Text.StringBuilder]$sb) {
  $c = New-Object -ComObject CpSysDib.StockChart
  $c.SetInputValue(0, 'A' + $code); $c.SetInputValue(1, [int][char]'1'); $c.SetInputValue(2, $ymd); $c.SetInputValue(3, $ymd)
  $c.SetInputValue(5, $fields); $c.SetInputValue(6, [int][char]'m'); $c.SetInputValue(7, 1); $c.SetInputValue(9, [int][char]'0')
  $c.SetInputValue(10, [int][char]'3'); $c.SetInputValue(12, [int][char]$mkt)
  $page = 0
  do {
    while ($cy.GetLimitRemainCount(1) -le 0) { Start-Sleep -Milliseconds 200 }
    $r = $c.BlockRequest(); $page++
    if ($r -ne 0 -or $c.GetDibStatus() -ne 0) { throw "ret=$r st=$($c.GetDibStatus()) $($c.GetDibMsg1())" }
    $n = $c.GetHeaderValue(3)
    for ($i = 0; $i -lt $n; $i++) {
      if ($c.GetDataValue(0, $i) -ne $ymd) { throw "다른 날짜 봉 $($c.GetDataValue(0, $i))" }
      [void]$sb.Append($mkt)
      for ($k = 1; $k -lt 8; $k++) { [void]$sb.Append(',').Append($c.GetDataValue($k, $i)) }
      [void]$sb.Append("`n")
    }
  } while ($c.Continue -eq 1 -and $page -lt 10)
  if ($c.Continue -eq 1) { throw "10쪽을 넘었다" }
}

foreach ($line in $items) {
  $p = $line.Trim().Split(','); $code = $p[0]; $date = $p[1]
  $dir = Join-Path $RawDir $date; $file = Join-Path $dir "$code.csv"
  if (Test-Path $file) { $stats.skipped++; continue }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("# daishin StockChart 1m opt9=0 opt10=3 fetched=$(Get-Date -Format s)`n")
  [void]$sb.Append("mkt,end,open,high,low,close,volume,amount`n")
  try {
    Fetch $code ([int]($date -replace '-', '')) 'K' $sb
    Fetch $code ([int]($date -replace '-', '')) 'N' $sb
    [void][IO.Directory]::CreateDirectory($dir)
    [IO.File]::WriteAllText("$file.part", $sb.ToString(), $utf8)
    Move-Item -LiteralPath "$file.part" -Destination $file -Force -ErrorAction Stop
    $stats.done++; $streak = 0
  } catch {
    $msg = $_.Exception.Message -replace '\s+', ' '
    Log ("FAIL $code $date $msg")
    $stats.failed++
    # 연결이 끊겼으면 바로 멈춘다(재실행하면 이어받는다). 사라진 종목코드는 영구 실패라 연속 실패로 세지 않는다 —
    # 세면 그런 코드가 몰린 자리에서 매번 멈춰 뒤로 못 넘어간다. 그 밖 실패가 이어지면(한도·장애) 헛돌지 않게 멈춘다.
    if ($cy.IsConnect -ne 1) { Log 'abort — 연결 끊김(IsConnect=0)'; $streak = 20; break }
    if ($msg -notmatch '종목') { $streak++ }
    if ($streak -ge 20) { Log 'abort — 연속 실패 20'; break }
  }
  if (($stats.done + $stats.failed) % 200 -eq 0 -and $stats.done + $stats.failed -gt 0) { Log ("progress done=$($stats.done) skipped=$($stats.skipped) failed=$($stats.failed)") }
}
Log ("end done=$($stats.done) skipped=$($stats.skipped) failed=$($stats.failed)")
$log.Close()
if ($streak -ge 20) { exit 3 }
if ($stats.failed -gt 0) { exit 4 }   # 다 돌았지만 실패가 있다 — collect.log 의 FAIL 줄을 볼 것
