# 006. Sheet Tab 관리 — 빠른 탭 전환 · Write Append · Export 컬럼 통합

> 상태: **방향 확정(미구현)** · 작성 2026-06-04
> 관련: [003 읽기 시트 북마크](./003-read-sheet-as-bookmark.md)

---

## 1. 사용자 결정 (이 대화에서 확정)

1. **SpreadsheetId 단일 사용.** Read/Write/Merge/Export 모두 동일한 spreadsheetId 사용.
   Settings 에서 ID만 변경. 탭 선택은 헤더 칩으로 분리.
2. **전탭 eager preload.** Sheet Tab 은 같은 DB 데이터의 필터 역할이므로 대부분
   중복 데이터 → 전탭 동시 로드 부담 없음. 탭이 월별 분류라면 데이터 자체가 작음.
3. **탭별 포지션 메모리.** 탭 이동 후 돌아오면 이전 탐색 위치(groupIndex, pointKey) 복원.
4. **헤더에 Read/Write 탭 칩 항상 노출.** 클릭으로 드롭다운, 단축키도 나중에 추가 가능.
5. **`f` 키 → Write Tab 마지막 Row 밑에 Append.** 현재 탐색 종목을 history 에 추가.
6. **exportFieldKeys 통합.** f-append · DB Export · 작업셋 Export · 필터 Export
   모두 동일한 컬럼 설정 사용. 순서 지정 가능.

---

## 2. 아키텍처 전환: RSC → 클라이언트 캐시

### 현재 구조
```
Page(RSC) ─── DB+Sheet(현재 탭) ──→ groups ──→ ReviewWorkspace(props)
```
탭 전환 = `router.refresh()` (전체 페이지 재로드 → 느림).

### 목표 구조
```
Page(RSC) ─── 초기 탭 데이터 ──→ ReviewWorkspace
                                     └─ useWorkingSetCache
                                          ├─ GET /api/review/sheets/tabs  (탭 목록)
                                          ├─ GET /api/review/workset?tab=A (병렬)
                                          ├─ GET /api/review/workset?tab=B
                                          └─ ... (전탭 eager)
```
탭 전환 = 캐시에서 즉시 읽기 (0ms).

---

## 3. 새 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/review/sheets/tabs` | GET | 현재 spreadsheetId 의 탭 목록 반환 |
| `/api/review/workset` | GET | `?tab=xxx` 파라미터로 해당 탭의 작업셋 반환 |
| `/api/review/workset` | POST `reload` | 탭 캐시 무효화 후 재조회 |
| `/api/review/write-sheet/append` | POST | Write Tab 에 row 추가 |

---

## 4. 클라이언트 캐시 훅: `useWorkingSetCache`

```ts
// 반환 구조
{
  tabs: string[];                           // 탭 목록
  worksets: Record<string, WorksetData>;    // tab → { groups, initialSelection }
  isLoading: boolean;
  reloadTab: (tab: string) => void;         // 해당 탭만 재조회
  reloadAll: () => void;                    // 탭 목록 재조회 + 전체 캐시 무효화
}
```

- 마운트 시: `/api/review/sheets/tabs` 조회 → 탭별 `/api/review/workset?tab=xxx` parallel fetch
- `reloadAll`: 새 탭 발견 + 전체 캐시 갱신
- `reloadTab(tab)`: 해당 탭만 Sheet 재파싱 + DB 재조회

---

## 5. 탭별 포지션 메모리

```ts
// useUiStore (persisted)
tabPositions: Record<string, { groupIndex: number; pointKey: string | null }>
setTabPosition: (tab: string, pos: TabPosition) => void
```

탭 전환 시 흐름:
1. 현재 탭 포지션 저장 (`setTabPosition(currentTab, { groupIndex, pointKey })`)
2. 신규 탭의 저장된 포지션으로 store hydrate (없으면 0번)

---

## 6. 헤더 탭 칩 UI

```
헤더: [삼성전자] | 2026-06-04 | 테마명 | [읽기: review ▾] [쓰기: output ▾]
```

- `[읽기 ▾]` 클릭: 탭 드롭다운 → 즉시 전환(캐시) + 포지션 복원
- `[쓰기 ▾]` 클릭: 탭 드롭다운 + "새 탭명 입력" 옵션 (신규 탭 생성)
- Write tab 설정은 `useUiStore` 에 persisted (`writeTab: string`)
- 탭별 Reload 버튼(↺)도 드롭다운 안에 배치

---

## 7. `f` 키 → Write Append

```ts
f 키:
  1. POST /api/review/write-sheet/append
     { writeTab, row: exportFieldKeys 순서로 현재 종목 데이터 }
  2. pushHistory({ 현재 탐색 종목 })
  3. 성공 토스트 or 헤더 간단 피드백
```

- `canWrite = writeTab != null && writeTab !== ""`
- override 중이면 탐색 종목 데이터, 아니면 선택 종목 데이터

---

## 8. exportFieldKeys 통합

```ts
// useUiStore (persisted)
exportFieldKeys: string[]   // 순서 포함, 사용자가 재정렬 가능
```

적용 대상:
- **f-append**: row 컬럼 순서
- **DB Export**: CSV 컬럼 순서
- **작업셋 Export**: 동일
- **필터 Export**: 동일

Settings 모달에 "Export 컬럼" 섹션 추가. 헤더 필드 설정 UI와 동일한 방식(선택 + 순서 지정).

---

## 9. Settings 모달 재구성

현재: spreadsheetId + 탭명을 하나의 모달에서 설정.

변경 후:
- **ReadSheetModal**: spreadsheetId 변경만 (드물게).
- **탭 전환**: 헤더 칩(항상 노출, 자주 변경).
- **Settings 모달**: Export 컬럼 설정 추가.

---

## 10. 스테이징

- **T1** API: `/api/review/sheets/tabs` + `/api/review/workset?tab=xxx`
- **T2** `useWorkingSetCache` 훅 + ReviewWorkspace 연결
- **T3** 헤더 Read/Write 탭 칩 UI + 탭별 포지션 메모리
- **T4** `f` 키 핸들러 + `/api/review/write-sheet/append`
- **T5** `exportFieldKeys` 통합 (useUiStore + Settings UI + 각 Export 경로 연결)
- **T6** Settings 모달 재구성 (spreadsheetId만 + Export 컬럼)
