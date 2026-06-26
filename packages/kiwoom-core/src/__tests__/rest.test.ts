import { describe, it, expect } from "vitest";
import { createKiwoom } from "../index.js";
import { createMemoryTokenStore } from "../tokenStore.js";
import { silentLogger } from "../logger.js";
import { mockTransport, isTokenCall, tokenResponseFor, type MockCall } from "./helpers.js";

const BASE = "https://api";

function kiwoomWith(
    appKeys: string[],
    handler: (call: MockCall) => any,
    tuning?: NonNullable<Parameters<typeof createKiwoom>[0]>["tuning"],
) {
    const { transport, calls } = mockTransport((call) =>
        isTokenCall(call.url) ? tokenResponseFor(call.body) : handler(call),
    );
    const kiwoom = createKiwoom({
        config: {
            credentials: appKeys.map((k) => ({ appKey: k, secretKey: `s-${k}` })),
            baseUrl: BASE,
        },
        transport,
        tokenStore: createMemoryTokenStore(),
        logger: silentLogger,
        tuning: { rateLimitMs: 0, cooldownMs: 10_000, ...tuning },
    });
    return { kiwoom, calls };
}

const dataCalls = (calls: MockCall[]) => calls.filter((c) => !isTokenCall(c.url));

describe("KiwoomRest — 응답 매핑", () => {
    it("성공 시 data + 헤더의 cont-yn/next-key 를 매핑", async () => {
        const { kiwoom } = kiwoomWith(["A"], () => ({
            status: 200,
            data: { code: "005930", name: "삼성전자" },
            headers: { "cont-yn": "Y", "next-key": "k1" },
        }));
        const res = await kiwoom.rest.getStockInfo("005930");
        expect(res.data.name).toBe("삼성전자");
        expect(res.contYn).toBe("Y");
        expect(res.nextKey).toBe("k1");
    });
});

describe("KiwoomRest — 429 failover (단발 호출)", () => {
    it("첫 키가 429 면 쿨다운 후 다른 키로 넘어가 성공", async () => {
        let n = 0;
        const { kiwoom, calls } = kiwoomWith(["A", "B"], () => {
            n++;
            if (n === 1) return { status: 429, data: {} };
            return { status: 200, data: { code: "005930", name: "삼성전자" }, headers: {} };
        });
        const res = await kiwoom.rest.getStockInfo("005930");
        expect(res.data.name).toBe("삼성전자");
        const dc = dataCalls(calls);
        expect(dc).toHaveLength(2);
        expect(dc[0].headers.authorization).toBe("Bearer T:A"); // 첫 키
        expect(dc[1].headers.authorization).toBe("Bearer T:B"); // failover 키
    });

    it("모든 키가 계속 429 면 재시도 소진 후 throw", async () => {
        const { kiwoom } = kiwoomWith(["A", "B"], () => ({ status: 429, data: {} }));
        await expect(kiwoom.rest.getStockInfo("005930")).rejects.toThrow(/rate limit/);
    });
});

describe("KiwoomRest — 페이지네이션은 한 키에 핀 고정", () => {
    it("getDailyChartsByCount: 연속조회 전 페이지가 같은 자격증명 토큰을 쓴다", async () => {
        const pages = [
            { qry: mkDaily(30), contYn: "Y", nextKey: "k1" },
            { qry: mkDaily(30), contYn: "N", nextKey: "" },
        ];
        let i = 0;
        const { kiwoom, calls } = kiwoomWith(["A", "B", "C"], () => {
            const p = pages[i++];
            return {
                status: 200,
                data: { stk_cd: "005930", stk_dt_pole_chart_qry: p.qry },
                headers: { "cont-yn": p.contYn, "next-key": p.nextKey },
            };
        });
        const candles = await kiwoom.rest.getDailyChartsByCount("005930", "20260515", 1000);
        expect(candles).toHaveLength(60);

        const chartCalls = dataCalls(calls).filter((c) => c.headers["api-id"] === "ka10081");
        expect(chartCalls).toHaveLength(2);
        // 핀 고정 → 두 페이지가 같은 토큰(=같은 키)
        expect(chartCalls[0].headers.authorization).toBe(chartCalls[1].headers.authorization);
        // 2페이지째는 next-key 를 실어 보냄
        expect(chartCalls[1].headers["next-key"]).toBe("k1");
    });
});

describe("KiwoomRest — 분봉 날짜 경계 종료 (NXT 코드 그대로 전달)", () => {
    it("가장 오래된 캔들이 tradeDate 이전이면 1페이지에서 종료", async () => {
        const { kiwoom, calls } = kiwoomWith(["A"], () => ({
            status: 200,
            data: {
                stk_cd: "005930_AL",
                stk_min_pole_chart_qry: [
                    mkMinute("20260515093000"),
                    mkMinute("20260514153000"), // 전일 → 경계
                ],
            },
            headers: { "cont-yn": "Y", "next-key": "k1" },
        }));
        const candles = await kiwoom.rest.getMinuteChartsForDate("005930_AL", "20260515");
        expect(candles).toHaveLength(2);
        // 경계로 끊겼으니 분봉 호출은 1회뿐(연속조회 안 함)
        const chartCalls = dataCalls(calls).filter((c) => c.headers["api-id"] === "ka10080");
        expect(chartCalls).toHaveLength(1);
        expect(chartCalls[0].body.stk_cd).toBe("005930_AL"); // NXT 코드 그대로
    });
});

function mkDaily(n: number) {
    return Array.from({ length: n }, (_, k) => ({
        cur_prc: "70000",
        trde_qty: "1000",
        trde_prica: "100",
        dt: `2026051${k % 10}`,
        open_pric: "69000",
        high_pric: "71000",
        low_pric: "68000",
        pred_pre: "+100",
        pred_pre_sig: "2",
    }));
}

function mkMinute(cntr_tm: string) {
    return {
        cur_prc: "70000",
        trde_qty: "10",
        cntr_tm,
        open_pric: "70000",
        high_pric: "70100",
        low_pric: "69900",
    };
}
