import { describe, it, expect } from "vitest";
import {
    availablePredicates,
    boardPredicateDef,
    defaultParams,
    evalBoardFilter,
    isBoardFilterActive,
    predicateAvailable,
    EOD_FIELDS,
    LIVE_FIELDS,
    type BoardFilterExpr,
    type BoardMetrics,
    type MetricField,
} from "../filter.js";

const metrics = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 20, amount: 300e8, buckets: [1, 1, 3, 0, 0, 0, 0], trailingHighs: { krx: [20, 5, 3], un: [20, 5, 3] }, ...over });
const grp = (kind: string, params: Record<string, number>, mode: "dim" | "hide" = "dim") => ({ predicates: [{ kind, params }], mode });

describe("board filter (순수)", () => {
    it("defaultParams — 레지스트리 기본값", () => {
        expect(defaultParams("smallAmount")).toEqual({ ltEok: 100 });
        expect(defaultParams("minAmtFew")).toEqual({ eok: 50, maxCount: 0 });
        expect(defaultParams("newHighFar")).toEqual({ market: 1, window: 20, tol: 2, side: 0 }); // market 기본 UN, side 기본 내부
    });

    it("weakHigh — 고가 등락률 < 기준이면 제외(dim)", () => {
        const expr: BoardFilterExpr = { groups: [grp("weakHigh", { ltPct: 10 })] };
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).effect).toBe("dim");
        expect(evalBoardFilter(expr, metrics({ highPct: 12 })).effect).toBe("show");
    });

    it("smallAmount — 총거래대금 < 100억 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("smallAmount", { ltEok: 100 })] };
        expect(evalBoardFilter(expr, metrics({ amount: 50e8 })).effect).toBe("dim");
        expect(evalBoardFilter(expr, metrics({ amount: 200e8 })).effect).toBe("show");
    });

    it("minAmtFew — ≥50억 분봉 횟수 ≤ 0 이면 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 50, maxCount: 0 })] };
        // buckets 인덱스 2(50억)~ 합 = 3 → 0회 아님 → show
        expect(evalBoardFilter(expr, metrics({ buckets: [1, 1, 3, 0, 0, 0, 0] })).effect).toBe("show");
        // ≥50억 구간 전부 0 → 0회 → 제외
        expect(evalBoardFilter(expr, metrics({ buckets: [5, 5, 0, 0, 0, 0, 0] })).effect).toBe("dim");
    });

    it("newHighFar — 20일 최고가 밖이면 제외 (market 파라미터로 시장 선택, 미지정=UN)", () => {
        const expr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2 })] };
        // 당일 20 = 최고 20 → 근접 → show
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: [5, 30, 3], un: [20, 5, 3] } })).effect).toBe("show");
        // 당일 5, 최고 30 → 갭 25 > 2 → 밖 → 제외 (UN 기준 — market 미지정 폴백)
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: [20, 5, 3], un: [5, 30, 3] } })).effect).toBe("dim");
        // market=0(KRX) 명시 → KRX 배열로 판정
        const krxExpr: BoardFilterExpr = { groups: [grp("newHighFar", { market: 0, window: 20, tol: 2 })] };
        expect(evalBoardFilter(krxExpr, metrics({ trailingHighs: { krx: [5, 30, 3], un: [20, 5, 3] } })).effect).toBe("dim");
        expect(evalBoardFilter(krxExpr, metrics({ trailingHighs: { krx: [20, 5, 3], un: [5, 30, 3] } })).effect).toBe("show");
    });

    it("newHighFar KRX AND UN — 둘 다 매물대 내부여야 흐리게(한쪽 돌파 시 해제)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                {
                    predicates: [
                        { kind: "newHighFar", params: { market: 0, window: 20, tol: 2 } },
                        { kind: "newHighFar", params: { market: 1, window: 20, tol: 2 } },
                    ],
                    mode: "dim",
                },
            ],
        };
        const inside = [5, 30, 3]; // 매물대 내부(당일 5 vs 최고 30)
        const breakout = [20, 5, 3]; // 돌파(당일=창최고)
        // 둘 다 내부 → 흐리게
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: inside, un: inside } })).effect).toBe("dim");
        // KRX 돌파 → AND 불충족 → 해제
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: breakout, un: inside } })).effect).toBe("show");
        // UN 돌파 → 해제
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: inside, un: breakout } })).effect).toBe("show");
    });

    it("그룹 AND, 그룹끼리 OR + 그룹별 mode(hide 우선)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                { predicates: [{ kind: "smallAmount", params: { ltEok: 100 } }, { kind: "weakHigh", params: { ltPct: 10 } }], mode: "hide" }, // AND
                grp("weakHigh", { ltPct: 5 }, "dim"),
            ],
        };
        // 소액 AND 약세 둘 다 참(hide 그룹) → hide
        expect(evalBoardFilter(expr, metrics({ amount: 50e8, highPct: 8 })).effect).toBe("hide");
        // 소액만 참(AND 불충족) · 약세<5 아님 → show
        expect(evalBoardFilter(expr, metrics({ amount: 50e8, highPct: 20 })).effect).toBe("show");
        // 약세<5(dim 그룹만) → dim
        expect(evalBoardFilter(expr, metrics({ amount: 500e8, highPct: 3 })).effect).toBe("dim");
    });

    it("사유(reasons) — 매칭 술어 라벨", () => {
        const expr: BoardFilterExpr = { groups: [grp("weakHigh", { ltPct: 10 })] };
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).reasons).toEqual(["고가 등락률"]);
    });

    it("isBoardFilterActive", () => {
        expect(isBoardFilterActive({ groups: [] })).toBe(false);
        expect(isBoardFilterActive({ groups: [{ predicates: [], mode: "dim" }] })).toBe(false);
        expect(isBoardFilterActive({ groups: [grp("weakHigh", { ltPct: 10 })] })).toBe(true);
    });

    it("minAmtFew — buckets 결손이면 매칭 안 함(라이브 전 종목 오검출 버그 방어)", () => {
        const expr: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 50, maxCount: 0 })] };
        // buckets 없음: 옛 버그는 count 0 ≤ 0 → dim(전 종목). 이제 false → show.
        expect(evalBoardFilter(expr, metrics({ buckets: undefined })).effect).toBe("show");
    });

    it("newHighFar side — 내부(기본)=매물대 안 매칭 / 돌파=창최고 근접 매칭", () => {
        const inside = { krx: [5, 30, 3], un: [5, 30, 3] }; // 당일 5 vs 최고 30 = 내부
        const breakout = { krx: [20, 5, 3], un: [20, 5, 3] }; // 당일=창최고 = 돌파
        const insideExpr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2, side: 0 })] };
        expect(evalBoardFilter(insideExpr, metrics({ trailingHighs: inside })).effect).toBe("dim"); // 내부 매칭
        expect(evalBoardFilter(insideExpr, metrics({ trailingHighs: breakout })).effect).toBe("show");
        const breakoutExpr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2, side: 1 })] };
        expect(evalBoardFilter(breakoutExpr, metrics({ trailingHighs: breakout })).effect).toBe("dim"); // 돌파 매칭(알람이 쓰는 방향)
        expect(evalBoardFilter(breakoutExpr, metrics({ trailingHighs: inside })).effect).toBe("show");
    });
});

describe("capability (requires ⊆ provides)", () => {
    it("소스가 제공하는 필드로 술어 팔레트가 갈린다", () => {
        // EOD: buckets 있음·deltas/marketCap/themeRanks 없음
        const eod = availablePredicates(EOD_FIELDS).map((d) => d.kind);
        expect(eod).toContain("minAmtFew"); // buckets ✓
        expect(eod).not.toContain("signal"); // deltas ✗
        expect(eod).not.toContain("rank"); // themeRanks ✗
        // 라이브(현재 배선): buckets 없음 → minAmtFew 자동 제외(옛 수동 필터 대체)
        const live = availablePredicates(LIVE_FIELDS).map((d) => d.kind);
        expect(live).not.toContain("minAmtFew");
        expect(live).toContain("newHighFar");
        // 알람용 full 라이브(deltas·marketCap·themeRanks 제공)면 실시간 술어 열림
        const full = availablePredicates(new Set<MetricField>(["highPct", "amount", "trailingHighs", "marketCap", "deltas", "themeRanks"])).map((d) => d.kind);
        expect(full).toEqual(expect.arrayContaining(["signal", "marketCap", "rank", "newHighFar"]));
    });

    it("predicateAvailable — 요구 필드 하나라도 없으면 불가", () => {
        const signal = boardPredicateDef("signal")!;
        expect(predicateAvailable(signal, new Set<MetricField>(["deltas"]))).toBe(true);
        expect(predicateAvailable(signal, new Set<MetricField>(["marketCap"]))).toBe(false);
    });
});

describe("실시간 술어(signal·marketCap·rank)", () => {
    const m = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 0, amount: 0, ...over });

    it("signal — 창별 델타가 임계 이상이면 매칭(rate ∧ tv 동시)", () => {
        const s = boardPredicateDef("signal")!;
        const metrics = m({ deltas: { d30s: { rate: 0.5, tvEok: 45 }, d1m: { rate: 0.3, tvEok: 30 } } });
        expect(s.test(metrics, { window: 0, rateMin: 0.4, tvMin: 40 })).toBe(true); // 30초: 0.5≥0.4 ∧ 45≥40
        expect(s.test(metrics, { window: 0, rateMin: 0.4, tvMin: 50 })).toBe(false); // tv 부족
        expect(s.test(metrics, { window: 1, rateMin: 0.4, tvMin: 40 })).toBe(false); // 1분: rate 0.3<0.4
        expect(s.test(m({ deltas: { d30s: undefined } }), { window: 0, rateMin: 0, tvMin: 0 })).toBe(false); // 창 데이터 없음
    });

    it("marketCap — 시총 이하 매칭", () => {
        const mc = boardPredicateDef("marketCap")!;
        expect(mc.test(m({ marketCap: 3_000 }), { lteEok: 5_000 })).toBe(true);
        expect(mc.test(m({ marketCap: 8_000 }), { lteEok: 5_000 })).toBe(false);
        expect(mc.test(m({ marketCap: undefined }), { lteEok: 5_000 })).toBe(false);
    });

    it("rank — any-theme reach(속한 테마 중 하나라도 K위 이내)", () => {
        const r = boardPredicateDef("rank")!;
        expect(r.test(m({ ranks: { krx: [10, 4], un: [7, 2] } }), { market: 1, threshold: 3 })).toBe(true); // UN min 2 ≤ 3
        expect(r.test(m({ ranks: { krx: [10, 4], un: [7, 5] } }), { market: 1, threshold: 3 })).toBe(false); // UN min 5 > 3
        expect(r.test(m({ ranks: { krx: [1], un: [] } }), { market: 1, threshold: 3 })).toBe(false); // UN 순위 없음
    });
});
