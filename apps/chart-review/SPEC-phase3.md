# chart-review 3차 명세 — CSV → review_target / review_point 인제스트 (CLI)

> 선행: SPEC.md(1차 mock 골격), SPEC-phase2.md(실 차트 렌더링) 완료.
> 이 문서는 **DB에 리뷰 대상(target)과 타점(point)을 적재하는 백엔드 파이프라인**이다.
> Google Sheet 생성(Phase 4) / 앱 읽기·tradeTime 입력(Phase 5) 은 범위 밖.
>
> chart-review 앱(Next.js)은 이 단계에서 **건드리지 않는다.** 작업 대상은
> `packages/data-core`(스키마·리포지토리) + **신규 CLI 앱**(feature-processor 패턴 미러)이다.
> 명세 문서를 chart-review 앱 폴더에 두는 건 도메인 묶음일 뿐.

---

## 0. 목표 한 줄

두 개의 CSV 소스를 읽어 DB의 `review_target`(종목+날짜, line_TARGET)과
`review_point`(타점 tradeTime + 수동값 payload)를 채운다. feature-processor처럼 **CLI로 실행**한다.

---

## 1. 핵심 결정 (왜 이 구조인가)

- **2-테이블 분리.** 한 (종목,날짜)에 tradeTime이 여러 개일 수 있으므로
  `review_target`(종목+날짜, UNIQUE) 와 `review_point`(타점, target당 0..N) 를 나눈다.
  단일 테이블 `UNIQUE(stockCode,tradeDate)` 는 두 번째 타점을 막으므로 틀렸다.
- **수동값은 review_point의 `payloadJson`(jsonb) 한 칼럼.** 별도 manual 테이블 불필요
  (reviewId=point.id 와 1:1). `entryType/result/...` 등 여러 수동 입력 값을 여기 담는다.
- **line_TARGET은 target에 1번만.** 종목+날짜 단위 가격선이라 타점마다 중복시키지 않는다.
- **reviewId = `review_point.id`.** 타점 1개 = reviewId 1개. tradeTime을 바꿔도 불변(=manual 보존).
- **로직은 data-core, 실행은 독립 CLI.** 테이블/리포지토리는 data-core에 두어 앱·CLI가 공용으로
  쓰고, CSV 읽기·파일이동은 얇은 CLI 앱(`apps/review-ingest`)에 둔다 (batch/feature-processor와 동일).

---

## 2. 두 CSV 소스와 역할

| 소스 | 경로(기본) | 채우는 것 | 처리 후 |
|---|---|---|---|
| **Capture** | `…/trade-csv/chart-review-target/Capture-*.csv` | `review_target` (line_TARGET, 종목·날짜) | `processed/`로 **이동** (인박스) |
| **main** | `…/trade-csv/review-target/main/**/main-*.csv` | `review_target` + `review_point`(tradeTime, payload) | **이동 안 함** (유지 원장, `.backup` 존재) → 멱등 |

- 경로는 env로(하드코딩 회피): `CHART_REVIEW_TARGET_DIR`, `REVIEW_MAIN_DIR`. 미설정 시 위 기본값.
- 스캔 규칙: 폴더의 `*.csv`만(파일). `processed/`·`failed/`·`.backup/`·하위 월폴더는 제외.
  단 main은 월폴더(`2026-05/main-2026-05.csv`) 구조이므로 **재귀로 `main-*.csv` glob**.

### 2.1 CSV 포맷 (실데이터 기준)

```
# Capture-YYYY-MM-DD.csv
tradeDate,stockCode,_종목명,tradeTime,_명령어 옵션,line_TARGET
2026-05-27,'009150,삼성전기,15:30, -pl,1621000
,,,,,                                  ← 빈 구분행
2026-05-27,'000660,SK하이닉스,15:30, -pl,    ← line_TARGET 빈 값

# main-YYYY-MM.csv (BOM 있음)
tradeDate,stockCode,_종목명,tradeTime,_명령어 옵션,line_TARGET,skipReason,entryType,themeRank,themeStrength,dailyChart,result,_done
2026-05-11,'000990,DB하이텍,09:04, -pl,172000,✅,분봉 재돌파(S-V) | 분봉 재돌파(L-1),후발(강),💯,신고가(S),❌,☑️
2026-05-11,'009540,HD한국조선해양,, -pl,487500,...    ← tradeTime 비어있음(타점 없음)
```

공통 처리:
- `stockCode`: 선두 `'`(엑셀 텍스트가드) 제거 + trim → `009150`. (batch 파서가 `.replace(/^'/,"")` 사용)
- 빈 구분행(`,,,,,` 전 컬럼 공백) skip. `stockCode`/`tradeDate` 없으면 skip.
- `_명령어 옵션`(`-pl`)은 **무시**(저장 안 함).
- `tradeDate`는 CSV 컬럼에서 읽음(파일명 의존 X). 포맷 `YYYY-MM-DD`.
- BOM(`﻿`) 제거(papaparse `header:true` 사용 시에도 첫 헤더 키에 BOM 붙을 수 있어 strip).

---

## 3. data-core 작업 (스키마 + 마이그레이션 + 리포지토리)

### 3.1 `src/schema/review.ts` (신규) — `src/schema/index.ts`에서 export

```ts
// pgTable = market.ts의 pgTableCreator 재사용
review_target
  id            bigserial PK
  stockCode     varchar(10) notNull
  tradeDate     date notNull
  stockName     varchar(100)
  lineTargets   jsonb $type<number[]> notNull default []
  sourceFile    varchar(200)          // 추적용(어느 캡처/원장에서 왔나)
  createdAt / updatedAt timestamp notNull defaultNow
  UNIQUE(stockCode, tradeDate)  uq_review_target_code_date
  index(tradeDate)

review_point
  id            bigserial PK          // = reviewId
  reviewTargetId bigint notNull references review_target.id onDelete cascade
  tradeTime     time notNull
  payloadJson   jsonb $type<Record<string, string|string[]>> notNull default {}
  createdAt / updatedAt timestamp notNull defaultNow
  UNIQUE(reviewTargetId, tradeTime)  uq_review_point_target_time
  index(reviewTargetId)
```

- **stocks FK 안 검(varchar만).** chart-review-target/main 종목이 stocks에 없을 수도 있어
  FK를 걸면 인제스트가 깨진다. 표시는 stockName 캐시로 충분. (차트는 candle 유무에 따로 의존.)
- 마이그레이션: `pnpm --filter @trade-data-manager/data-core db:generate` → `db:migrate`.
  drizzle 산출물은 `packages/data-core/drizzle/`에 생성.

### 3.2 `src/repositories/review.repository.ts` (신규) — index export

```ts
type ReviewTargetInsert = { stockCode; tradeDate; stockName?; lineTargets: number[]; sourceFile?; }
type ReviewPointSeed    = { tradeTime: string; payloadJson: Record<string, string|string[]>; }

// Capture 용: 대량 upsert (point 무관)
upsertReviewTargets(db, rows: ReviewTargetInsert[]): Promise<void>
  // onConflict(stockCode, tradeDate) do update set stockName, lineTargets, sourceFile, updatedAt

// main 용: target 보장 후 id 반환
getOrCreateReviewTargetId(db, t: ReviewTargetInsert): Promise<bigint>
  // upsert ... returning id  (있으면 갱신+id, 없으면 생성+id)

// main 용: 없을 때만 삽입 (기존 point의 payload 보존)
insertReviewPointIfAbsent(db, p: { reviewTargetId: bigint } & ReviewPointSeed): Promise<void>
  // onConflict(reviewTargetId, tradeTime) DO NOTHING
```

- **`insertReviewPointIfAbsent` = 존재 시 건드리지 않음**(§6 보존 규칙). main 백필은 *시드*일 뿐,
  이후 payload의 SSOT는 앱(Phase 5).

---

## 4. 신규 CLI 앱 `apps/review-ingest` (feature-processor 미러)

### 4.1 스캐폴드 (feature-processor 복제 후 수정)
```
package.json   name @trade-data-manager/review-ingest, "type":"module"
               scripts: dev "tsx src/index.ts", build "tsc", type-check, start
               deps: @trade-data-manager/data-core(workspace:*), commander, papaparse,
                     dotenv, drizzle-orm, pg
               dev:  @trade-data-manager/tsconfig, @types/node, @types/pg, @types/papaparse,
                     tsx, typescript, rimraf, vitest
src/index.ts        commander 엔트리 (dotenv ../../.env, getDb, command 등록, parseAsync)
src/repository/db.ts getDb/closeDb (feature-processor 복제. 별도 프로세스라 풀 변수 충돌 무관)
src/logger.ts        복제
src/parseCapture.ts  순수: csv content → ReviewTargetInsert[]
src/parseMain.ts     순수: csv content → { targets: ReviewTargetInsert[]; points: Array<{key,(target참조),seed}> }
src/ingestCapture.ts processFolder(dir): scan→parse→upsertReviewTargets→processed 이동
src/ingestMain.ts    processFiles(dir): recursive main-*.csv→parse→getOrCreateTarget+insertPointIfAbsent (이동 X)
src/__tests__/parse.test.ts  파서 단위테스트
```

### 4.2 commander 명령
```
review-ingest capture   [--dir <path>]    # Capture 인박스 → review_target, processed 이동
review-ingest main      [--dir <path>]    # main 원장 → review_target + review_point(payload)
review-ingest all                          # capture 먼저, 그다음 main (target 겹치면 main이 최신)
```
실행 예: `pnpm --filter @trade-data-manager/review-ingest dev all`

---

## 5. 파싱 규칙 (순수 함수, 테스트 대상)

### 5.1 공통
- `parseStockCode(raw)`: `raw.trim().replace(/^'/, "")`.
- `parseLineTargets(raw)`: 빈→`[]`. `raw.split("|").map(s=>Number(s.trim().replace(/,/g,""))).filter(n=>Number.isFinite(n))`.
  예 `"9010 | 9450"`→`[9010,9450]`, `"172000"`→`[172000]`, `""`→`[]`.
- `parseTradeTime(raw)`: 빈→null(타점 없음). `"09:04"`→`"09:04:00"`(또는 그대로, Postgres time 허용).

### 5.2 Capture → ReviewTargetInsert[]
- 행마다: stockCode, tradeDate, stockName(`_종목명`), lineTargets(parseLineTargets), sourceFile=파일명.
- tradeTime은 **무시**(15:30 placeholder). Capture는 target만.

### 5.3 main → targets + points
- 행마다 target upsert 입력 1건(stockCode/tradeDate/stockName/lineTargets/sourceFile).
- `tradeTime` 비어있으면(PASS·미입력) **point 없음**(target만). 있으면 point 1건 생성:
  - `tradeTime` = parseTradeTime
  - `payloadJson` = **payload 컬럼 자동 수집**(아래)

### 5.4 payloadJson 수집 (헤더 그대로, 자동)
- **제외 컬럼**(identity/meta): `tradeDate, stockCode, tradeTime, line_TARGET, _종목명, _명령어 옵션`.
- 그 외 모든 컬럼 → payload (키 = **CSV 헤더 문자열 그대로**: `skipReason, entryType, themeRank,
  themeStrength, dailyChart, result, _done` …). 새 수동 컬럼이 생겨도 자동 포함(설정 불필요).
- 값 규칙: trim 후 **빈 값이면 키 자체 생략**. `' | '` 포함이면 배열로 분해
  (`"분봉 재돌파(S-V) | 분봉 재돌파(L-1)"`→`["분봉 재돌파(S-V)","분봉 재돌파(L-1)"]`), 아니면 문자열.

---

## 6. 멱등 / 보존 규칙 (★ 재실행·재인제스트 안전)

```
review_target  : upsert (stockCode, tradeDate) — lineTargets/stockName/sourceFile/updatedAt 갱신
review_point   : insert-if-absent (reviewTargetId, tradeTime) — 있으면 DO NOTHING
Capture 파일    : 성공 시 processed/ 이동 → 다음 실행에서 재처리 안 됨
main 파일       : 이동 안 함 → 매 실행 재읽기, 그러나 point는 없을 때만 삽입(멱등)
```

- **앱 입력(tradeTime/payload) 보존이 최우선.** main 재인제스트가 기존 point의 payload를
  덮지 않는다(DO NOTHING). main 백필은 "최초 시드", 이후 SSOT는 DB/앱.
- target 겹침(Capture vs main) 시: 마지막 writer 승. `all`은 capture→main 순이라 main 값이 남음.

---

## 7. 범위 밖 (Phase 3에서 안 함)

```
- Google Sheet 생성(review_* → 시트)           → Phase 4
- 앱 읽기 / tradeTime·payload 앱 입력 → DB 저장  → Phase 5
- 대표 테마 산출 (시트 생성 시점 결정)            → Phase 4
- 종목/캔들 sync (batch 책임. 없으면 차트만 빔)
- chart-review Next.js 앱 코드 변경 (이번엔 안 건드림)
- payload 키 정규화/검증 (헤더 그대로 저장)
- main 파일 이동/아카이브
```

---

## 8. 완료 조건 (Acceptance)

```
1.  data-core: review_target/review_point 마이그레이션 생성·적용, type-check 통과
2.  review-ingest: type-check + vitest 통과
    - parseLineTargets: ""→[], "172000"→[172000], "9010 | 9450"→[9010,9450]
    - parseStockCode: "'009150"→"009150"
    - Capture 파싱: 빈 구분행 skip, tradeTime 무시
    - main 파싱: 빈 tradeTime → point 없음 / 있으면 point 생성
    - payload 수집: 제외 컬럼 빼고 헤더 그대로, 빈 값 키 생략, ' | ' 배열화
3.  `review-ingest capture` 실행 → Capture-*.csv 가 review_target 으로 upsert, processed/ 이동
4.  `review-ingest main` 실행 → main-*.csv 의 tradeTime 행이 review_point 로,
    payloadJson 에 수동 컬럼이 헤더명 그대로 채워짐 (' | ' 는 배열)
5.  한 (stockCode,tradeDate)에 tradeTime 여러 개가 각각 review_point 로 들어감
6.  재실행 시: Capture 는 처리 대상 없음(이동됨), main 은 기존 point 미변경(DO NOTHING)
7.  stocks 에 없는 종목이어도 인제스트 실패 안 함 (FK 없음)
8.  reviewId = review_point.id 로 타점 1:1 식별 가능
```

---

## 9. 구현 순서 권장

```
1. data-core: schema/review.ts + index export → db:generate → db:migrate → type-check
2. data-core: repositories/review.repository.ts (upsertReviewTargets / getOrCreateReviewTargetId /
   insertReviewPointIfAbsent) + index export → type-check
3. apps/review-ingest 스캐폴드 (feature-processor 복제: package.json/tsconfig/db.ts/logger.ts) + pnpm install
4. parseCapture.ts / parseMain.ts (+ parseLineTargets/parseStockCode/payload 수집) + vitest 먼저
5. ingestCapture.ts (scan→upsert→processed 이동) / ingestMain.ts (recursive→getOrCreate+insertIfAbsent)
6. index.ts commander (capture / main / all) + dotenv
7. 실행: `pnpm --filter @trade-data-manager/review-ingest dev all` → DB 확인(review_target/point) /
   Capture processed 이동 확인 / main 재실행 멱등 확인
```

---

## 10. 다음 단계 미리보기 (참고)

```
Phase 4  review_target(+대표테마) → Google Sheet 단일 탭 덮어쓰기 (서비스계정 write)
         · point 0개 target도 "tradeTime 입력 대상" 행으로 출력
Phase 5  앱: Sheet 읽기 + line_TARGET 가격선 렌더 + tradeTime/payload 앱 입력 → DB 저장
         (insertReviewPoint / updatePayload 리포지토리 추가)
```
