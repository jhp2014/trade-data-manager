# CLAUDE.md

trade-data-manager — 한국 주식 데이터 수집·큐레이션·실시간 모니터링 시스템.

**이 앱의 본질은 데이트레이딩에서 유사한 상황을 분류하고, 그 분류에 따른 최적의 전략과 통계를 확인하는 것이다.**
기능·축·패널을 논의할 때 "그게 분류를 더 잘 가르는가 / 통계를 더 잘 보이게 하는가"로 잰다.

## 작업 위치 (개발/사용 인스턴스 분리)

사용자는 **`C:\Users\whdgn\Dev\trade-data-manager` (main, api 3001 / workbench 3100 / lab 3200 / lab-api 3300)** 에서 프로그램을 실사용한다.
개발은 **`C:\Users\whdgn\Dev\tdm-work` (git worktree, api 3011 / workbench 3110 / lab 3210 / lab-api 3310)** 에서만 한다 — 사용자가 쓰는 중에도 개발이 굴러가게 하려는 구성.

- 세션이 사용자 폴더에서 시작됐으면 **먼저 `C:\Users\whdgn\Dev\tdm-work` 로 옮기고** 작업한다. 사용자 폴더의 파일은 고치지 않는다(그 폴더의 dev 서버가 떠 있어 화면이 흔들린다).
- 개발 서버 기동: `$env:API_PORT=3011; pnpm --filter @trade-data-manager/api dev` · `pnpm --filter @trade-data-manager/workbench dev -- --port 3110` · `pnpm --filter @trade-data-manager/lab dev -- --port 3210` · `$env:LAB_API_PORT=3310; pnpm --filter @trade-data-manager/lab-api dev`.
  루트 `pnpm dev` 는 3001/3100/3200/3300 을 뺏으므로 **개발 워크트리에서 금지**. 같은 이유로 `.claude/launch.json` 에는 **개발 항목(api-dev·workbench-dev·lab-dev·lab-api-dev)만 둔다** — 사용자 포트를 띄울 손잡이를 아예 안 만드는 것이 경고문보다 확실하다(사용자 화면을 봐야 하면 `preview_start` 에 url 을 직접 준다). apps/live 는 양쪽 다 VPS(100.74.165.85:3002)를 본다.
- **공유 자원 — 개발 쪽에서 금지**: market 로컬 Postgres 는 한 벌이다. `ingest backfill`·`db-ops backup` 실행 금지(사용자 데이터가 바뀐다), drizzle 마이그레이션 금지(스키마 변경 작업은 사용자가 사용을 멈추고 진행하기로 합의). curation(Supabase)·live 알람 설정은 **읽기만**.
- 야간 스케줄러(20:30 collect→backup)는 사용자 폴더 고정.
- 토스 키(`infra/toss/.env`)는 개발 폴더에만 둔다 — 클라이언트당 유효 토큰이 하나라, 다른 곳에서 발급하면 먼저 받은 토큰이 죽는다. 같은 이유로 토스 recon 은 동시에 돌리지 않는다.
- 대신(CYBOS Plus) 원천 분봉 폴더(`infra/daishin/.env` 의 `DAISHIN_RAW_DIR` = `C:\Users\whdgn\TradingData\daishin-minutes`)는 사용·개발 공용 보관본이다 — 대신 1분봉 창이 약 2년이라 지우면 다시 못 받는다. 수집은 개발 폴더에서만(CYBOS 관리자 로그인 필요).
- worktree 신설 시 git 추적 밖 물건을 수동 복사: `.env` 7개(`infra/persistence·kis·kiwoom·krx·dart·google·telegram`), `apps/workbench/.env.local`(`API_PROXY_TARGET=http://localhost:3011`)·`apps/lab/.env.local`(`API_PROXY_TARGET=http://localhost:3011` + `LAB_API_PROXY_TARGET=http://127.0.0.1:3310`), `apps/api/.env`(`VAULT_DIR` — 복기 노트 [탐색], 사용자 폴더 반영 때도 수동 생성), `apps/lab-api/.env`(`TDM_AI_DIR` — 판단 작업장 tdm-ai 경로 · `CHART_LINES_DIR` — lab 저장 선 폴더, 사용 `C:\Users\whdgn\TradingData\chart-lines` / 개발 `…\chart-lines-dev`, 사용자 폴더 반영 때도 수동 생성), `apps/api/.cache`(~760MB, 안 하면 격자·순위 재굽기).
- 반영은 사용자가 요청할 때 사용자 폴더에서 fast-forward + 앱 재시작. 브랜치는 한 줄 유지(머지 커밋 금지).
## 구조 (헥사고날)

```
apps/       api · db-ops · ingest · lab · lab-api · live · workbench   (진입점)
core/       market                                                      (순수 도메인)
contracts/  wire                                                        (서버↔클라 계약)
infra/      broker · google · kis · kiwoom · persistence · telegram    (어댑터)
```

- `apps/api` — NestJS 백엔드 (workbench가 대면하는 REST)
- `apps/workbench` — Vite+React 작업대, dockview 기반 패널 셸
- `apps/lab` — 판단 학습 실험실 화면(옛 독립 저장소 trade-lab, 2026-10-16 편입). tdm 데이터는 읽기(GET)만(쓰기는 lab 저장 선 파일뿐 — lab-api `/chart-lines`), 판단·AI 가공은 별도 작업장 `C:\Users\whdgn\Dev\tdm-ai`(옛 trade-judgment 는 보관소). 장기적으로 workbench 를 대체해 간다(설계: `apps/lab/DESIGN.md`)
- `apps/lab-api` — lab 이 대면하는 백엔드(Hono), 시장 읽기 전용 + lab 저장 선(`/chart-lines`, 파일 — 결정 로그 「일봉 판단 학습」)만 쓰기. api 의 lab 읽기 경로를 잠식해 api 를 은퇴시킨다(결정 로그 「trade-lab 편입」). 옛 /judgment 읽기는 2026-10-17 은퇴 — 판단·AI 가공은 tdm-ai 작업장(「판단·AI 가공의 작업장」)
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
