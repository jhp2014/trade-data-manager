# chart-capture

CSV 입력의 종목/날짜 목록을 받아 일봉(상)+분봉(하) 콤보 차트를 KRX/NXT 두 버전으로 PNG 캡처합니다.

## 환경 설정

```bash
cp .env.example .env
# .env에서 DATABASE_URL, CAPTURE_INPUT_DIR, CAPTURE_OUTPUT_DIR 필수 설정
```

## 실행 방법

```bash
# 의존성 설치
pnpm install

# Next.js 앱 빌드 (first time)
pnpm build

# 캡처 실행 (next start 자동 기동)
pnpm capture

# dry-run (실제 캡처 없이 경로만 출력)
pnpm capture --dry-run

# 특정 variant만
pnpm capture --variant KRX

# 외부 서버 모드 (디버깅용)
pnpm --filter chart-capture dev   # 터미널 A
pnpm capture --external-server http://localhost:3939  # 터미널 B
```

## CSV 형식

```csv
stockCode,tradeDate,line_target,line_stop,line_entry
005930,2026-04-21,75000,72000,73500
000660,20260421,150000|145000,140000,
```

- `stockCode`: 6자리 종목코드 (앞 0 보존)
- `tradeDate`: YYYY-MM-DD 또는 YYYYMMDD
- `line_*`: `|` 구분 가격 숫자 목록 (생략 가능)

## 출력 파일명

`{tradeDate}_{stockCode}_{stockName}_{variant}.png`

예: `2026.04.21_005930_삼성전자_KRX.png`

## 디렉토리 이동 규칙

| 결과 | 이동 위치 | 사이드카 |
|------|-----------|----------|
| 전체 성공 | `input/processed/` | 없음 |
| 일부 실패/스킵 | `input/processed/` | `.partial.log` |
| 파싱 실패 | `input/failed/` | `.error.log` |

## 종료 코드

- `0`: 성공 또는 skipped만 있음
- `1`: 한 건 이상 failed
- `2`: 서버 기동/Playwright/DB 연결 실패
