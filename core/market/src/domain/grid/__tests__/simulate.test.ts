// simulate — 트레이드 시뮬 상태기계의 비관 규칙·브랜치 걷기·체결 등가 정리를 격자 리터럴로 못 박는다.
// 규칙: decisions.md 「시그널 결과」 트레이드 시뮬 항목(2026-09-06).
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid } from "../grid.js";
import { walkOutcome } from "../outcome.js";
import { simFillBasis, simulate, type SimSignal, type TradeSimParams } from "../simulate.js";

// cross 는 walkOutcome 회귀선(levelViewOf 불변식 ④)에만 필요 — simulate 는 안 본다.
const hi = (min: number, price: number, cross: number | null = null): GridPivot => ({
    kind: "high",
    min,
    price,
    confirmedMin: min + 1,
    cum: "0",
    cross: cross === null ? null : { min: cross, tv: "0", cum: "0" },
});
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: min + 1, cum: "0", cross: null });
const gridOf = (pivots: GridPivot[], sessionHigh: { min: number; price: number }): PointGrid =>
    ({ base: null, touch: null, pivots, newHighs: [], prevBase: null, prevBaseKrx: null, sessionHigh });

const SIGNAL: SimSignal = { min: 500, close: 10000 };
/** 기본 노브 — 취소 둘 off. 테스트마다 필요한 것만 덮는다. */
const P = (over: Partial<TradeSimParams> = {}): TradeSimParams => ({
    entry: { anchor: "close", pct: 3 },
    stopPct: 3,
    takePct: 5,
    trailUpPct: 4,
    trailDownPct: 4,
    cancelRisePct: null,
    cancelAfterMin: null,
    ...over,
});
const n = (pct: number): { entry: { anchor: "close"; pct: number } } => ({ entry: { anchor: "close", pct } });

// 익절 시나리오 격자 — 시그널(min 500, 종가 10000) 후:
//   hi 510@10300 → lo 520@9700(체결 후보, n=3 의 E=9700 딱) → hi 540@10600 → lo 550@10100(눌림 4.7%)
//   → hi 570@11200 → lo 580@10900 → 꼬리 상승, 세션 최고가 590@11300.
const TAKE_GRID = gridOf(
    [hi(510, 10300), lo(520, 9700), hi(540, 10600, 538), lo(550, 10100), hi(570, 11200, 568), lo(580, 10900)],
    { min: 590, price: 11300 },
);

// 손절 시나리오 격자 — hi 510@10200 → lo 520@9750(n=2 의 E=9800 체결) → hi 530@10050 → lo 545@9400
// (손절 s=3, 9506 이하) → hi 560@9600(반등 2.1%) → lo 570@9200 → hi 585@9700(반등 5.4%).
const STOP_GRID = gridOf(
    [hi(510, 10200), lo(520, 9750), hi(530, 10050), lo(545, 9400), hi(560, 9600), lo(570, 9200), hi(585, 9700)],
    { min: 510, price: 10200 },
);

describe("simulate — 진입·취소(비관 원칙: 모호하면 미체결/취소)", () => {
    it("n=3 지정가 — E 이하 첫 피벗 저점에서 체결(가격 = E, 시각 = 극값 봉)", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P());
        expect(r.entryPrice).toBe(9700);
        expect(r.entryMin).toBe(520);
        expect(r.requiredPct).toBe(3); // (10000−9700)/10000
    });

    it("n=0 즉시 체결 — E=종가·시그널 봉 시각, 취소 노브 무시(체결률 100%)", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P({ ...n(0), cancelRisePct: 2, cancelAfterMin: 1 }));
        expect(r.entryPrice).toBe(10000);
        expect(r.entryMin).toBe(500);
        expect(["stop", "take", "open"]).toContain(r.status);
    });

    it("눌림 부족(shallow) — E 이하 저점 피벗이 세션 끝까지 없다", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P(n(4))); // E=9600 < 최저 눌림 9700
        expect(r.status).toBe("shallow");
        expect(r.entryPrice).toBeNull();
        expect(r.requiredPct).toBe(3); // 요구 타점 — "어디서 샀어야 체결됐나"
    });

    it("상승 이탈(cancelled) — 취소선 선터치가 체결을 막는다, 동시각도 취소가 이긴다", () => {
        // x=2.5 → 취소선 10250: hi 510@10300 이 체결(520)보다 먼저.
        const first = simulate(TAKE_GRID, SIGNAL, P({ cancelRisePct: 2.5 }));
        expect(first.status).toBe("cancelled");
        // 동시각 — 취소 고점과 체결 저점이 같은 분(손격자): 취소 우선(비관).
        const tieGrid = gridOf([hi(520, 10600), lo(520, 9700)], { min: 520, price: 10600 });
        expect(simulate(tieGrid, SIGNAL, P({ cancelRisePct: 5 })).status).toBe("cancelled");
    });

    it("취소가 체결보다 늦으면 체결 — 취소선은 그 뒤로 무의미", () => {
        // x=5 → 10500: 첫 초과 고점은 540, 체결은 520 — 체결이 이긴다.
        const r = simulate(TAKE_GRID, SIGNAL, P({ cancelRisePct: 5 }));
        expect(r.status).toBe("take");
        expect(r.entryMin).toBe(520);
    });

    it("시간 만료(expired) — 체결 인정 = 체결 피벗 봉 시각 ≤ 마감시각(경계 포함, +1분부터 만료)", () => {
        expect(simulate(TAKE_GRID, SIGNAL, P({ cancelAfterMin: 20 })).status).toBe("take"); // 마감 520 == 체결 봉
        expect(simulate(TAKE_GRID, SIGNAL, P({ cancelAfterMin: 19 })).status).toBe("expired");
    });

    it("미체결의 놓친 상승 — 시그널 종가 분모, 같은 트레일↑ 규칙", () => {
        // shallow(n=4): hi 510@10300 → lo 520@9700 은 10300×0.96=9888 이하라 트레일 발동 — 놓친 상승 = 10300.
        const r = simulate(TAKE_GRID, SIGNAL, P(n(4)));
        expect(r.missedRisePct).toBeCloseTo(3, 10); // (10300/10000 − 1)×100
        // u=8 이면 그 눌림(5.8%)도 못 끊어… 9700 ≤ 10300×0.92=9476? 아니오 → 러닝 계속 → 꼬리 11300.
        const wide = simulate(TAKE_GRID, SIGNAL, P({ ...n(4), trailUpPct: 8 }));
        expect(wide.missedRisePct).toBeCloseTo(13, 10);
        // 시그널이 모든 피벗·세션 최고가 뒤 — 놓친 상승 결손(null), 요구 타점도 결손.
        const late = simulate(TAKE_GRID, { min: 600, close: 11000 }, P(n(4)));
        expect(late.status).toBe("shallow");
        expect(late.missedRisePct).toBeNull();
        expect(late.requiredPct).toBeNull();
    });
});

describe("simulate — 레이스·브랜치 걷기", () => {
    it("익절 브랜치 — 트레일↑ 발동 전 최고 도달가(E 분모), 발동 저점 이후 고점은 무시", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P());
        expect(r.status).toBe("take");
        // take 터치 = hi 540@10600(≥ 9700×1.05=10185), lo 550@10100 ≤ 10600×0.96=10176 → 발동, peak=10600.
        expect(r.peakPct).toBeCloseTo(((10600 - 9700) / 9700) * 100, 10);
        expect(r.troughPct).toBeNull();
        expect(r.missedRisePct).toBeNull(); // 체결 분기는 미정의
    });

    it("익절 브랜치 트레일 미발동 — peak = 잔여 세션 최고가(같은 값의 자연 연장), walkOutcome 상한과 일치", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P({ trailUpPct: 8 }));
        expect(r.status).toBe("take");
        // u=8: 550 눌림(4.0%)·580 눌림(2.7%) 다 못 끊음 → 러닝 11200 → 꼬리 11300.
        expect(r.peakPct).toBeCloseTo(((11300 - 9700) / 9700) * 100, 10);
        // outcome.ts 를 안 건드리고 재구현한 "시그널 이후 상한"의 회귀선.
        expect(walkOutcome(TAKE_GRID, { min: 520, high: 0 }).sessionHigh.price).toBe(11300);
    });

    it("꼬리 익절 — 고점 피벗엔 없지만 세션 최고가가 익절가 이상이면 take, peak = 세션 최고가", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P({ takePct: 16 })); // 익절가 11252 > 모든 고점 피벗(11200)
        expect(r.status).toBe("take");
        expect(r.peakPct).toBeCloseTo(((11300 - 9700) / 9700) * 100, 10);
    });

    it("손절 브랜치 — 트레일↓ 발동 전 최저 도달가(진단값), 반등 d% 에서 측정 종료", () => {
        const r = simulate(STOP_GRID, SIGNAL, P(n(2)));
        expect(r.status).toBe("stop");
        expect(r.entryPrice).toBe(9800);
        // 손절 터치 = lo 545@9400(≤ 9800×0.97=9506) → runMin 9400 → hi 560@9600 은 9400×1.04=9776 미만
        // → lo 570@9200 → hi 585@9700 ≥ 9200×1.04=9568 → 종료, trough=9200.
        expect(r.troughPct).toBeCloseTo(((9200 - 9800) / 9800) * 100, 10);
        expect(r.peakPct).toBeNull();
    });

    it("손절 브랜치 트레일 미발동 — trough = 잔여 저점 최솟값(값을 지어내지 않는 근사)", () => {
        const r = simulate(STOP_GRID, SIGNAL, P({ ...n(2), trailDownPct: 10 }));
        expect(r.status).toBe("stop");
        expect(r.troughPct).toBeCloseTo(((9200 - 9800) / 9800) * 100, 10);
    });

    it("체결 스윙의 저점이 이미 손절가 이하 — 즉시 손절(같은 스윙 안 순서는 하락이 먼저, 비관)", () => {
        // n=2 E=9800, s=2 손절가 9604: 체결 피벗 lo 520@9550 이 이미 이하 — 그 봉에서 stop.
        const g = gridOf([hi(510, 10200), lo(520, 9550), hi(540, 10100), lo(560, 9300), hi(575, 9800)], { min: 510, price: 10200 });
        const r = simulate(g, SIGNAL, P({ ...n(2), stopPct: 2 }));
        expect(r.status).toBe("stop");
        expect(r.entryMin).toBe(520);
        // runMin 9550 → hi 540@10100(반등 5.8% ≥ d=4) → 즉시 종료, trough=9550 — 뒤의 9300 은 트레일이
        // 이미 나간 뒤의 별개 하락이라 측정 밖이다.
        expect(r.troughPct).toBeCloseTo(((9550 - 9800) / 9800) * 100, 10);
    });

    it("익절·손절 동시각(손격자) — 손절이 이긴다(비관)", () => {
        // 체결 520@9700(E=9700) 후 min 540 에 고점(익절가 이상)과 저점(손절가 이하)이 같은 분.
        const g = gridOf([lo(520, 9700), hi(540, 10300), lo(540, 9300)], { min: 540, price: 10300 });
        const r = simulate(g, SIGNAL, P({ takePct: 5, stopPct: 3 }));
        expect(r.status).toBe("stop");
    });

    it("미결(open) — 둘 다 미터치 장마감, 도달값 없이 상태 라벨만", () => {
        const r = simulate(TAKE_GRID, SIGNAL, P({ stopPct: 20, takePct: 20 }));
        expect(r.status).toBe("open");
        expect(r.entryPrice).toBe(9700);
        expect(r.peakPct).toBeNull();
        expect(r.troughPct).toBeNull();
    });
});

describe("simFillBasis — 체결률 곡선의 1층(취소 노브에만 의존)", () => {
    it("취소 off — 시그널 이후 전체 최저 눌림", () => {
        const b = simFillBasis(TAKE_GRID, SIGNAL, { cancelRisePct: null, cancelAfterMin: null });
        expect(b).toEqual({ lowMin: 520, lowPrice: 9700, requiredPct: 3 });
    });

    it("상승 취소 이전의 저점만 — 취소 시각과 같은 분은 취소가 이긴다(비관)", () => {
        const b = simFillBasis(TAKE_GRID, SIGNAL, { cancelRisePct: 2.5, cancelAfterMin: null }); // 취소 @510
        expect(b.lowPrice).toBeNull();
        expect(b.requiredPct).toBeNull();
    });

    it("시간 마감 이내의 저점만(경계 포함)", () => {
        const b = simFillBasis(TAKE_GRID, SIGNAL, { cancelRisePct: null, cancelAfterMin: 20 });
        expect(b.lowPrice).toBe(9700);
        const cut = simFillBasis(TAKE_GRID, SIGNAL, { cancelRisePct: null, cancelAfterMin: 19 });
        expect(cut.lowPrice).toBeNull();
    });

    it("체결 등가 정리 — 모든 n 에서 simulate 체결 여부 ⟺ requiredPct ≥ n (취소 유무 양쪽)", () => {
        for (const cancel of [null, 5] as const) {
            const b = simFillBasis(TAKE_GRID, SIGNAL, { cancelRisePct: cancel, cancelAfterMin: null });
            for (let pct = 2; pct <= 12; pct += 0.5) {
                const r = simulate(TAKE_GRID, SIGNAL, P({ entry: { anchor: "close", pct }, cancelRisePct: cancel }));
                const filled = r.status === "stop" || r.status === "take" || r.status === "open";
                expect(filled).toBe(b.requiredPct !== null && b.requiredPct >= pct);
            }
        }
    });
});
