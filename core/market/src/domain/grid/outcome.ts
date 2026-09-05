// core/market/domain/grid/outcome — 시그널 이후 "결과" 걷기(읽기 층, 순수). 규칙: .claude/decisions.md
// "시그널 결과" 절.
//
// 걷기 = 시그널 이후 마디 뷰(레벨 쌍, levelViewOf) 순회. 레벨(마디 뷰)은 단조 상승이고, 레벨 저점은
// (레벨, 재크로싱) 구간의 저점 피벗 최솟값이다(v9: 경로 뷰를 직접 순회하지 않는다). 허용 폭 T(%)보다
// 깊은(깊이 ≥ T) 첫 저점이 나오면 거기서 "연속 상승"이 끝나고 — 그 직전 고점이 "어디까지 올라갔는지",
// 그 저점이 T 를 처음 넘은 눌림이다.
//
// **세션 최고가(격자 사실, 2026-09-04)가 하한(≥)을 없앤다**: T 이내로 끝까지 간 시그널·확정 고점이
// 아예 없는 시그널의 연장 고점 = 세션 최고가(정확값). 회복 판정도 이걸로 닫힌다 —
// 어떤 고점가를 넘은 봉이 있었다 ⟺ 세션 최고가 > 그 고점가(크로싱 = strict >, 볼륨 무관).
//
// **breakpoint 압축의 증명**: T 초과 첫 저점의 색인은 T 에 대해 비감소다. 깊이 d_i 가 앞선 러닝 최대보다
// 작으면 d_i ≥ T 인 어떤 T 에서도 더 앞의 더 깊은 저점이 먼저 걸린다 — 그러므로 깊이의 러닝-최대 접두만
// 남긴 목록이 모든 T 단면의 답을 준다(걷기 한 번 = T→연장고점 계단함수 전부, 슬라이스는 재걷기 없이 즉시).
//
// **판정은 `깊이 ≥ T` 다(`>` 아님)**: zigzag 확정이 −2% 터치(≤)라 구간 저점의 깊이는 항상 ≥ 2% —
// `>` 로 쓰면 T=2 에서 첫 저점이 안 걸려 "T=2 특수해 = 다리 고점(legHighOf)"이 깨진다(outcome.test).
//
// T 무관(걷기)/T 의존(슬라이스)을 함수로 갈라 둔 것이 성능 계약이다 — 소비자(useOutcomes)는 걷기를
// 시그널·격자에만 memo 하고, T 드래그는 슬라이스만 다시 돈다.
import type { PointGrid } from "./grid.js";
import { levelViewOf } from "./levelView.js";

/** 눌림 breakpoint — 깊이의 러닝-최대 접두 항목 하나. 깊이는 직전 고점 대비 %(양수). */
export interface OutcomeBreak {
    /** (highPrice − lowPrice) / highPrice × 100 — 목록 안에서 강한 단조 증가. */
    depth: number;
    /** 이 눌림 직전 고점(= 이 깊이가 걸리는 T 대의 연장 고점). */
    highMin: number;
    highPrice: number;
    /** 이 눌림의 저가(구간 봉 최저 — 크로싱이 없으면 세션 끝까지의 최저). */
    lowMin: number;
    lowPrice: number;
}

/** 시그널 하나의 T 무관 걷기 산출물 — 항상 존재한다(세션 최고가가 격자 사실이라). */
export interface OutcomeWalk {
    /** 깊이 러닝-최대 접두. 비어 있음 ⟺ 시그널 이후 확정 고점 0(2% 이상 눌림 자체가 없음 = 무눌림). */
    breaks: OutcomeBreak[];
    /** 세션 최고가(격자 사실) — "T 이내"·"무눌림"의 연장 고점이자 회복 판정의 자. */
    sessionHigh: { min: number; price: number };
}

/** 시그널(Point 봉 시각) 이후 마디 뷰(레벨 쌍)를 걷어 breakpoint 목록을 만든다. */
export function walkOutcome(grid: PointGrid, pointMin: number): OutcomeWalk {
    const breaks: OutcomeBreak[] = [];
    let maxDepth = 0;
    for (const { high, low } of levelViewOf(grid)) {
        if (high.min < pointMin) continue; // 시그널 이전 사이클
        const depth = ((high.price - low.price) / high.price) * 100;
        if (depth > maxDepth) {
            maxDepth = depth;
            breaks.push({ depth, highMin: high.min, highPrice: high.price, lowMin: low.min, lowPrice: low.price });
        }
    }
    return { breaks, sessionHigh: grid.sessionHigh };
}

/**
 * T 단면의 상태 — **데이터 서술이다, 판단 아님**(2026-09-04 사용자 확정 — "절단/미절단"·"손절" 어휘 기각):
 *   exceeded = T 보다 깊은 눌림 발생(연장 고점 = 그 직전 고점) ·
 *   contained = 눌림은 있었으나 전부 T 이내(연장 고점 = 세션 최고가) ·
 *   none = 2% 이상 눌림 자체가 없음(연장 고점 = 세션 최고가, 저가 없음).
 */
export type OutcomeStatus = "exceeded" | "contained" | "none";

/** T 단면 — 값은 전부 정확(하한 없음, 세션 최고가 덕). 저가류는 none 에서만 null(무사건). */
export interface OutcomeSlice {
    status: OutcomeStatus;
    /** 연장 고점("어디까지 올라갔는지"). */
    extHighMin: number;
    extHighPrice: number;
    /** 연장 고점 %(Point 봉 종가 대비). */
    extPct: number;
    /** 보고 저가 — exceeded: T 를 처음 넘은 눌림 / contained: T 이내 최대 눌림. none 은 null. */
    lowMin: number | null;
    lowPrice: number | null;
    /** 고점 대비 저가 %(음수) — 저가의 **자기 직전 고점** 대비. none 은 null. */
    dropFromHighPct: number | null;
    /** Point 종가 대비 저가 %(부호 그대로). none 은 null. */
    dropFromClosePct: number | null;
    /**
     * 그 저가 이후 직전 고가를 다시 넘었는가(회복) — 세션 최고가 > 그 고점가 로 판정(크로싱 = strict >,
     * 볼륨 무관 정확: 넘은 봉은 정의상 러닝 최고가 갱신이라 세션 최고가에 반드시 반영된다). none 은 null.
     */
    recovered: boolean | null;
}

/** 걷기의 T(%) 단면 — `깊이 ≥ T` 인 첫 breakpoint 가 초과 눌림. close = Point 봉 종가(모든 % 의 기준). */
export function sliceOutcome(walk: OutcomeWalk, tolerancePct: number, close: number): OutcomeSlice {
    const cut = walk.breaks.find((b) => b.depth >= tolerancePct);
    // contained 의 보고 저가 = T 이내 최대 눌림 = 러닝-최대 접두의 마지막 항목.
    const at = cut ?? (walk.breaks.length > 0 ? walk.breaks[walk.breaks.length - 1] : null);
    const ext = cut ? { min: cut.highMin, price: cut.highPrice } : walk.sessionHigh;
    return {
        status: cut ? "exceeded" : at ? "contained" : "none",
        extHighMin: ext.min,
        extHighPrice: ext.price,
        extPct: (ext.price / close - 1) * 100,
        lowMin: at ? at.lowMin : null,
        lowPrice: at ? at.lowPrice : null,
        dropFromHighPct: at ? -at.depth : null,
        dropFromClosePct: at ? (at.lowPrice / close - 1) * 100 : null,
        recovered: at ? walk.sessionHigh.price > at.highPrice : null,
    };
}
// Δ 연장폭 = 두 단면의 extPct 차 — 정의가 뺄셈 하나뿐이라 별도 함수를 두지 않는다(소비자 = buildOutcomesView 한 곳).
