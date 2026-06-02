# chart-review 1차 구현 명세

> 작업 지시서. 이 문서는 1차(mock) 범위만 다룬다. Sheets API 연동, manual 저장(DB),
> 실 차트 렌더링은 이후 단계이며 여기서는 **인터페이스/스키마만 합의**하고 구현하지 않는다.

---

## 0. 한 줄 요약

`apps/data-view`는 동결한다(삭제 안 함, 무수정 방치). 신규 앱 `apps/chart-review`를 만들어,
Sheet에서 필터/정렬된 타점 목록을 **종목+날짜 그룹 단위로 차트 복기**하는 도구를 만든다.
1차는 mock 데이터로 그룹핑·탐색·레이아웃·Point List까지 완성하고, 차트는 placeholder로 둔다.

---

## 1. 역할 분담 (왜 새 앱인가)

```
Sheet(Excel/Google Sheet) = 리스트 / 필터 / 정렬 / 수동(m_) 입력 작업 공간
chart-review App          = 차트 리뷰 / 테마 확인 / point 탐색 전용 화면
DB(data-core)             = 차트 데이터 / 테마 스냅샷 / (나중에) manual point 저장소
```

- data-view를 더 큰 Excel로 키우지 않는다. 필터/정렬/수동입력은 Sheet가 더 잘한다.
- 앱은 리스트 관리 도구가 아니라, Sheet에서 선택·필터링된 타점을 빠르게 차트로 복기하는 도구.

---

## 2. 패키지 경계

```
공유 유지 : packages/data-core   (쿼리/리포지토리) — 신규 앱도 의존
공유 유지 : packages/chart-utils (순수 유틸: chartTime, chartPadding, colors, amountMarker)
fork(복사): 차트 React 렌더링 코어 — data-view 에서 떼와 chart-review 로 copy-and-prune
            (단, 1차에서는 복사하지 않는다. 차트는 placeholder. 실 차트 연동 시 작업)
```

- 패키지로 추출하지 않는다. data-view가 동결되므로 공유 진화 명분이 없다 → fork가 정석.
- fork 대상은 `useChartShell`, `useCrosshairTooltip`, `tooltipUtils`, `ChartTooltip`, chart mappers.
- 버릴 것: `ChartModal`, `useChartModalStore`, deck/peer-list 연동 (새 앱은 인라인 차트, 모달 아님).
- **1차에서는 위 fork를 하지 않는다.** 차트 자리는 placeholder 컴포넌트.

---

## 3. 라우팅 & URL 전략

```
경로 : /review/[code]/[date]/[time]     (path param, 3개 모두 URL에 존재)
예시 : /review/005930/2026-05-29/09:34
```

- **path param**을 쓴다(쿼리보다 깔끔, 그리고 Sheet 진입 시 time까지 URL로 조회해야 하므로 URL에 있어야 함).
- "path냐 query냐"와 "가볍냐"는 별개 축이다. 가벼움은 **URL을 바꾸는 API**가 결정한다:
  - 최초 진입 / 공유 링크 : 정상 라우트(서버 컴포넌트가 params를 읽어 **seed**로만 사용)
  - 이후 group/point 이동 : `window.history.replaceState` 로 **주소창만** 갱신, Next 라우터 우회 → 가벼움
  - 차트/데이터 : 클라이언트 react-query (data-view의 `useChartPreview` 패턴)
- 원칙: **서버는 seed만, 이후는 클라이언트가 운전.** 서버 params는 최초 1회만 의미.
- 부작용(의도된 것): `replaceState`라 history entry가 안 쌓여 뒤로가기로 point가 안 튄다 → 리뷰 도구에 바람직.
- viewMode는 URL에 넣지 않는다(내부 state). 공유/복원에 필수 아님.

---

## 4. 탐색 모델 (핵심)

### 4.1 그룹핑

```
groupKey = `${stockCode}|${tradeDate}`
같은 stockCode + tradeDate 는 하나의 group
group 내부 points 는 tradeTime 오름차순
group 순서는 Sheet 에서 처음 등장한 순서 유지
```

### 4.2 탐색 단위

```
좌우 탐색 (Prev/Next Stock) = group 이동  (row 단위 아님!)
Point 이동                  = 같은 group 안의 tradeTime 선택 (Point List 클릭)
```

- **row 단위로 좌우 이동하지 않는다.** 같은 종목의 여러 타점을 따로 넘기는 건 원하는 UX가 아니다.
- 대표 테마 덕분에 (아래 5절) 한 타점이 테마 수만큼 중복되지 않는다 → group이 타점과 1:1(시각 제외).

### 4.3 reviewId & key

```
pointKey = reviewId   (항상 존재)
```

- **reviewId 는 DB가 Sheet 생성 시 행마다 발급**한다. 정렬/행삽입/값수정에도 불변.
- 이유: manual(m_) 값을 DB에 저장할 때 "이 payload가 어느 리뷰 행 거냐"의 **join key**가 필요한데,
  natural key(stockCode|tradeDate|tradeTime)는 값 자체가 데이터라, 시각을 수정하는 순간
  이전 payload가 고아(orphan)가 된다. reviewId로 묶으면 메모가 제 타점을 따라간다.
- **1차(mock)에서는** mock 행에 `reviewId` 필드를 그냥 박아둔다(나중에 DB 발급으로 대체). fallback key 불필요.

---

## 5. 대표 테마 (Sheet 생성 단계의 중복 제거)

문제: 한 종목이 여러 테마에 속하면 Sheet에 같은 타점이 테마 수만큼 fan-out 되어 중복 탐색이 발생한다.

해결: **중복 제거를 Sheet 생성(DB) 단계로 내린다.**

```
Sheet 생성 시 : (stockCode, tradeDate, tradeTime) 당 1행
대표 테마      : 그 tradeDate 기준 멤버 종목 수가 가장 많은 테마
동점 처리      : themeId asc 등 결정적 규칙 (재생성 시 대표가 흔들리지 않도록)
SheetRow       : themeId / themeName = 대표 테마
나머지 테마    : 앱 안에서 전환 (findThemesByStockAndDate 로 런타임 조회)
```

- "종목 수"는 반드시 **그 tradeDate 기준**(테마 멤버십은 날짜마다 다름).
- 멤버 수는 단순/안정적 휴리스틱. v1은 이걸로 가고 부족하면 나중에 교체.
- **1차(mock)에서는** mock 행에 대표 테마를 이미 박아둔다(생성 로직 구현 안 함). group은 groupKey로만 묶고,
  themeId는 groupKey에 넣지 않는다(테마는 보기 옵션).

---

## 6. 컬럼 규약 (3분류, 헤더 이름으로 자동 판별)

Sheet에는 data-view처럼 feature 컬럼들도 포함된다(엑셀에서 필터/정렬용). 앱은 헤더 이름만 보고 3분류한다.

```
1. 고정 식별 컬럼 : stockCode, tradeDate, tradeTime, theme(themeName/themeId), reviewId
                    → 구조 필드 (탐색/그룹핑/식별에 사용)
2. feature 컬럼   : 거래대금 · 등락률 등 (그 외 접두어 없는 컬럼)
                    → 읽기 전용 표시 (저장 안 함)
3. m_ 컬럼        : m_entryType, m_reason, m_memo ...  (`m_` 접두어)
                    → manual/option. (나중에) payloadJson 으로 저장. 1차는 표시만.
```

- 사용자가 엑셀에 `m_` 컬럼을 자유롭게 추가/삭제해도 앱이 **설정 없이** manual로 인식.
- payloadJson 키는 **`m_` 접두어를 떼고** 저장 (`m_entryType` → `entryType`). 1차에선 저장 안 하므로 표시 키만 정리.
- 저장은 full overwrite("무조건 덮어쓰기"), merge 아님. 저장 시점 엑셀이 manual 값의 SSOT.

---

## 7. manual(m_) 값의 출처 — 표시는 Sheet, 저장은 DB

```
표시 소스   = Sheet(=1차 mock 행)에서 읽은 m_ 값  → 탐색 중 Point List 에 표시
저장(영구화) = 저장 버튼 → DB payloadJson 덮어쓰기  → (이후 단계, 1차 제외)
```

- m_ 값은 sheet 읽기에 **공짜로 따라온다**(SheetRow에 포함). 표시하려고 DB를 따로 조회하지 않는다.
- DB는 "읽어서 보여주는 곳"이 아니라 "저장하는 곳". (엑셀에서 방금 친 값이 바로 보이는 게 직관에 맞음.)
- 따라서 Point List의 `manualSummary`는 `sourceRow`의 m_ 컬럼에서 계산한다 — 1차에서 DB 안 건드림.

---

## 8. 단축키-우선 구조 (1차에 구현은 안 하되, 얹을 수 있게)

나중에 단축키 위주로 탐색할 예정이므로, **상태 위치**와 **탐색 표현**을 지금부터 그에 맞춘다.

1. **탐색 상태는 store에** (컴포넌트 로컬 X). zustand store(data-view `useUiStore` 패턴 참고)에:
   `selectedGroupIndex`, `selectedPointKey`(또는 index), `viewMode`.
   전역 키 리스너가 어디서든 접근 가능해야 하므로.
2. **탐색을 named command로** 표현: `nextGroup / prevGroup / nextPoint / prevPoint / setViewMode`.
   Prev/Next 버튼·Point List 클릭·(나중에) 단축키가 **모두 같은 command를 호출**한다.
   → 단축키 추가 = "키 → command 매핑"만 얹으면 끝, 기존 로직 무수정.
3. command가 상태를 바꾼 뒤 `history.replaceState`로 URL을 mirror (3절). 키보드 연타에도 가벼움.

---

## 9. 화면 레이아웃 (summary 기본 화면)

```
Header  12%
Body    88%
  Left  22%
    Top    45%  Daily Chart   (placeholder)
    Bottom 55%  Point List / Side Info
  Right 78%      Minute Chart  (placeholder)
```

- **사이드 정보는 좌측, 주 분봉 차트는 우측 78%.** 분봉을 가장 크게, 좌측에 일봉 context + point 목록 고정.
- 비율(특히 좌측 22% 안의 일봉 45%)은 mock에서 실측 후 조정 가능 항목.

### Header 표시 (1차)

```
종목명  종목코드 | 거래일 | Point 09:34 (2/2) | Group 1/12 | 입력 0/4
예) 삼성전자 005930 | 2026-05-29 | Point 09:34 (2/2) | Group 1/12 | 입력 0/4
```

(현재 등락률/당일고가/고점경과 등 차트 데이터 연동 항목은 실 차트 단계에서 추가.)

### Point List (핵심 UI)

같은 group(stockCode+tradeDate) 안의 여러 tradeTime을 표시. 현재 point 강조. 클릭 시 point 변경.
각 point의 m_ 입력 요약 표시.

```
● 09:12 | 70억 | 입력 3/4
  entryType O | reason O | memo - | done O
● 09:34 | 100억 | 입력 0/4
  entryType - | reason - | memo - | done -
```

- manualSummary 규칙: m_ field 값이 비어있지 않으면 입력됨. filledCount/totalCount, preview는 주요 field만.
- 차트 marker 클릭으로 point 이동하는 기능은 1차에 구현하지 않는다(Point List 클릭으로 충분).

### View Mode (내부 state, URL 아님)

```
type ReviewViewMode = "summary" | "minute" | "daily" | "overlay" | "theme";
1차 구현: summary / minute / daily 만. overlay·theme 는 placeholder.
단축키는 1차 미구현(8절 구조만 준비).
```

---

## 10. 데이터 모델 (mock 기준)

```ts
export type SheetPointRow = {
  reviewId: string;            // 1차 mock: 행에 박아둠. (나중에 DB 발급)
  rowNumber: number;

  stockCode: string;
  stockName?: string;
  tradeDate: string;
  tradeTime: string;

  themeName?: string;          // 대표 테마
  themeId?: string;            // 대표 테마

  // feature 컬럼(읽기 전용 표시)과 m_ 컬럼(manual)을 어떻게 담을지:
  //  - features: Record<string, string>  (접두어 없는 비고정 컬럼)
  //  - manual:   Record<string, string>  (m_ 접두어 떼고 담음)
  features: Record<string, string>;
  manual: Record<string, string>;
};

export type ReviewPoint = {
  pointKey: string;            // = reviewId
  tradeTime: string;
  rowNumber: number;
  reviewId: string;

  amountText?: string | null;  // Point List 표기용(예: "70억")

  manualSummary: {
    filledCount: number;
    totalCount: number;
    missingRequired: string[];
    preview: Record<string, string | null>;   // entryType/reason/memo/reviewDone 등
  };

  sourceRow: SheetPointRow;
};

export type ReviewStockGroup = {
  groupKey: string;            // `${stockCode}|${tradeDate}`
  stockCode: string;
  stockName?: string;
  tradeDate: string;
  points: ReviewPoint[];       // tradeTime 오름차순
};
```

### (설계만, 1차 구현 안 함) DB manual 테이블 — data-core

```ts
// 저장 기능 단계에서 packages/data-core 스키마에 추가.
type ManualPoint = {
  reviewId: string;            // PK / join key
  stockCode: string;
  tradeDate: string;
  tradeTime: string;
  payloadJson: Record<string, string>;   // m_ 컬럼들(접두어 제거), full overwrite
  updatedAt: string;
  // sourceSheetId/sourceGid/sourceRowNumber 는 Sheets 연동 단계에서 추가
  //  (1차/저장 단계엔 채울 소스가 없으므로 넣지 않는다)
};
```

---

## 11. 1차 구현 범위 (DO)

```
1.  apps/chart-review 신규 Next.js 앱 생성 (data-view 무수정, 다른 포트)
2.  /review/[code]/[date]/[time] 라우트
3.  mock SheetRow 작성 (reviewId 포함 / 고정·feature·m_ 3종 컬럼 섞어서 / 한 종목당 여러 tradeTime,
    여러 종목·여러 날짜)
4.  groupSheetRows: stockCode|tradeDate 기준 group 빌드 (등장 순서 유지, point 시각 오름차순)
5.  탐색 상태를 zustand store 에 (selectedGroupIndex, selectedPointKey, viewMode)
6.  탐색을 named command 로 (nextGroup/prevGroup/nextPoint/prevPoint/setViewMode)
7.  최초 진입: 서버 컴포넌트가 path params 를 seed 로 읽어 초기 group/point 선택
8.  이후 이동: command → store 변경 → history.replaceState 로 URL mirror
9.  레이아웃: Header 12% / Body 22:78 / 좌측(일봉45% placeholder + Point List 55%) / 우측 분봉 placeholder
10. Point List: 같은 group 의 여러 tradeTime 표시 / 현재 point 강조 / 클릭 시 point 변경 /
    m_ 입력 요약(manualSummary) 표시
11. Prev/Next Stock 버튼: group 단위 이동 (command 호출)
12. viewMode: 내부 state. summary/minute/daily 전환만 구현 (overlay/theme placeholder)
13. 차트는 placeholder 컴포넌트
```

## 12. 1차에서 하지 않을 것 (DON'T)

```
- Google Sheets API 연동 (mock 으로 진행)
- DB manual point 저장 (테이블은 설계만, 10절)
- Sheet write-back
- 실 차트 렌더링 / data-view 차트 fork
- 분봉 marker 클릭 이동
- 단축키 실제 바인딩 (8절 구조만 준비)
- 테마 리스트/오버레이 실제 구현 (placeholder)
- 수동 입력 편집 폼 (편집은 엑셀에서, 앱은 표시만)
- 대표 테마 산출 로직 (mock 행에 박아둠)
```

## 13. 완료 조건 (Acceptance)

```
1.  /review/[code]/[date]/[time] 접속 가능
2.  mock 행이 stockCode|tradeDate group 으로 묶임
3.  같은 group 의 여러 tradeTime 이 좌측 Point List 에 표시됨
4.  Prev/Next Stock 은 row 가 아니라 group 단위로 이동
5.  Point List 클릭 시 현재 tradeTime(point) 변경
6.  URL 에 code/date/time 이 반영됨 (path param)
7.  group/point 이동이 router navigation 이 아니라 history.replaceState 로 동작 (가벼움)
8.  viewMode 는 URL 에 없음 (내부 state)
9.  탐색 상태가 store 에 있고, 이동이 named command 로 이뤄짐 (단축키 얹기 가능)
10. summary 레이아웃: Header 12% / Body 88% / Left 22%(일봉 45% + Point List 55%) / Right 78% 분봉
11. summary/minute/daily 전환이 내부 state 로 동작
12. Point List 에 각 point 의 m_ 입력 요약이 sourceRow 기준으로 표시됨
13. 차트 자리는 placeholder 로 채워져 있음
```

---

## 14. 설계 판단 요약 (왜 이렇게)

```
1.  data-view 동결, 신규 앱 fork (공유 패키지 진화 명분 없음)
2.  Sheet = 필터/정렬/입력, App = 차트 리뷰/탐색
3.  탐색 단위 = stockCode+tradeDate group (row 아님)
4.  group 안 여러 tradeTime = Point List 선택
5.  대표 테마(날짜 기준 멤버 최다)로 Sheet 생성 시 1행화 → 중복 탐색 제거
6.  reviewId = DB 생성, manual 저장의 안정적 join key (natural key 는 고아값 발생)
7.  컬럼 3분류: 고정/feature(표시)/m_(manual). 헤더 이름으로 자동 판별
8.  m_ 표시는 Sheet 에서, 저장은 DB payloadJson (full overwrite)
9.  URL = seed + replaceState mirror (SSOT 아님). viewMode 는 내부 state
10. 탐색 상태=store, 탐색=command API → 단축키 얹기 쉬운 구조
11. 좌측 side info / 우측 main 분봉
12. DB 저장 우선, Sheet write-back 후순위
```
