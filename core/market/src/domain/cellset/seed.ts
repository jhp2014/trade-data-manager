// 시드 조건 묶음 — 빈 화면을 주지 않으려고 심는 **평범한 저장물**이다. 빌트인 지위가 없다:
// 사용자가 지우고 제 조건으로 채우는 것이 이 모델의 요점이라(decisions 「집합 = (낟알, 우주, 조건)」),
// 여기 4칸은 옛 probe 로직 4종의 **이주본**일 뿐 특별 대우를 받지 않는다.
//
// 노브(SeedKnobs)는 옛 probe 패널의 스칼라 9개 그대로다 — panelUi 에 이미 영속된 사용자 조정값을
// 시드로 번역해 살리기 위해서다(갈아타며 조용히 기본값으로 되돌리지 않는다). 번역이 끝난 뒤의
// 편집은 조건 payload 위에서 이뤄지고, 노브는 그 payload 를 만드는 씨앗으로만 남는다.
import type { CellCondition, CellConditions, CellPredicate, CellValueRange } from "./predicate.js";

/** 시드를 만드는 노브 — 전부 평평한 스칼라(panelUi 가방에 그대로 영속되던 모양). */
export interface SeedKnobs {
    /** ① 격자 파생 Point(기준선 있는 차트). */
    gridOn: boolean;
    /** ② 등락률 ≥ X% 상태에서 세션 누적 대금이 N억에 **하루 처음** 도달한 분. */
    surgeOn: boolean;
    surgeRatePct: number;
    surgeAmountEok: number;
    /** ③ 직전 W 거래일 고가를 분봉 고가가 **하루 처음** 넘는 분(당일 제외). */
    priorHighOn: boolean;
    priorHighDays: number;
    /** ④ 테마 존 순위가 직전 대비 상승하며 N위 이내인 분. */
    zoneOn: boolean;
    zoneMaxRank: number;
    /** 공통 하한(억) — 모든 칸에 AND 항으로 복제된다. 0 = 항을 안 넣는다.
     *  칸 밖의 전역 게이트로 두지 않는 이유: 우주는 조건이 아니다(전역 필드를 만들면 ② 합류 때
     *  "그 필드는 어느 우주의 것인가"로 되살아난다). 패널의 하한 노브는 **모든 칸의 하한 항을
     *  일괄 수정하는 편의 손잡이**일 뿐이고, 저장물은 칸마다 자기 항을 든다. */
    minCumAmountEok: number;
}

export const DEFAULT_SEED_KNOBS: SeedKnobs = {
    gridOn: true,
    surgeOn: true,
    surgeRatePct: 5,
    surgeAmountEok: 100,
    priorHighOn: true,
    priorHighDays: 20,
    zoneOn: false, // ④ 는 분 단면 재료를 물어 첫 켬이 무겁다(단락이 생겨 옛날보다는 싸졌다)
    zoneMaxRank: 3,
    minCumAmountEok: 0,
};

/** 시드 칸의 id — 옛 로직 태그와 1:1. 사용자가 지우면 그냥 사라진다(되살리기는 "시드 복원"). */
export const SEED_IDS = {
    grid: "seed:grid",
    surge: "seed:surge",
    priorHigh: "seed:priorHigh",
    zone: "seed:zone",
} as const;

const atLeast = (value: number): CellValueRange => ({ from: { kind: "value", value } });
const atMost = (value: number): CellValueRange => ({ to: { kind: "value", value } });

/** 옛 노브 → 시드 조건 4칸. 순서가 곧 화면 순서다. */
export function seedConditionsOf(k: SeedKnobs = DEFAULT_SEED_KNOBS): CellConditions {
    const floor: CellPredicate[] =
        k.minCumAmountEok > 0 ? [{ kind: "cellValue", field: "cumAmountEok", ranges: [atLeast(k.minCumAmountEok)] }] : [];

    const grid: CellCondition = {
        id: SEED_IDS.grid,
        name: "격자",
        enabled: k.gridOn,
        // 전이 없음 — 격자 좌표는 사건 자체라 "처음"이라는 말이 붙지 않는다.
        predicates: [{ kind: "gridPoint" }, ...floor],
    };
    const surge: CellCondition = {
        id: SEED_IDS.surge,
        name: "급등대금",
        enabled: k.surgeOn,
        // 칸 전이 firstOfDay — 옛 surgeFired 플래그의 등가물(엣지로 바꾸면 rate 가 오르내릴 때마다 재발화한다).
        transition: "firstOfDay",
        predicates: [
            { kind: "cellValue", field: "ratePct", ranges: [atLeast(k.surgeRatePct)] },
            { kind: "cellValue", field: "cumAmountEok", ranges: [atLeast(k.surgeAmountEok)] },
            ...floor,
        ],
    };
    const priorHigh: CellCondition = {
        id: SEED_IDS.priorHigh,
        name: "전고돌파",
        enabled: k.priorHighOn,
        transition: "firstOfDay", // 옛 priorFired
        predicates: [{ kind: "priorHighBreak", days: k.priorHighDays }, ...floor],
    };
    const zone: CellCondition = {
        id: SEED_IDS.zone,
        name: "존순위",
        enabled: k.zoneOn,
        // 전이가 **술어 줄**에 붙는다 — 하한 항과 AND 로 공존해야 하므로(칸 전이면 하한 충족 여부가
        // 전이의 밑값에 섞인다). 옛 zoneRise 의 "직전 관찰 대비 개선 ∨ 재진입"과 등가.
        predicates: [{ kind: "cellValue", field: "zoneRank", ranges: [atMost(k.zoneMaxRank)], transition: "improve" }, ...floor],
    };
    return [grid, surge, priorHigh, zone];
}
