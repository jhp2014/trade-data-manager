# feature-processor

`apps/batch`가 수집한 분봉 데이터를 읽어 기술적 지표를 계산하고 `minute_candle_features` 테이블에 저장하는 CLI.

---

## 실행

### 스크립트 목록

| 명령어 | 동작 |
|--------|------|
| `pnpm dev` | tsx로 즉시 실행 (CLI이므로 dev로 충분) |
| `pnpm build` | TypeScript → `dist/` 컴파일 |
| `pnpm start` | 빌드 결과(`dist/index.js`) 실행 |
| `pnpm type-check` | 타입 검사 (`tsc --noEmit`) |
| `pnpm clean` | `dist/` 삭제 |
| `pnpm clean:cache` | `dist/` + `.turbo/` + `*.tsbuildinfo` 삭제 |
| `pnpm clean:all` | `clean:cache` + `node_modules` 삭제 |

루트에서 실행할 경우:

```bash
pnpm --filter feature-processor dev minute -- <옵션>
```

### `minute` 서브커맨드

분봉 피처를 계산하는 유일한 커맨드입니다.

```bash
# 아직 처리되지 않은 거래일만 처리 (기본 — 매일 실행 시 추천)
pnpm dev minute --pending
pnpm dev minute -p

# 특정 거래일만 처리
pnpm dev minute --date 2026-04-21
pnpm dev minute -d 2026-04-21

# 전체 거래일 재처리 (처음부터 다시 계산할 때)
pnpm dev minute --all
pnpm dev minute -a
```

루트에서 실행:

```bash
pnpm --filter feature-processor dev minute -- --pending
pnpm --filter feature-processor dev minute -- --date 2026-04-21
pnpm --filter feature-processor dev minute -- --all
```

> 옵션을 지정하지 않으면 `--pending`과 동일하게 동작합니다.

---

## 환경 변수

루트 `.env`에 설정합니다:

```
DATABASE_URL=postgresql://user:password@localhost:5432/trade-data-manager
```

---

## 처리 흐름

```
1. 처리 대상 거래일 조회 (--date / --pending / --all 에 따라)
2. 거래일별 반복:
   a. 해당 날짜에 분봉이 있는 종목 코드 목록 조회
   b. 종목별 하루치 분봉 전체 조회
   c. MINUTE_CALCULATORS 순서대로 적용 → 피처 행 생성
   d. minute_candle_features에 UPSERT
```

`MINUTE_CALCULATORS`는 `packages/data-core/src/market-feature/calculators/`에 정의된 계산기 배열입니다. 새 지표를 추가하려면 해당 디렉터리에 Calculator를 추가하고 배열에 등록합니다.

---

## 프로젝트 구조

```
src/
├── index.ts        # CLI 진입점 (commander 기반)
├── runner.ts       # 피처 계산 파이프라인 (runMinuteFeatures)
├── logger.ts       # Winston 로거
└── repository/
    └── db.ts       # PostgreSQL 연결 (DATABASE_URL 사용)
```
