# recon 01 — StockChart 입력 12(거래소) 값별 응답. 실행: 관리자 32비트 PowerShell(collector/collect.ps1 처럼 Start-Process -Verb RunAs) + CYBOS Plus 관리자 로그인.
#   ...\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -File recon/01-exchange.ps1 -Out <파일>
# 실측(2026-11-08):
# · 미지정 = 'A' = 'K' (지금 NXT 아닌 종목). 카카오 2025-07-15: K 09:00 55,499 + N 20,889 = 키움 통합 76,388 정확 일치.
# · 'A'(통합)는 지금 NXT 여부로 거른다 — 그때 NXT·지금 빠진 종목은 KRX 만. 'N' 은 과거 NXT 체결을 그대로 준다(프리 50·애프터 260봉).
# · NXT 출범(2025-03-04) 전·NXT 미편입 날은 'N' 0봉. 1분봉 바닥 2024-11-01(2024-10 이전 0봉).
param([string]$Out)
$log = New-Object System.Collections.Generic.List[string]
function W($s) { $log.Add([string]$s) }
try {
  $cy = New-Object -ComObject CpUtil.CpCybos
  W ("IsConnect=" + $cy.IsConnect)
  function Chart($code, $d, $mkt) {
    while ($cy.GetLimitRemainCount(1) -le 1) { Start-Sleep -Milliseconds 300 }
    $c = New-Object -ComObject CpSysDib.StockChart
    $c.SetInputValue(0,$code); $c.SetInputValue(1,[int][char]'1'); $c.SetInputValue(2,$d); $c.SetInputValue(3,$d)
    $c.SetInputValue(5,[int[]](0,1,2,3,4,5,8,9)); $c.SetInputValue(6,[int][char]'m'); $c.SetInputValue(7,1); $c.SetInputValue(9,[int][char]'0')
    if ($mkt) { $c.SetInputValue(12,[int][char]$mkt) }
    $null=$c.BlockRequest(); $n=$c.GetHeaderValue(3)
    $rows=@(); for($i=0;$i -lt $n;$i++){ $rows += ,@($c.GetDataValue(1,$i), $c.GetDataValue(6,$i), $c.GetDataValue(7,$i)) }
    return ,$rows
  }
  foreach ($q in @(@('A035720',20250715),@('A000370',20250715),@('A035720',20250415),@('A035720',20250318),@('A000370',20250515),@('A035720',20260915))) {
    foreach ($m in @($null,'A','N','K')) {
      $rows = Chart $q[0] $q[1] $m
      $pre = @($rows | ? { $_[0] -lt 900 }).Count; $aft = @($rows | ? { $_[0] -gt 1531 }).Count
      $v = @($rows | ? { $_[0] -in 901,902,903 } | % { "$($_[0]):$($_[1])" }) -join ' '
      $tv = 0; $ta = [double]0; foreach ($r in $rows) { $tv += [double]$r[1]; $ta += [double]$r[2] }
      W ("$($q[0]) $($q[1]) mkt=$m n=$($rows.Count) pre=$pre after=$aft vol=$tv amt=$ta  $v")
    }
  }
  foreach ($d in 20240701,20240801,20240902,20241002,20241101,20240603,20240513) {
    $rows = Chart 'A005930' $d $null
    W ("depth $d n=$($rows.Count)")
  }
} catch { W ("ERR " + $_.Exception.Message) }
[IO.File]::WriteAllLines($Out, $log, [Text.Encoding]::UTF8)
