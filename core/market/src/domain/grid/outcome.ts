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
// ⚠ 예외 하나(v9 밴드 Point): 시그널이 세션 최고가 봉 **뒤**면 연장 상한·품는 쌍의 연장 좌표(cap)는
// p 이후 경로 뷰 고점(폴백 = 시그널 봉 고가)이라 **경로 뷰 해상도의 근사**다 — 피벗이 못 된 봉의 더
// 높은 고가는 격자에 없다(2% 해상도 밖 = 결손 아님 원칙). 상단 돌파 Point 는 여전히 전부 정확.
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
    /** 이 눌림의 기준 고점(트레일링 자 — 깊이·회복 판정의 분모). 품는 쌍(밴드 Point)에선 시그널
     *  **이전**의 레벨 봉이다 — 연장 고점 역할은 cap 이 대신한다(두 역할이 갈리는 유일한 자리). */
    highMin: number;
    highPrice: number;
    /** 이 눌림의 저가(구간 봉 최저 — 크로싱이 없으면 세션 끝까지의 최저). */
    lowMin: number;
    lowPrice: number;
    /** 연장 고점 좌표가 기준 고점과 갈릴 때만(품는 쌍 — 레벨 봉이 시그널 이전이라 그대로 쓰면 과거
     *  고가가 연장 고점으로 샌다, §10.4): p 이후의 연장 좌표 = max(시그널 봉 고가, (p, 저가) 사이
     *  경로 뷰 고점). 없으면 highMin/highPrice 가 곧 연장 고점(상단 돌파 Point — 옛 동작). */
    capMin?: number;
    capPrice?: number;
}

/** 시그널 하나의 T 무관 걷기 산출물 — 항상 존재한다(세션 최고가가 격자 사실이라). */
export interface OutcomeWalk {
    /** 깊이 러닝-최대 접두. 비어 있음 ⟺ 시그널 이후 2% 이상 눌림 자체가 없음(무눌림). */
    breaks: OutcomeBreak[];
    /** 시그널 **이후**의 연장 상한 — "T 이내"·"무눌림"의 연장 고점이자 회복 판정의 자. 보통 세션
     *  최고가(격자 사실) 그대로지만, 밴드 Point 처럼 시그널이 세션 최고가 봉 **뒤**에 설 수 있어
     *  그때는 p 이후 경로 뷰 고점(없으면 시그널 봉 자신의 고가 — 해상도 밖 상승은 결손이 아니다)으로
     *  갈음한다(§10.4 — p 이전 고가가 연장 고점으로 새지 않게). */
    sessionHigh: { min: number; price: number };
}

/** 걷기의 시그널 좌표 — 시각과 자기 봉 고가(연장 상한 폴백·품는 쌍 cap 의 재료). DerivedPoint 가 그대로 들어온다. */
export interface OutcomeSignal {
    min: number;
    high: number;
}

/**
 * 시그널 이후 마디 뷰(레벨 쌍)를 걷어 breakpoint 목록을 만든다.
 *
 * 밴드 Point(§10.4) — p 가 어느 레벨 쌍의 저점 구간 안(레벨 봉 < p < 그 레벨의 크로싱)에 서면, 그
 * 구간에서 **p 이후 경로 뷰 저점의 최솟값**을 첫 눌림 후보로 넣는다(깊이의 기준 고점 = 그 레벨 가격 —
 * 트레일링은 이미 선 러닝 최고가 기준이고, 구간 안 러닝 최고가 = 레벨 가격). 여기가 경로 뷰를 직접
 * 순회하는 유일한 소비처다. p 가 상단 돌파 봉 자신이면 품는 쌍이 없어(크로싱 이후) 개정 전과 동일하다
 * (outcome.test 가 고정).
 */
export function walkOutcome(grid: PointGrid, point: OutcomeSignal): OutcomeWalk {
    const pairs = levelViewOf(grid);
    const breaks: OutcomeBreak[] = [];
    let maxDepth = 0;
    const push = (highMin: number, highPrice: number, lowMin: number, lowPrice: number, cap?: { min: number; price: number }): void => {
        const depth = ((highPrice - lowPrice) / highPrice) * 100;
        if (depth > maxDepth) {
            maxDepth = depth;
            breaks.push({ depth, highMin, highPrice, lowMin, lowPrice, capMin: cap?.min, capPrice: cap?.price });
        }
    };
    // p 를 품는 레벨 쌍(최대 하나 — 다음 레벨 봉은 자기 크로싱 뒤라 p 를 못 품는다).
    for (let k = 0; k < pairs.length; k++) {
        const pair = pairs[k];
        if (!(pair.high.min < point.min)) break; // 시간순 — p 이전 레벨만 후보
        if (!(point.min < pair.endMin)) continue;
        let low: { min: number; price: number } | null = null;
        for (let i = pair.highIndex + 1; i < grid.pivots.length; i++) {
            const q = grid.pivots[i];
            if (q.min >= pair.endMin) break;
            if (q.min <= point.min || q.kind !== "low") continue;
            if (low === null || q.price < low.price) low = { min: q.min, price: q.price };
        }
        if (low !== null) {
            // 깊이·회복 자 = 레벨(이미 선 러닝 최고가), 연장 좌표(cap) = p 이후만(§10.4 — 과거 고가 금지):
            // 시그널 봉 자신과 (p, 저가) 사이 경로 뷰 고점의 max.
            let cap = { min: point.min, price: point.high };
            for (let i = pair.highIndex + 1; i < grid.pivots.length; i++) {
                const q = grid.pivots[i];
                if (q.min >= low.min) break;
                if (q.min <= point.min || q.kind !== "high") continue;
                if (q.price > cap.price) cap = { min: q.min, price: q.price };
            }
            push(pair.high.min, pair.high.price, low.min, low.price, cap);
        }
        break;
    }
    for (const { high, low } of pairs) {
        if (high.min < point.min) continue; // 시그널 이전 사이클
        push(high.min, high.price, low.min, low.price);
    }
    // 연장 상한 — 세션 최고가가 p 이전이면 p 이후 경로 뷰 고점(폴백 = 시그널 봉 자신)으로.
    let sessionHigh = grid.sessionHigh;
    if (sessionHigh.min < point.min) {
        let cap = { min: point.min, price: point.high };
        for (const q of grid.pivots) {
            if (q.kind === "high" && q.min > point.min && q.price > cap.price) cap = { min: q.min, price: q.price };
        }
        sessionHigh = cap;
    }
    return { breaks, sessionHigh };
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
    // 연장 고점 = cut 의 연장 좌표(cap 이 있으면 그것 — 품는 쌍의 기준 고점은 시그널 이전이라 §10.4 위반).
    const ext = cut
        ? cut.capMin !== undefined && cut.capPrice !== undefined
            ? { min: cut.capMin, price: cut.capPrice }
            : { min: cut.highMin, price: cut.highPrice }
        : walk.sessionHigh;
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
