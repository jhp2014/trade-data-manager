# chart-review 5차 명세 — Google Sheet 읽기 배선 (mock → 실제 시트)

> 선행: SPEC-phase3.md(CSV → DB), SPEC-phase4.md(DB → Google Sheet export) 완료.
> 이 문서는 **chart-review 앱이 `mockSheetRows` 대신 Phase 4가 만든 실제 Google Sheet를 읽도록**
> 배선하는 단계다. **읽기 전용** — tradeTime·수동값 입력/저장은 범위 밖(다음 트랙, 9절).
>
> ⚠️ 이 문서는 파이프라인 합의 이전의 옛 phase5 초안을 **Phase 4 시트 포맷에 맞춰 전면 개정**한 것이다.
> (옛 초안의 "빈 tradeTime 행 skip" 규칙은 폐기 — Phase 4가 의도적으로 빈 tradeTime 행을 낸다.)

---

## 0. 목표 한 줄

`mockSheetRows` 직접 import를 **Google Sheets API 읽기**로 바꾼다. export 시트의 헤더 이름으로
컬럼을 3분류(고정/feature/`m_`)해 `SheetPointRow[]`로 파싱하고, 그 아래 그룹핑·탐색·차트는
지금 코드를 **거의 그대로** 재사용한다. 단, **tradeTime 빈 행(입력 대기 타깃)** 을 다룰 수 있게
파싱·그룹핑·마커에 최소 보강을 한다.

핵심: **Sheet → `SheetPointRow[]` 어댑터 한 겹 + 빈 tradeTime 대응**. 입력/저장은 안 한다.

---

## 1. 핵심 결정

- **읽기 전용.** 앱은 시트에 쓰지 않는다. 저장(tradeTime·m_→DB)은 다음 트랙(모달 입력, 9절).
  read scope = `https://www.googleapis.com/auth/spreadsheets.readonly`.
- **시트 포맷은 Phase 4 export 계약을 그대로 신뢰.** 헤더: 고정(`reviewId/stockCode/stockName/
  tradeDate/tradeTime/lineTargets`) + feature(`changeRate5m`…`cnt300Amt`) + `m_*`(수동).
- **빈 tradeTime 행 = "입력 대기" 타깃.** skip 하지 않는다. 그룹은 만들되 마커 없는 포인트로 둔다
  (차트는 보이고, 타점 표시만 없음). 사람이 차트 보고 시간 정할 대상.
- **빈 reviewId 대응.** Phase 4는 타점 없는 행의 reviewId를 공백으로 낸다 → 파서가 **합성 키**를
  부여(rowNumber 기반, 유일성 보장)해서 pointKey 충돌을 막는다.
- **파싱 순수함수 / I/O server action 분리.** 헤더 3분류·행 매핑은 순수(vitest), googleapis 호출은
  얇은 server action.
- **mock 보존.** env 없으면(개발/CI/타입체크/빌드) mock fallback. creds 없이 type-check/test/build 통과.

---

## 2. 추가 의존성 (apps/chart-review/package.json)

```jsonc
"dependencies": {
  "googleapis": "^144.0.0"   // 신규. spreadsheets.values.get 만 사용 (읽기 전용).
}
```

> review-ingest에 이미 들어간 것과 동일 버전. 설치 후 `pnpm install`.

---

## 3. 환경 변수 (루트 `.env` — Phase 4와 공유)

```
GOOGLE_SHEETS_ID=<스프레드시트 ID>           # Phase 4와 동일 시트
GOOGLE_SHEETS_TAB=review                      # Phase 4 export 탭 (기본 review)
GOOGLE_APPLICATION_CREDENTIALS=<json 경로>    # 서비스계정 keyFile (A안)
# 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (B안)
```

- **Phase 4와 같은 서비스 계정** 사용. 읽기만 하므로 scope는 readonly로 충분(쓰기 scope여도 무방).
- private key B안일 때 `.replace(/\\n/g, "\n")` 복원 필수.
- 인증 변수가 **하나라도 비면**(또는 GOOGLE_SHEETS_ID 없음) → Sheets 끄고 mock fallback(6.3).
- 나는 .env / 키 값 자체는 읽지 않는다 — 변수 이름만 합의.

---

## 4. Sheet 포맷 계약 (Phase 4 export 헤더와 짝)

### 4.1 1행 = 헤더, 2행부터 = 데이터

`rowNumber` = 시트 물리 행번호(헤더 1행 → 첫 데이터행 = 2). 파서가 부여.

### 4.2 헤더 → 3분류 (이름 기반)

```
고정 식별 : reviewId, stockCode, stockName, tradeDate, tradeTime, lineTargets
m_ 접두어 : m_* → manual (접두어 떼고 manual[key])
그 외     → features[header]   (읽기 전용 표시; changeRate*/cnt*Amt/dayHigh* 등)
```

- `lineTargets`는 고정 컬럼으로 인식하되, **이번 단계에선 features로 떨어뜨려도 무방**
  (가격선 렌더는 본 단계 범위 밖 — 9절). `SheetPointRow`에 새 필드 추가 안 함.
  → 즉 실제 구현은 "고정 5개(reviewId/stockCode/stockName/tradeDate/tradeTime) + lineTargets는
  features로" 가 가장 단순. 가격선이 필요해지면 그때 전용 필드 승격.
- 알 수 없는 헤더는 전부 features로 떨어지므로 안전(Phase 4가 컬럼을 늘려도 깨지지 않음).

### 4.3 필수 컬럼 가드

- **헤더 필수: `stockCode`, `tradeDate`** 2개. 없으면 파서가 명확한 에러
  (`[sheet] required column missing: stockCode`).
- **`tradeTime`은 필수 아님**(Phase 4가 빈 값 행을 의도적으로 냄).
- 데이터 행에서 `stockCode` 또는 `tradeDate`가 비면 **그 행만 skip + console.warn**. tradeTime 빈 건 정상.
- 전 컬럼 공백 행 skip.

### 4.4 reviewId / pointKey (빈 값 합성)

```
reviewId 값이 있으면(타점 행)   → reviewId 그대로, pointKey = reviewId
비어있으면(입력 대기 타깃 행)   → reviewId = "" 유지, pointKey = `pending:${stockCode}|${tradeDate}|${rowNumber}`
```

- rowNumber로 유일성 보장 → 한 그룹에 입력대기 행이 여러 개여도 pointKey 충돌 없음.
- pointKey는 화면 선택/URL 식별용. 빈 reviewId는 "아직 DB 타점 없음"의 의미(다음 트랙에서 생성).

### 4.5 tradeTime / tradeDate 정규화

- tradeTime: 값 있으면 **`HH:MM`로 정규화**(`HH:MM:SS`면 앞 5글자, 엑셀 시간직렬값이면 변환).
  값 없으면 `""` 유지. → 기존 `normalizeTradeTime`/`normalizeSeedTime`(phase2)과 일관.
- tradeDate: `YYYY-MM-DD` 문자열 계약. 다른 포맷이면 정규화.

---

## 5. 신규 파일

### 5.1 `src/lib/parseSheet.ts` (순수, 테스트 대상)

```ts
export function parseSheetValues(values: string[][]): SheetPointRow[];
```

- 1행 헤더 → 컬럼 인덱스 분류표(4.2) → 필수 가드(4.3, stockCode/tradeDate만).
- 2행부터: 고정필드 채우고, `m_*`→manual(접두어 제거), 나머지→features.
- reviewId/pointKey 합성(4.4), tradeTime/tradeDate 정규화(4.5), rowNumber = 시트 행번호.
- 빈 행 / 필수 결손 행 skip.
- **vitest**: 헤더 3분류 / `m_` 접두어 제거 / 필수컬럼 누락 에러 / 행 결손 skip /
  tradeTime 있음·없음 / reviewId 합성(빈 값) / 정규화.

> `SheetPointRow`의 `pointKey`는 현재 타입에 없다(groupSheetRows가 reviewId를 pointKey로 씀).
> 파서는 reviewId만 채우고, **pointKey 합성은 groupSheetRows의 toReviewPoint에서** 처리하는 게
> 변경 최소(6.4). 즉 빈 reviewId 행에 한해 toReviewPoint가 `pending:...` pointKey를 만든다.

### 5.2 `src/actions/sheet.ts` (server, I/O 얇게)

```ts
"use server";
export async function fetchSheetRowsAction(): Promise<SheetPointRow[]>;
```

- 서비스계정 인증(keyFile 우선 → email/key, readonly scope).
- `sheets.spreadsheets.values.get({ spreadsheetId, range: '<tab>', valueRenderOption: 'FORMATTED_VALUE' })`
  → `res.data.values ?? []` → `parseSheetValues`.
- 인증/네트워크 실패는 **throw**(조용한 mock 금지). 빈 시트는 에러 아님 → `[]`.

### 5.3 `src/lib/loadSheetRows.ts` (소스 선택 — 단일 진입점)

```ts
export async function loadSheetRows(): Promise<SheetPointRow[]>;
```

- `hasSheetsEnv()`(GOOGLE_SHEETS_ID + 인증 변수) true → `fetchSheetRowsAction()`,
  false → `mockSheetRows`. 어느 소스인지 1줄 로그.
- **page는 mock/Sheets를 몰라야 한다.** 소스 분기는 여기 한 곳.

---

## 6. 배선 (기존 파일 수정)

### 6.1 `app/review/[code]/[date]/[time]/page.tsx`

```ts
export const dynamic = "force-dynamic";
export default async function ReviewPage({ params }: ReviewPageProps) {
  const rows = await loadSheetRows();              // mock 직접 import 제거
  const groups = groupSheetRows(rows);
  const initialSelection = resolveInitialSelection(groups, {
    stockCode: params.code, tradeDate: params.date, tradeTime: params.time,
  });
  return <ReviewWorkspace groups={groups} initialSelection={initialSelection} />;
}
```
- 컴포넌트 **async**로. `resolveInitialSelection`/`ReviewWorkspace`는 유지.

### 6.2 `app/page.tsx` (홈 리다이렉트 — 빈 tradeTime 가드)

```ts
export default async function HomePage() {
  const rows = await loadSheetRows();
  if (rows.length === 0) { /* 빈 시트 안내 또는 notFound() */ }
  const first = rows[0];
  const timeSeg = first.tradeTime || "_";          // 빈 tradeTime이면 placeholder 세그먼트
  redirect(`/review/${first.stockCode}/${first.tradeDate}/${timeSeg}`);
}
```
- ⚠️ 현재는 `mockSheetRows[0].tradeTime`을 그대로 URL에 박아 빈 값이면 라우팅이 깨진다.
  빈 tradeTime이면 `_` 같은 placeholder 세그먼트로 넣고, `resolveInitialSelection`이
  매칭 실패 시 `points[0]` fallback 하므로 무탈(이미 그렇게 동작).

### 6.3 fallback 규칙

```
env 완비    → Google Sheets 읽기 (실데이터)
env 미설정  → mockSheetRows (개발/CI/타입체크/빌드)
Sheets 에러 → throw (조용한 mock 금지). 빈 시트는 에러 아님 → 빈 배열 → 안내/guard.
```

### 6.4 `lib/groupSheetRows.ts` (빈 tradeTime / 빈 reviewId 대응)

- `toReviewPoint`: `pointKey`를 **reviewId 있으면 reviewId, 없으면 `pending:${stockCode}|${tradeDate}|${rowNumber}`** 로.
  (stockCode/tradeDate는 row에서 접근 가능, rowNumber도 있음)
- 정렬 `a.tradeTime.localeCompare(b.tradeTime)`: 빈 문자열은 맨 앞 → 입력대기 포인트가 위로(무탈).
- `amountText: row.features.amountText ?? null`: Phase 4는 amountText를 안 내므로 `null`(="-" 표시). 그대로 둠.

### 6.5 `components/review/ReviewWorkspace.tsx` (마커/표시 가드)

- `markerTime`: tradeTime이 빈 문자열이면 `composeUnix` 호출하지 말고 **`null`**(마커 없음).
  현재 `normalizeTradeTime("")=""` → `composeUnix(date,"")`가 NaN/오동작할 수 있으니 가드 추가.
- PointList / 헤더의 `Point {tradeTime}`: 빈 값이면 **"미입력"** 같은 라벨로 표기(렌더 깨짐 방지).
- 그 외(차트/뷰모드/feature strip) 무수정.

> `groupSheetRows`/`resolveInitialSelection`/`ReviewWorkspace`의 **구조·시그니처는 유지**,
> 위 가드만 최소 추가. 차트 코드(RealMinute/DailyChart, useChartPreview)는 완전 무수정.

---

## 7. 범위 밖 (이번엔 안 함)

```
- tradeTime / m_ 입력·저장 (DB write)        → 다음 트랙(모달 입력, 9절)
- lineTargets 가격선 렌더                    → 후속(전용 필드 승격 + priceLines 연결)
- 시트 write-back (앱은 읽기 전용)
- 테마 전환 / overlay·theme view 실제 구현 (placeholder 유지)
- 시트 실시간 구독 / 새로고침 버튼 / 캐시 TTL (force-dynamic로 충분)
- 다중 탭 병합 (단일 range)
- PREVIEW_KEYS(manualSummary)를 Phase 4 m_ 키에 맞춰 재정렬 (선택 polish)
```

---

## 8. 완료 조건 (Acceptance)

```
1.  pnpm --filter @trade-data-manager/chart-review type-check 통과
2.  pnpm --filter @trade-data-manager/chart-review test 통과
    - 기존 groupSheetRows 테스트 유지
    - parseSheet 테스트 신규(5.1 케이스)
3.  env 미설정 시 mock fallback 으로 앱이 기존과 동일하게 동작(build 포함)
4.  env(시트ID+서비스계정) 설정 시 Phase 4 export 시트의 행이 그룹/Point List/차트에 렌더
5.  m_ 컬럼이 접두어 떼고 manual, 그 외 feature, 고정 컬럼이 식별 필드로 분류됨
6.  tradeTime 있는 타점 = 마커 표시, tradeTime 빈 타깃 = "입력 대기"로 그룹 안에 보이고
    차트는 렌더되되 마커 없음 (크래시 X, 라우팅 X)
7.  빈 reviewId 행이 합성 pointKey로 충돌 없이 선택/탐색됨
8.  필수 컬럼(stockCode/tradeDate) 누락 시 명확한 에러, 일부 행 결손 시 그 행만 skip
9.  page들이 mock/Sheets를 직접 모르고 loadSheetRows() 한 곳으로만 분기
10. 차트 코드(RealMinute/DailyChart, useChartPreview) 무수정
11. 앱은 시트에 쓰지 않는다 (readonly)
```

---

## 9. 구현 순서 권장

```
1. googleapis 추가 + pnpm install
2. lib/parseSheet.ts (순수) + vitest 부터 (3분류 / m_ / 필수가드 / 빈 tradeTime / reviewId 합성)
3. actions/sheet.ts (values.get + 인증 + readonly) → parseSheetValues 연결
4. lib/loadSheetRows.ts (env 분기, mock fallback)
5. groupSheetRows.toReviewPoint pointKey 합성 + ReviewWorkspace 마커/라벨 가드
6. page.tsx 2곳 async + loadSheetRows() (review = force-dynamic, home = 빈 time 가드)
7. env 미설정으로 type-check/test/build 확인 (mock 경로)
8. (creds 있으면) 실제 export 시트로 수동 확인: 그룹/Point List/차트/m_분류/빈 tradeTime 타깃
```

---

## 10. 다음 트랙 미리보기 (참고, 본 명세 범위 아님) — 입력/저장 (track C)

사용자 확정 방향:

```
- 입력은 사이드바가 아니라 [입력] 버튼 → 모달 폼 (공간 절약, 단순).
- 저장 경로 = DB 직접 (review_point 생성/갱신). 시트는 export 전용(읽기).
  · tradeTime 빈 타깃에서 시간 지정 → review_point 신규 생성 (getOrCreateReviewTargetId + insert point)
  · 기존 m_ 값 갱신 → payloadJson 덮어쓰기
  · 삭제 → 앱에서 review_point 삭제
- m_ 컬럼 입력 UX:
  · 해당 컬럼에 이미 입력된 값들을 추천(Selector/autocomplete)으로 제시 → 오타 없이 동일 값 재사용.
  · 컬럼별로 "추천 on/off" 설정 (긴 메모류는 off, 키워드성 값은 on).
  · 다중 값 입력 지원 (여러 값 선택 → 저장 시 배열, 시트 표기 시 " | " join).
- 저장 후 시트 최신화는 review-ingest export 재실행(Phase 4)로 (DB→Sheet 단방향 유지).
```
```
참고: track D — 테마 전환 / overlay·theme view 실제 구현은 별개.
```
