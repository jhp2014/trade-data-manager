import { describe, it, expect } from "vitest";
import { Credential } from "../credential.js";
import { createMemoryTokenStore } from "../tokenStore.js";
import { silentLogger } from "../logger.js";
import { mockTransport, isTokenCall, tokenResponseFor, futureExpiry } from "./helpers.js";

function setup() {
    const store = createMemoryTokenStore();
    const { transport, calls } = mockTransport((call) =>
        isTokenCall(call.url) ? tokenResponseFor(call.body) : { status: 200, data: {} },
    );
    const cred = new Credential("A", "sa", {
        baseUrl: "https://api",
        transport,
        tokenStore: store,
        logger: silentLogger,
        tokenMarginMs: 5 * 60 * 1000,
    });
    return { cred, calls, store };
}

describe("Credential 토큰", () => {
    it("최초 1회 발급 후 메모리 재사용(추가 호출 없음)", async () => {
        const { cred, calls } = setup();
        expect(await cred.getToken()).toBe("T:A");
        await cred.getToken();
        await cred.getToken();
        expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(1);
    });

    it("force=true 면 강제 재발급", async () => {
        const { cred, calls } = setup();
        await cred.getToken();
        await cred.getToken(true);
        expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(2);
    });

    it("tokenStore 캐시가 유효하면 새 인스턴스도 발급 안 함", async () => {
        const store = createMemoryTokenStore();
        await store.save("does-not-matter", { access_token: "x", expires_dt: futureExpiry() });
        // appKey 'A' 의 캐시 키로 미리 심기
        const { transport, calls } = mockTransport((call) =>
            isTokenCall(call.url) ? tokenResponseFor(call.body) : { status: 200, data: {} },
        );
        const cred = new Credential("A", "sa", {
            baseUrl: "https://api",
            transport,
            tokenStore: store,
            logger: silentLogger,
            tokenMarginMs: 5 * 60 * 1000,
        });
        // 캐시를 cred.id 로 직접 저장
        await store.save((cred as any).id, { access_token: "cached", expires_dt: futureExpiry() });
        expect(await cred.getToken()).toBe("cached");
        expect(calls.filter((c) => isTokenCall(c.url))).toHaveLength(0);
    });

    it("동시 요청은 single-flight 로 1회만 발급", async () => {
        const { cred, calls } = setup();
        const [a, b, c] = await Promise.all([cred.getToken(), cred.getToken(), cred.getToken()]);
        expect([a, b, c]).toEqual(["T:A", "T:A", "T:A"]);
        expect(calls.filter((x) => isTokenCall(x.url))).toHaveLength(1);
    });

    it("인증 거부(return_code!=0)면 throw", async () => {
        const store = createMemoryTokenStore();
        const { transport } = mockTransport((call) =>
            isTokenCall(call.url)
                ? { status: 200, data: { return_code: 1, return_msg: "거부" } }
                : { status: 200, data: {} },
        );
        const cred = new Credential("A", "sa", {
            baseUrl: "https://api",
            transport,
            tokenStore: store,
            logger: silentLogger,
            tokenMarginMs: 0,
        });
        await expect(cred.getToken()).rejects.toThrow(/인증 거부/);
    });
});
