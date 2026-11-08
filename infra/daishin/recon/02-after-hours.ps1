# recon 02 — 입력 10(시간외 거래량 구분) 값별로 장 시작·마감 근처 봉과 하루 합. 실행 방법은 recon 01 과 같다.
# 실측(2026-11-08, 5종목-날 × K·N × '1'/'2'/'3'):
# · '1' 은 KRX 장전 시간외를 901 봉에 더한다(삼성전자 2025-07-22 +117주), '2'='3' = 키움 KRX 칸과 같다 → 수집기는 '3'.
# · KRX 장후 시간외 종가(키움 15:35 봉)는 어느 값으로도 오지 않는다(000040 2025-07-22 201,457주가 통째 없다).
# · 동시호가가 늦게 체결된 날(000660 2025-07-10, 키움 15:32)도 대신은 1530.
# · NXT 15:30~15:40 체결은 N 의 1541 봉에 합쳐 온다(키움은 15:35 통합 봉 — 하루 합 같음).
param([string]$Out)
$ErrorActionPreference = 'Continue'
$w = [IO.StreamWriter]::new($Out, $false, [Text.Encoding]::UTF8); $w.AutoFlush = $true
$cy = New-Object -ComObject CpUtil.CpCybos
if ($cy.IsConnect -ne 1) { $w.WriteLine("IsConnect=0"); $w.Close(); exit 1 }
$samples = @(@('005930',20250722),@('000040',20250722),@('000660',20250710),@('005930',20250520),@('000040',20250520))
$fields = [int[]](0,1,2,3,4,5,8,9)
foreach ($s in $samples) {
  foreach ($m in 'K','N') {
    foreach ($o in '1','2','3') {
      try {
        while ($cy.GetLimitRemainCount(1) -le 0) { Start-Sleep -Milliseconds 200 }
        $c = New-Object -ComObject CpSysDib.StockChart
        $c.SetInputValue(0,'A'+$s[0]); $c.SetInputValue(1,[int][char]'1'); $c.SetInputValue(2,$s[1]); $c.SetInputValue(3,$s[1])
        $c.SetInputValue(5,$fields); $c.SetInputValue(6,[int][char]'m'); $c.SetInputValue(7,1); $c.SetInputValue(9,[int][char]'0')
        $c.SetInputValue(10,[int][char]$o); $c.SetInputValue(12,[int][char]$m)
        $rows = @(); $page = 0
        do {
          if ($page -gt 0) { while ($cy.GetLimitRemainCount(1) -le 0) { Start-Sleep -Milliseconds 200 } }
          $r = $c.BlockRequest(); $page++
          if ($r -ne 0 -or $c.GetDibStatus() -ne 0) { $w.WriteLine("$($s[0]) $($s[1]) $m opt$o ret=$r st=$($c.GetDibStatus()) $($c.GetDibMsg1())"); break }
          $n = $c.GetHeaderValue(3)
          for ($i=0; $i -lt $n; $i++) { $rows += ,@($c.GetDataValue(1,$i),$c.GetDataValue(2,$i),$c.GetDataValue(5,$i),$c.GetDataValue(6,$i),$c.GetDataValue(7,$i)) }
        } while ($c.Continue -eq 1 -and $page -lt 8)
        $sum = 0; foreach ($x in $rows) { $sum += [long]$x[3] }
        $edge = ($rows | Where-Object { ($_[0] -ge 855 -and $_[0] -le 902) -or ($_[0] -ge 1529 -and $_[0] -le 1545) } | Sort-Object { [int]$_[0] } | ForEach-Object { "$($_[0]):c$($_[2])/v$($_[3])/a$($_[4])" }) -join ' '
        $w.WriteLine("$($s[0]) $($s[1]) $m opt$o bars=$($rows.Count) vol=$sum | $edge")
      } catch { $w.WriteLine("$($s[0]) $($s[1]) $m opt$o ERR " + ($_.Exception.Message -replace '\s+',' ')) }
    }
  }
}
$w.WriteLine("end"); $w.Close()
