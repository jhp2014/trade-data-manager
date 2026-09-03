# CLAUDE.md

trade-data-manager — 한국 주식 데이터 수집·큐레이션·실시간 모니터링 시스템.

## 작업 위치 (개발/사용 인스턴스 분리)

사용자는 **`C:\Users\whdgn\Dev\trade-data-manager` (main, api 3001 / workbench 3100)** 에서 프로그램을 실사용한다.
개발은 **`C:\Dev\tdm-work` (git worktree, api 3011 / workbench 3110)** 에서만 한다 — 사용자가 쓰는 중에도 개발이 굴러가게 하려는 구성.

- 세션이 사용자 폴더에서 시작됐으면 **먼저 `C:\Dev\tdm-work` 로 옮기고** 작업한다. 사용자 폴더의 파일은 고치지 않는다(그 폴더의 dev 서버가 떠 있어 화면이 흔들린다).
- 개발 서버 기동: `$env:API_PORT=3011; pnpm --filter @trade-data-manager/api dev` · `pnpm --filter @trade-data-manager/workbench dev -- --port 3110`.
  루트 `pnpm dev` 는 3001/3100 을 뺏으므로 **개발 워크트리에서 금지**. apps/live 는 양쪽 다 VPS(100.74.165.85:3002)를 본다.
- **공유 자원 — 개발 쪽에서 금지**: market 로컬 Postgres 는 한 벌이다. `ingest backfill`·`db-ops backup` 실행 금지(사용자 데이터가 바뀐다), drizzle 마이그레이션 금지(스키마 변경 작업은 사용자가 사용을 멈추고 진행하기로 합의). curation(Supabase)·live 알람 설정은 **읽기만**.
- 야간 스케줄러(20:30 collect→backup)는 사용자 폴더 고정.
- worktree 신설 시 git 추적 밖 물건을 수동 복사: `.env` 6개(`infra/persistence·kis·kiwoom·krx·google·telegram`), `apps/workbench/.env.local`(`API_PROXY_TARGET=http://localhost:3011`), `apps/api/.cache`(~760MB, 안 하면 격자·순위 재굽기).
- 반영은 사용자가 요청할 때 사용자 폴더에서 fast-forward + 앱 재시작. 브랜치는 한 줄 유지(머지 커밋 금지).
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

## 참고 자료

- **`.claude/architecture-map.md`** — 어디가 무슨 책임인지(성긴 구조 지도). 세부 구현 전에 "이미 있는 걸 새로 만드는 건 아닌지" 확인할 때.
- **`.claude/decisions.md`** — 왜 이렇게 정했고 뭘 기각했는지(현재 상태만, 이력 아님). 설계 논의 중 과거 결정과 부딪히는지 확인할 때 — 코드 쓰기 전에 여기서 걸러지는 게 가장 싸다. `code-reviewer`·`planner` 서브에이전트도 참고하지만, **대화 중 메인 세션이 먼저 참고하는 게 제일 이르고 값지다**.

둘 다 "내비게이션/현재 규칙"일 뿐 최종 근거는 실제 코드 — 둘이 실제와 다르면 코드를 믿고, 그 자리에서 갱신할지 판단한다(`decisions.md` 갱신은 `/decision-log` 스킬).

## 알려진 함정

- **서버에서 `tsc` 금지**: live VPS(iwinv, RAM 961MB)에서 `tsc --noEmit` 돌리면 V8 힙(~480MB) 초과로 OOM(`exit 134`). 코드 문제로 오독하기 쉬움 — 서버는 애초에 `tsx`로 실행만 하고 빌드/타입체크 단계가 없음(배포 게이트 아님). 타입 검증은 로컬에서 끝내고, 서버 검증은 런타임 로그·엔드포인트 curl로 할 것.
- **`apps/live/.env` 로컬↔서버 내용이 다름**: 통째로 scp 금지. 값 하나 바꿀 땐 서버 파일을 직접 sed로 수정.
- **curation은 Supabase egress 제한(Fair Use)**: 읽기 경로는 로컬 미러를 거칠 것, Supabase에 직접 다량 조회 금지.
