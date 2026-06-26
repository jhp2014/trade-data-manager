import { describe, it, expect } from "vitest";
import { Credential, type CredentialDeps } from "../credential.js";
import { CredentialPool } from "../credentialPool.js";
import { resolveTuning } from "../config.js";
import { silentLogger } from "../logger.js";
import { createMemoryTokenStore } from "../tokenStore.js";

// 풀 테스트는 토큰을 부르지 않으므로 transport 는 호출 시 실패하는 더미면 충분.
function dummyDeps(): CredentialDeps {
    return {
        baseUrl: "https://x",
        transport: {
            async post() {
                throw new Error("transport 호출되면 안 됨");
            },
        },
        tokenStore: createMemoryTokenStore(),
        logger: silentLogger,
        tokenMarginMs: 0,
    };
}

function makePool(appKeys: string[], tuning = resolveTuning(appKeys.length, { rateLimitMs: 0 })) {
    const creds = appKeys.map((k) => new Credential(k, `s-${k}`, dummyDeps()));
    return { pool: new CredentialPool(creds, tuning), creds };
}

describe("CredentialPool", () => {
    it("라운드로빈으로 키를 순환한다", () => {
        const { pool, creds } = makePool(["A", "B", "C"]);
        const got = [0, 0, 0, 0, 0, 0].map(() => pool.acquire().credential);
        expect(got).toEqual([creds[0], creds[1], creds[2], creds[0], creds[1], creds[2]]);
    });

    it("쿨다운 중인 키는 건너뛴다 (failover)", () => {
        const { pool, creds } = makePool(["A", "B", "C"]);
        creds[0].cooldown(10_000); // A 쿨다운
        const ids = [0, 0, 0, 0].map(() => pool.acquire().credential);
        expect(ids).not.toContain(creds[0]);
        // B, C 만 번갈아
        expect(new Set(ids)).toEqual(new Set([creds[1], creds[2]]));
    });

    it("전부 쿨다운이면 가장 빨리 풀리는 키를 고른다", () => {
        const { pool, creds } = makePool(["A", "B"]);
        creds[0].cooldown(50_000);
        creds[1].cooldown(1_000); // B 가 더 빨리 풀림
        expect(pool.acquire().credential).toBe(creds[1]);
    });

    it("단일키면 로테이션은 항상 같은 키(no-op)", () => {
        const { pool, creds } = makePool(["A"]);
        expect(pool.acquire().credential).toBe(creds[0]);
        expect(pool.acquire().credential).toBe(creds[0]);
    });
});

describe("Credential.reserve — (키×TR) 페이싱", () => {
    it("같은 TR 연속 호출은 rateLimitMs 간격으로 누적, 첫 호출은 0", () => {
        const cred = new Credential("A", "sa", dummyDeps());
        expect(cred.reserve("ka10081", 200)).toBe(0);
        const d2 = cred.reserve("ka10081", 200);
        const d3 = cred.reserve("ka10081", 200);
        expect(d2).toBeGreaterThan(0);
        expect(d3).toBeGreaterThan(d2 - 5); // 단조 증가(타이밍 여유)
    });

    it("다른 TR 은 서로 독립 버킷이라 둘 다 즉시", () => {
        const cred = new Credential("A", "sa", dummyDeps());
        expect(cred.reserve("ka10080", 200)).toBe(0);
        expect(cred.reserve("ka10081", 200)).toBe(0); // 다른 TR → 영향 없음
    });
});
