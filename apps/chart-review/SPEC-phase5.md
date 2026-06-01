# chart-review 5차 명세 — Google Sheets 읽기 + 앱 입력

> ⚠️ 이 문서는 CSV→review_point 파이프라인(Phase 3·4) 합의 **이전**에 작성됐다.
> Sheets **읽기 메커니즘(서비스계정 인증/클라이언트/헤더 3분류 파싱)** 은 그대로 유효하나,
> 데이터 모델·흐름은 Phase 3/4 확정사항(review_point 테이블, line_TARGET 가격선, tradeTime 앱 입력)에
> 맞춰 이 단계 직전에 개정한다.

> 선행: SPEC.md, SPEC-phase2.md, SPEC-phase3.md(CSV→review_point), SPEC-phase4.md(review_point→Sheet).
> 이 문서는 리스트 소스를 mock → Google Sheet 로 교체하고, line_TARGET 가격선 렌더 +
> tradeTime 앱 입력(→DB 저장)을 추가한다.

---

## 0. 목표 한 줄

`mockSheetRows` 직접 import를 **Google Sheets API 읽기**로 바꾼다. Sheet의 헤더 이름으로
컬럼을 3분류(고정/feature/m_)해 `SheetPointRow[]`로 파싱하고, 그 뒤 그룹핑·탐색·차트는
지금 코드 그대로(`groupSheetRows`, `ReviewWorkspace`) 재사용한다.

핵심: **Sheet → `SheetPointRow[]` 어댑터 한 겹만 새로 만든다.** 그 아래는 무수정.

---

## 1. 핵심 결정

- **읽기 전용.** 앱은 Sheet에 쓰지 않는다(write-back은 영구 후순위, SPEC.md 14절). manual 저장은
  트랙 C에서 **DB로** 한다. Sheet는 사람이 엑셀에서 편집하는 입력 공간 그대로 둔다.
- **Sheet 생성(DB→Sheet)은 이 트랙 범위 밖.** 이 앱은 "이미 만들어진 Sheet"를 읽기만 한다.
  reviewId·대표 테마를 채우는 생성 파이프라인은 별도(추후). 그 전까지는 4.4의 전환용 fallback 사용.
- **파싱 로직(순수 함수)과 I/O(server action)를 분리.** 헤더 3분류·행 매핑은 순수 함수로 떼서
  vitest로 테스트한다(부수효과 없음). Google API 호출은 얇은 server action에만 둔다.
- **mock은 지우지 않는다.** env가 없을 때(개발/CI/타입체크) **자동 fallback 소스**로 남긴다.
  → creds 없이도 type-check / test / build 가 통과해야 함(완료조건 1·2).

---

## 2. 추가 의존성 (apps/chart-review/package.json)

```jsonc
"dependencies": {
  "googleapis": "^144.0.0"   // 신규. 공식 클라이언트. sheets.spreadsheets.values.get 만 사용.
  // 기존 deps 전부 유지
}
```

> 대안으로 `google-spreadsheet`(경량)도 있으나, 공식 `googleapis`가 타입/인증이 명확하고
> values.get 한 호출이면 충분하므로 이걸로 간다. 설치 후 `pnpm install`.

---

## 3. 환경 변수 (루트 `.env`)

```
# 어느 시트를 읽나
GOOGLE_SHEETS_ID=<스프레드시트 ID (URL의 /d/ 와 /edit 사이 토큰)>
GOOGLE_SHEETS_RANGE=Sheet1!A1:ZZ        # 헤더 포함 A1 기준 범위. 탭 이름 맞출 것.

# 인증 — 서비스 계정 (비공개 시트 권장 방식)
GOOGLE_SERVICE_ACCOUNT_EMAIL=<서비스계정 이메일>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private key. \n 이스케이프된 1줄로>
```

- **서비스 계정 방식**을 1순위로 한다: 시트를 비공개로 두고, 그 서비스계정 이메일에
  "뷰어" 권한만 공유하면 됨. scope = `https://www.googleapis.com/auth/spreadsheets.readonly`.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`는 .env에 한 줄로 들어가므로, 코드에서 읽을 때
  `.replace(/\\n/g, "\n")` 로 개행 복원 필수(안 하면 "invalid key" 에러).
- (간이 대안) 시트를 "링크가 있는 모두 보기"로 공개할 거면 서비스계정 대신 `GOOGLE_API_KEY`
  하나로도 read 가능. 1순위는 비공개+서비스계정. **나는 .env를 읽지 않는다 — 변수 이름만 합의.**
- 이 변수들이 **하나라도 비면** Sheets를 끄고 mock fallback(1절·6.3).

---

## 4. Sheet 포맷 계약 (헤더 규약 — SPEC.md 6절 재확인)

### 4.1 1행 = 헤더, 2행부터 = 데이터

`rowNumber`는 컬럼이 아니라 **시트 물리 행번호**(헤더가 1행이면 첫 데이터행 = 2). 파서가 부여한다.

### 4.2 헤더 → 3분류 (이름 기반, 설정 없음)

```
고정 식별 : stockCode, stockName, tradeDate, tradeTime, themeId, themeName, reviewId
m_ 접두어 : m_* → manual (접두어 떼고 manual[key])
그 외     → features[header]  (읽기 전용 표시)
```

- 고정 헤더는 **정확 일치**로 인식. 흔한 변형 흡수용 alias 맵을 파서에 둔다(소문자/카멜 혼용 대비):
  ```
  code|stock_code → stockCode,  name|stock_name → stockName,
  date|trade_date → tradeDate,  time|trade_time → tradeTime,
  theme_id → themeId,  theme|theme_name → themeName,  review_id → reviewId
  ```
  (필요 최소만. 모르는 헤더는 전부 features로 떨어지므로 안전.)
- `amountText`: Point List 표기는 `toReviewPoint`가 `row.features.amountText`를 읽는다(현 코드 유지).
  → 시트에 `amountText` feature 컬럼이 있으면 그대로 잡힌다. 없으면 표기만 빈다(크래시 X).

### 4.3 필수 컬럼 가드

`stockCode`, `tradeDate`, `tradeTime` **세 개는 필수**. 헤더에 없으면 파서가 명확한 에러를 던진다
(`[sheet] required column missing: tradeTime`). 데이터 행에서 이 셋 중 하나라도 비면 **그 행만 skip**
하고 `console.warn`(전체 실패 아님).

### 4.4 reviewId (전환 처리)

- 트랙 C(DB 저장)의 join key. **DB→Sheet 생성이 reviewId를 채우는 게 정석**(SPEC.md 4.3).
- 생성 파이프라인이 아직 없으므로 전환 규칙:
  ```
  reviewId 컬럼 값이 있으면      → 그대로 사용
  비어있으면(전환기 crutch)      → `${stockCode}|${tradeDate}|${tradeTime}` 합성 + console.warn 1회
  ```
- 합성 키는 **임시방편**임을 주석/경고로 명시. 트랙 C 시작 전 reviewId 채우기를 권고.

### 4.5 tradeTime 정규화

- 시트 값이 `HH:MM` / `HH:MM:SS` / 엑셀 시간직렬값 등으로 들어올 수 있다.
- 파서에서 **`HH:MM`로 정규화**(mock·URL seed와 동일 포맷). `HH:MM:SS`면 앞 5글자 슬라이스.
  엑셀 직렬 시간값(0~1 소수)이 오면 `HH:MM`으로 변환(또는 시트 셀 서식을 텍스트로 두도록 계약).
- tradeDate는 `YYYY-MM-DD` 문자열 계약(엑셀에서 텍스트/날짜서식 일관). 다른 포맷이면 정규화.
- 이 정규화 덕에 phase-2의 `normalizeSeedTime`/`normalizeTradeTime` 봉합이 그대로 맞는다.

---

## 5. 신규 파일

### 5.1 `src/lib/parseSheet.ts` (순수, 테스트 대상)

```ts
// 부수효과 없음. 2차원 문자열 배열 → SheetPointRow[]
export function parseSheetValues(values: string[][]): SheetPointRow[];
```

- 1행을 헤더로 읽어 컬럼 인덱스 분류표 작성(4.2) → 필수 가드(4.3).
- 2행부터 행 매핑: 고정필드 채우고, `m_*` → `manual`(접두어 제거), 나머지 → `features`.
- reviewId 전환 처리(4.4), tradeTime/tradeDate 정규화(4.5), rowNumber = 시트 행번호.
- 빈 행(전 컬럼 공백) skip.

### 5.2 `src/actions/sheet.ts` (server, I/O 얇게)

```ts
"use server";
// googleapis 로 values.get → parseSheetValues 호출 → SheetPointRow[]
export async function fetchSheetRowsAction(): Promise<SheetPointRow[]>;
```

- 서비스계정 JWT(`google.auth.JWT` 또는 `GoogleAuth`)로 readonly scope 인증.
- `sheets.spreadsheets.values.get({ spreadsheetId, range })` → `res.data.values ?? []`.
- private key `\n` 복원(3절). 결과를 `parseSheetValues`에 넘겨 반환.
- 에러는 throw하지 말고 상위에서 fallback 가능하도록… 단, **인증/네트워크 실패는 throw**해서
  "조용히 mock"으로 오인하지 않게 한다. fallback은 **env 미설정**일 때만(6.3).

### 5.3 `src/lib/loadSheetRows.ts` (소스 선택 — 단일 진입점)

```ts
// 서버에서만 호출. env 있으면 Sheets, 없으면 mock.
export async function loadSheetRows(): Promise<SheetPointRow[]>;
```

- `hasSheetsEnv()`(GOOGLE_SHEETS_ID + 인증 변수 존재) 검사 → true면 `fetchSheetRowsAction()`,
  false면 `mockSheetRows`(dev fallback) 반환. 콘솔에 어느 소스를 썼는지 1줄 로그.
- **page들은 mock/Sheets를 몰라야 한다.** 오직 `loadSheetRows()`만 안다(소스 교체 지점 1곳).

---

## 6. 배선 (기존 파일 수정)

### 6.1 `app/review/[code]/[date]/[time]/page.tsx`

```ts
export default async function ReviewPage({ params }: ReviewPageProps) {
  const rows = await loadSheetRows();              // mockSheetRows 직접 import 제거
  const groups = groupSheetRows(rows);
  const initialSelection = resolveInitialSelection(groups, {
    stockCode: params.code, tradeDate: params.date, tradeTime: params.time,
  });
  return <ReviewWorkspace groups={groups} initialSelection={initialSelection} />;
}
```
- 컴포넌트를 **async**로. `groupSheetRows`/`resolveInitialSelection`/`ReviewWorkspace` 무수정.
- 동적 렌더 강제: 파일에 `export const dynamic = "force-dynamic";`(시트가 매 요청 최신이도록).
  또는 6.4의 캐시 정책 적용.

### 6.2 `app/page.tsx` (홈 리다이렉트)

```ts
export default async function HomePage() {
  const rows = await loadSheetRows();
  if (rows.length === 0) { /* 빈 시트 안내 페이지 또는 notFound() */ }
  const first = rows[0];
  redirect(`/review/${first.stockCode}/${first.tradeDate}/${first.tradeTime}`);
}
```
- mock 직접 import 제거 → `loadSheetRows()`. 빈 시트일 때 redirect 대상이 없으니 가드.

### 6.3 fallback 규칙 정리

```
env 완비    → Google Sheets 읽기 (실데이터)
env 미설정  → mockSheetRows (개발/CI/타입체크/빌드)
Sheets 에러 → throw (조용한 mock 금지). 빈 시트는 에러 아님 → 빈 배열.
```

### 6.4 (선택) 캐시 / 쿼터 보호

- Sheets API에 매 요청 직격하지 않도록 짧은 TTL 캐시 권장(예: `unstable_cache` 60s,
  또는 모듈 스코프 in-memory `{ data, ts }` 60s). 과하면 생략하고 `force-dynamic`만.
- 명시적 새로고침은 브라우저 새로고침(라우트 재요청)으로 충분(이 트랙엔 새로고침 버튼 미구현).

---

## 7. 범위 밖 (이번에도 안 함)

```
- Sheet write-back (앱은 읽기 전용)
- DB manual 저장 / 저장 버튼          → 트랙 C
- 테마 전환(대표 테마 외) / findThemesByStockAndDate → 트랙 D
- 대표 테마 산출 / DB→Sheet 생성 파이프라인 (reviewId·대표테마 채우기)
- overlay / theme view mode 실제 구현
- 단축키 바인딩
- 시트 변경 실시간 구독 / 새로고침 버튼 UI
- 다중 시트/탭 병합 (단일 range)
```

---

## 8. 완료 조건 (Acceptance)

```
1.  pnpm --filter @trade-data-manager/chart-review type-check 통과
2.  pnpm --filter @trade-data-manager/chart-review test 통과
    - 기존 groupSheetRows 테스트 유지
    - parseSheet 테스트 신규: 헤더 3분류 / m_ 접두어 제거 / 필수컬럼 누락 에러 /
      빈 행 skip / reviewId fallback / tradeTime 정규화 케이스
3.  env 미설정 시 mock fallback 으로 앱이 기존과 동일하게 동작 (build 포함)
4.  env(GOOGLE_SHEETS_ID + 서비스계정) 설정 시 실제 Sheet 행이 그룹/Point List에 렌더
5.  m_ 컬럼이 접두어 떼고 manual 로, 그 외가 features 로, 고정 컬럼이 식별 필드로 분류됨
6.  Sheet의 (stockCode, tradeDate) 가 DB 캔들과 맞으면 트랙 A 차트가 그대로 렌더
7.  필수 컬럼 누락 시 명확한 에러, 일부 행 결손 시 그 행만 skip (전체 크래시 X)
8.  reviewId 컬럼이 있으면 사용, 없으면 합성 + 경고 (전환 동작)
9.  page 들이 mock/Sheets 를 직접 알지 않고 loadSheetRows() 한 곳으로만 소스 분기
10. groupSheetRows / resolveInitialSelection / ReviewWorkspace / 차트 코드 무수정
11. 앱은 Sheet 에 쓰지 않는다 (readonly scope)
```

---

## 9. 구현 순서 권장

```
1. googleapis 추가 + pnpm install
2. lib/parseSheet.ts 작성 (순수) + vitest 테스트부터 (헤더 분류·m_·필수가드·정규화·fallback)
3. actions/sheet.ts (values.get + 인증 + private key \n 복원) → parseSheetValues 연결
4. lib/loadSheetRows.ts (env 분기, mock fallback)
5. page.tsx 2곳을 async + loadSheetRows() 로 교체 (force-dynamic)
6. env 미설정 상태로 type-check / test / build 확인 (mock 경로)
7. (creds 있으면) 실제 시트로 수동 확인: 그룹핑 / Point List / 차트 / m_ 분류
8. reviewId 미채움 시 경고·합성 동작 확인 → 트랙 C 전 reviewId 채우기 메모
```

---

## 10. 다음 트랙 미리보기 (참고, 본 명세 범위 아님)

```
C. DB manual 저장 : data-core 에 manual_point 테이블 + saveManualAction(reviewId, payloadJson 덮어쓰기)
                    + ReviewWorkspace 저장 버튼. reviewId 안정성 전제(4.4).
D. 테마 전환      : findThemesByStockAndDate 로 대표 테마 외 후보 조회 + 선택 point 기준 정렬,
                    분봉 overlay/theme view mode 실제 구현.
```
