// core/market/domain/grid/simulate — 트레이드 시뮬(읽기 층, 순수). 규칙: .claude/decisions.md
// 「시그널 결과」 트레이드 시뮬 항목(2026-09-06).
//
// 결과 걷기(outcome.ts — 데이터 서술 층)와 층이 다른 **판단/시뮬 층**이다: 손절·익절 어휘가 여기선
// 제자리고, 마디 뷰(levelViewOf)가 아니라 **경로 뷰 피벗(grid.pivots)을 직접 순회**한다 — v9 양방향
// zigzag 가 어느 방향이든 ≥2% 스윙을 전부 극값 정확값으로 들고 있어, 모든 % 노브가 ≥2 면 임의
// 가격선 터치·선착 레이스가 피벗 열로 정확 판정된다(옛 "레이스는 격자 불가"는 v8 단방향 시절 판정).
//
// **본체는 손익 재현이 아니라 도달 측정이다**: 익절 브랜치 보고값 = 트레일↑u 눌림 전 최고 도달가,
// 손절 브랜치 = 트레일↓d 반등 전 최저 도달가(진단 — 손익은 −s 고정). 청산 체결가 정밀도는 안 쫓는다.
//
// **비관 원칙 = "모호하면 미체결/취소"**: 격자 해상도(<2% 스윙) 밖 터치 → 미체결, 취소 시각 ≤ 체결
// 시각 → 취소, 시간 경계(체결 피벗 봉 시각 > 마감시각) → 미체결, 체결 스윙의 저점이 이미 손절가
// 이하 → 즉시 손절, 익절·손절 동시각 → 손절. 체결률을 깎는 쪽으로만 틀리고 가짜 실패 케이스를
// 만드는 쪽으로는 안 틀린다.
//
// **체결 등가 정리(체결률 곡선의 근거)**: 취소선이 시그널 종가 앵커라 n 과 무관하므로, 시그널당
// "취소 사건 이전 최저 눌림 깊이(requiredPct)" 하나가 모든 n 의 체결 여부를 정한다 —
// 체결 ⟺ requiredPct ≥ n. 첫 크로싱 저점은 제약(시간 상한) 안의 어떤 저점보다 이르므로 등가가
// 성립한다(simulate.test 11 이 스윕 대조로 고정). `simFillBasis`(취소 노브만 의존)가 이 1층이고,
// 소비자(useTradeSim)는 basis 를 취소 노브에만 memo 해 n 드래그 중 곡선이 안 움직이게 한다.
//
// 시각 좌표는 전부 **피벗 극값 봉 시각**이다 — 스윙 중간의 실제 터치 시각은 격자에 없다(시간 취소의
// "체결 인정 = E 이하 첫 피벗 저점의 봉 시각 ≤ 마감시각"이 이 근사의 비관 처방).
import type { PointGrid } from "./grid.js";

/** 시뮬 노브 7 — pointDef payload 동승 물건(정의 상태, 판정 노브 아님 — points.ts T1/T2 와 같은 사정). */
export interface TradeSimParams {
    /** 진입 지정가 앵커+오프셋: E = anchor×(1−pct/100). anchor 는 지금 "close" 뿐(나중 "고가" 니즈가
     *  값 추가로 흡수되게 필드로 둔다). pct=0 = **즉시 체결**(E=종가·취소 무시·체결률 100% — 기준선
     *  비교용), 0<pct<2 금지(파서가 2로 올림 — <2% 터치는 격자 해상도 밖이라 지정가 해석이 무의미). */
    entry: { anchor: "close"; pct: number };
    /** 손절 폭(%, E 기준, ≥2). */
    stopPct: number;
    /** 익절 폭(%, E 기준, ≥2) — 트레일↑ 무장 게이트. */
    takePct: number;
    /** 익절 후 트레일↑(%, 러닝 최고가 기준, ≥2). */
    trailUpPct: number;
    /** 손절 후 트레일↓(%, 러닝 최저가 기준, ≥2). */
    trailDownPct: number;
    /** 체결 전 종가×(1+x/100) 선터치 = 주문 취소(≥2). null = off. */
    cancelRisePct: number | null;
    /** 시그널 후 m분 안 미체결 = 주문 취소(>0). null = off. */
    cancelAfterMin: number | null;
}

/** 시뮬 % 노브의 도메인 — 하한 2 = zigzag 해상도(이보다 잔 터치는 격자에 없다 — 비관 규칙상 전부
 *  미체결이 되어 노브가 뜻을 잃는다). 진입 pct 만 0(즉시 체결)이 특례로 허용된다. */
export const SIM_PCT_MIN = 2;
export const SIM_PCT_MAX = 50;

export const DEFAULT_TRADE_SIM_PARAMS: TradeSimParams = {
    entry: { anchor: "close", pct: 3 },
    stopPct: 3,
    takePct: 5,
    trailUpPct: 4,
    trailDownPct: 4,
    cancelRisePct: null,
    cancelAfterMin: null,
};

/** 시그널 좌표 — DerivedPoint 가 그대로 들어온다(min·close 만 본다). ⚠ OutcomeSignal(high 필수)과
 *  다른 물건 — 시뮬의 % 분모는 체결가 E 고 E 의 앵커가 종가라 high 가 안 필요하다. */
export interface SimSignal {
    min: number;
    close: number;
}

/**
 * 분류 6 — 미체결 3(shallow 눌림 부족 / cancelled 상승 이탈 / expired 시간 만료) +
 * 체결 3(stop 손절 / take 익절 / open 미결 — 장마감까지 둘 다 미터치, 상태 라벨만·청산가 숫자 없음).
 */
export type SimStatus = "shallow" | "cancelled" | "expired" | "stop" | "take" | "open";

/** 취소 노브에만 의존하는 1층 — 시그널당 하나, n 에 불변(체결률 곡선의 재료). */
export interface SimFillBasis {
    /** 취소 사건(상승 취소 시각·시간 마감 중 이른 것) 이전의 최저 눌림 피벗. 저점 피벗이 아예 없으면
     *  null = "2% 눌림조차 없었다"(그 자체가 답 — 값을 지어내지 않는다). */
    lowMin: number | null;
    lowPrice: number | null;
    /** 요구 타점 % = (종가 − 최저 눌림가)/종가×100 — "어디서 샀어야 체결됐나"의 직답.
     *  종가 아래로 안 왔으면 음수(즉시 진입 외 불가였던 시그널). lowPrice 없으면 null. */
    requiredPct: number | null;
}

/** 시뮬 결과 — % 분모는 전부 체결가 E(유일 예외: missedRisePct = 시그널 종가 — 체결 안 된 세계의
 *  가정 분모가 더 거짓이라). 결손(null)은 무사건/미정의 — 값을 지어내지 않는다. */
export interface SimResult {
    status: SimStatus;
    /** 체결가 E(체결 분기만). */
    entryPrice: number | null;
    /** 체결 시각(분) — E 이하 첫 피벗 저점의 극값 봉 시각(n=0 은 시그널 봉). */
    entryMin: number | null;
    /** 익절 브랜치: 트레일↑u 발동 전 최고 도달 %(E 분모). 미발동 = 잔여 최고가(같은 값의 자연 연장). */
    peakPct: number | null;
    /** 손절 브랜치: 트레일↓d 발동 전 최저 도달 %(E 분모, 음수) — 진단값(손익은 −s 고정).
     *  미발동 = 잔여 피벗 저점 최솟값(손절 피벗 포함 — 항상 존재, 꼬리 하락도 미확정 피벗이 담는다). */
    troughPct: number | null;
    /** 요구 타점 %(basis 승계 — 체결·미체결 양쪽 정의, 시트 정렬 척도). */
    requiredPct: number | null;
    /** 미체결 3분류의 "놓친 상승": 시그널 이후 트레일↑u 규칙의 최고 도달 %(**시그널 종가 분모**).
     *  시그널 후 고점 피벗·꼬리 고가가 아예 없으면 null(결손). 체결 분기는 null(미정의). */
    missedRisePct: number | null;
}

const pctOf = (price: number, denom: number): number => (price / denom - 1) * 100;

/** 상승 취소 사건 시각 — 종가×(1+x/100) 이상을 처음 세운 고점 피벗(∪ 세션 최고가 꼬리). 없으면 null.
 *  세션 최고가를 후보에 넣는 이유: 꼬리(마지막 사건 이후)의 갱신은 피벗으로 안 설 수 있는데 취소는
 *  비관 방향이라 놓치면 안 된다(가짜 체결을 만드는 쪽 오류). */
function riseCancelMinOf(grid: PointGrid, signal: SimSignal, cancelRisePct: number | null): number | null {
    if (cancelRisePct === null) return null;
    const line = signal.close * (1 + cancelRisePct / 100);
    let at: number | null = null;
    for (const p of grid.pivots) {
        if (p.min <= signal.min || p.kind !== "high") continue;
        if (p.price >= line) {
            at = p.min;
            break;
        }
    }
    const sh = grid.sessionHigh;
    if (sh.min > signal.min && sh.price >= line && (at === null || sh.min < at)) at = sh.min;
    return at;
}

/**
 * 1층 — 취소 사건 이전의 최저 눌림(피벗 저점). 저점 자격 = 시그널 뒤(min > signal.min — 종가 앵커라
 * 자기 봉 재사용 금지 = 미래 누출 방지) · 시간 마감 이내(min ≤ deadline) · 상승 취소 **이전**(min <
 * riseCancelMin — 취소 시각과 같은 분은 취소가 이긴다, 비관).
 */
export function simFillBasis(
    grid: PointGrid,
    signal: SimSignal,
    params: Pick<TradeSimParams, "cancelRisePct" | "cancelAfterMin">,
): SimFillBasis {
    const cancelMin = riseCancelMinOf(grid, signal, params.cancelRisePct);
    const deadline = params.cancelAfterMin === null ? null : signal.min + params.cancelAfterMin;
    let low: { min: number; price: number } | null = null;
    for (const p of grid.pivots) {
        if (p.min <= signal.min || p.kind !== "low") continue;
        if (deadline !== null && p.min > deadline) break;
        if (cancelMin !== null && p.min >= cancelMin) break;
        if (low === null || p.price < low.price) low = { min: p.min, price: p.price };
    }
    return {
        lowMin: low === null ? null : low.min,
        lowPrice: low === null ? null : low.price,
        requiredPct: low === null ? null : ((signal.close - low.price) / signal.close) * 100,
    };
}

/** 익절 브랜치/놓친 상승 공용 — fromMin 이후(경계 포함 여부는 호출부가 min 비교로 이미 거름) 피벗을
 *  걸어 트레일↑u 발동 전 최고가를 잰다. startIdx = 걷기 시작 피벗 색인(포함), seedHigh = 러닝 최고가
 *  초기값(취소·익절 사건 봉 등 — null 이면 첫 고점 피벗부터). 꼬리는 sessionHigh 로 닫는다. */
function walkTrailUp(grid: PointGrid, startIdx: number, seedHigh: number | null, trailUpPct: number, afterMin: number): number | null {
    let runMax = seedHigh;
    const k = 1 - trailUpPct / 100;
    for (let i = startIdx; i < grid.pivots.length; i++) {
        const p = grid.pivots[i];
        if (p.min <= afterMin) continue;
        if (p.kind === "high") {
            if (runMax === null || p.price > runMax) runMax = p.price;
        } else if (runMax !== null && p.price <= runMax * k) {
            return runMax; // 트레일 발동 — 그 직전 러닝 최고가가 도달값
        }
    }
    // 미발동 — 꼬리(마지막 피벗 이후)의 갱신은 sessionHigh 가 담는다(afterMin 이후일 때만).
    const sh = grid.sessionHigh;
    if (sh.min > afterMin && (runMax === null || sh.price > runMax)) runMax = sh.price;
    return runMax;
}

/**
 * 트레이드 시뮬 본체 — 상태기계: 지정가 진입(E = 종가×(1−n/100), 다음 봉부터) → 미체결 3분류 ｜
 * 체결 → 손절 E(1−s) vs 익절 E(1+t) 선착 → 브랜치 걷기. 파라미터는 파서(parseTradeSimParams)가
 * 이미 클램프했다고 전제한다 — 여기서 다시 정규화하지 않는다(정규화 규칙 두 벌 금지).
 */
export function simulate(grid: PointGrid, signal: SimSignal, params: TradeSimParams): SimResult {
    const basis = simFillBasis(grid, signal, params);
    const missedRise = (): number | null => {
        const m = walkTrailUp(grid, 0, null, params.trailUpPct, signal.min);
        return m === null ? null : pctOf(m, signal.close);
    };
    const unfilled = (status: "shallow" | "cancelled" | "expired"): SimResult => ({
        status,
        entryPrice: null,
        entryMin: null,
        peakPct: null,
        troughPct: null,
        requiredPct: basis.requiredPct,
        missedRisePct: missedRise(),
    });

    // ── 진입 ──
    const n = params.entry.pct;
    let entryMin: number;
    let entryPrice: number;
    let fillIdx: number; // 체결 이후 레이스 걷기 시작 색인(체결 피벗 다음 — n=0 은 0에서 min 비교로 거름)
    let immediateStop = false;
    if (n === 0) {
        // 즉시 체결(사용자 확정) — E = 종가, 취소 노브 무시, 레이스는 다음 봉부터.
        entryMin = signal.min;
        entryPrice = signal.close;
        fillIdx = 0;
    } else {
        const cancelMin = riseCancelMinOf(grid, signal, params.cancelRisePct);
        const deadline = params.cancelAfterMin === null ? null : signal.min + params.cancelAfterMin;
        const E = signal.close * (1 - n / 100);
        let fill: { idx: number; min: number; price: number } | null = null;
        for (let i = 0; i < grid.pivots.length; i++) {
            const p = grid.pivots[i];
            if (p.min <= signal.min || p.kind !== "low") continue;
            if (p.price <= E) {
                fill = { idx: i, min: p.min, price: p.price };
                break; // 첫 크로싱 저점 = 체결 후보(제약 비교는 아래에서)
            }
        }
        if (fill === null) {
            // E 이하 저점 피벗이 세션 끝까지 없다 — 상승 취소가 있었으면 이탈, 아니면 눌림 부족.
            return unfilled(cancelMin !== null ? "cancelled" : "shallow");
        }
        // 선착 비교 — 취소는 동시(≤)에도 이긴다, 마감은 체결 == 마감시각까지 인정(+1분부터 만료).
        if (cancelMin !== null && cancelMin <= fill.min) {
            return unfilled(deadline !== null && deadline < cancelMin ? "expired" : "cancelled");
        }
        if (deadline !== null && fill.min > deadline) return unfilled("expired");
        entryMin = fill.min;
        entryPrice = E;
        fillIdx = fill.idx + 1;
        // 체결 스윙의 저점이 이미 손절가 이하 — 같은 스윙 안 순서는 하락이 먼저(비관) = 즉시 손절.
        immediateStop = fill.price <= E * (1 - params.stopPct / 100);
    }

    const stopPrice = entryPrice * (1 - params.stopPct / 100);
    const takePrice = entryPrice * (1 + params.takePct / 100);

    // ── 레이스: 체결 이후 손절/익절 첫 터치를 각각 찾아 시각 명시 비교 — **동시각은 손절이 이긴다**
    //    (비관. 실격자는 피벗 시각이 강한 오름차순이라 동시각이 없지만, 규칙은 명시로 적는다) ──
    let stopAt: { idx: number; min: number; price: number } | null = immediateStop
        ? { idx: fillIdx - 1, min: entryMin, price: grid.pivots[fillIdx - 1].price }
        : null;
    let takeAt: { idx: number; min: number; high: number } | null = null;
    if (stopAt === null) {
        for (let i = fillIdx; i < grid.pivots.length; i++) {
            const p = grid.pivots[i];
            if (p.min <= entryMin) continue;
            if (stopAt === null && p.kind === "low" && p.price <= stopPrice) stopAt = { idx: i, min: p.min, price: p.price };
            if (takeAt === null && p.kind === "high" && p.price >= takePrice) takeAt = { idx: i, min: p.min, high: p.price };
            if (stopAt !== null && takeAt !== null) break;
        }
        if (stopAt !== null && takeAt !== null) {
            if (stopAt.min <= takeAt.min) takeAt = null;
            else stopAt = null;
        }
        // 꼬리 익절 — 고점 피벗은 못 섰지만 세션 최고가가 익절가 이상(꼬리 갱신). 이후 피벗이 없으니
        // 트레일은 원리적으로 미발동 — peak = 세션 최고가.
        if (stopAt === null && takeAt === null) {
            const sh = grid.sessionHigh;
            if (sh.min > entryMin && sh.price >= takePrice) {
                return {
                    status: "take",
                    entryPrice,
                    entryMin,
                    peakPct: pctOf(sh.price, entryPrice),
                    troughPct: null,
                    requiredPct: basis.requiredPct,
                    missedRisePct: null,
                };
            }
        }
    }

    if (stopAt !== null) {
        // ── 손절 브랜치: 러닝 최저가 트레일↓d — 반등(고점 피벗 ≥ runMin×(1+d)) 전 최저 도달가.
        //    미발동이면 잔여 저점 최솟값(손절 피벗 포함 — 꼬리 하락도 미확정 피벗이 담아 항상 존재).
        let runMin = stopAt.price;
        const k = 1 + params.trailDownPct / 100;
        for (let i = stopAt.idx + 1; i < grid.pivots.length; i++) {
            const p = grid.pivots[i];
            if (p.kind === "low") {
                if (p.price < runMin) runMin = p.price;
            } else if (p.price >= runMin * k) {
                break; // 반등 — 측정 종료
            }
        }
        return {
            status: "stop",
            entryPrice,
            entryMin,
            peakPct: null,
            troughPct: pctOf(runMin, entryPrice),
            requiredPct: basis.requiredPct,
            missedRisePct: null,
        };
    }
    if (takeAt !== null) {
        const peak = walkTrailUp(grid, takeAt.idx, takeAt.high, params.trailUpPct, entryMin);
        return {
            status: "take",
            entryPrice,
            entryMin,
            peakPct: peak === null ? null : pctOf(peak, entryPrice),
            troughPct: null,
            requiredPct: basis.requiredPct,
            missedRisePct: null,
        };
    }
    // ── 미결(open): 장마감까지 손절·익절 둘 다 미터치 — 상태 라벨만(청산가 숫자 없음, 사용자 확정).
    return {
        status: "open",
        entryPrice,
        entryMin,
        peakPct: null,
        troughPct: null,
        requiredPct: basis.requiredPct,
        missedRisePct: null,
    };
}
