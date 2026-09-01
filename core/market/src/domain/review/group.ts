// core/market/domain/review — 그룹(named set). **이름 붙인 집합** — 한 항목에 여럿 붙는다.
// 축(domain/rank)과 짝이자 대비: 축 = "상하 순서를 매길 수 있는 하나", 그룹 = "순서 없는 종류".
//
// 옛 태그가 이것이고, 여기에 **관계**가 붙어 그룹이 됐다. 태그로는 그룹 안 그룹도, 두 그룹이
// 얼마나 겹치는지(징검다리)도 볼 수 없었다 — 관계를 담을 자리가 없었기 때문이다.
//   · parent  : 그룹 안 그룹. 연속성을 좌표가 아니라 **계층의 깊이**로 표현한다(임의로 잘게 쪼갠다).
//   · 징검다리 : 저장하지 않는다. 두 그룹의 **멤버 겹침으로 계산**된다(A·B 를 둘 다 가진 항목).
// (옛 map·x·y 좌표는 맵 패널과 함께 드롭 — 시각화용이었지 데이터가 아니었다.)
//
// 이름은 손잡이지 주장이 아니다 — "미정1" 로 지어도 된다. 이름 짓는 비용이 낮아야 잘게 쪼갤 수 있고,
// 그래야 "하나의 이름으로 디테일을 계속 구분할 수 없다"는 원래 문제를 피한다.

/**
 * 그룹 불변식 위반 — **호출자의 잘못**이지 서버 고장이 아니다(순환·없는 부모).
 * DB 로는 못 막아 저장 경로가 던지는데, 그냥 Error 로 던지면 가장자리에서 500 이 되어 화면에
 * "Internal server error" 만 뜬다 — 이유를 보여주려면 종류가 구분돼야 한다.
 */
export class GroupInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GroupInvariantError";
    }
}

/** 차트 참조 — (종목, 날짜). 하루 단위 소유물(골격·차트 앵커·하루 그룹)의 키. */
export interface ChartRef {
    stockCode: string;
    date: string; // YYYY-MM-DD
}

// (옛 GroupScope·scopeContains — 그룹이 하루냐 타점이냐 — 는 2026-09-01 타점 층위 폐지로 삭제.
//  그룹의 멤버는 이제 언제나 차트(하루) 하나뿐이라 층위를 말할 게 없다.)

/**
 * 그룹 하나. **이름이 곧 정체성**이다(전역 유일) — 계약은 id 가 아니라 이름으로 지목한다.
 * surrogate id 는 저장소 안에 남는다(rename 이 FK 를 타고 cascade 하지 않게, 조인도 bigint 로).
 * 다만 밖으로 내보내지 않는다: 로컬 미러와 Supabase 가 각자 id 를 발급하고 전체교체 때 갈리므로,
 * id 를 계약에 두면 동기화를 건넌 참조가 조용히 다른 행을 가리킨다.
 */
export interface Group {
    name: string;
    /** 그룹 안 그룹. null = 최상위. 순환하면 안 된다(DB 로는 못 막아 저장 경로가 본다). */
    parentName: string | null;
}

/** 그룹에 든 항목의 키 — 언제나 차트(종목, 날짜). */
export type GroupItemRef = ChartRef;

/** 한 항목에 붙은 그룹들(멤버십 피드 항목). 전 항목을 한 번에 받아 화면이 키로 접는다. */
export interface GroupMembership extends GroupItemRef {
    groupNames: string[];
}

