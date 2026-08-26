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

## 차트 앵커 표기 (정규화 패널 + 차트 패널)

- **앵커 표기는 param → 뷰모델(`AnchorMark`) 로 공용화한다 — 차트 컴포넌트는 `ChartAnchor` 를 모른다.** 표기 레지스트리·`buildMarks`·계단식 쌓기가 `lib/anchorMarks.ts` 한 곳이고, 새 param = 레지스트리 한 줄 → **두 화면(정규화·차트) 동시 등장, 차트 컴포넌트 무변경**. 좌표 원본(`anchorDate`/`anchorTime`)만 싣고 **x 환산은 화면 몫**이다 — 차트는 lightweight-charts `Time`, 정규화는 `t − baseT` 라 단위가 애초에 다르다.
  - 기각: 차트에 `ChartAnchor[]` 를 그대로 내려보내기. `DailyChart`/`MinuteChart` 는 복기·실시간 두 패널이 공유하는데 **실시간엔 `ChartAnchor` 가 없어**(메모리 `ChartLineAnchor` + 알람선) 가짜 앵커를 지어내야 하고, grain 필터·승자 판정·param→글자가 차트 안으로 들어가 param 마다 자란다.
  - 실시간 플레인은 이 표식을 **안 쓴다**(사용자 확정) — 마크 prop 미전달 = 표식 없음.
  - `AnchorDisplayDef.line`(가로 수준선 + 값 칩)은 **정규화만 소비한다** — 차트는 제 가로선 경로(`resolveChartAnchorLines` → `usePriceLineSet`)가 따로 있다. 공유되는 건 `mark` 쪽이다.

- **표식은 두 층으로 그린다 — 칩은 SVG 오버레이, 드롭선은 series primitive.** 요구가 정반대라 갈린다: 칩은 툴팁·클릭이 필요하고 x(timeScale)만 알면 되지만, 드롭선은 상호작용이 없고 **가격축까지 따라야 한다** — 오버레이 tick 은 `subscribeVisibleLogicalRangeChange` 라 가격축만 바뀌는 조작에 안 깨어나 끝점이 봉을 놓친다. 반대로 캔버스 primitive 는 툴팁·클릭을 못 준다. 계단식 쌓기(`stackMarkRows`)는 **React 한 곳에서** 계산해 칩 자리를 정하고, primitive 엔 `{time, 그 봉 칩 무더기 줄 수}` 만 넘긴다(시작 y 는 pane 상단 기준 픽셀 = 가격 스케일 무관). primitive 는 좌표를 `update()` 가 아니라 **`draw()` 에서** 푼다(`vertLine.ts` 와 다른 점) — 가격축 변경에 `updateAllViews` 가 불린다는 보장이 없다.

- **승자 판정은 `resolveChartAnchorLines` 하나뿐이다.** 하늘색 가로선과 채운 "기준" 칩이 같은 판정에서 나와야 한다 — 칩 쪽에서 `beatsAsBaseline` 을 다시 돌리면 둘이 조용히 갈리고, 그 선이 육안 검증의 근거라 치명적이다. 그래서 이 함수가 `winnerCoord` 를 반환해 화면이 받아 쓴다.

- **같은 사실을 두 자리에 적지 않는다 — 무시 캔들은 상단 칩 층이 진다.** 봉 위 마커(`useDailySeriesData`)에는 등락률 숫자만 남기고 "무시" 글자는 뺀다. 단 **tier 색을 회색으로 덮는 규칙은 유지** — 그 숫자가 오염된 고가의 산물이라는 표시는 색이 계속 져야 한다. 지목(어느 봉인지)은 드롭선이 가져간다.

- (2026-08-26 확정, 구현 착수. 근거: [[norm-panel-anchor-marks-design]])

## 헥사고날 경계 (구조는 CLAUDE.md, 여긴 왜)

- **`core/`가 순수해야 하는 이유는 어댑터 교체 가능성이 아니라 테스트 속도·도메인 규칙의 단일 출처다.** infra/프레임워크 의존이 들어가면 순수 계산 로직(예: `baselineResolver`, `dropSameDayAnchors`)의 유닛 테스트가 DB 없이 못 돈다.

## market/curation 스키마

- (CLAUDE.md 데이터 계층 절 참고 — 배포 분리 이유는 [[deploy-split-market-local-curation-supabase]], egress 제한 이유는 [[curation-mirror-read-path]])
