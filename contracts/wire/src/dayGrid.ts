// 날짜 격자 번들 — GET /day-grids?date 의 계약(2026-09-23 — decisions 「하루 타점」).
//
// 하루 우주의 격자는 서버가 **날짜 × 전 종목**으로 한 벌 굽는다: zigzag 1% · floor 0 · 밴드 3% ·
// 기준선 모름(core `DAY_GRID_DETECT_OPTIONS`). 클라는 읽는 시점에 p%(2·3…)로 접고(core `foldGrid`)
// 조건 둘(① 기준선 돌파 ② 마디 재돌파)로 타점을 뽑는다. 기준선은 여기 없다 — 사람이 고치는 값이라
// 수명이 다르다(과거 날짜 번들은 불변). ①의 기준선은 `/point-grids` 의 `grid.base` 를 쓴다.
//
// 튜플은 `/point-grids` 와 **같은 인코딩**(core codec.ts) — base 칸 null · touch 없음.
// version·opts 가 클라 기대와 다르면 디코더가 throw 한다(같은 칸 수의 "의미만 바뀐 번들" 침묵 오독 차단).
import type { WireChartGrid } from "@trade-data-manager/market";

export interface DayGridBundle {
    /** 검출 규칙 버전(core POINT_GRID_RULE_VERSION). */
    version: number;
    /** 굽기 옵션 — core DAY_GRID_DETECT_OPTIONS 와 같아야 한다. */
    opts: { zigzagPct: number; floorEok: number; approachPct: number };
    date: string;
    /** 그날 유니버스(분봉 있는 종목) 전부. */
    charts: WireChartGrid[];
}
