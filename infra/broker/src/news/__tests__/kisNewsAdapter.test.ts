import { describe, it, expect } from "vitest";
import { KisError } from "@trade-data-manager/kis";
import { KisNewsAdapter, type KisNewsSource } from "../kisNewsAdapter.js";

type Out = Record<string, string>;

const item = (srno: string, dt: string, tm: string, title: string, extra: Out = {}): Out => ({
    cntt_usiq_srno: srno,
    data_dt: dt,
    data_tm: tm,
    hts_pbnt_titl_cntt: title,
    news_ofer_entp_code: "6",
    dorg: "연합뉴스",
    news_lrdv_code: "03",
    iscd1: "",
    ...extra,
});

function fakeSource(out: Out[], capture?: (p: { date?: string; time?: string }) => void): KisNewsSource {
    return {
        async getNewsTitles(params) {
            capture?.(params);
            return { data: { output: out } } as Awaited<ReturnType<KisNewsSource["getNewsTitles"]>>;
        },
    };
}

describe("KisNewsAdapter", () => {
    it("필드 매핑 + iscd1~10 비지않은 것만 종목으로 수집", async () => {
        const out = [item("100", "20260626", "153012", "삼성·SK 뉴스", { iscd1: "005930", iscd3: "000660", dorg: "한경" })];
        const [h] = await new KisNewsAdapter(fakeSource(out)).fetchBefore();
        expect(h).toEqual({
            srno: "100",
            date: "2026-06-26",
            time: "15:30:12",
            title: "삼성·SK 뉴스",
            sourceCode: "6",
            sourceName: "한경",
            categoryCode: "03",
            stockCodes: ["005930", "000660"],
        });
    });

    it("앵커 → KIS compact 포맷(00YYYYMMDD / 0000HHMMSS) 전달", async () => {
        let sent: { date?: string; time?: string } = {};
        await new KisNewsAdapter(fakeSource([], (p) => (sent = p))).fetchBefore({ date: "2026-06-26", time: "17:51:41" });
        expect(sent).toEqual({ date: "0020260626", time: "0000175141" });
    });

    it("wrap 차단: 앵커보다 최신(wrap)인 항목을 버리고 내림차순으로 돌려준다", async () => {
        // API 가 페이지를 못 채워 같은 날 뒤쪽(22:27)으로 wrap 해 채운 응답을 흉내.
        const out = [
            item("a", "20260626", "175141", "anchor"),
            item("b", "20260626", "175000", "older-ok"),
            item("c", "20260626", "222744", "wrapped-newer"),
        ];
        const page = await new KisNewsAdapter(fakeSource(out)).fetchBefore({ date: "2026-06-26", time: "17:51:41" });
        expect(page.map((h) => h.srno)).toEqual(["a", "b"]); // c(wrap) 제거, 내림차순
    });

    it("이전 날짜 항목은 앵커 윈도 안(≤)이라 유지 — 자정 크로스 보존", async () => {
        const out = [
            item("x", "20260626", "000400", "0626 새벽"),
            item("y", "20260625", "234000", "0625 밤"),
        ];
        const page = await new KisNewsAdapter(fakeSource(out)).fetchBefore({ date: "2026-06-26", time: "00:05:00" });
        expect(page.map((h) => h.date)).toEqual(["2026-06-26", "2026-06-25"]);
    });

    it("유량초과(KisError)면 백오프 후 재시도해 결국 성공", async () => {
        let calls = 0;
        const flaky: KisNewsSource = {
            async getNewsTitles() {
                calls++;
                if (calls <= 2) throw new KisError("유량초과 — 재시도 소진 [FHKST01011800]");
                return { data: { output: [item("ok", "20260626", "150000", "성공")] } } as Awaited<
                    ReturnType<KisNewsSource["getNewsTitles"]>
                >;
            },
        };
        const waited: number[] = [];
        const adapter = new KisNewsAdapter(flaky, {
            sleep: async (ms) => void waited.push(ms), // 실제 대기 없이 즉시
            onRetry: () => {},
        });
        const page = await adapter.fetchBefore();
        expect(calls).toBe(3); // 2번 throw + 3번째 성공
        expect(waited.length).toBe(2); // 2번 백오프
        expect(page[0].srno).toBe("ok");
    });

    it("유량초과가 재시도 한도까지 계속되면 throw", async () => {
        const always: KisNewsSource = {
            async getNewsTitles() {
                throw new KisError("유량초과 — 재시도 소진 [FHKST01011800]");
            },
        };
        const adapter = new KisNewsAdapter(always, { maxRateLimitRetries: 2, sleep: async () => {}, onRetry: () => {} });
        await expect(adapter.fetchBefore()).rejects.toThrow(/유량초과/);
    });

    it("유량초과가 아닌 에러는 재시도 없이 즉시 전파", async () => {
        let calls = 0;
        const boom: KisNewsSource = {
            async getNewsTitles() {
                calls++;
                throw new Error("네트워크 끊김");
            },
        };
        const adapter = new KisNewsAdapter(boom, { sleep: async () => {}, onRetry: () => {} });
        await expect(adapter.fetchBefore()).rejects.toThrow(/네트워크/);
        expect(calls).toBe(1); // 재시도 안 함
    });
});
