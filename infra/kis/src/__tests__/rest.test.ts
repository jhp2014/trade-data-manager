import { describe, it, expect } from "vitest";
import { createKis } from "../index.js";
import { createMemoryTokenStore } from "../tokenStore.js";
import { silentLogger } from "../logger.js";
import { mockTransport, isTokenCall, tokenResponseFor, type MockCall } from "./helpers.js";

const BASE = "https://api";

function kisWith(
    appKeys: string[],
    handler: (call: MockCall) => any,
    tuning?: NonNullable<Parameters<typeof createKis>[0]>["tuning"],
) {
    const { transport, calls } = mockTransport((call) =>
        isTokenCall(call.url) ? tokenResponseFor(call.body) : handler(call),
    );
    const kis = createKis({
        config: {
            credentials: appKeys.map((k) => ({ appKey: k, appSecret: `s-${k}` })),
            baseUrl: BASE,
            custType: "P",
        },
        transport,
        tokenStore: createMemoryTokenStore(),
        logger: silentLogger,
        tuning: { rateLimitMs: 0, tokenRateLimitMs: 0, cooldownMs: 10_000, ...tuning },
    });
    return { kis, calls };
}

const dataCalls = (calls: MockCall[]) => calls.filter((c) => c.method === "get");

const ok = (output2: any[] = []) => ({
    status: 200,
    data: { rt_cd: "0", msg_cd: "MCA00000", msg1: "정상", output1: { stck_prpr: "70000" }, output2 },
    headers: { tr_cont: "D" },
});

describe("KisRest — 응답 매핑", () => {
    it("rt_cd 0 성공 시 data + tr_cont 헤더 매핑", async () => {
        const { kis } = kisWith(["A"], () => ({ ...ok([{ stck_cntg_hour: "090100", acml_tr_pbmn: "12345" }]) }));
        const res = await kis.rest.getMinuteChart("005930");
        expect(res.data.output2[0].acml_tr_pbmn).toBe("12345");
        expect(res.trCont).toBe("D");
    });

    it("GET 요청에 appkey/appsecret/tr_id/custtype 헤더와 FID 파라미터를 싣는다", async () => {
        const { kis, calls } = kisWith(["A"], () => ok());
        await kis.rest.getMinuteChart("005930", { time: "130000" });
        const dc = dataCalls(calls)[0];
        expect(dc.url).toBe(`${BASE}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice`);
        expect(dc.headers["tr_id"]).toBe("FHKST03010200");
        expect(dc.headers["custtype"]).toBe("P");
        expect(dc.headers["appkey"]).toBe("A");
        expect(dc.headers["appsecret"]).toBe("s-A");
        expect(dc.headers["authorization"]).toBe("Bearer T:A");
        expect(dc.params.FID_INPUT_ISCD).toBe("005930");
        expect(dc.params.FID_INPUT_HOUR_1).toBe("130000");
    });
});

describe("KisRest — 유량초과(EGW00201) failover (단발 호출)", () => {
    it("첫 키가 EGW00201 이면 쿨다운 후 다른 키로 넘어가 성공", async () => {
        let n = 0;
        const { kis, calls } = kisWith(["A", "B"], () => {
            n++;
            if (n === 1) return { status: 200, data: { rt_cd: "1", msg_cd: "EGW00201", msg1: "초당 거래건수 초과" } };
            return ok([{ stck_cntg_hour: "090100", acml_tr_pbmn: "999" }]);
        });
        const res = await kis.rest.getMinuteChart("005930");
        expect(res.data.output2[0].acml_tr_pbmn).toBe("999");
        const dc = dataCalls(calls);
        expect(dc).toHaveLength(2);
        expect(dc[0].headers.appkey).toBe("A"); // 첫 키
        expect(dc[1].headers.appkey).toBe("B"); // failover 키
    });

    it("모든 키가 계속 EGW00201 이면 재시도 소진 후 throw", async () => {
        const { kis } = kisWith(["A", "B"], () => ({
            status: 200,
            data: { rt_cd: "1", msg_cd: "EGW00201", msg1: "초당 거래건수 초과" },
        }));
        await expect(kis.rest.getMinuteChart("005930")).rejects.toThrow(/유량초과/);
    });
});

describe("KisRest — 토큰 만료(EGW00123) 시 강제 재발급 후 재시도", () => {
    it("첫 응답이 토큰만료면 토큰 재발급하고 같은 키로 재시도해 성공", async () => {
        let n = 0;
        const { kis, calls } = kisWith(["A"], () => {
            n++;
            if (n === 1) return { status: 200, data: { rt_cd: "1", msg_cd: "EGW00123", msg1: "토큰 만료" } };
            return ok([{ stck_cntg_hour: "090100", acml_tr_pbmn: "1" }]);
        });
        const res = await kis.rest.getMinuteChart("005930");
        expect(res.data.rt_cd).toBe("0");
        // 토큰 발급은 2회(최초 + 강제 재발급)
        expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(2);
    });
});

describe("KisRest — collectDayMinutes 하루치 페이징 수집", () => {
    // 08:00~08:49(프리마켓) + 09:00~15:30 분봉을 1분 간격으로 생성(내림차순 서빙용 오름차순 원본).
    function makeDay(): string[] {
        const times: string[] = [];
        const push = (h: number, m: number) => times.push(`${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`);
        for (let m = 0; m < 50; m++) push(8, m); // 0800~0849
        for (let t = 9 * 60; t <= 15 * 60 + 30; t++) push(Math.floor(t / 60), t % 60); // 0900~1530
        return times;
    }

    it("시간 역순 페이징으로 하루치를 모으고(프리마켓 포함) 오름차순 정렬, 한 키에 핀 고정", async () => {
        const allTimes = makeDay(); // 오름차순
        const candleAt = (t: string) => ({
            stck_bsop_date: "20260626",
            stck_cntg_hour: t,
            stck_prpr: "70000",
            stck_oprc: "70000",
            stck_hgpr: "70100",
            stck_lwpr: "69900",
            cntg_vol: "100",
            acml_tr_pbmn: "1000",
        });
        const { kis, calls } = kisWith(["A", "B"], (call) => {
            const reqTime = call.params.FID_INPUT_HOUR_1 || "240000";
            // reqTime 이하를 내림차순으로 최대 120봉.
            const page = allTimes.filter((t) => t <= reqTime).reverse().slice(0, 120).map(candleAt);
            return { status: 200, data: { rt_cd: "0", msg_cd: "", msg1: "", output1: {}, output2: page }, headers: {} };
        });

        const candles = await kis.rest.collectDayMinutes("005930", "20260626", { marketDiv: "UN" });
        expect(candles.length).toBe(allTimes.length); // 전부 dedup 수집
        expect(candles[0].stck_cntg_hour).toBe("080000"); // 프리마켓 포함 + 오름차순
        expect(candles[candles.length - 1].stck_cntg_hour).toBe("153000");
        // 중복 없음
        expect(new Set(candles.map((c) => c.stck_cntg_hour)).size).toBe(candles.length);
        // 핀 고정 → 모든 페이지 같은 키
        const dc = dataCalls(calls);
        expect(dc.length).toBeGreaterThan(1); // 여러 페이지
        expect(new Set(dc.map((c) => c.headers.appkey)).size).toBe(1);
    });
});

describe("KisRest — lease 핀 고정(페이지네이션용)", () => {
    it("같은 lease 로 연속 호출하면 같은 자격증명을 쓰고 tr_cont 를 전달", async () => {
        const { kis, calls } = kisWith(["A", "B", "C"], () => ok());
        const lease = kis.pool.acquire();
        await kis.rest.getMinuteChart("005930", { lease });
        await kis.rest.getMinuteChart("005930", { lease, trCont: "N" });
        const dc = dataCalls(calls);
        expect(dc).toHaveLength(2);
        expect(dc[0].headers.appkey).toBe(dc[1].headers.appkey); // 핀 고정 → 동일 키
        expect(dc[1].headers["tr_cont"]).toBe("N");
    });
});
