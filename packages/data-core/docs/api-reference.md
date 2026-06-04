# data-core API 레퍼런스

`packages/data-core`는 모든 앱이 공유하는 데이터 계층입니다. 이 문서는 공개 export를 기준으로 함수/쿼리/계산기가 어떤 입력을 받고 어떤 값을 만들거나 DB에 반영하는지 예시로 설명합니다.

## 1. 공개 진입점

```ts
import {
  createDb,
  saveStock,
  findReviewLoadTargets,
  getThemeBundle,
  MINUTE_CALCULATORS,
  buildSheetMatrix,
} from "@trade-data-manager/data-core";
```

`src/index.ts`는 다음을 export합니다.

| 묶음 | 내용 |
|------|------|
| `db` | `createDb`, `Database` 타입 |
| `schema` | Drizzle table과 infer 타입 |
| `repositories` | upsert/read/merge 함수 |
| `queries` | 앱 화면용 묶음 query |
| `market-feature` | 피처 계산기와 헬퍼 |
| `review-sheet` | Sheet export matrix 생성 |

## 2. DB 팩토리

### `createDb(pool)`

입력:

```ts
import { Pool } from "pg";
import { createDb } from "@trade-data-manager/data-core";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = createDb(pool);
```

출력:

```ts
// Drizzle database 객체
db.query.stocks.findFirst(...)
db.insert(...)
```

설명: `pg.Pool`을 받아 schema가 연결된 Drizzle DB 인스턴스를 만듭니다. 앱별 `getDb()`는 이 함수를 감싸 singleton pool을 관리합니다.

## 3. 스키마 지도

### Market tables

| table export | DB 테이블 | 핵심 키 | 설명 |
|--------------|-----------|---------|------|
| `stocks` | `stocks` | `stock_code` PK | 종목 마스터 |
| `themes` | `themes` | `theme_name` unique | 테마 마스터 |
| `dailyCandles` | `daily_candles` | `(trade_date, stock_code)` unique | KRX/NXT 일봉을 한 row에 보관 |
| `minuteCandles` | `minute_candles` | `(stock_code, trade_date, trade_time)` unique | 1분봉 |
| `dailyThemeMappings` | `daily_theme_mappings` | `(theme_id, daily_candle_id)` unique | 특정 날짜 일봉과 테마 연결 |
| `intradayProgramAmount` | `intraday_program_amounts` | `(daily_candle_id, trade_time)` unique | 프로그램 매매 동향 |

### Feature tables

| table export | DB 테이블 | 핵심 키 | 설명 |
|--------------|-----------|---------|------|
| `minuteCandleFeatures` | `minute_candle_features` | `minute_candle_id` unique | 분봉별 계산 지표 |

`minute_candle_features`의 지표 컬럼은 `MINUTE_CALCULATORS`가 반환하는 `columns()` 결과로 생성됩니다.

### Review tables

| table export | DB 테이블 | 핵심 키 | 설명 |
|--------------|-----------|---------|------|
| `reviewTargets` | `review_target` | `(stock_code, trade_date)` unique | 복기 대상 종목/날짜 |
| `reviewPoints` | `review_point` | `(review_target_id, trade_time)` unique | 타점 1건 |
| `reviewManualKeys` | `review_manual_key` | `key` unique | `m_` 수동 입력 컬럼 레지스트리 |

## 4. Repository: 공통 helper

### `buildConflictUpdateSet(table, excludeKeys?)`

입력:

```ts
buildConflictUpdateSet(stocks, ["stockCode"]);
```

출력 개념:

```ts
{
  stockName: sql`EXCLUDED.stock_name`,
  marketName: sql`EXCLUDED.market_name`,
  isNxtAvailable: sql`EXCLUDED.is_nxt_available`,
  regDay: sql`EXCLUDED.reg_day`
}
```

설명: `ON CONFLICT DO UPDATE SET`에 넣을 객체를 자동 생성합니다. `excludeKeys`에 넣은 PK/unique 컬럼은 업데이트하지 않습니다. 컬럼 키가 `updatedAt`이면 `NOW()`를 씁니다.

## 5. Repository: stock

### `saveStock(db, data)`

입력:

```ts
await saveStock(db, {
  stockCode: "005930",
  stockName: "삼성전자",
  marketName: "KOSPI",
  isNxtAvailable: true,
  regDay: "1975-06-11",
});
```

DB 효과:

```text
stocks(stock_code="005930")가 없으면 insert.
이미 있으면 stock_name, market_name, is_nxt_available, reg_day 갱신.
```

반환: `void`

### `findStockByCode(db, { stockCode })`

입력:

```ts
await findStockByCode(db, { stockCode: "005930" });
```

출력 예시:

```ts
{
  stockCode: "005930",
  stockName: "삼성전자",
  marketName: "KOSPI",
  isNxtAvailable: true,
  regDay: "1975-06-11"
}
```

없으면 `undefined`입니다.

### `findStocksByCodes(db, { stockCodes })`

입력:

```ts
await findStocksByCodes(db, { stockCodes: ["005930", "000660"] });
```

출력 예시:

```ts
[
  { stockCode: "005930", stockName: "삼성전자", ... },
  { stockCode: "000660", stockName: "SK하이닉스", ... }
]
```

`stockCodes`가 빈 배열이면 DB를 치지 않고 `[]`를 반환합니다.

### `findStocksMapByCodes(db, { stockCodes })`

입력:

```ts
const map = await findStocksMapByCodes(db, { stockCodes: ["005930"] });
```

출력 예시:

```ts
Map([
  ["005930", { stockCode: "005930", stockName: "삼성전자", ... }]
])
```

용도: batch/chart-capture/theme-bundle에서 in-memory join을 할 때 씁니다.

## 6. Repository: daily candle

### `saveDailyCandles(db, rows)`

입력:

```ts
await saveDailyCandles(db, [
  {
    tradeDate: "2026-05-27",
    stockCode: "005930",
    openKrx: "75000",
    highKrx: "77000",
    lowKrx: "74500",
    closeKrx: "76500",
    openNxt: "75100",
    highNxt: "77100",
    lowNxt: "74600",
    closeNxt: "76600",
    tradingVolumeKrx: 12000000n,
    tradingAmountKrx: "920000000000",
    tradingVolumeNxt: 3000000n,
    tradingAmountNxt: "230000000000",
    prevCloseKrx: "74000",
    prevCloseNxt: "74100",
    changeValueKrx: "2500",
    changeValueNxt: "2500",
    marketCap: null,
    listedShares: null,
    floatingShares: null,
  }
]);
```

DB 효과:

```text
daily_candles(trade_date="2026-05-27", stock_code="005930") upsert.
id/tradeDate/stockCode는 갱신 제외, 나머지는 EXCLUDED 값으로 갱신.
```

반환: `void`. 빈 배열이면 아무것도 하지 않습니다.

### `findDailyCandleByStockAndDate(db, { stockCode, tradeDate })`

입력:

```ts
await findDailyCandleByStockAndDate(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
{
  id: 123n,
  prevCloseKrx: "74000",
  prevCloseNxt: "74100"
}
```

용도: 분봉 저장 전에 `daily_candle_id` FK와 전일 종가를 찾습니다.

### `findRecentDailyCandlesByCodes(db, { stockCodes, tradeDate, lookback })`

입력:

```ts
await findRecentDailyCandlesByCodes(db, {
  stockCodes: ["005930", "000660"],
  tradeDate: "2026-05-27",
  lookback: 3,
});
```

출력 예시:

```ts
Map([
  ["005930", [
    { tradeDate: "2026-05-25", stockCode: "005930", closeKrx: "73500", ... },
    { tradeDate: "2026-05-26", stockCode: "005930", closeKrx: "74000", ... },
    { tradeDate: "2026-05-27", stockCode: "005930", closeKrx: "76500", ... },
  ]],
  ["000660", [ ... ]]
])
```

각 종목별로 `tradeDate <= 기준일`인 최근 N개를 가져오고, 반환 배열은 오래된 날짜부터 최신 날짜까지 ASC입니다.

## 7. Repository: minute candle

### `saveMinuteCandles(db, rows)`

입력:

```ts
await saveMinuteCandles(db, [
  {
    dailyCandleId: 123n,
    tradeDate: "2026-05-27",
    stockCode: "005930",
    tradeTime: "09:00:00",
    unixTimestamp: 1811376000,
    open: "75000",
    high: "75200",
    low: "74900",
    close: "75100",
    tradingVolume: 50000n,
    tradingAmount: "3755000000",
    accumulatedTradingAmount: "3755000000",
    openRateKrx: "1.3514",
    highRateKrx: "1.6216",
    lowRateKrx: "1.2162",
    closeRateKrx: "1.4865",
    openRateNxt: "1.2146",
    highRateNxt: "1.4845",
    lowRateNxt: "1.0796",
    closeRateNxt: "1.3495",
  }
]);
```

DB 효과:

```text
minute_candles(stock_code, trade_date, trade_time) 기준 upsert.
```

반환: `void`. 빈 배열이면 no-op입니다.

### `findDistinctStockCodesByDate(db, { tradeDate })`

입력:

```ts
await findDistinctStockCodesByDate(db, { tradeDate: "2026-05-27" });
```

출력 예시:

```ts
["005930", "000660", "035420"]
```

용도: feature-processor가 특정 거래일에 처리할 종목 목록을 구합니다.

### `findMinuteCandlesByStockAndDate(db, { stockCode, tradeDate })`

입력:

```ts
await findMinuteCandlesByStockAndDate(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
[
  { tradeTime: "09:00:00", close: "75100", closeRateNxt: "1.3495", ... },
  { tradeTime: "09:01:00", close: "75300", closeRateNxt: "1.6194", ... }
]
```

항상 `tradeTime ASC`입니다.

### `findMinuteCandlesByCodesAndDate(db, { stockCodes, tradeDate })`

입력:

```ts
await findMinuteCandlesByCodesAndDate(db, {
  stockCodes: ["005930", "000660"],
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
Map([
  ["005930", [
    { tradeTime: "09:00:00", ... },
    { tradeTime: "09:01:00", ... }
  ]],
  ["000660", [
    { tradeTime: "09:00:00", ... }
  ]]
])
```

용도: chart-review의 테마 번들이 여러 종목 분봉을 한 번에 조립합니다.

## 8. Repository: theme

### `findThemesByStockAndDate(db, { stockCode, tradeDate })`

입력:

```ts
await findThemesByStockAndDate(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
[
  { themeId: 10n, themeName: "반도체" },
  { themeId: 24n, themeName: "AI반도체" }
]
```

내부 흐름:

```text
daily_candles에서 id 조회
  -> daily_theme_mappings에서 theme_id 목록 조회
  -> themes에서 theme row 조회
```

매핑이 없으면 `[]`입니다.

### `findMemberCodesByThemeIds(db, { themeIds, tradeDate, selfCode })`

입력:

```ts
await findMemberCodesByThemeIds(db, {
  themeIds: ["10", "24"],
  tradeDate: "2026-05-27",
  selfCode: "005930",
});
```

출력 예시:

```ts
Map([
  ["10", ["005930", "000660", "042700"]],
  ["24", ["005930", "123456"]]
])
```

`selfCode`는 테마 매핑 결과에 없더라도 항상 포함됩니다.

특수 입력:

```ts
await findMemberCodesByThemeIds(db, {
  themeIds: [],
  tradeDate: "2026-05-27",
  selfCode: "005930",
});
```

출력:

```ts
Map([["", ["005930"]]])
```

### `saveThemeAndReturnId(db, themeName)`

입력:

```ts
const id = await saveThemeAndReturnId(db, "반도체");
```

출력 예시:

```ts
10n
```

DB 효과: `themes.theme_name` 기준 upsert 후 `theme_id`를 반환합니다.

### `deleteThemeMappingsByStockAndDate(db, { stockCode, tradeDate })`

입력:

```ts
await deleteThemeMappingsByStockAndDate(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
});
```

DB 효과:

```text
해당 stock/date의 daily_candle_id를 찾고,
daily_theme_mappings에서 그 daily_candle_id의 모든 매핑 삭제.
```

용도: batch 재실행 때 기존 테마를 교체하기 전에 호출합니다.

### `saveThemeMapping(db, themeId, dailyCandleId)`

입력:

```ts
await saveThemeMapping(db, 10n, 123n);
```

DB 효과:

```text
daily_theme_mappings(theme_id=10, daily_candle_id=123) insert.
이미 있으면 onConflictDoNothing.
```

반환: `void`

## 9. Repository: market feature

### `saveMinuteFeatures(db, rows)`

입력:

```ts
await saveMinuteFeatures(db, [
  {
    minuteCandleId: 1001n,
    dailyCandleId: 123n,
    tradeDate: "2026-05-27",
    stockCode: "005930",
    tradeTime: "09:00:00",
    closeRateKrx: "1.4865",
    closeRateNxt: "1.3495",
    tradingAmount: "3755000000",
    changeRate5m: null,
    dayHighRate: "1.4845",
    dayHighTime: "09:00:00",
    pullbackFromDayHigh: "-0.1350",
    minutesSinceDayHigh: 0,
    cumulativeTradingAmount: "3755000000",
    cnt20Amt: 0,
    cnt30Amt: 1,
    // ...cnt40Amt 등
  }
]);
```

DB 효과:

```text
minute_candle_features(minute_candle_id) 기준 upsert.
500개 단위 chunk로 insert하여 PostgreSQL 파라미터 한계를 피함.
```

반환: `void`

### `findAllTradeDates(db)`

입력:

```ts
await findAllTradeDates(db);
```

출력 예시:

```ts
["2026-05-26", "2026-05-27", "2026-05-28"]
```

`minute_candles`에 존재하는 거래일 전체입니다.

### `findPendingTradeDates(db)`

입력:

```ts
await findPendingTradeDates(db);
```

출력 예시:

```ts
["2026-05-28"]
```

`minute_candles`에는 있지만 `minute_candle_features`가 아직 없는 분봉이 포함된 거래일입니다.

### `findFeaturesByCodesAndDate(db, { stockCodes, tradeDate })`

입력:

```ts
await findFeaturesByCodesAndDate(db, {
  stockCodes: ["005930", "000660"],
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
Map([
  ["005930", [
    { tradeTime: "09:00:00", cumulativeTradingAmount: "3755000000", ... },
    { tradeTime: "09:01:00", cumulativeTradingAmount: "8120000000", ... }
  ]],
  ["000660", [ ... ]]
])
```

용도: chart-review 테마 오버레이에서 누적거래대금 등 feature를 시간별로 붙입니다.

## 10. Repository: review target/point

### `upsertReviewTargets(db, rows)`

입력:

```ts
await upsertReviewTargets(db, [
  {
    stockCode: "005930",
    tradeDate: "2026-05-27",
    stockName: "삼성전자",
    lineTargets: [75000, 77000],
    sourceFile: "capture.csv",
  }
]);
```

DB 효과:

```text
review_target(stock_code, trade_date) 기준 upsert.
stockName, lineTargets, sourceFile, updatedAt 갱신.
```

반환: `void`

### `getOrCreateReviewTargetId(db, target)`

입력:

```ts
const id = await getOrCreateReviewTargetId(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
  stockName: "삼성전자",
  lineTargets: [75000],
  sourceFile: "manual",
});
```

출력 예시:

```ts
456n
```

설명: target을 upsert하고 id를 반환합니다. import 계열에서 target id가 필요할 때 씁니다.

### `insertReviewPointIfAbsent(db, point)`

입력:

```ts
await insertReviewPointIfAbsent(db, {
  reviewTargetId: 456n,
  tradeTime: "09:12:00",
  payloadJson: { result: "watch" },
});
```

DB 효과:

```text
review_point(review_target_id, trade_time)이 없으면 insert.
이미 있으면 아무것도 하지 않음.
```

용도: seed/import에서 기존 타점을 덮어쓰고 싶지 않을 때.

### `upsertReviewPoint(db, input)`

입력:

```ts
await upsertReviewPoint(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
  tradeTime: "09:12",
  payload: {
    result: "good",
    tag: ["breakout", "volume"],
  },
});
```

출력 예시:

```ts
{ id: "789" }
```

DB 효과:

```text
1. review_target(stockCode, tradeDate)가 있어야 함. 없으면 Error.
2. review_point(review_target_id, trade_time) 기준 upsert.
3. 충돌 시 payload_json 전체를 새 payload로 덮어씀.
```

주의: payload merge가 아니라 전체 덮어쓰기입니다. 기존 키를 유지하려면 호출자가 완성된 payload를 보내야 합니다.

### `deleteReviewPointById(db, id)`

입력:

```ts
await deleteReviewPointById(db, 789n);
```

DB 효과:

```text
review_point.id=789 삭제.
```

반환: `void`

### `findReviewLoadTargets(db, opts?)`

입력 1: DB 전체

```ts
await findReviewLoadTargets(db);
```

입력 2: 작업셋 key 제한

```ts
await findReviewLoadTargets(db, {
  keys: [
    { stockCode: "005930", tradeDate: "2026-05-27" },
    { stockCode: "000660", tradeDate: "2026-05-27" },
  ],
});
```

출력 예시:

```ts
[
  {
    stockCode: "005930",
    stockName: "삼성전자",
    tradeDate: "2026-05-27",
    lineTargets: [75000, 77000],
    points: [
      {
        reviewId: "789",
        tradeTime: "09:12:00",
        payload: { result: "good", tag: ["breakout", "volume"] },
        features: {
          changeRate5m: "0.82",
          cumulativeTradingAmount: "120000000000",
          dayHighRate: "12.3000"
        }
      }
    ]
  }
]
```

설명:

- `keys`가 없으면 전체 target을 `tradeDate DESC, stockCode ASC`로 가져옵니다.
- `keys: []`면 `[]`를 반환합니다.
- key 쌍 매칭은 SQL에서 code/date IN으로 좁힌 뒤 JS에서 정확한 `(code,date)` 쌍만 필터합니다.
- point별 feature는 `minute_candle_features`에서 같은 `(stockCode, tradeDate, tradeTime)`을 찾아 붙입니다.

### `findReviewExportRows(db, opts?)`

입력:

```ts
await findReviewExportRows(db, {
  keys: [{ stockCode: "005930", tradeDate: "2026-05-27" }],
});
```

또는:

```ts
await findReviewExportRows(db, { since: "2026-05-01" });
```

출력 예시:

```ts
[
  {
    reviewId: "789",
    stockCode: "005930",
    stockName: "삼성전자",
    tradeDate: "2026-05-27",
    tradeTime: "09:12:00",
    lineTargets: [75000, 77000],
    features: { changeRate5m: "0.82", cumulativeTradingAmount: "120000000000" },
    payload: { result: "good", tag: ["breakout", "volume"] }
  }
]
```

point가 없는 target은 `reviewId: null`, `tradeTime: null`, `payload: {}`인 row로 나갑니다.

용도: `chart-review` Export API가 이 결과를 `buildSheetMatrix()`에 넘깁니다.

### `findReviewTargetsWithPointsByCodes(db, { stockCodes, tradeDate })`

입력:

```ts
await findReviewTargetsWithPointsByCodes(db, {
  stockCodes: ["005930", "000660"],
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
Map([
  ["005930", {
    reviewTargetId: "456",
    lineTargets: [75000, 77000],
    points: [
      { reviewId: "789", tradeTime: "09:12:00", payload: { result: "good" } }
    ]
  }]
])
```

용도: `getThemeBundle()`이 테마 멤버마다 review target 여부와 point list를 붙일 때 씁니다.

## 11. Repository: manual key registry

### `listManualKeys(db)`

입력:

```ts
await listManualKeys(db);
```

출력 예시:

```ts
[
  { id: 1n, key: "result", label: null, sortOrder: 0, createdAt: ..., updatedAt: ... },
  { id: 2n, key: "tag", label: "태그", sortOrder: 1, createdAt: ..., updatedAt: ... }
]
```

정렬: `sortOrder ASC`, `key ASC`

### `addManualKey(db, { key, label? })`

입력:

```ts
await addManualKey(db, { key: "result", label: "결과" });
```

DB 효과:

```text
review_manual_key에 key 추가.
sortOrder는 현재 MAX(sort_order)+1.
이미 있으면 onConflictDoNothing.
```

반환: `void`

### `deleteManualKey(db, key)`

입력:

```ts
const removed = await deleteManualKey(db, "result");
```

출력 예시:

```ts
12
```

DB 효과:

```text
1. review_manual_key.key="result" 삭제.
2. 모든 review_point.payload_json에서 "result" 키 제거.
3. payload에서 키가 제거된 point row 수 반환.
```

주의: 파괴적 삭제입니다.

### `renameManualKey(db, { from, to })`

입력:

```ts
await renameManualKey(db, { from: "result", to: "grade" });
```

출력 예시:

```ts
{ renamedPayloads: 12 }
```

DB 효과:

```text
1. review_manual_key의 key를 result -> grade로 변경.
2. 모든 payload_json에서 result 값을 grade 키로 이동.
3. to 키가 이미 있으면 Error.
```

검증: `to`는 영문/숫자/밑줄만 허용합니다.

### `backfillManualKeysFromPayloads(db)`

입력:

```ts
await backfillManualKeysFromPayloads(db);
```

출력 예시:

```ts
["legacyTag", "oldResult"]
```

DB 효과:

```text
review_point.payload_json에 존재하지만 review_manual_key에는 없는 key를 찾아 레지스트리에 추가.
payload 값 자체는 건드리지 않음.
```

용도: 과거 import로 생긴 legacy key를 입력 모달에서 관리 가능하게 만들 때.

## 12. Repository: Sheet merge import

### `mergeReviewPointPayloads(db, items)`

입력:

```ts
await mergeReviewPointPayloads(db, [
  {
    reviewId: "789",
    values: { result: "good", tag: ["breakout", "volume"] },
    ref: "L2",
  },
  {
    stockCode: "005930",
    tradeDate: "2026-05-27",
    tradeTime: "09:30",
    values: { result: "bad" },
    ref: "L3",
  },
  {
    reviewId: "999999",
    values: { result: "missing" },
    ref: "L4",
  },
  {
    reviewId: "790",
    values: {},
    ref: "L5",
  },
]);
```

출력 예시:

```ts
{
  merged: 2,
  skippedNoValues: ["L5"],
  skippedNotFound: ["L4"]
}
```

동작:

1. `values`가 빈 항목은 `skippedNoValues`.
2. `reviewId`가 있고 DB에 존재하면 id로 병합.
3. id가 없거나 못 찾으면 `(stockCode, tradeDate, tradeTime HH:MM)`으로 찾음.
4. 못 찾으면 `skippedNotFound`.
5. 찾으면 `payload_json = payload_json || values`로 병합.

중요: 빈 셀은 삭제가 아닙니다. 비어있지 않은 값만 덮어씁니다.

## 13. Query: theme bundle

### `getThemeBundle(db, { stockCode, tradeDate })`

입력:

```ts
await getThemeBundle(db, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
});
```

출력 예시:

```ts
[
  {
    themeId: "10",
    themeName: "반도체",
    members: [
      {
        stockCode: "005930",
        stockName: "삼성전자",
        isSelf: true,
        daily: [/* 최근 600개 이하 일봉 */],
        minute: [/* 2026-05-27 분봉 */],
        features: [/* 2026-05-27 분봉 feature */],
        review: {
          reviewTargetId: "456",
          lineTargets: [75000],
          points: [
            { reviewId: "789", tradeTime: "09:12:00", payload: { result: "good" } }
          ]
        }
      },
      {
        stockCode: "000660",
        stockName: "SK하이닉스",
        isSelf: false,
        daily: [/* ... */],
        minute: [/* ... */],
        features: [/* ... */],
        review: null
      }
    ]
  }
]
```

내부 흐름:

```text
findThemesByStockAndDate()
  -> findMemberCodesByThemeIds()
  -> collectAllCodes()
  -> Promise.all([
       findStocksMapByCodes(),
       findRecentDailyCandlesByCodes(lookback=600),
       findMinuteCandlesByCodesAndDate(),
       findFeaturesByCodesAndDate(),
       findReviewTargetsWithPointsByCodes()
     ])
  -> 테마별 members 조립
```

주의: 해당 종목/거래일에 테마 매핑이 없으면 Error를 던집니다. chart-review는 모든 종목에 placeholder 테마가 있어야 한다는 invariant를 기대합니다.

## 14. market-feature: 계산기 인터페이스

### `FeatureCalculator<TContext, TOutput>`

형태:

```ts
interface FeatureCalculator<TContext, TOutput> {
  columns(opts?: ColumnOptions): Record<string, any>;
  calculate(ctx: TContext): TOutput;
  reset?(): void;
}
```

의미:

- `columns()`는 Drizzle 컬럼 정의를 반환합니다.
- `calculate()`는 현재 context에서 feature 값을 반환합니다.
- `reset()`은 종목/날짜가 바뀔 때 누적 상태를 초기화합니다.

### `MinuteCandleContext`

입력 예시:

```ts
{
  current: { tradeTime: "09:10:00", closeRateNxt: "4.20", tradingAmount: "5000000000", ... },
  candles: [/* 같은 종목/날짜의 모든 분봉, 시간 ASC */],
  index: 10,
  findCandleMinutesAgo: (minutesAgo) => MinuteCandle | null,
}
```

계산기는 이 context만 보고 값을 계산합니다.

### `buildColumnsFromCalculators(calculators, opts?)`

입력:

```ts
buildColumnsFromCalculators([
  new CloseRateNxtCalculator(),
  new TradingAmountCalculator(),
]);
```

출력 개념:

```ts
{
  closeRateNxt: numeric("close_rate_nxt", ...).notNull(),
  tradingAmount: numeric("trading_amount", ...).notNull()
}
```

컬럼 키가 겹치면 즉시 Error를 던집니다.

### `mergeCalculatorOutputs(outputs)`

입력:

```ts
mergeCalculatorOutputs([
  { closeRateNxt: "1.23" },
  { tradingAmount: "5000000000" },
]);
```

출력:

```ts
{
  closeRateNxt: "1.23",
  tradingAmount: "5000000000"
}
```

출력 키가 겹치면 Error를 던집니다.

## 15. market-feature: 등록된 분봉 계산기

등록 순서:

```ts
[
  CloseRateKrxCalculator,
  CloseRateNxtCalculator,
  TradingAmountCalculator,
  ChangeRateCalculator(5),
  ChangeRateCalculator(10),
  ChangeRateCalculator(30),
  ChangeRateCalculator(60),
  ChangeRateCalculator(120),
  DayHighCalculator,
  PullbackCalculator,
  CumulativeAmountCalculator,
  AmountCountCalculator(20),
  ...
  AmountCountCalculator(300),
]
```

### `CloseRateKrxCalculator`

입력 context:

```ts
{ current: { closeRateKrx: "3.1250" } }
```

출력:

```ts
{ closeRateKrx: "3.1250" }
```

`closeRateKrx`가 null이면 `"0"`을 반환합니다.

### `CloseRateNxtCalculator`

입력:

```ts
{ current: { closeRateNxt: "3.2200" } }
```

출력:

```ts
{ closeRateNxt: "3.2200" }
```

`closeRateNxt`가 null이면 `"0"`을 반환합니다.

### `TradingAmountCalculator`

입력:

```ts
{ current: { tradingAmount: "5250000000" } }
```

출력:

```ts
{ tradingAmount: "5250000000" }
```

분봉 row의 거래대금을 그대로 feature row에 복사합니다.

### `ChangeRateCalculator(minutes)`

입력:

```ts
const calc = new ChangeRateCalculator(5);

ctx.current.closeRateNxt = "4.50";
ctx.findCandleMinutesAgo(5)?.closeRateNxt = "2.10";
```

출력:

```ts
{ changeRate5m: "2.40" }
```

과거 캔들이 없으면:

```ts
{ changeRate5m: null }
```

등록된 minutes는 5, 10, 30, 60, 120입니다.

### `DayHighCalculator`

상태: `dayHighRate`, `dayHighTime`

입력 순서:

```ts
09:00 highRateNxt = "2.0000"
09:01 highRateNxt = "3.5000"
09:02 highRateNxt = "3.1000"
```

출력:

```ts
09:00 -> { dayHighRate: "2.0000", dayHighTime: "09:00:00" }
09:01 -> { dayHighRate: "3.5000", dayHighTime: "09:01:00" }
09:02 -> { dayHighRate: "3.5000", dayHighTime: "09:01:00" }
```

종목/날짜가 바뀌면 `reset()`으로 상태를 비워야 합니다. feature-processor의 `computeStockFeatures()`가 계산기별 `reset?.()`을 호출합니다.

### `PullbackCalculator`

상태: 자체 `dayHighRate`, `dayHighTime`

입력 순서:

```ts
09:00 highRateNxt="2.0000", closeRateNxt="1.8000"
09:01 highRateNxt="3.5000", closeRateNxt="3.2000"
09:02 highRateNxt="3.1000", closeRateNxt="2.7000"
```

출력 예시:

```ts
09:00 -> { pullbackFromDayHigh: "-0.2000", minutesSinceDayHigh: 0 }
09:01 -> { pullbackFromDayHigh: "-0.3000", minutesSinceDayHigh: 1 }
09:02 -> { pullbackFromDayHigh: "-0.8000", minutesSinceDayHigh: 1 }
```

의미:

- `pullbackFromDayHigh = 현재 closeRateNxt - 당일 고점 highRateNxt`
- 음수일수록 고점에서 눌린 상태입니다.
- `minutesSinceDayHigh`는 고점 발생 후 경과 분입니다.

### `CumulativeAmountCalculator`

상태: `cumulative`

입력 순서:

```ts
09:00 tradingAmount = "3000000000"
09:01 tradingAmount = "4500000000"
09:02 tradingAmount = "1000000000"
```

출력:

```ts
09:00 -> { cumulativeTradingAmount: "3000000000" }
09:01 -> { cumulativeTradingAmount: "7500000000" }
09:02 -> { cumulativeTradingAmount: "8500000000" }
```

### `AmountCountCalculator(thresholdEok)`

입력:

```ts
const calc = new AmountCountCalculator(30);

09:00 tradingAmount = "2500000000" // 25억
09:01 tradingAmount = "3000000000" // 30억
09:02 tradingAmount = "5000000000" // 50억
```

출력:

```ts
09:00 -> { cnt30Amt: 0 }
09:01 -> { cnt30Amt: 1 }
09:02 -> { cnt30Amt: 2 }
```

등록된 threshold는 `STAT_AMOUNTS`입니다.

```ts
[20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300]
```

## 16. review-sheet

### `FIXED_COLUMNS`

값:

```ts
[
  "groupId",
  "reviewId",
  "stockCode",
  "stockName",
  "tradeDate",
  "tradeTime",
  "lineTargets",
]
```

### `FEATURE_COLUMNS`

값:

```ts
[
  "changeRate5m",
  "changeRate10m",
  "changeRate30m",
  "changeRate60m",
  "changeRate120m",
  "dayHighRate",
  "dayHighTime",
  "pullbackFromDayHigh",
  "minutesSinceDayHigh",
  "tradingAmount",
  "cumulativeTradingAmount",
  "cnt20Amt",
  "...",
  "cnt300Amt",
]
```

### `toManualHeader(key)`

입력:

```ts
toManualHeader("result");
toManualHeader("_legacy");
```

출력:

```ts
"m_result"
"m_legacy"
```

manual key 앞의 `_`는 제거하고 `m_` 접두사를 붙입니다.

### `buildSheetMatrix(rows, options?)`

입력:

```ts
buildSheetMatrix(
  [
    {
      reviewId: "789",
      stockCode: "005930",
      stockName: "삼성전자",
      tradeDate: "2026-05-27",
      tradeTime: "09:12:00",
      lineTargets: [75000, 77000],
      features: {
        changeRate5m: "0.82",
        cumulativeTradingAmount: "120000000000",
      },
      payload: {
        result: "good",
        tag: ["breakout", "volume"],
      },
    },
  ],
  { baseUrl: "http://localhost:3200" },
);
```

출력 예시:

```ts
[
  [
    "groupId",
    "reviewId",
    "stockCode",
    "stockName",
    "tradeDate",
    "tradeTime",
    "lineTargets",
    "reviewUrl",
    "changeRate5m",
    "...feature columns",
    "m_result",
    "m_tag"
  ],
  [
    "005930-2026-05-27",
    "789",
    "005930",
    "삼성전자",
    "2026-05-27",
    "09:12",
    "75000 | 77000",
    "http://localhost:3200/review/005930/2026-05-27/09:12",
    "0.82",
    "...",
    "good",
    "breakout | volume"
  ]
]
```

manual 컬럼은 rows 전체 payload key를 모아 `m_` 헤더로 정렬합니다. `baseUrl`이 없으면 `reviewUrl` 컬럼은 생략됩니다.

## 17. 함수 선택 가이드

| 해야 할 일 | 함수 |
|------------|------|
| 종목 마스터 저장 | `saveStock()` |
| 일봉 저장 | `saveDailyCandles()` |
| 분봉 저장 | `saveMinuteCandles()` |
| 피처 저장 | `saveMinuteFeatures()` |
| 특정 날짜 피처 미처리 여부 파악 | `findPendingTradeDates()` |
| chart-review 작업셋 로드 | `findReviewLoadTargets()` |
| chart-review 차트 번들 로드 | `getThemeBundle()` |
| 타점 저장/수정 | `upsertReviewPoint()` |
| 타점 삭제 | `deleteReviewPointById()` |
| Sheet export row 생성 | `findReviewExportRows()` |
| Sheet matrix 생성 | `buildSheetMatrix()` |
| Sheet import merge | `mergeReviewPointPayloads()` |
| 수동 키 목록/추가/이름변경/삭제 | `listManualKeys()`, `addManualKey()`, `renameManualKey()`, `deleteManualKey()` |
