# chart-review 4차 명세 — DB → Google Sheet 내보내기 (생성)

> 선행: SPEC-phase3.md(CSV → review_target/review_point 적재) 완료.
> 이 문서는 **DB의 리뷰 대상/타점을 Google Sheet 한 탭으로 내보내는(export) 백엔드 파이프라인**이다.
> "쓰기를 읽기보다 먼저" 원칙에 따라, Phase 5(앱이 Sheet 읽기 + tradeTime 입력) **직전 단계**다.
>
> chart-review 앱(Next.js)은 이 단계에서 **건드리지 않는다.** 작업 대상은
> `packages/data-core`(export 쿼리 + 컬럼 매니페스트) + **기존 CLI 앱 `apps/review-ingest`** 에
> `export` 커맨드 추가다. 명세 문서를 chart-review 폴더에 두는 건 도메인 묶음일 뿐.

---

## 0. 목표 한 줄

DB의 `review_target`(+ `review_point`, + `minute_candle_features`)를 한 장의 Google Sheet 탭으로
멱등 내보낸다. 시트는 **DB에서 재생성되는 일회용 작업 큐**이고, DB가 단일 진실원(SSOT)이다.
feature-processor / review-ingest 처럼 **CLI로 실행**한다.

---

## 1. 핵심 결정 (왜 이 구조인가)

- **시트는 DB의 스냅샷.** 시트→DB 역인제스트(track C)는 별도 단계. Phase 4는 **export 단방향만** 한다.
  업데이트는 시트를 다시 export 하면 통째로 덮어쓴다(멱등). 충돌·머지 로직 없음.
- **행(row) 단위 = 타깃 + 타점 혼합.** (사용자 확정)
  - `review_point` 가 있는 타깃 → **타점마다 1행** (tradeTime/payload/feature 채움).
  - `review_point` 가 없는 타깃(캡처 출신) → **tradeTime 빈 행 1줄** (앱에서 시간 입력할 자리).
- **저장 경로 = DB 직접.** (사용자 확정) 앱은 tradeTime·수동값을 DB로 저장(track C).
  시트의 `m_*` 컬럼은 **시트→DB 동기화(track C)** 로 반영, **생성은 앱에서 → export**, **삭제는 앱에서**.
  → 이 분담은 Phase 4 범위 밖이지만, export 컬럼 계약이 그 전제를 만족하도록 설계한다(5절).
- **컬럼 = 매니페스트 + 데이터 기반 혼합.**
  - 고정 식별 / feature 컬럼은 **매니페스트(설정 파일)** 로 SSOT 관리 → 무슨 컬럼을 낼지 한 곳에서 조절.
    (사용자: "어떤 컬럼이 나올지 설정하는 파일" 요구 반영)
  - 수동(`m_*`) 컬럼은 `payloadJson` 키에서 **데이터 기반**으로 생성 → 새 수동 항목이 늘어도 자동 반영.
  - "필요 없는 컬럼은 시트에서 사람이 지운다"가 전제(사용자). export는 풍부하게 내고, 정리는 시트에서.
- **로직은 data-core, I/O는 CLI.** export 쿼리·행 조립·매니페스트는 data-core(앱/CLI 공용),
  Google Sheets API 호출은 얇은 CLI 커맨드에 둔다. 추후 앱 "내보내기 버튼"이 같은 data-core 함수 재사용.

---

## 2. 추가 의존성 (apps/review-ingest/package.json)

```jsonc
"dependencies": {
  "googleapis": "^144.0.0"   // 신규. 공식 클라이언트. spreadsheets.values.update/clear 만 사용.
  // 기존 deps 전부 유지
}
```

> data-core 에는 googleapis를 넣지 않는다(순수 쿼리/조립만). Sheets 클라이언트는 CLI에만.

---

## 3. 환경 변수 (루트 `.env`)

```
GOOGLE_SHEETS_ID=1EVZKXWclWVKZ_MKXOsf3-PPqEJe1zdrZpDK29erVILw   # 스프레드시트 ID (URL /d/ ~ /edit 사이)
GOOGLE_SHEETS_TAB=review                                        # 내보낼 탭 이름 (없으면 기본값 "review")
GOOGLE_SERVICE_ACCOUNT_EMAIL=<서비스계정 이메일>                  # JSON의 client_email
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private key, \n 이스케이프된 1줄>  # JSON의 private_key
```

- **인증 = 서비스 계정.** 시트를 그 서비스계정 이메일에 **"편집자"** 로 공유해야 export(쓰기)가 된다.
  scope = `https://www.googleapis.com/auth/spreadsheets` (read-only 아님).
- private key는 .env에 한 줄로 들어오므로 코드에서 `.replace(/\\n/g, "\n")` 로 개행 복원 **필수**.
- (대안) JSON 키 파일을 프로젝트 루트에 두고 gitignore 처리하는 방식도 지원 가능:
  `GOOGLE_APPLICATION_CREDENTIALS=<json 경로>` 가 있으면 `GoogleAuth({ keyFile })` 로 인증.
  EMAIL/PRIVATE_KEY 2개 방식과 둘 중 하나만 있으면 됨(코드에서 우선순위: keyFile → email/key).
- 위 변수가 **하나라도 비면** export 커맨드는 명확한 에러로 중단(조용히 넘어가지 않는다).
- **나는 .env / JSON 키 값 자체는 읽지 않는다 — 변수 이름·경로만 합의.**

---

## 4. 데이터 소스 & 조인

```
review_target            (전부; 종목+날짜+lineTargets+stockName)
  └─ LEFT JOIN review_point   (있으면 타점마다 1행, 없으면 NULL 1행)
        └─ minute_candle_features  (review_point의 (stockCode,tradeDate,tradeTime) 로 조인)
```

- feature 조인은 `findFeaturesAt(db, { stockCodes, tradeDate, tradeTime })`(이미 존재) 를 활용하거나,
  export 전용으로 **타점 키 묶음을 한 번에 조회**하는 쿼리를 새로 둔다(N+1 회피). 데이터 규모 작음(수백 행).
- tradeTime 빈 행(캡처 타깃)은 feature 조인 대상이 없으므로 feature 컬럼 전부 공백.
- 정렬: `tradeDate DESC, stockCode ASC, tradeTime ASC` (최근 날짜가 위로).

---

## 5. 컬럼 계약 (시트 헤더 — Phase 5 reader 와 짝)

Phase 5 reader 는 헤더 이름으로 3분류한다: **고정 식별 / `m_*`=수동 / 그 외=feature(읽기전용)**.
export 는 그 규약에 맞춰 헤더를 낸다.

### 5.1 고정 식별 컬럼 (앞쪽, 매니페스트)

| 헤더 | 소스 | 비고 |
|---|---|---|
| `reviewId` | `review_point.id` (문자열) | 타점 없는 행은 **공백** (앱이 tradeTime 입력 시 point 생성→다음 export에 채워짐) |
| `stockCode` | `review_target.stock_code` | 필수 |
| `stockName` | `review_target.stock_name` | |
| `tradeDate` | `review_target.trade_date` (`YYYY-MM-DD`) | 필수 |
| `tradeTime` | `review_point.trade_time` → `HH:MM` | 타점 없는 행은 **공백** (= 앱 입력 대상) |
| `lineTargets` | `review_target.line_targets` (number[]) | `" | "` 로 join. 가격선 렌더용 |

> themeId/themeName 은 review 스키마에 없으므로 **내지 않는다**(앱에선 optional이라 무탈).

### 5.2 feature 컬럼 (가운데, 매니페스트로 on/off·순서 제어)

`minute_candle_features` 의 TS 컬럼명을 **그대로 헤더로** 쓴다(=Phase 5에서 features로 떨어짐):

```
등락률    : changeRate5m, changeRate10m, changeRate30m, changeRate60m, changeRate120m
고가      : dayHighRate, dayHighTime
pullback : pullbackFromDayHigh, minutesSinceDayHigh
거래대금  : tradingAmount, cumulativeTradingAmount
구간횟수  : cnt20Amt, cnt30Amt, cnt40Amt, cnt50Amt, cnt60Amt, cnt70Amt, cnt80Amt, cnt90Amt,
           cnt100Amt, cnt120Amt, cnt140Amt, cnt160Amt, cnt180Amt, cnt200Amt, cnt250Amt, cnt300Amt
(raw)    : closeRateKrx, closeRateNxt   ← 매니페스트에서 기본 off 가능
```

- 매니페스트(`reviewSheetColumns.ts`)는 **순서 있는 배열**로 어떤 feature를 낼지 정의.
  배열에서 빼면 시트에서 사라짐 → "설정 파일" 요구 충족. 기본값은 위 전체(raw 제외 권장).
- 값 포맷: numeric 은 DB 문자열 그대로(반올림/단위변환 안 함), null/없음은 빈 문자열.

### 5.3 수동 컬럼 `m_*` (뒤쪽, 데이터 기반)

- export 대상 **모든 타점의 `payloadJson` 키 합집합**을 모아 각 키를 `m_{key}` 헤더로 낸다.
  - 선행 underscore 정리: `_done` → `m_done` (키 앞 `_` 제거 후 prefix). 매핑은 순수함수로 테스트.
  - 현재 실데이터 키: `skipReason, entryType, themeRank, themeStrength, dailyChart, result, _done`
    → `m_skipReason, m_entryType, m_themeRank, m_themeStrength, m_dailyChart, m_result, m_done`
  - 배열 값(`["A","B"]`)은 `" | "` 로 join (CSV 입력 규약과 동일 왕복).
- 타점 없는 행(캡처 타깃)은 `m_*` 전부 공백 — 앱/사람이 채울 자리.
- `m_*` 가 시트→DB 저장 대상(track C)이라는 게 핵심. export는 **기존 payload를 왕복 보존**해서
  사람이 시트에서 이어 적을 수 있게 한다.

### 5.4 행/헤더 레이아웃

- 1행 = 헤더, 2행부터 = 데이터. (Phase 5 reader 계약과 일치)
- 컬럼 순서: `[고정] + [feature(매니페스트 순)] + [m_*(정렬된 키)]`.

---

## 6. 신규/수정 파일

### 6.1 `packages/data-core/src/review-sheet/columns.ts` (매니페스트, 순수)

```ts
export const FIXED_COLUMNS = ["reviewId","stockCode","stockName","tradeDate","tradeTime","lineTargets"] as const;
export const FEATURE_COLUMNS: string[] = [ /* 5.2 기본 목록 (raw 제외) */ ];
// payload key → m_ 헤더 변환 (순수)
export function toManualHeader(key: string): string;   // "_done" → "m_done"
```

### 6.2 `packages/data-core/src/review-sheet/buildSheetMatrix.ts` (순수, 테스트 대상)

```ts
// DB에서 읽은 정규화 행 입력 → string[][] (헤더 포함) 출력. 부수효과 없음.
export type ReviewExportRow = {
  reviewId: string | null;
  stockCode: string; stockName: string | null;
  tradeDate: string; tradeTime: string | null;
  lineTargets: number[];
  features: Record<string, string | null>;   // minute feature TS키 → 값
  payload: Record<string, string | string[]>; // payloadJson
};
export function buildSheetMatrix(rows: ReviewExportRow[]): string[][];
```

- m_ 컬럼 합집합 산출, 고정/feature/m_ 순서로 헤더·행 직렬화, 배열 `" | "` join, null→"".
- **vitest 테스트**: 헤더 순서 / m_ 키 합집합·정렬 / `_done`→`m_done` / 배열 join /
  tradeTime·tradeTime없음 / feature 누락(공백) / lineTargets join.

### 6.3 `packages/data-core/src/repositories/review.repository.ts` (확장)

```ts
// export용: 타깃 LEFT JOIN 타점, 타점은 feature까지 채운 ReviewExportRow[] 반환.
export async function findReviewExportRows(
  db: Database,
  opts?: { since?: string },   // tradeDate >= since (선택). 기본 전체.
): Promise<ReviewExportRow[]>;
```

- 타깃 전부 조회 → 타점 조회 → 타점 (code,date,time) 묶음으로 feature 일괄 조회(Map) → 조립.
- 타점 0개 타깃은 tradeTime=null 행 1개로.

### 6.4 `apps/review-ingest/src/sheetClient.ts` (I/O, 얇게)

```ts
// googleapis 인증 + 탭 clear 후 전체 쓰기. (멱등 덮어쓰기)
export async function writeSheet(matrix: string[][]): Promise<void>;
```

- 인증: `GOOGLE_APPLICATION_CREDENTIALS`(keyFile) 우선, 없으면 EMAIL+PRIVATE_KEY(\n 복원).
  scope `…/auth/spreadsheets`.
- `spreadsheets.values.clear({ range: '<tab>' })` → `values.update({ range:'<tab>!A1', valueInputOption:'RAW', requestBody:{ values: matrix } })`.
- env 누락 시 명확한 에러 throw.

### 6.5 `apps/review-ingest/src/index.ts` (커맨드 추가)

```ts
program.command("export")
  .description("DB의 review_target/point를 Google Sheet로 내보내기 (탭 덮어쓰기)")
  .option("--since <date>", "이 날짜 이후(tradeDate>=)만 export")
  .action(async (opts) => runSafely(async () => {
    const rows = await findReviewExportRows(db, { since: opts.since });
    const matrix = buildSheetMatrix(rows);
    await writeSheet(matrix);
    logger.info(`export 완료: ${rows.length} rows, ${matrix[0]?.length ?? 0} cols`);
  }));
```

> `apps/review-ingest/src/paths.ts` / `repository/db.ts` / `logger.ts` 등 기존 인프라 재사용.

---

## 7. 범위 밖 (이번엔 안 함)

```
- 시트 → DB 역인제스트 / m_* 저장 (track C, Phase 5+)
- 앱의 "내보내기 버튼" UI (data-core 함수만 준비; 배선은 후순위)
- 타점 삭제 동기화 (앱에서 처리; export는 현재 DB 상태 스냅샷만)
- 다중 탭 / 종목별 분리 시트 / 서식·색상·필터뷰
- Sheets 변경 실시간 구독, 증분 업데이트 (매번 통째 덮어쓰기로 충분)
- reviewId 외 join key 합성 (point.id 그대로 사용)
```

---

## 8. 완료 조건 (Acceptance)

```
1.  pnpm --filter @trade-data-manager/data-core type-check 통과
2.  pnpm --filter @trade-data-manager/review-ingest type-check / build 통과
3.  buildSheetMatrix vitest 통과 (6.2 케이스: 헤더순서/ m_합집합·_done변환 / 배열join /
    tradeTime유무 / feature공백 / lineTargets join)
4.  review-ingest export 실행 시 GOOGLE_SHEETS_ID 탭이 [헤더 + 데이터]로 통째 덮어써짐 (멱등:
    두 번 돌려도 결과 동일)
5.  타점 있는 행 = tradeTime/payload(m_*)/feature 채움, 타점 없는 캡처 타깃 = tradeTime·m_* 공백 1행
6.  feature 컬럼이 minute_candle_features 와 (code,date,time) 으로 정확히 조인됨 (없으면 공백, 크래시 X)
7.  env(서비스계정/시트ID) 누락 시 명확한 에러로 중단 (조용한 skip 금지)
8.  컬럼 구성이 매니페스트(reviewSheetColumns) 한 곳에서 제어됨 (feature 배열 수정 = 시트 컬럼 변경)
9.  data-core 에 googleapis 의존성이 새지 않음 (Sheets I/O는 CLI에만)
```

---

## 9. 구현 순서 권장

```
1. data-core: review-sheet/columns.ts (매니페스트 + toManualHeader)
2. data-core: review-sheet/buildSheetMatrix.ts (순수) + vitest 부터
3. data-core: findReviewExportRows (타깃+타점+feature 조립) export
4. review-ingest: googleapis 추가 + pnpm install
5. review-ingest: sheetClient.ts (인증 + clear + update)
6. review-ingest: index.ts 에 export 커맨드 배선
7. env 미설정으로 type-check/build/test 확인 (Sheets 호출 없는 경로)
8. (creds 있으면) 실제 시트로 수동 export → 헤더 3분류·feature 조인·m_ 왕복 눈으로 확인
```

---

## 10. 다음 트랙 미리보기 (참고, 본 명세 범위 아님)

```
Phase 5 (개정) : 앱이 이 시트를 읽어 리스트 렌더 + 차트. tradeTime 빈 행도 "입력 대상"으로 노출
                 (기존 phase5 초안의 "빈 tradeTime 행 skip" 규칙은 이 export 전제에 맞춰 개정).
track C        : 시트 m_* → DB 저장(reviewId=point.id 덮어쓰기), tradeTime 입력 시 review_point 생성,
                 타점 삭제는 앱에서. 시트는 작업 후 다시 export 하면 DB 기준으로 재정렬.
```
