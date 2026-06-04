# 설정값 지도 (configuration)

chart-review 의 설정값은 **한 파일에 모으지 않는다.** 대신 "그 값을 _누가·언제_ 바꾸는가"에 따라 사는 곳이 다르다. 이 문서는 설정값이 흩어져 있다고 느낄 때 **어디를 봐야 하는지**를 알려주는 색인이다.

## 설정이 사는 4개의 층

| 층 | 매체 | 누가 바꾸나 | 범위 |
|----|------|------------|------|
| **환경 변수(env)** | 루트 `.env` (예시: `.env.example`) | 운영자/배포 | 서버 인스턴스 전체 |
| **쿠키** | 브라우저 쿠키 `cr_read_sheet` | 사용자(앱 설정 UI) | 브라우저별 |
| **localStorage** | `chart-review-ui` (zustand persist) | 사용자(설정 모달/뷰) | 브라우저별 |
| **코드 상수** | `src/lib/*.ts` 등 | 개발자(커밋) | 빌드 전체 |

> 원칙: **사람·인스턴스마다 달라야 하는 값**은 env/쿠키/localStorage 로, **모두에게 같아야 하는 동작 수치**는 코드 상수로. UI에서 바꾸는 값은 코드에 박지 않는다.

---

## 1. 환경 변수 (서버)

chart-review 는 별도 `.env.example` 을 두지 않고 **루트 `.env`** 를 쓴다. 관련 키는 `review-ingest` 섹션에 있다.

| 변수 | 용도 | 비고 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 접속(진실 원천) | 필수 |
| `GOOGLE_SHEETS_ID` | 작업셋 기본 스프레드시트 ID | 쿠키 미설정 시 폴백 |
| `GOOGLE_SHEETS_TAB` | 작업셋 기본 탭(기본 `review`) | 〃 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 서비스계정 JSON 키 **파일 경로** | 인증 방식 A |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | 서비스계정 인라인 자격증명 | 인증 방식 B(A 없을 때) |
| `REVIEW_APP_BASE_URL` | 앱 베이스 URL(기본 `http://localhost:3200`) | 외부 호출용 |
| `CHART_REVIEW_TARGET_DIR` | CSV 타겟 적재 디렉터리 | 미설정 시 기본 경로 |

- **자격증명은 항상 env 에서만** 읽는다(쿠키로 덮어쓰지 않음). 코드: `hasSheetsCredentials()` in `src/lib/readSheetConfig.ts`.
- env 값 자체(비밀)는 저장소에 두지 않는다. `.env.example` 은 변수 _이름_ 만 담은 비밀 아닌 템플릿이다.

## 2. 쿠키 — 읽기 시트(작업셋)

| 쿠키 | 값 | 정의 위치 |
|------|-----|----------|
| `cr_read_sheet` | JSON `{ id, tab }` | `READ_SHEET_COOKIE` in `src/lib/readSheetConfig.ts` |

- 우선순위: **쿠키 → env(`GOOGLE_SHEETS_*`) → 없음(=DB 전체)**. 해석은 `getReadSheetConfig()`.
- 쿠키라서 **브라우저마다 다른 작업셋**을 동시에 쓸 수 있다(= 사람마다 다른 북마크). → [decisions/003](./decisions/003-read-sheet-as-bookmark.md)
- 설정 UI: 설정 모달 → "읽기 시트 (작업셋)" (`src/components/review/modals/ReadSheetModal.tsx`), API: `src/app/api/review/read-sheet/route.ts`.

## 3. localStorage — UI 환경설정

| 키 | 내용 |
|----|------|
| `chart-review-ui` | zustand `persist` 스토어(`src/stores/useUiStore.ts`) |

`partialize` 로 저장되는 필드:

| 필드 | 의미 | 바꾸는 곳 |
|------|------|----------|
| `chartPriceMode` | 가격 모드 `krx`\|`nxt`(기본 `krx`) | 헤더 토글 |
| `headerFieldKeys` | 헤더에 작게 노출할 m_/feature 키(순서 유지) | 설정 → 헤더 표시 필드 |
| `pointFieldKeys` | Point List 카드에 노출할 m_ 키 | 설정 → Point List 표시 필드 |
| `manualFilters` | m_ 값 필터(`key → 허용값[]`) | 설정 → m_ 값 필터 |
| `writeTab` | `f` 키 append와 Export/Import 기본 쓰기 탭 | 헤더 Write Tab 칩, 설정 → 탭 |
| `exportFieldKeys` | `f` append/Export에 사용할 필드 순서 | 설정 → Export 필드 |
| `tabPositions` | 읽기 탭/DB 모드별 마지막 그룹·타점 위치 | 탭 전환 시 자동 저장 |
| `cycleTabList` | `r` 키로 순환할 읽기 탭 제한 목록 | 설정 → 탭 |
| `inputKeyOrder` | 입력 드로어의 m_ 컬럼 표시 순서 | 설정 → 입력 필드 |
| `inputKeyDisabled` | 입력 드로어에서 숨길 m_ 컬럼 | 설정 → 입력 필드 |
| `quickPresetGroups` | 숫자키 1~4 퀵 입력 프리셋 정의 | 설정 → 퀵 프리셋 |
| `minuteZoomCandles` | `x` 키 확대 시 마커 중심 캔들 수 | 설정 |
| `minuteClipEnd` | 분봉 기본 뷰 클립 종료 시각 | 설정 |

> 세션 상태(선택 그룹/타점, 뷰 모드, override, 히스토리)는 **persist 하지 않는다** — `src/stores/useReviewStore.ts`. 새로고침하면 URL 기준으로 복원된다.

## 4. 코드 상수 (빌드 고정값)

UI로 바꾸지 않고 **모두에게 동일**해야 하는 동작 수치. 성격별로 두 파일에 나눠 둔다.

### `src/lib/constants.ts` — 차트·리스트 수치

| 상수 | 값 | 의미 |
|------|-----|------|
| `CHART_HOVER_DELAY_MS` | 200 | 크로스헤어 툴팁 표시 지연 |
| `CHART_PARAMS_DEBOUNCE_MS` | 200 | q/e 빠른 그룹 탐색 시 차트 fetch 디바운스 |
| `CHART_OVERLAY_MAX_SERIES` | 15 | 테마 오버레이 최대 시리즈 수 |
| `DEFAULT_MINUTE_ZOOM_CANDLES` | 150 | `x` 키 확대 시 분봉 표시 개수 |
| `DEFAULT_MINUTE_CLIP_END` | `"15:30"` | 분봉 기본 뷰가 자동으로 보여주는 종료 시각 |
| `AMOUNT_MIL_TO_EOK` | 100 | daily 거래대금(백만원)→억 변환 |
| `AMOUNT_KRW_TO_EOK` | 1e8 | minute 거래대금(원)→억 변환 |
| `LIST_PAGE_SIZE` | 100 | 덱 항목 페이지 사이즈 |
| `PEER_ROW_AMOUNT_HIGHLIGHT_THRESHOLDS_EOK` | `[50,70,100]` | PeerList 누적 거래대금 강조 임계값(억) |

### `src/lib/shortcuts.ts` — 복기 UX(단축키·뷰·마커)

| 상수/함수 | 의미 |
|-----------|------|
| `VIEW_MODES` / `VIEW_MODE_CYCLE` | 중앙 차트 뷰 순서·라벨(헤더 세그먼트 + z 순환의 단일 출처) |
| `cycleViewMode(cur, ±1)` | 현재 뷰에서 한 칸 순환 |
| `SHORTCUT_KEYS` | 전역 단축키 매핑(q/e/a/d/w/s/z/c/f/r/t/x/Space) |
| `DEFAULT_MARKER_MINUTES` | 540(=09:00). tradeTime 없을 때 마커 기본값 |
| `MARKER_WHEEL_STEP_MIN` | Shift+휠 1노치당 마커 이동(분) |
| `MARKER_HOUR_STEP_MIN` | Shift+a/d 1회 마커 이동(분). 현재 값은 20 |
| `SWITCHER_AUTO_COMMIT_MS` | Tab 히스토리 스위처 자동 확정 지연 |

단축키 _동작_ 자체는 `useGlobalShortcuts`(`src/hooks/useGlobalShortcuts.ts`)가 이 매핑을 읽어 처리한다.

### 그 밖에 의도적으로 지역에 둔 값

전역으로 끌어올릴 이유가 없는(한 파일에서만 쓰는) 값은 그 파일에 둔다.

| 값 | 위치 | 이유 |
|----|------|------|
| `HISTORY_LIMIT` (30) | `src/stores/useReviewStore.ts` | 히스토리 MRU 길이 — 스토어 내부 관심사 |
| `VALUE_TRUNCATE` (15) | `src/components/review/ReviewWorkspace.tsx` | 한 컴포넌트의 표시 절단 길이 |
| `DEFAULT_TAB` (`"review"`) | `src/lib/readSheetConfig.ts` | 읽기 시트 해석 기본 탭 |

---

## 새 설정값을 추가할 때

1. **사람/인스턴스마다 달라야 하나?** → env(서버) 또는 쿠키/localStorage(사용자).
2. **모두에게 같은 동작 수치인가?** → 코드 상수.
   - 차트·리스트 수치 → `constants.ts`
   - 단축키·뷰·마커 → `shortcuts.ts`
   - **한 파일에서만 쓰나?** → 그 파일에 지역 상수로 두고 끌어올리지 않는다.
3. UI에서 토글되는 값을 코드에 하드코딩하지 않는다(반대도 마찬가지).
