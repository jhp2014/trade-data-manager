import { describe, it, expect } from "vitest";
import { loadKisConfigFromEnv, resolveTuning, DEFAULT_RATE_LIMIT_MS } from "../config.js";

const base = {
    KIS_BASE_URL: "https://openapi.koreainvestment.com:9443",
};

describe("loadKisConfigFromEnv", () => {
    it("단일키(KIS_APP_KEY/SECRET)를 수집하고 custType 기본 P", () => {
        const cfg = loadKisConfigFromEnv({ ...base, KIS_APP_KEY: "a", KIS_APP_SECRET: "s" } as any);
        expect(cfg.credentials).toEqual([{ appKey: "a", appSecret: "s" }]);
        expect(cfg.custType).toBe("P");
        expect(cfg.baseUrl).toBe(base.KIS_BASE_URL);
    });

    it("멀티키(_2..)를 모으고 appKey 중복은 제거", () => {
        const cfg = loadKisConfigFromEnv({
            ...base,
            KIS_APP_KEY: "a",
            KIS_APP_SECRET: "s",
            KIS_APP_KEY_2: "b",
            KIS_APP_SECRET_2: "s2",
            KIS_APP_KEY_3: "a", // 중복 → 무시
            KIS_APP_SECRET_3: "sx",
            KIS_CUST_TYPE: "B",
        } as any);
        expect(cfg.credentials.map((c) => c.appKey)).toEqual(["a", "b"]);
        expect(cfg.custType).toBe("B");
    });

    it("자격증명이 없으면 throw", () => {
        expect(() => loadKisConfigFromEnv({ ...base } as any)).toThrow(/자격증명/);
    });

    it("baseUrl 이 없으면 throw", () => {
        expect(() => loadKisConfigFromEnv({ KIS_APP_KEY: "a", KIS_APP_SECRET: "s" } as any)).toThrow(/BASE_URL/);
    });
});

describe("resolveTuning", () => {
    it("기본값 + maxRetries 는 키수+2", () => {
        const t = resolveTuning(3);
        expect(t.rateLimitMs).toBe(DEFAULT_RATE_LIMIT_MS);
        expect(t.maxRetries).toBe(5);
    });
    it("부분 오버라이드 가능", () => {
        const t = resolveTuning(1, { rateLimitMs: 0, cooldownMs: 5 });
        expect(t.rateLimitMs).toBe(0);
        expect(t.cooldownMs).toBe(5);
        expect(t.maxRetries).toBe(3);
    });
});
