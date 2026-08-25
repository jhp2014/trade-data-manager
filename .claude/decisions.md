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

- **day grain 축은 당일 데이터를 값에 못 쓴다(타입으로 강제).** `DayComputedAxisDef.compute` 는 `ChartRef[]`(시각 없음)를 받아 시각 자체가 입력에 없다 — "그 하루가 시작하기 전까지만" 절단선이 주석이 아니라 타입 시그니처다.

## 헥사고날 경계 (구조는 CLAUDE.md, 여긴 왜)

- **`core/`가 순수해야 하는 이유는 어댑터 교체 가능성이 아니라 테스트 속도·도메인 규칙의 단일 출처다.** infra/프레임워크 의존이 들어가면 순수 계산 로직(예: `baselineResolver`, `dropSameDayAnchors`)의 유닛 테스트가 DB 없이 못 돈다.

## market/curation 스키마

- (CLAUDE.md 데이터 계층 절 참고 — 배포 분리 이유는 [[deploy-split-market-local-curation-supabase]], egress 제한 이유는 [[curation-mirror-read-path]])
