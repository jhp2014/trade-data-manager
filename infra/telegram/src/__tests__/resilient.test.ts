import { describe, it, expect, vi } from "vitest";
import { makeResilient, isConnectionError, type RawTelegram } from "../resilient.js";

const TIMEOUTS = { connectTimeoutMs: 50, opTimeoutMs: 50 };

// 스크립트 가능한 fake RawTelegram — searchChannel 을 호출마다 지정한 대로 동작시킨다.
interface FakeSpec {
    // 이 연결의 searchChannel 이 할 일(호출 순서대로 소비, 넘치면 마지막을 반복).
    search: Array<() => Promise<string[]>>;
    connected?: boolean; // isConnected() 반환(기본 true)
}

function fakeRaw(spec: FakeSpec) {
    let i = 0;
    const destroy = vi.fn(async () => {});
    const raw: RawTelegram = {
        isConnected: () => spec.connected ?? true,
        async searchChannel() {
            const step = spec.search[Math.min(i, spec.search.length - 1)];
            i++;
            return step() as unknown as never;
        },
        async sendMessage() {},
        destroy,
    };
    return { raw, destroy };
}

// open 팩토리를 스펙 큐로 만든다 — 재빌드마다 다음 스펙의 새 연결을 준다.
function openQueue(...specs: FakeSpec[]) {
    let n = 0;
    const built: Array<ReturnType<typeof fakeRaw>> = [];
    const open = vi.fn(async () => {
        const f = fakeRaw(specs[Math.min(n, specs.length - 1)]);
        n++;
        built.push(f);
        return f.raw;
    });
    return { open, built, calls: () => open.mock.calls.length };
}

const ok = (v: string[]) => async () => v;
const fail = (msg: string) => async () => {
    throw new Error(msg);
};

describe("makeResilient", () => {
    it("정상 op 통과 — open 1회", async () => {
        const q = openQueue({ search: [ok(["a"])] });
        const tg = makeResilient(q.open, TIMEOUTS);
        expect(await tg.searchChannel("@x", "q")).toEqual(["a"]);
        expect(q.calls()).toBe(1);
    });

    it("연결 TIMEOUT → 재빌드 후 성공(자가치유) — open 2회, 옛 연결 destroy", async () => {
        const q = openQueue({ search: [fail("TIMEOUT")] }, { search: [ok(["healed"])] });
        const tg = makeResilient(q.open, TIMEOUTS);
        expect(await tg.searchChannel("@x", "q")).toEqual(["healed"]);
        expect(q.calls()).toBe(2);
        expect(q.built[0].destroy).toHaveBeenCalledOnce(); // 죽은 연결 폐기
    });

    it("op 이 매달리면 opTimeoutMs 로 끊고 재빌드 — connected-but-wedged", async () => {
        const hang = () => new Promise<string[]>(() => {}); // 영원히 pending
        const q = openQueue({ search: [hang] }, { search: [ok(["recovered"])] });
        const tg = makeResilient(q.open, TIMEOUTS);
        expect(await tg.searchChannel("@x", "q")).toEqual(["recovered"]);
        expect(q.calls()).toBe(2);
    });

    it("연속 연결실패 → 2번째서 던지고, 다음 호출은 새 연결로 처음부터", async () => {
        const q = openQueue(
            { search: [fail("not connected")] },
            { search: [fail("TIMEOUT")] },
            { search: [ok(["later"])] },
        );
        const tg = makeResilient(q.open, TIMEOUTS);
        await expect(tg.searchChannel("@x", "q")).rejects.toThrow("TIMEOUT");
        expect(q.calls()).toBe(2); // 요청당 재빌드 1회 상한
        // 다음 요청은 세 번째 연결로 성공
        expect(await tg.searchChannel("@x", "q")).toEqual(["later"]);
        expect(q.calls()).toBe(3);
    });

    it("FLOOD_WAIT 는 터미널 — 재빌드 없이 즉시 표면화", async () => {
        const q = openQueue({ search: [fail("FLOOD_WAIT_30")] });
        const tg = makeResilient(q.open, TIMEOUTS);
        await expect(tg.searchChannel("@x", "q")).rejects.toThrow("FLOOD_WAIT");
        expect(q.calls()).toBe(1); // 재빌드 안 함
    });

    it("세션 무효는 터미널 — 재빌드 없이 표면화", async () => {
        const q = openQueue({ search: [fail("텔레그램 세션 무효(SESSION_REVOKED)")] });
        const tg = makeResilient(q.open, TIMEOUTS);
        await expect(tg.searchChannel("@x", "q")).rejects.toThrow("세션 무효");
        expect(q.calls()).toBe(1);
    });

    it("동시 최초 op 2건이 open 을 한 번만 트리거", async () => {
        const q = openQueue({ search: [ok(["a"]), ok(["b"])] });
        const tg = makeResilient(q.open, TIMEOUTS);
        const [r1, r2] = await Promise.all([tg.searchChannel("@x", "1"), tg.searchChannel("@x", "2")]);
        expect(q.calls()).toBe(1); // opening 메모이즈
        expect([r1, r2].sort()).toEqual([["a"], ["b"]].sort());
    });

    it("동시 연결실패 2건이 이중 teardown 안 함 — open 총 2회, 옛 연결 destroy 1회", async () => {
        // 첫 연결: 두 요청 모두 TIMEOUT. 둘째 연결: 둘 다 성공.
        const q = openQueue({ search: [fail("TIMEOUT"), fail("TIMEOUT")] }, { search: [ok(["a"]), ok(["b"])] });
        const tg = makeResilient(q.open, TIMEOUTS);
        const res = await Promise.all([tg.searchChannel("@x", "1"), tg.searchChannel("@x", "2")]);
        expect(res.sort()).toEqual([["a"], ["b"]].sort());
        expect(q.calls()).toBe(2); // 재빌드 한 번만(identity 가드로 핑퐁 없음)
        expect(q.built[0].destroy).toHaveBeenCalledOnce();
    });

    it("disconnect 후 op 은 거절", async () => {
        const q = openQueue({ search: [ok(["a"])] });
        const tg = makeResilient(q.open, TIMEOUTS);
        await tg.ensureConnected();
        await tg.disconnect();
        await expect(tg.searchChannel("@x", "q")).rejects.toThrow("종료");
        expect(q.built[0].destroy).toHaveBeenCalledOnce();
    });
});

describe("isConnectionError", () => {
    const connected = { isConnected: () => true } as RawTelegram;
    const disconnected = { isConnected: () => false } as RawTelegram;

    it("연결계열은 true", () => {
        expect(isConnectionError(new Error("TIMEOUT"), connected)).toBe(true);
        expect(isConnectionError(new Error("TELEGRAM_TIMEOUT:searchChannel"), connected)).toBe(true);
        expect(isConnectionError(new Error("not connected"), connected)).toBe(true);
        expect(isConnectionError(new Error("ECONNRESET"), connected)).toBe(true);
    });

    it("터미널은 false(연결계열 문자열과 겹쳐도)", () => {
        expect(isConnectionError(new Error("FLOOD_WAIT_30"), connected)).toBe(false);
        expect(isConnectionError(new Error("SESSION_REVOKED"), connected)).toBe(false);
        expect(isConnectionError(new Error("AUTH_KEY_UNREGISTERED"), disconnected)).toBe(false);
    });

    it("미상 에러는 현재 연결상태로 판단", () => {
        expect(isConnectionError(new Error("something odd"), connected)).toBe(false);
        expect(isConnectionError(new Error("something odd"), disconnected)).toBe(true);
    });
});
