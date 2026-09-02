import { describe, it, expect, vi } from "vitest";
import { KrxRest } from "../rest/client.js";
import { KrxError } from "../errors.js";
import { silentLogger } from "../logger.js";
import { loadKrxConfigFromEnv, resolveTuning, DEFAULT_BASE_URL, DEFAULT_RATE_LIMIT_MS } from "../config.js";
import type { KrxTransport } from "../transport.js";

/** 호출을 기록하는 가짜 전송 — 실제 KRX 없이 URL·헤더·파라미터를 검증한다. */
function fakeTransport(reply: { status?: number; data?: unknown } = {}) {
    const calls: { url: string; params: Record<string, string>; headers: Record<string, string> }[] = [];
    const transport: KrxTransport = {
        get: (url, params, headers) => {
            calls.push({ url, params, headers });
            return Promise.resolve({
                status: reply.status ?? 200,
                data: (reply.data ?? { OutBlock_1: [] }) as never,
                headers: {},
            });
        },
    };
    return { transport, calls };
}

const rest = (t: KrxTransport, rateLimitMs = 0) =>
    new KrxRest({
        transport: t,
        authKey: "KEY123",
        baseUrl: DEFAULT_BASE_URL,
        tuning: resolveTuning({ rateLimitMs }),
        logger: silentLogger,
    });

describe("KrxRest.getByddTrd", () => {
    it("시장별 엔드포인트 + basDd 쿼리 + AUTH_KEY 헤더", async () => {
        const { transport, calls } = fakeTransport();
        await rest(transport).getByddTrd("ksq", "20260626");
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${DEFAULT_BASE_URL}/sto/ksq_bydd_trd`);
        expect(calls[0].params).toEqual({ basDd: "20260626" });
        // 인증은 토큰 발급 없이 헤더 하나 — 이게 이 패키지가 kis/kiwoom 보다 얇은 이유다.
        expect(calls[0].headers).toEqual({ AUTH_KEY: "KEY123" });
    });

    it("휴장일 빈 응답도 정상 통과(에러 아님)", async () => {
        const { transport } = fakeTransport({ data: { OutBlock_1: [] } });
        const res = await rest(transport).getByddTrd("stk", "20260830");
        expect(res.data.OutBlock_1).toEqual([]);
    });

    it("200 이 아니면 본문째 KrxError — 인증 실패 진단이 recon 에서 보여야 한다", async () => {
        const body = { respMsg: "Unauthorized API Call", respCode: "401" };
        const { transport } = fakeTransport({ status: 401, data: body });
        await expect(rest(transport).getByddTrd("stk", "20260626")).rejects.toMatchObject({
            name: "KrxError",
            meta: { status: 401, apiId: "stk_bydd_trd", body },
        });
    });

    it("본문이 객체가 아니면 KrxError(HTML 에러페이지 등)", async () => {
        const { transport } = fakeTransport({ data: "<html>error</html>" });
        await expect(rest(transport).getByddTrd("stk", "20260626")).rejects.toBeInstanceOf(KrxError);
    });

    it("유량 게이트 — 동시에 불러도 슬롯을 겹치지 않게 예약한다", async () => {
        vi.useFakeTimers();
        try {
            const { transport, calls } = fakeTransport();
            const r = rest(transport, 200);
            const all = Promise.all([
                r.getByddTrd("stk", "20260626"),
                r.getByddTrd("ksq", "20260626"),
                r.getByddTrd("stk", "20260625"),
            ]);
            await vi.advanceTimersByTimeAsync(0);
            expect(calls).toHaveLength(1); // 첫 건만 즉시
            await vi.advanceTimersByTimeAsync(200);
            expect(calls).toHaveLength(2);
            await vi.advanceTimersByTimeAsync(200);
            expect(calls).toHaveLength(3);
            await all;
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("loadKrxConfigFromEnv", () => {
    it("인증키 없으면 즉시 실패 — 조용히 401 맞는 것보다 낫다", () => {
        const saved = process.env.KRX_AUTH_KEY;
        delete process.env.KRX_AUTH_KEY;
        try {
            expect(() => loadKrxConfigFromEnv()).toThrow(KrxError);
        } finally {
            if (saved !== undefined) process.env.KRX_AUTH_KEY = saved;
        }
    });

    it("baseUrl 은 기본값, 환경변수가 있으면 그쪽", () => {
        const savedKey = process.env.KRX_AUTH_KEY;
        const savedUrl = process.env.KRX_BASE_URL;
        process.env.KRX_AUTH_KEY = "  ABC  "; // 공백은 trim
        delete process.env.KRX_BASE_URL;
        try {
            expect(loadKrxConfigFromEnv()).toEqual({ authKey: "ABC", baseUrl: DEFAULT_BASE_URL });
            process.env.KRX_BASE_URL = "https://example.test/svc/sample/apis";
            expect(loadKrxConfigFromEnv().baseUrl).toBe("https://example.test/svc/sample/apis");
        } finally {
            if (savedKey === undefined) delete process.env.KRX_AUTH_KEY;
            else process.env.KRX_AUTH_KEY = savedKey;
            if (savedUrl === undefined) delete process.env.KRX_BASE_URL;
            else process.env.KRX_BASE_URL = savedUrl;
        }
    });

    it("resolveTuning 기본값", () => {
        expect(resolveTuning()).toEqual({ rateLimitMs: DEFAULT_RATE_LIMIT_MS });
        expect(resolveTuning({ rateLimitMs: 0 })).toEqual({ rateLimitMs: 0 });
    });
});
