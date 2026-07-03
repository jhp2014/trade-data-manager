import { describe, it, expect } from "vitest";
import { createKiwoom } from "../index.js";
import { createMemoryTokenStore } from "../tokenStore.js";
import { silentLogger } from "../logger.js";
import { mockTransport, isTokenCall, tokenResponseFor, type MockCall } from "./helpers.js";

// getDailyChartsForRange / getRawDailyChartsForRange 의 특성화(characterization) 테스트.
// 공용 페이징 루프 추출 리팩토링의 안전망 — 연속조회 핀 고정·날짜경계 종료·수정/원주가 구분을 고정한다.

const BASE = "https://api";

function kiwoomWith(appKeys: string[], handler: (call: MockCall) => any) {
    const { transport, calls } = mockTransport((call) =>
        isTokenCall(call.url) ? tokenResponseFor(call.body) : handler(call),
    );
    const kiwoom = createKiwoom({
        config: { credentials: appKeys.map((k) => ({ appKey: k, secretKey: `s-${k}` })), baseUrl: BASE },
        transport,
        tokenStore: createMemoryTokenStore(),
        logger: silentLogger,
        tuning: { rateLimitMs: 0, cooldownMs: 10_000 },
    });
    return { kiwoom, calls };
}

const dataCalls = (calls: MockCall[]) => calls.filter((c) => !isTokenCall(c.url));
const mkPage = (dts: string[]) => dts.map((dt) => ({ dt, cur_prc: "100", trde_qty: "1", trde_prica: "1", open_pric: "1", high_pric: "1", low_pric: "1", pred_pre: "+1", pred_pre_sig: "2" }));

describe("KiwoomRest — getDailyChartsForRange (수정주가, 연속조회)", () => {
    it("가장 오래된 봉 dt < from 이면 종료 + 전 페이지 합산 + 한 키 핀 고정 + upd_stkpc_tp=1", async () => {
        // 페이지는 최신→과거. 1페이지 oldest 20260109 ≥ from → 계속, 2페이지 oldest 20251231 < from → 종료.
        const pages = [
            { qry: mkPage(["20260110", "20260109"]), contYn: "Y", nextKey: "k1" },
            { qry: mkPage(["20260108", "20251231"]), contYn: "Y", nextKey: "k2" },
        ];
        let i = 0;
        const { kiwoom, calls } = kiwoomWith(["A", "B"], () => {
            const p = pages[i++];
            return { status: 200, data: { stk_dt_pole_chart_qry: p.qry }, headers: { "cont-yn": p.contYn, "next-key": p.nextKey } };
        });
        const out = await kiwoom.rest.getDailyChartsForRange("005930", "20260101", "20260110");
        expect(out.map((c) => c.dt)).toEqual(["20260110", "20260109", "20260108", "20251231"]);

        const chartCalls = dataCalls(calls).filter((c) => c.headers["api-id"] === "ka10081");
        expect(chartCalls).toHaveLength(2); // 2페이지에서 날짜경계로 종료
        expect(chartCalls[0].headers.authorization).toBe(chartCalls[1].headers.authorization); // 핀 고정
        expect(chartCalls[1].headers["next-key"]).toBe("k1"); // 2페이지는 1페이지 next-key
        expect(chartCalls[0].body.upd_stkpc_tp).toBe("1"); // 수정주가
        expect(chartCalls[0].body.base_dt).toBe("20260110"); // baseDate=to
    });

    it("빈 페이지면 즉시 종료", async () => {
        const { kiwoom } = kiwoomWith(["A"], () => ({ status: 200, data: { stk_dt_pole_chart_qry: [] }, headers: { "cont-yn": "Y", "next-key": "k1" } }));
        const out = await kiwoom.rest.getDailyChartsForRange("005930", "20260101", "20260110");
        expect(out).toEqual([]);
    });

    it("maxPages 상한에서 종료(계속 cont-yn=Y 여도)", async () => {
        // from 을 아주 과거로 둬 날짜경계에 안 걸리게 → maxPages 로만 끊긴다.
        const { kiwoom, calls } = kiwoomWith(["A"], () => ({
            status: 200,
            data: { stk_dt_pole_chart_qry: mkPage(["20260110"]) },
            headers: { "cont-yn": "Y", "next-key": "k" },
        }));
        const out = await kiwoom.rest.getDailyChartsForRange("005930", "20000101", "20260110", 3);
        expect(out).toHaveLength(3);
        expect(dataCalls(calls).filter((c) => c.headers["api-id"] === "ka10081")).toHaveLength(3);
    });
});

describe("KiwoomRest — getRawDailyChartsForRange (원주가, 연속조회)", () => {
    it("range 페이징 동작은 동일하되 upd_stkpc_tp=0(원주가)", async () => {
        const pages = [
            { qry: mkPage(["20260110", "20260109"]), contYn: "Y", nextKey: "k1" },
            { qry: mkPage(["20260108", "20251231"]), contYn: "N", nextKey: "" },
        ];
        let i = 0;
        const { kiwoom, calls } = kiwoomWith(["A"], () => {
            const p = pages[i++];
            return { status: 200, data: { stk_dt_pole_chart_qry: p.qry }, headers: { "cont-yn": p.contYn, "next-key": p.nextKey } };
        });
        const out = await kiwoom.rest.getRawDailyChartsForRange("005930", "20260101", "20260110");
        expect(out.map((c) => c.dt)).toEqual(["20260110", "20260109", "20260108", "20251231"]);
        const chartCalls = dataCalls(calls).filter((c) => c.headers["api-id"] === "ka10081");
        expect(chartCalls[0].body.upd_stkpc_tp).toBe("0"); // 원주가
    });
});
