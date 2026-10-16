// 캐시 정책만 본다(계산은 가짜 compute) — 과거 히트/미스·오늘 제외·in-flight dedup·이웃 선계산·LRU 상한·선계산 실패 침묵.
import { describe, expect, it } from "vitest";
import { makeCachedDayFlowBody } from "./dayFlowCache.js";

const TODAY = "2025-01-10";
const flush = () => new Promise((ok) => setTimeout(ok, 10)); // 백그라운드 선계산이 가라앉길 기다린다

function harness(days: string[], opts: { limit?: number; failDates?: Set<string> } = {}) {
    const computed: string[] = [];
    let gate: Promise<void> | null = null;
    const body = makeCachedDayFlowBody({
        compute: async (date) => {
            computed.push(date);
            if (gate) await gate;
            if (opts.failDates?.has(date)) throw new Error(`계산 실패: ${date}`);
            return { date, stocks: [] };
        },
        tradingDays: async () => days,
        today: () => TODAY,
        limit: opts.limit,
    });
    return { body, computed, setGate: (g: Promise<void>) => (gate = g) };
}

describe("makeCachedDayFlowBody", () => {
    it("과거 날짜 — 미스 1회 계산 후 히트(재계산·재직렬화 없음, 같은 문자열)", async () => {
        const h = harness([]);
        const a = await h.body("2025-01-02");
        const b = await h.body("2025-01-02");
        expect(a).toBe(b); // 동일 참조 — 캐시된 문자열 그대로
        expect(JSON.parse(a)).toEqual({ date: "2025-01-02", stocks: [] });
        expect(h.computed).toEqual(["2025-01-02"]);
    });

    it("오늘(이후)은 캐시하지 않는다 — 매 요청 직계산", async () => {
        const h = harness([]);
        await h.body(TODAY);
        await h.body(TODAY);
        expect(h.computed).toEqual([TODAY, TODAY]);
    });

    it("in-flight dedup — 같은 날짜 동시 요청은 계산 한 번을 공유", async () => {
        const h = harness([]);
        let release!: () => void;
        h.setGate(new Promise((ok) => (release = ok)));
        const p1 = h.body("2025-01-02");
        const p2 = h.body("2025-01-02");
        release();
        expect(await p1).toBe(await p2);
        expect(h.computed).toEqual(["2025-01-02"]);
    });

    it("요청 뒤 앞뒤 거래일 각 1개를 선계산해 캐시에 올린다 — 오늘·이미 캐시된 날짜는 생략", async () => {
        const days = ["2025-01-06", "2025-01-07", "2025-01-08", TODAY];
        const h = harness(days);
        await h.body("2025-01-07");
        await flush();
        expect(h.computed.sort()).toEqual(["2025-01-06", "2025-01-07", "2025-01-08"]); // 이웃 둘 선계산
        h.computed.length = 0;
        await h.body("2025-01-06"); // 선계산분 히트 — 재계산 0, 이웃(01-05 없음·01-07 캐시됨) 추가 계산 0
        await flush();
        expect(h.computed).toEqual([]);
        await h.body("2025-01-08"); // 이웃 = 01-07(캐시됨)·TODAY(오늘 — 제외)
        await flush();
        expect(h.computed).toEqual([]);
    });

    it("선계산 실패는 조용히 버린다 — 다음 실요청이 다시 계산한다", async () => {
        const days = ["2025-01-06", "2025-01-07"];
        const h = harness(days, { failDates: new Set(["2025-01-06"]) });
        await h.body("2025-01-07");
        await flush();
        expect(h.computed).toEqual(["2025-01-07", "2025-01-06"]); // 실패했지만 던지지 않았다
        await expect(h.body("2025-01-06")).rejects.toThrow("계산 실패"); // 실요청은 에러 그대로(500 경로)
        expect(h.computed).toEqual(["2025-01-07", "2025-01-06", "2025-01-06"]);
    });

    it("LRU 상한 — 넘치면 가장 오래 안 쓴 날짜부터 버린다(메모리 유지)", async () => {
        const h = harness([], { limit: 2 }); // 빈 거래일 목록 = 선계산 없음(순수 LRU 관찰)
        await h.body("2025-01-02");
        await h.body("2025-01-03");
        await h.body("2025-01-02"); // 01-02 를 최근 사용으로
        await h.body("2025-01-06"); // 상한 2 초과 → 01-03 축출
        h.computed.length = 0;
        await h.body("2025-01-02");
        expect(h.computed).toEqual([]); // 히트
        await h.body("2025-01-03");
        expect(h.computed).toEqual(["2025-01-03"]); // 축출됐던 날짜 — 재계산
    });
});
