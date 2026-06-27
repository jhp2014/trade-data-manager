import { describe, it, expect } from "vitest";
import { loadKiwoomConfigFromEnv, resolveTuning, DEFAULT_RATE_LIMIT_MS } from "../config.js";

const BASE = "https://api.example.com";

describe("loadKiwoomConfigFromEnv — 멀티키 수집", () => {
    it("단일키(.env 기본형)만 있어도 풀 사이즈 1", () => {
        const cfg = loadKiwoomConfigFromEnv({
            KIWOOM_APP_KEY: "A",
            KIWOOM_SECRET_KEY: "sa",
            KIWOOM_BASE_URL: BASE,
        } as any);
        expect(cfg.credentials).toEqual([{ appKey: "A", secretKey: "sa" }]);
    });

    it("기본키 + _2 + _3 → 트리플키", () => {
        const cfg = loadKiwoomConfigFromEnv({
            KIWOOM_APP_KEY: "A",
            KIWOOM_SECRET_KEY: "sa",
            KIWOOM_APP_KEY_2: "B",
            KIWOOM_SECRET_KEY_2: "sb",
            KIWOOM_APP_KEY_3: "C",
            KIWOOM_SECRET_KEY_3: "sc",
            KIWOOM_BASE_URL: BASE,
        } as any);
        expect(cfg.credentials.map((c) => c.appKey)).toEqual(["A", "B", "C"]);
    });

    it("중복 appKey 는 제거(기본키 == _1)", () => {
        const cfg = loadKiwoomConfigFromEnv({
            KIWOOM_APP_KEY: "A",
            KIWOOM_SECRET_KEY: "sa",
            KIWOOM_APP_KEY_1: "A",
            KIWOOM_SECRET_KEY_1: "sa",
            KIWOOM_BASE_URL: BASE,
        } as any);
        expect(cfg.credentials).toHaveLength(1);
    });

    it("자격증명 없으면 throw", () => {
        expect(() => loadKiwoomConfigFromEnv({ KIWOOM_BASE_URL: BASE } as any)).toThrow();
    });

    it("baseUrl 없으면 throw", () => {
        expect(() =>
            loadKiwoomConfigFromEnv({ KIWOOM_APP_KEY: "A", KIWOOM_SECRET_KEY: "sa" } as any),
        ).toThrow();
    });
});

describe("resolveTuning — 키 개수 기반 동적", () => {
    it("기본 rate=200ms(5/sec), maxRetries=키수+2", () => {
        const t = resolveTuning(3);
        expect(t.rateLimitMs).toBe(DEFAULT_RATE_LIMIT_MS);
        expect(t.maxRetries).toBe(5);
    });
    it("부분 오버라이드 가능", () => {
        const t = resolveTuning(1, { rateLimitMs: 100, cooldownMs: 50 });
        expect(t.rateLimitMs).toBe(100);
        expect(t.cooldownMs).toBe(50);
        expect(t.maxRetries).toBe(3);
    });
});
