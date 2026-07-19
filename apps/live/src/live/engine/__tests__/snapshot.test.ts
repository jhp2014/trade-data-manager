import { describe, it, expect } from "vitest";
import { EngineStore } from "../store.js";
import { buildSnapshot } from "../snapshot.js";
import type { DailyContextSource } from "../dailyContext.js";
import type { MembershipSource } from "../membership.js";
import type { Quote } from "../types.js";

// 조각 3 — 스냅샷 원재료 배급(deltas·ranks). 판정은 클라 보드 필터가 자기 임계로.

const quote = (code: string, price: number, ts: number, over: Partial<Quote> = {}): Quote => ({
    code,
    name: `${code}명`,
    price,
    changeRate: (price / 100 - 1) * 100,
    volume: 0,
    base: 100,
    open: 100,
    high: price,
    low: 100,
    marketCap: 1_000,
    tradeValue: 10_000,
    ts,
    ...over,
});

const membership = (map: Record<string, string[]>): MembershipSource => ({
    themesOf: (c) => map[c] ?? [],
    reload: async () => {},
});
const dailyCtx = (codes: string[]): DailyContextSource => ({
    contextOf: (c) => (codes.includes(c) ? { trailingHighs: { krx: [], un: [] }, basePrice: { krx: 100, un: 100 } } : undefined),
    ensure: async () => {},
});

describe("buildSnapshot 원재료(deltas·ranks)", () => {
    it("30초·1분 델타를 링버퍼에서 계산해 싣는다(이력 부족 창은 생략, 전무면 필드 생략)", () => {
        const store = new EngineStore();
        store.setHot([{ code: "005930", name: "s" }], 0);
        store.updateQuotes([quote("005930", 100, 0, { tradeValue: 10_000 })]);
        store.updateQuotes([quote("005930", 105, 35_000, { tradeValue: 14_500 })]);

        const snap = buildSnapshot(store, membership({}), dailyCtx(["005930"]), "live", 35_000);
        const s = snap.stocks[0];
        expect(s.deltas?.d30s?.tvEok).toBe(45); // (14500-10000)백만원 = 45억
        expect(s.deltas?.d1m).toBeUndefined(); // 60초치 이력 없음

        // 단일 틱(신규 편입 직후) — 델타 전무 → 필드 생략
        const fresh = new EngineStore();
        fresh.setHot([{ code: "000660", name: "f" }], 0);
        fresh.updateQuotes([quote("000660", 100, 0)]);
        expect(buildSnapshot(fresh, membership({}), dailyCtx([]), "live", 0).stocks[0].deltas).toBeUndefined();
    });

    it("테마 순위 — 알람과 같은 잣대(basePrice 기반, 유니버스 내 등락률 내림차순)", () => {
        const store = new EngineStore();
        store.setHot([{ code: "A00001", name: "a" }, { code: "A00002", name: "b" }], 0);
        store.updateQuotes([quote("A00001", 120, 0), quote("A00002", 110, 0)]); // 등락률 20% > 10%

        const snap = buildSnapshot(store, membership({ A00001: ["반도체"], A00002: ["반도체", "AI"] }), dailyCtx(["A00001", "A00002"]), "live", 0);
        const byCode = new Map(snap.stocks.map((s) => [s.code, s]));
        expect(byCode.get("A00001")?.ranks?.un).toEqual([1]); // 반도체 1위
        expect(byCode.get("A00002")?.ranks?.un).toEqual([2, 1]); // 반도체 2위·AI 1위(혼자)
    });

    it("전일종가 미도착(핫 편입 직후)이면 순위 제외 — ranks 생략", () => {
        const store = new EngineStore();
        store.setHot([{ code: "A00001", name: "a" }], 0);
        store.updateQuotes([quote("A00001", 120, 0)]);
        const snap = buildSnapshot(store, membership({ A00001: ["반도체"] }), dailyCtx([]), "live", 0); // 컨텍스트 없음
        expect(snap.stocks[0].ranks).toBeUndefined();
    });
});
