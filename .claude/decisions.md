# 설계 결정 로그

> `planner`·`code-reviewer`·`scout` 서브에이전트와 사람이 함께 참고하는 자료. **architecture-map.md 가 "어디가 책임인지"라면, 여긴 "왜 이렇게 정했고 뭘 기각했는지"** — 특히 한 파일 주석만 봐선 안 보이는(여러 파일에 걸친) 규칙과, 코드에서 지워져 grep 으로도 안 잡히는 기각된 대안을 담는다.
>
> **현재 상태만 담는다 — 이력 아님.** 결정이 뒤집히면 그 항목을 새 내용으로 **덮어쓴다**(취소선으로 남기지 않는다). 전체 논의 과정·기각 사유의 디테일은 각 프로젝트 메모리나 커밋에 있으니 링크만 남긴다. 여기가 두꺼워지면 이미 실패한 것 — 코드로 봐도 뻔한 것, 한 파일에 갇힌 이유는 넣지 않는다.

## 축(axis) 시스템

- **축은 계산 축(코드 정의)뿐이다.** 판단 축(사람이 slot 줄에 손배치)은 2026-08-25 전면 폐지 — `rank_axes`/`rank_slots`/`rank_placements` 테이블·관련 포트·UI 전부 삭제됨. 새 비교 축이 필요하면 `core/market/src/application/service/axis/*.ts` 파일 하나 + `registry.ts` 한 줄로 계산 축을 만든다. **DB 테이블을 새로 만들지 않는다.**
  - 판단할 수 없는 비교(형태 직관 등)의 후계자는 [[similarity-map-design]](미착수) — 판단축을 되살리는 방향이 아니다.
  - 커밋: 7627b782. 근거: [[computed-axis-day-rows]], [[ordinal-placement-design]](폐지됨).

- **curation param(`chart_anchors`)은 사실만 기록한다.** "기준선을 그었다"는 사실이지 "이 종목이 좋다"는 판단이 아니다. 판단을 param 값으로 넣으면 계산 축이 손배치를 몸속에 재건하는 셈이 된다(결과 분포가 순환논증). 새 param 을 추가할 때 이 경계를 지킬 것.

- **계산 축의 grain 이 행의 정체성을 정한다.** `grain: "point"` 축의 행 = 타점(종목,날짜,시각). `grain: "day"` 축의 행 = **차트(종목,날짜)** — 모수는 "그날 타점이 있나"가 아니라 "그 축이 요구하는 필수 param 앵커가 그 차트에 있나"다. 그래서 분봉 타점을 아직 안 찍은 하루도 기준선만 그어져 있으면 매물 공백·기준선 거리 값이 나온다. 이 규칙은 core(`ComputedAxisDef` 타입 분기)·api(`computedAxes.ts` 캐시 키·모수)·wire(`time?` 옵셔널)·workbench(`rowKey`/`rowLookup` 폴백) 네 레이어에 걸쳐 있다 — 한 곳만 보고 고치면 나머지가 깨진다.
  - 커밋: 3c4dff9c. 근거: [[computed-axis-day-rows]].

- **축 순서는 화면마다 별개 저장물이다.** 시트 열 = store `rankAxisOrder`(`wb.rankAxisOrder`), 집합 편성 보드 레일 = 패널 로컬 `wb.filterAxisOrder`(`panels/filter/axisOrder.ts`). 시트는 읽는 순서, 보드는 조건 거는 순서라 같은 축이 두 화면에서 다른 자리에 서는 편이 낫다는 판단(2026-08-25, 그전의 "한 벌 공유"를 뒤집음 — 공유 시절 주석은 전부 갱신됨). 보드 pref 가 비면 시트 서열을 따르므로 안 만진 사람에겐 예전과 같다. **드래그 미디어타입도 갈라 둘 것**(`x-rank-axis` vs `x-filter-axis`) — 같으면 시트 열을 보드에 떨어뜨렸을 때 엉뚱한 순서가 바뀐다.
  - 커밋: bd022e75. 근거: [[filter-funnel-design]].

- **day grain 축은 당일 데이터를 값에 못 쓴다(타입으로 강제).** `DayComputedAxisDef.compute` 는 `ChartRef[]`(시각 없음)를 받아 시각 자체가 입력에 없다 — "그 하루가 시작하기 전까지만" 절단선이 주석이 아니라 타입 시그니처다.

## 워크벤치 목록 렌더링

- **모수가 수천이 될 수 있는 목록은 가상화한다 — 모수를 좁혀서 해결하지 않는다.** 시트 day 모드(행=후보 하루 ~5,800)가 크롬을 얼린 사고의 결론. 좁히기가 답이 아닌 이유는 그 화면들의 존재 이유가 "값 없는 항목 = 아직 안 한 것"을 **한 화면에서 보는 것**이라서다(깔때기가 미배치를 안 떨구는 것과 같은 규칙). 어휘도 한 벌로 고정한다: **평탄 배열(그룹 머리와 행을 한 배열에) + 고정 높이 + `@tanstack/react-virtual`** — `WorksetList`·`filter/resultRows`·시트가 같은 수법을 쓴다.
  - 시트는 이때 `<table>`을 버리고 **div 그리드 + `position:absolute` 행**으로 간다. `<table>` 유지 + spacer `<tr>` 안은 기각 — 표는 `table-layout:fixed`·`border-collapse:separate`·`ROW_H` 고정으로 **이미 계산을 하나도 안 하고 있었고**(폭·고정 오프셋은 전부 `layoutColumns()`), `<tr>`이 절대배치를 못 받아 가상화 좌표계가 둘로 갈린다. 근거: [[sheet-virtualization-div-grid]].

- **가상화 상자 계보에 `overflow:hidden`(또는 `clip`)을 걸지 말 것 — 좌측 고정 열이 조용히 죽는다.** 총 높이 상자와 행 div 이야기다. 걸리는 순간 그게 새 스크롤 기준이 돼서 `position:sticky; left` 셀이 sticky 를 멈추고 같이 밀려난다(실측: 붙어야 할 셀이 −299px). **셀 자신**의 `overflow:hidden`(말줄임)은 무해하다. 같은 이유로 **헤더를 스크롤 상자 밖으로 빼는 우회도 금지** — 가로 스크롤이 갈려 고정 열이 죽는다. 헤더는 같은 상자 안에서 `sticky; top:0`으로 두고, 그 높이(핀 블록 포함)만큼 가상화기에 `scrollMargin`을 준다.

- **가상 목록의 세로 스크롤 이동은 가상화기 API 로 한다(`el.scrollTop = …` 금지) — 가로축은 DOM 직접.** DOM 에 직접 쓰면 가상화기가 그 사실을 못 배워 스크롤바와 그리는 구간이 어긋난다(`ItemRows` 에서 실제로 났다). 가상화기는 세로축 하나만 아는 물건이라 가로 복원·"축 보여줘" 같은 가로 이동은 여전히 DOM 이 맡는다 — 세션 복원(`rank/useSessionScroll`)이 두 축을 가른 이유가 이것.

## 헥사고날 경계 (구조는 CLAUDE.md, 여긴 왜)

- **`core/`가 순수해야 하는 이유는 어댑터 교체 가능성이 아니라 테스트 속도·도메인 규칙의 단일 출처다.** infra/프레임워크 의존이 들어가면 순수 계산 로직(예: `baselineResolver`, `dropSameDayAnchors`)의 유닛 테스트가 DB 없이 못 돈다.

## market/curation 스키마

- (CLAUDE.md 데이터 계층 절 참고 — 배포 분리 이유는 [[deploy-split-market-local-curation-supabase]], egress 제한 이유는 [[curation-mirror-read-path]])
