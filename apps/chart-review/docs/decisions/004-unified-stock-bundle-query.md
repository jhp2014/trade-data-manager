# 004. 종목 단위 통합 번들 쿼리 + Point List 보유 배지

> 상태: **방향 제안(미구현)** · 작성 2026-06-03
> 관련: [002 Sheet→DB SSOT](./002-sheet-to-db-source-of-truth.md), [architecture.md §2/§6](../architecture.md)

이 문서는 **코드 작업 전 방향 정리**다. 현재 쿼리 구조를 인벤토리로 정리하고,
`(stockCode, tradeDate)` 하나로 "그 종목에 관련된 모든 것"을 한 번에 가져오는
**단일 번들 쿼리**로 통합하는 설계와, 그 부산물로 얻는 **Point List 보유 배지**
(테마 리스트 + 히스토리)를 어떻게 그릴지를 다룬다.

설계 원칙(사용자 합의): **로컬 1인 사용이므로 짜잘한 쿼리보다 대량을 한 번에 긁어
프론트에서 처리하는 쪽이 유지보수에 유리하다.**

---

## 1. 현재 쿼리 인벤토리

### 1.1 두 개의 큰 쿼리 패밀리

복기 화면은 **성격이 다른 두 경로**로 DB를 친다.

```
[A] 페이지 서버 로드 (작업셋 전체, 1회)
    page.tsx → loadReviewRows()
      → resolveWorkingSetKeys()              // 시트/env/DB 로 작업셋 키 결정
      → findReviewLoadTargets(db, {keys})    // ★ review.repository
      → toSheetPointRows()                   // 평탄화 → SheetPointRow[]
    => Point List · 수동 입력 m_ 값 · 타점별 feature 를 "보유 데이터"로 적재

[B] 차트 미리보기 (종목 1개, 탐색할 때마다)
    api/chart-preview (GET) → loadChartPreview({stockCode, tradeDate})
      → getThemeBundle(db, {stockCode, tradeDate})   // ★ queries/theme-bundle
      → mappers/overlay 로 DTO 가공
    => self 일봉/분봉 + 테마별 멤버 오버레이(일·분봉·feature)
```

- **[A]는 "작업셋"** — 시트가 고른 `(code,date)` 묶음. 결과(`ReviewStockGroup[]`)는
  Point List·수동값·feature까지 **클라이언트가 통째로 들고 있다.**
- **[B]는 "지금 보는 종목 1개"** — `effectiveStock`(선택 그룹 또는 `chartOverride`)이
  바뀔 때마다 `code+date`로 라이브 조회. 작업셋에 없어도 차트는 그려진다.
- 둘은 **겹치는 데이터를 서로 다른 모양으로** 가져온다(분봉·feature). [A]는 타점 시각의
  feature만, [B]는 하루치 feature 시계열 전체를 가져온다.

### 1.2 [A] `findReviewLoadTargets` (review.repository.ts)

| 단계 | 함수 | 내용 |
|------|------|------|
| 1 | `db.select(review_targets)` | `stock_code IN` + `trade_date IN` 후 JS로 `(code,date)` 페어 필터, `date desc / code asc` |
| 2 | `db.select(review_points)` | `inArray(reviewTargetId)` 로 타점 일괄 |
| 3 | `findExportFeatures` | `minute_candle_features` 를 `date + code IN` 으로, `code|date|time` 키 맵 |

반환 `ReviewLoadTarget[]` = `{stockCode, stockName, tradeDate, lineTargets, points:[{reviewId, tradeTime, payload(m_), features}]}`.
→ **이 경로만이 "어떤 종목이 review_target(=Point List 보유)인지"를 안다.**

### 1.3 [B] `getThemeBundle` (queries/theme-bundle.ts) — 사용자가 든 예시

```
findThemesByStockAndDate(code,date)         // 3단계: dailyCandle id→mapping→themes
  → (없으면 throw: 모든 종목은 placeholder 테마라도 있어야 함)
findMemberCodesByThemeIds(themeIds,date)    // 테마별 멤버 code[]
collectAllCodes()                           // self + 모든 멤버 dedupe
Promise.all([
  findStocksMapByCodes,                     // 종목명
  findRecentDailyCandlesByCodes(lookback=600), // 종목별 일봉 N개 (개별쿼리 N병렬)
  findMinuteCandlesByCodesAndDate,          // 하루치 분봉 (code IN, 1쿼리)
  findFeaturesByCodesAndDate,               // 하루치 feature 시계열 (code IN, 1쿼리)
])
=> ThemeBundle[] { themeId, themeName, members:[{code, name, isSelf, daily, minute, features}] }
```

**이미 self 기준으로 "테마 내 다른 종목들의 일·분봉·feature"를 한 번에 묶는다.**
사용자가 "그 시점 기준 테마 내 다른 종목 feature까지 가져오는 쿼리"라 한 게 바로 이것.

### 1.4 리프 리포지토리 (재사용 가능한 부품)

| 함수 | 키 | 반환 |
|------|----|------|
| `findStocksMapByCodes` | `code[]` | `Map<code, Stock>` (종목명) |
| `findDailyCandleByStockAndDate` | `code,date` | 1건 (id, prevClose) |
| `findRecentDailyCandlesByCodes` | `code[],date,lookback` | `Map<code, DailyCandle[]>` (종목별 N병렬) |
| `findMinuteCandlesByCodesAndDate` | `code[],date` | `Map<code, MinuteCandle[]>` (1쿼리) |
| `findFeaturesByCodesAndDate` | `code[],date` | `Map<code, Features[]>` (하루치 시계열) |
| `findFeaturesAt` / `findLatestFeaturesBeforeTime` | `code[],date,time` | 단일 시점 / carry-forward |
| `findThemesByStockAndDate` / `findMemberCodesByThemeIds` | `code,date` | 테마·멤버 |

→ 리프는 이미 **대부분 `code[]` 벌크 + Map 반환** 형태. 통합 쿼리는 이들을 **재배치**하면 된다.

### 1.5 현재 구조의 통증 지점

1. **review_target 인지 범위가 [A]에 갇혀 있다.** [B](테마/히스토리 탐색)는 어떤 종목이
   Point List를 가졌는지 모른다 → 배지를 못 단다. 이게 사용자가 풀려는 핵심.
2. **데이터 모양 이원화.** 같은 종목의 분봉/feature를 [A]는 타점 시각만, [B]는 하루치를
   서로 다른 타입(`SheetPointRow.features: Record<string,string>` vs `MinuteCandleFeatures[]`)으로.
3. **`getThemeBundle` 은 테마 없으면 throw.** 작업셋엔 있으나 테마 placeholder가 없는
   종목은 차트 조회가 깨질 수 있는 약점(현재는 invariant로 가정).
4. 탐색 단위로 [B]가 매번 도는 것 자체는 OK(디바운스됨). 문제는 **review_target 여부와
   Point List 데이터가 [B] 응답에 함께 실리지 않는 것.**

---

## 2. 통합 방향: 단일 `(stockCode, tradeDate)` 번들 쿼리

### 2.1 목표

> "**종목 코드 + 날짜 하나**를 주면, 그 종목을 어떻게(작업셋/테마/히스토리) 만났든
> **차트 + 테마 멤버 feature + (있다면) Point List/수동값**을 **한 응답**으로 돌려준다."

즉 `getThemeBundle`을 **상위 확장**해, review_target 정보를 **각 멤버에 직접 합류**시킨다.

> **확장 대상 주의.** data-core 의 테마 쿼리는 두 개다.
> - `theme-bundle`(`getThemeBundle`) — 하루치 일·분봉·feature **시계열**. **chart-review 가 쓰는 것** → 여기 확장.
> - `theme-snapshot`(`getThemeSnapshotAt`) — 단일 `(date,time)` feature. (삭제된) deck 앱용으로, 현재 **어느 앱도 안 쓰는 dead code 로 보임**. 건드리지 않는다(추후 제거 후보).

### 2.2 설계: `review` 를 `ThemeBundleMember` 에 직접 매단다 (피드백 반영)

별도 `self` 블록 / 최상위 `review` / 평탄 `reviewTargetKeys` 배열을 만들지 않는다.
`ThemeBundleMember` 가 이미 `(stockCode, tradeDate)` 한 건이므로 **그 자리에 `review` 를 단다.**
그러면 self 도, 배지 판정도 전부 멤버에서 파생된다.

```ts
// 의사코드 — 구현 아님
export interface ThemeBundleMember {       // 기존 타입에 review 한 줄만 추가
  stockCode: string;
  stockName: string;
  daily: DailyCandle[];
  minute: MinuteCandle[];
  features: MinuteCandleFeatures[];
  review: ReviewTargetBundle | null;       // ★ review_target 있으면 Point List, 없으면 null
}
// isSelf 플래그는 입력 stockCode 와 비교하면 알 수 있어 불필요(원하면 편의로만 유지).
// self 전용 블록(daily/minute/prevClose)도 없앤다 — self 멤버에서 그대로 뽑으면 됨.

export interface ReviewTargetBundle {
  reviewTargetId: string;
  lineTargets: unknown;                    // jsonb
  points: Array<{
    reviewId: string;
    tradeTime: string;
    payload: Record<string, string>;       // 수동 m_ 값
    features: MinuteCandleFeatures | null; // 타점 시각 feature (옵션)
  }>;
}
```

**조립 = `getThemeBundle` 에 한 갈래만 추가:**

```
기존 4-병렬(stocks / daily / minute / features) 옆에
  findReviewTargetsWithPointsByCodes(db, {codes: allCodes, tradeDate})
    → Map<code, ReviewTargetBundle>          // review_target IN 1회 + review_point IN 1회
members.map 에서:
  review: reviewByCode.get(code) ?? null     // 멤버마다 자기 review 를 매단다
```

이로써 파생이 전부 멤버에서 나온다:
- **배지(Point List 보유?)** = `member.review != null`
- **self 의 Point List** = `members.find(m => m.stockCode === stockCode)?.review`
- **별도 `reviewTargetKeys` 배열 불필요** — 각 멤버가 스스로 안다.

비용: 멤버 수와 무관하게 쿼리 2개(`review_target` IN, `review_point` IN) 추가뿐. lookback=600
일봉이 여전히 지배적이라 영향 미미. 그리고 **모든 멤버가 Point List 전체를 들고 오므로
"어디로 탐색하든 모든 정보 표시"(사용자 목표)가 추가 조회 없이 충족** — §4 S5 가 사실상 공짜.

### 2.3 기존 호출부 흡수

| 현재 | 통합 후 |
|------|---------|
| `loadChartPreview` → `getThemeBundle` + 매퍼 | 같은 호출. 멤버에 `review` 가 실려 옴 → 매퍼가 overlaySeries 로 전파 |
| `findReviewLoadTargets`([A] 작업셋 로드) | **그대로 유지.** 작업셋 일괄 로드는 별 경로가 맞다(키가 N개) |
| 배지 판정 | 테마 리스트: 멤버 `review != null` / 히스토리: 작업셋 Set(§3.1) |

> [A] 작업셋 로드를 없애지는 않는다. [A]는 "여러 키 일괄"이고 번들은 "단일 키 풍부"라
> 역할이 다르다. 단, **둘 다 같은 리프와 같은 review_target 적재 헬퍼**를 공유해 SSOT 유지.

### 2.4 DTO 확장 (`types/chart.ts`)

멤버에 review 가 실리므로, DTO 도 **멤버 단위(`ChartOverlaySeries`)에 얹는다**(상위 평탄 배열 불필요):

```ts
interface ChartOverlaySeries {
  stockCode: string;
  stockName: string;
  isSelf: boolean;
  series: ChartOverlayPoint[];
  hasReview?: boolean;            // ★ 배지용. 더 필요하면 review?: ReviewTargetDTO 로 확장
}

interface ChartPreviewDTO {
  // 메인차트용 raw 캔들 (= 요청 멤버 투영). selfStockCode/selfStockName 은 제거 —
  // 호출자가 이미 요청 (code,date) 를 알기 때문(useChartPreview 가 그 값으로 fetch).
  daily: DailyCandle[];
  minute: MinuteCandle[];
  prevCloseKrx: number | null;
  prevCloseNxt: number | null;
  themes: ChartThemeOverlay[];
  review?: ReviewTargetDTO | null;  // 요청 멤버의 review (메인 Point List 렌더용, 선택)
}
```

→ 테마 리스트 배지는 `overlaySeries[].hasReview` 만 보면 되고(별도 Set 불필요),
기존 차트 렌더는 무변경. **self 라벨/식별 필드는 걷어낸다** — 메인차트 `daily/minute` 는
요청 멤버(`stockCode === 요청코드`)를 골라 투영한 값일 뿐, self 전용 개념이 아니다.

---

## 3. Point List 보유 배지 (테마 리스트 + 히스토리)

사용자 요구: **"Point List가 있는 종목은 어떻게 탐색하더라도 표시(예: 숫자에 동그라미)되면 좋겠다."**

### 3.1 "보유" 판정의 단일 출처

`(stockCode, tradeDate)` 가 `review_target` 에 존재하면 보유.

**원칙: 데이터가 자기 플래그를 들고 다닌다.** 외부 Set 조회 없이 양쪽 다 자급한다.

- **테마 리스트(현재 번들 멤버)**: 멤버가 스스로 안다 → `overlaySeries[].hasReview`.
- **히스토리**: 엔트리에 들어오는 순간(=그 종목 번들을 막 본 순간) review 유무를 이미 안다.
  → `HistoryEntry` 에 `hasReview` 를 **찍어서 저장**한다. 작업셋 Set 불필요 + 탐색 전용
  review_target 도 정확히 잡힌다(Set 방식의 누락 약점 없음).

### 3.2 테마 리스트 — `ThemeSidebar.tsx`

- 위치: `ThemeRow`의 `rank`(현재 `<span className={styles.rank}>{rank}</span>`, line 115).
- 변경: 그 멤버가 보유면 rank 숫자에 **동그라미 테두리**(CSS modifier, 예 `styles.rankReview`).
- 데이터 전달: `computeThemeMemberMetrics`/`ThemeMemberMetric` 가 overlaySeries 의 `hasReview` 를
  metric 으로 전파 → `ThemeRow` 는 `metric.hasReview` 만 읽는다. **별도 Set prop 불필요**
  — 데이터가 이미 멤버에 붙어 있다.
- `ThemeRow` 표시만 토글. 로직 변화 없음(순수 표시).

### 3.3 히스토리 — `HistorySwitcher.tsx` + `useReviewStore`

- 데이터: `HistoryEntry` 에 `hasReview?: boolean` 추가. `pushHistory(entry)` 호출 측
  (ReviewWorkspace, 종목 선택/탐색 시점)에서 그 종목 번들의 review 유무를 넣어 준다.
- 위치: 각 row의 이름/날짜 옆(현재 `현재` 배지 자리 근처, line 57~59).
- 변경: `entry.hasReview` 면 작은 배지/동그라미. `HistorySwitcher` 는 prop 추가 없이
  엔트리 필드만 읽는다 → **자급, 외부 Set 불필요.**

---

## 4. 적용 단계(점진적, 행동 무변경 우선)

| 단계 | 내용 | 비용 | 리스크 |
|------|------|------|--------|
| S0 | 본 문서 합의 | - | - |
| S1 | **data-core**: `findReviewTargetsWithPointsByCodes` 헬퍼 + `ThemeBundleMember.review` 매달기 | 중 | 쿼리 2개 추가(IN) |
| S2 | **DTO/overlay**: `ChartOverlaySeries.hasReview` 노출, self 식별 필드 정리 | 낮음 | DTO 옵셔널 확장 |
| S3 | **테마 리스트 배지**: themeMetrics→ThemeRow `hasReview` 표시 | 낮음 | 표시만 |
| S4 | **히스토리 배지**: `HistoryEntry.hasReview` 적재 + HistorySwitcher 표시 | 낮음 | 표시만 |
| S5 | (S1 부산물) 탐색 종목이 review_target 이면 멤버 `review` 로 Point List 그대로 렌더 | 낮음 | 선택 UI 표시 |

S1 이 토대(쿼리 통합)이고, S2~S4 는 그 데이터를 화면에 흘리는 표시 작업. 멤버에 review 를
매단 덕에 S5 가 별도 작업이 아니라 S1 데이터를 그리기만 하면 된다.

### 결정/리스크 메모

- **R1. [A]를 통합 쿼리로 합치지 않는다.** 작업셋은 다중 키 일괄이라 단일키 번들과 목적이 다름.
  공유는 *리프 + review_target 적재 헬퍼* 수준으로.
- **R2. 히스토리 배지.** `HistoryEntry.hasReview` 를 push 시점에 적재(데이터가 자기 플래그를
  들고 다님). 작업셋 Set 방식보다 정확(탐색 전용 review_target 도 잡힘)하고 외부 의존 0.
- **R3. `getThemeBundle` throw.** 통합 쿼리에서는 테마 없을 때 self 1-멤버 폴백으로 감싸
  탐색 견고성 ↑(현재 invariant 의존 제거). 별도 합의 필요.
- **R4. 성능.** 추가분은 테마 멤버 code 들에 대한 `review_target`/`review_point` IN 2회뿐.
  lookback=600 일봉이 지배적 비용이라 영향 미미. 로컬 단일 사용 전제와도 부합.
- **R5. 필터 snap-back(별건).** 필터 활성 중 히스토리로 비매칭 종목 점프 시 차트가 안 뜨는
  문제는 본 통합과 독립. 배지로 "왜 안 뜨는지"는 가시화되나 해결은 별도(선택 효과 예외 처리).
