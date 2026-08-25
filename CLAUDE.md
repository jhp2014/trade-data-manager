# CLAUDE.md

trade-data-manager — 한국 주식 데이터 수집·큐레이션·실시간 모니터링 시스템.

## 구조 (헥사고날)

```
apps/       api · db-ops · ingest · live · workbench   (진입점)
core/       market                                      (순수 도메인)
contracts/  wire                                        (서버↔클라 계약)
infra/      broker · google · kis · kiwoom · persistence · telegram  (어댑터)
```

- `apps/api` — NestJS 백엔드 (workbench가 대면하는 REST)
- `apps/workbench` — Vite+React 작업대, dockview 기반 패널 셸
- `apps/live` — 실시간 모니터/알람/트레이더, iwinv VPS 상주
- `apps/db-ops` — 백업 (market + curation 미러)
- `apps/ingest` — 수집 CLI (일봉/분봉/뉴스 백필)

## 커맨드

pnpm + turbo 모노레포. 루트 스크립트:

```
pnpm dev / build / type-check / test / lint   # turbo가 전 패키지에 위임
pnpm db:generate                               # market 스키마 마이그레이션 생성
pnpm db:generate:curation                      # curation 스키마 (별도 config: drizzle.curation.config.ts)
```

## 데이터 계층

DB 스키마 2개, `infra/persistence/src/schema/{market,curation}.ts`. 배포도 분리되어 있음:

- **market**: 각자 로컬 Postgres (pg_dump로 시딩)
- **curation**: 공유 Supabase, 로컬은 읽기 전용 미러 + dual write (egress 제한 있음, 아래 참조)

## 알려진 함정

- **서버에서 `tsc` 금지**: live VPS(iwinv, RAM 961MB)에서 `tsc --noEmit` 돌리면 V8 힙(~480MB) 초과로 OOM(`exit 134`). 코드 문제로 오독하기 쉬움 — 서버는 애초에 `tsx`로 실행만 하고 빌드/타입체크 단계가 없음(배포 게이트 아님). 타입 검증은 로컬에서 끝내고, 서버 검증은 런타임 로그·엔드포인트 curl로 할 것.
- **`apps/live/.env` 로컬↔서버 내용이 다름**: 통째로 scp 금지. 값 하나 바꿀 땐 서버 파일을 직접 sed로 수정.
- **curation은 Supabase egress 제한(Fair Use)**: 읽기 경로는 로컬 미러를 거칠 것, Supabase에 직접 다량 조회 금지.
