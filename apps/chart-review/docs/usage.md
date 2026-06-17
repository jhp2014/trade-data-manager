# 사용법

## 1. 화면 구성

| 영역 | 설명 |
|------|------|
| 헤더 | 현재 종목명/코드, 작업셋 내 위치(n/m), 가격 모드(KRX/NXT), Export·Import·설정 버튼 |
| 좌측 사이드바 | 테마 멤버 종목 리스트(클릭 시 차트만 임시 탐색) |
| 중앙 차트 | 뷰 모드에 따라 요약/분봉/일봉/오버레이 |
| 우측/하단 Point List | 현재 종목(그룹)의 타점 목록. 선택·입력·삭제 |

핵심 단위 두 가지:
- **그룹(Group)** = `(종목코드, 거래일)` 한 쌍. 작업셋은 그룹들의 목록이다.
- **타점(Point)** = 그룹 안의 한 시각(`tradeTime`). 한 그룹에 여러 타점이 있을 수 있다.

---

## 2. 단축키

> 입력창(INPUT/TEXTAREA/SELECT)이나 모달에 포커스가 있을 때는 전역 단축키가 동작하지 않는다(값 타이핑 보호). Ctrl/Cmd/Alt 조합도 무시.

### 전역

| 키 | 동작 |
|----|------|
| `q` / `e` | 이전 / 다음 **그룹**(종목)으로 이동 |
| `a` / `d` | 현재 차트 마커 시각을 -1분 / +1분 이동 |
| `Shift+a` / `Shift+d` | 현재 차트 마커 시각을 -20분 / +20분 이동 |
| `Ctrl+a` / `Ctrl+d` (`Cmd+a` / `Cmd+d`) | 이전 / 다음 **타점**으로 이동. 경계에 있어도 마커가 해당 타점 시각으로 스냅 |
| `w` / `s` | 현재 선택 테마의 멤버 리스트에서 위 / 아래 종목으로 임시 탐색 |
| `z` | 뷰 모드 순환 — `Summary → Minute → Daily → Overlay` |
| `c` | 테마 멤버/작업셋 밖 종목 임시 탐색을 해제하고 본 종목으로 복귀 |
| `Space` | 타점 **입력 드로어** 열기 |
| `Ctrl+Space` | 입력 드로어 안에서 저장 |
| `f` | 현재 active point 값을 **Write Tab** 마지막 행에 append |
| `r` | 읽기 Sheet Tab 순환. DB 모드에서는 첫 Sheet Tab으로 복귀 |
| `t` | 가격 모드 토글 — KRX ↔ NXT |
| `x` | 분봉 차트를 마커 중심 확대 ↔ 기본 뷰로 토글 |
| `Tab` | **탐색 히스토리 스위처** 열기 |
| `Shift` + 휠 | 차트 마커 시각(tradeTime) ±1분 미세 이동 |
| GroupId **붙여넣기** | `005930-2026-05-27` 형식을 붙여넣으면 즉시 해당 그룹으로 점프 |
| CaseId **붙여넣기** | `036570-2026-06-02-1035` (GroupId + `HHmm`) 형식. 해당 그룹으로 점프한 뒤 시각과 일치하는 타점을 선택(없으면 첫 타점, 타점 자체가 없으면 기본 마커 위치) |
| `1`~`4` | 퀵 입력 프리셋 그룹 열기(해당 그룹에 프리셋이 있을 때만) |

필터가 켜져 있으면 `q`/`e`는 **매칭 타점이 있는 종목만** 순회한다(종목 내부에서는 전 타점을 그대로 보여주되 매칭 배지를 표시).

### 퀵 입력 프리셋 (숫자키 1~4)

| 키 | 동작 |
|----|------|
| `1`~`4` | 해당 숫자의 프리셋 그룹 열기 |
| 같은 숫자 다시 입력 | 열린 그룹 안에서 다음 프리셋으로 이동 |
| 다른 숫자 입력 | 다른 프리셋 그룹으로 점프 |
| `w` / `s` | 열린 그룹 안에서 이전 / 다음 프리셋 |
| `Space` / `Enter` | 현재 프리셋 적용 |
| `Esc` | 취소 |

프리셋은 설정 모달에서 정의하며 브라우저 `localStorage`에 저장된다. 적용 시 현재 active point의 manual payload에 병합한 뒤 `POST /api/review/point`로 저장한다. 액션은 덮어쓰기, 추가, 삭제 세 가지다.

### Tab 히스토리 스위처 (모달 안에서)

| 키 | 동작 |
|----|------|
| `Tab` / `s` | 다음 항목 |
| `Shift+Tab` / `w` | 이전 항목 |
| `Space` / `Enter` | 선택 확정 |
| `Esc` | 취소 |
| (무입력 2초) | 현재 하이라이트로 자동 확정 |

히스토리에는 **GroupId 붙여넣기/스위처로 도달한 그룹만** 기록된다(`q`/`e` 순회는 기록하지 않음). MRU 순서로 최대 30개 유지.

### 모달 공통

- `Esc` — 열린 모달/드로어 닫기
- 설정 모달의 일반 입력칸에서는 전역 단축키가 동작하지 않는다.
- 입력 드로어에서는 `Enter`가 현재 행의 값을 칩으로 확정하고, `Ctrl+Space`가 저장이다.

---

## 3. 작업셋(Read Sheet) 운용 — = 북마크

복기 대상 목록은 **연결된 Google Sheet**가 정한다. 시트에 보고 싶은 행만 남겨두면 그게 곧 작업셋이자 북마크 컬렉션이다.

- 시트에서 읽는 컬럼은 **`stockCode`, `tradeDate` 두 개뿐**이다(헤더 이름 기준). `(종목코드, 거래일)`로 dedupe 해서 "어떤 그룹을 볼지"만 결정하고, 실제 타점/값은 DB에서 가져온다. 시트의 `tradeTime`·`m_`·feature 컬럼은 **읽기 단계에서 무시**된다.
- 설정 우선순위: **쿠키(브라우저별) → env(`GOOGLE_SHEETS_ID`/`GOOGLE_SHEETS_TAB`) → 없음(=DB 전체)**.
- 쿠키 기반이라 **사람마다 다른 작업셋**을 동시에 쓸 수 있다(같은 서버라도). 단, 계정이 아니라 브라우저 단위이며 별도 인증은 없다.

### 설정 방법 (헤더 설정 모달)

| 동작 | API |
|------|-----|
| 현재 설정 조회 | `GET /api/review/read-sheet` |
| 작업셋 시트 지정(쿠키 저장) | `POST /api/review/read-sheet` `{ spreadsheetId, tab? }` |
| 작업셋 해제(env 폴백) | `DELETE /api/review/read-sheet` |

> 북마크 컬렉션을 여러 개 두고 싶으면 **같은 스프레드시트의 탭을 여러 개** 만들어 `tab`만 바꿔 가리키면 된다.

### Read Tab / DB 모드 / Write Tab

헤더의 탭 칩은 다음 상태를 가진다.

| 항목 | 설명 |
|------|------|
| `⇌` | 읽기 소스를 DB 전체와 Sheet Tab 사이에서 전환 |
| 읽기 칩 (`review`, `tab2`, `DB` 등) | 클릭하거나 `r`을 누르면 Sheet Tab을 순환. DB 모드에서는 Sheet Tab으로 복귀 |
| `→` 오른쪽 Write Tab 칩 | 클릭하면 쓰기 대상 탭을 순환. 새 탭 이름 지정은 설정 모달에서 한다 |
| `↻` | 현재 읽기 소스 재조회. DB 모드면 DB 전체, Sheet 모드면 현재 탭 |

탭별 마지막 위치는 `localStorage`의 `tabPositions`에 저장된다. A 탭에서 30번째 종목을 보다가 B 탭으로 갔다가 다시 A 탭으로 돌아오면 가능한 경우 그 위치를 복원한다.

---

## 4. 타점 입력 / 삭제

- `Space` → 입력 드로어. 현재 마커 시각(`HH:MM`)이 입력 대상 `tradeTime`이 된다(Shift+휠로 분 조정).
- 값은 **수동 키 레지스트리(`review_manual_key`)** 가 정의한 키들을 행으로 렌더하며, 멀티값은 칩으로 추가한다.
- 저장: `POST /api/review/point` `{ stockCode, tradeDate, tradeTime, payload }` (upsert).
- 삭제: `DELETE /api/review/point` `{ reviewId }`.
- 현재 마커 시각에 이미 point가 있으면 수정 모드, 없으면 신규 입력 모드다.
- 신규 입력은 같은 종목/거래일의 기존 point manual 값을 기본 복사한다.

수동 키 자체의 추가/이름변경/삭제는 `/api/review/manual-keys` (GET/POST/PATCH/DELETE). **키 삭제는 파괴적** — 레지스트리뿐 아니라 모든 타점 payload에서 해당 키를 제거한다.

---

## 5. 필터 (m_ 값 필터)

- 설정 모달에서 `m_` 키별 허용 값을 고른다. 키 간 **AND**, 같은 키의 값 간 **OR**.
- 필터가 켜지면 `a`/`d` 순회 대상이 "매칭 타점이 1개 이상인 종목"으로 좁혀진다.
- 필터 상태는 `localStorage`(zustand persist, `chart-review-ui`)에 저장된다.

---

## 6. 내보내기 / 가져오기 (Google Sheet)

### Export — DB → Sheet

`POST /api/review/export` `{ spreadsheetId?, tab?, filters?, scope? }`

- `scope="working"`(기본): 현재 작업셋 범위의 타점만. 시트 미설정이면 자동으로 DB 전체.
- `scope="all"`: DB 전체 타점.
- `filters`: 위 범위 안에서 매칭 타점만.
- 타점 1건 = 1행. `spreadsheetId`/`tab` 미지정 시 env 기본값. 탭이 없으면 생성.
- 쓰기에는 서비스 계정이 시트에 **편집자**로 공유돼 있어야 한다.

### Import (merge) — Sheet → DB

`POST /api/review/import-merge` `{ spreadsheetId?, tab? }`

- 시트의 **비어있지 않은 `m_` 값만** DB payload에 병합(덮어쓰기). **빈 셀은 건드리지 않는다**(삭제 금지).
- 행 식별: `reviewId` 우선, 없으면 `(code+date+time)` 좌표. 못 찾으면 스킵 후 리포트.
- 미지정 시 읽기 시트 설정(쿠키/env)을 사용.

### CSV Import

`POST /api/review/import-csv` — CSV 파일로 대량 입력(상세는 라우트 참조).

---

## 7. 환경 변수

복기 데이터 연결·시트 내보내기에 필요한 변수는 루트 `.env.example`의 `review-ingest` 섹션 참조:

- `DATABASE_URL` — 없으면 mock 데이터로 폴백
- `GOOGLE_SHEETS_ID` / `GOOGLE_SHEETS_TAB` — 작업셋·Export 기본 시트
- `GOOGLE_APPLICATION_CREDENTIALS` 또는 (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`) — 시트 읽기/쓰기 자격증명
- `REVIEW_APP_BASE_URL` — Export 시 행에 심는 복기 링크의 베이스

설정값이 코드 어디에 있는지는 `configuration.md`와 [code-map.md](./code-map.md) 참조.
