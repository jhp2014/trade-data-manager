import { describe, it, expect } from "vitest";
import { Credential } from "../credential.js";
import { createMemoryTokenStore } from "../tokenStore.js";
import { silentLogger } from "../logger.js";
import { mockTransport, isTokenCall, tokenResponseFor } from "./helpers.js";

const deps = (transport: any) => ({
    baseUrl: "https://api",
    transport,
    tokenStore: createMemoryTokenStore(),
    logger: silentLogger,
    tokenMarginMs: 5 * 60 * 1000,
    tokenRateLimitMs: 0,
});

describe("Credential 토큰", () => {
    it("최초 발급 후 캐시 재사용(두 번째 호출은 재발급 안 함)", async () => {
        const { transport, calls } = mockTransport((c) =>
            isTokenCall(c.url) ? tokenResponseFor(c.body) : {},
        );
        const cred = new Credential("appA", "secA", deps(transport));
        const t1 = await cred.getToken();
        const t2 = await cred.getToken();
        expect(t1).toBe("T:appA");
        expect(t2).toBe("T:appA");
        expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(1);
    });

    it("force=true 면 재발급", async () => {
        const { transport, calls } = mockTransport((c) =>
            isTokenCall(c.url) ? tokenResponseFor(c.body) : {},
        );
        const cred = new Credential("appA", "secA", deps(transport));
        await cred.getToken();
        await cred.getToken(true);
        expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(2);
    });

    it("토큰 거부(403 + error_description) 면 KisError", async () => {
        const { transport } = mockTransport(() => ({
            status: 403,
            data: { error_code: "EGW00133", error_description: "기간이 만료된 token 입니다." },
        }));
        const cred = new Credential("appA", "secA", deps(transport));
        await expect(cred.getToken()).rejects.toThrow(/인증 거부/);
    });

    it("발급 요청 바디에 appkey/appsecret 를 싣는다", async () => {
        const { transport, calls } = mockTransport((c) =>
            isTokenCall(c.url) ? tokenResponseFor(c.body) : {},
        );
        const cred = new Credential("appA", "secA", deps(transport));
        await cred.getToken();
        const call = calls.find((c) => isTokenCall(c.url))!;
        expect(call.url).toBe("https://api/oauth2/tokenP");
        expect(call.body).toMatchObject({ grant_type: "client_credentials", appkey: "appA", appsecret: "secA" });
    });
});
