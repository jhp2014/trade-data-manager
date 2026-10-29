<#
  야간 데이터 파이프라인: collect(수집) → backup(백업).
  Windows 작업 스케줄러가 매일 20:30 에 이 스크립트 하나만 실행한다(체이닝).

    collect : pnpm --filter @trade-data-manager/ingest start backfill
              (일상 한방 — 어제까지 N일 캔들·뉴스·일별속성(KRX 시총/상장주식수/소속부) + 공모가,
               오늘 제외, skip-if-present. KRX 는 T-1 제공이라 20:30 시점에 어제치가 확실히 올라와 있다)
    telegram: pnpm --filter @trade-data-manager/ingest start telegram-sync
              (텔레그램 뉴스 방 9개 아카이브 — 신규 + 48h 수정 재훑기. 별도 스텝이라 로그가 갈리고
               텔레그램 실패가 시장 데이터 수집 결과와 섞이지 않는다. 여기서 받은 "어제"가 다음 날 DB 읽기 coverage 가 된다)
    lines   : git commit — TradingData\chart-lines(lab 저장 선, 그 폴더만의 로컬 git)
              (lab-api 가 쓸 때마다 커밋하면 무거워 하루치를 한 번에 — 이력·되돌리기용, 바뀐 게 없으면 넘어간다)
    backup  : pnpm --filter @trade-data-manager/db-ops backup
              (curation 미러 Supabase→로컬 내장 + 로컬 전체 덤프 + 복원검증 + Drive 업로드)

  backup 은 collect/telegram 실패와 무관하게 실행(백업은 안전망). 하나라도 실패하면 exit 1 →
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

Write-Log '===== 야간 작업 시작 (collect → telegram → lines → backup) ====='

$collect = Invoke-Step 'collect (ingest backfill)' @('--filter', '@trade-data-manager/ingest', 'start', 'backfill')
$telegram = Invoke-Step 'telegram (ingest telegram-sync)' @('--filter', '@trade-data-manager/ingest', 'start', 'telegram-sync')

# lab 저장 선 하루치 커밋 — 폴더가 git 이 아니면(옮기기 전) 넘어간다. 바뀐 게 없으면 커밋하지 않는다.
$LinesDir = Join-Path $HOME 'TradingData\chart-lines'
function Invoke-LinesCommit {
    if (-not (Test-Path (Join-Path $LinesDir '.git'))) { Write-Log "- lines: $LinesDir 가 git 이 아니다 — 넘어감"; return 0 }
    Write-Log '▶ lines (chart-lines 커밋) 시작'
    # git 을 못 찾으면 실패로 — 못 찾은 채 넘어가면 직전 스텝의 $LASTEXITCODE 를 읽어 "바뀐 것 없음"으로 묻힌다
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { Write-Log '✗ lines: git 을 찾지 못했다(PATH)'; return 1 }
    & $git.Source -C $LinesDir add -A *>&1 | Out-File -FilePath $Log -Append -Encoding utf8
    # add 실패(남은 index.lock 등)는 실패로 — 아니면 스테이징이 비어 아래 diff 가 "바뀐 것 없음"이라 말한다
    if ($LASTEXITCODE -ne 0) { Write-Log "✗ lines: git add 실패 (exit $LASTEXITCODE)"; return $LASTEXITCODE }
    & $git.Source -C $LinesDir diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { Write-Log '✓ lines 바뀐 것 없음'; return 0 }
    & $git.Source -C $LinesDir commit -q -m ('chart-lines ' + (Get-Date -Format 'yyyy-MM-dd')) *>&1 | Out-File -FilePath $Log -Append -Encoding utf8
    $code = $LASTEXITCODE
    if ($code -eq 0) { Write-Log '✓ lines 커밋' } else { Write-Log "✗ lines 커밋 실패 (exit $code)" }
    return $code
}
$lines = Invoke-LinesCommit

# collect/telegram 실패해도 backup 은 반드시 실행(어제까지 상태라도 떠둔다).
$backup = Invoke-Step 'backup (db-ops)' @('--filter', '@trade-data-manager/db-ops', 'backup')

if ($collect -ne 0 -or $telegram -ne 0 -or $lines -ne 0 -or $backup -ne 0) {
    Write-Log "===== 종료: 실패 (collect=$collect, telegram=$telegram, lines=$lines, backup=$backup) ====="
    exit 1
}
Write-Log '===== 종료: 성공 ====='
exit 0
