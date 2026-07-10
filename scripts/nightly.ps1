<#
  야간 데이터 파이프라인: collect(수집) → backup(백업).
  Windows 작업 스케줄러가 매일 20:30 에 이 스크립트 하나만 실행한다(체이닝).

    collect : pnpm --filter @trade-data-manager/ingest start backfill
              (일상 한방 — 어제까지 N일 캔들·뉴스 + 당일 시총 + 공모가, 오늘 제외, skip-if-present)
    backup  : pnpm --filter @trade-data-manager/db-ops backup
              (curation 미러 Supabase→로컬 내장 + 로컬 전체 덤프 + 복원검증 + Drive 업로드)

  backup 은 collect 실패와 무관하게 실행(백업은 안전망). 둘 중 하나라도 실패하면 exit 1 →
  작업 스케줄러 LastTaskResult 에 실패로 표시된다. 각 앱이 상세 로그를 자체 기록하므로 여기선
  오케스트레이션 흐름만 nightly.log 에 남긴다.
#>
param(
    # 기본값 = db-ops 백업 로그와 같은 폴더(머신 이동 시 $HOME 로 자연 이동).
    [string]$LogDir = (Join-Path $HOME 'TradingData\db-backup-local\logs')
)

$ErrorActionPreference = 'Continue'  # 한 스텝이 던져도 다음 스텝(backup)까지 진행
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# pnpm 확보 — 스케줄러의 최소 PATH 에서도 잡히도록 nvm4w 경로를 앞에 붙인다.
$nvm = 'C:\nvm4w\nodejs'
if (Test-Path (Join-Path $nvm 'pnpm.cmd')) {
    $env:Path = "$nvm;$env:Path"
    $pnpm = Join-Path $nvm 'pnpm.cmd'
} else {
    $pnpm = 'pnpm'
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir 'nightly.log'

function Write-Log([string]$msg) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $line | Out-File -FilePath $Log -Append -Encoding utf8
    Write-Host $line
}

# pnpm 스텝 실행: 자식 출력(성공+에러)을 로그+콘솔에 흘리고, 종료코드만 반환.
function Invoke-Step([string]$label, [string[]]$pnpmArgs) {
    Write-Log "▶ $label 시작"
    & $pnpm @pnpmArgs *>&1 | ForEach-Object {
        $_ | Out-File -FilePath $Log -Append -Encoding utf8
        Write-Host $_
    }
    $code = $LASTEXITCODE
    if ($code -eq 0) { Write-Log "✓ $label 완료" } else { Write-Log "✗ $label 실패 (exit $code)" }
    return $code
}

Write-Log '===== 야간 작업 시작 (collect → backup) ====='

$collect = Invoke-Step 'collect (ingest backfill)' @('--filter', '@trade-data-manager/ingest', 'start', 'backfill')
# collect 실패해도 backup 은 반드시 실행(어제까지 상태라도 떠둔다).
$backup = Invoke-Step 'backup (db-ops)' @('--filter', '@trade-data-manager/db-ops', 'backup')

if ($collect -ne 0 -or $backup -ne 0) {
    Write-Log "===== 종료: 실패 (collect=$collect, backup=$backup) ====="
    exit 1
}
Write-Log '===== 종료: 성공 ====='
exit 0
