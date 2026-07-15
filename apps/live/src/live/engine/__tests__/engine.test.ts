// 엔진 기동 견고성 — 연결 수명은 KiwoomWs 소유, 엔진은 'connected' 에만 반응한다.
// 배경(2026-07-15 실측): 무효 캐시 토큰으로 WS LOGIN 805004 → 엔진 영구 사망(손으로 캐시 삭제해야 복구).
// 원인은 KiwoomWs 가 **최초** 연결 실패엔 재연결을 안 걸고 호출자에게 위임했는데(handleDisconnect 의
// !started 가드) 그 호출자인 엔진도 재시도를 안 한 것. 이제 ws 가 autoRetryFirstConnect 로 재시도하고
// (forceTokenRefresh 가 토큰까지 자가치유), 엔진은 지연 성공을 'connected' 로 받아 초기화한다.
import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import type { KiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { LiveEngine } from "../engine.js";
import type { MembershipSource } from "../membership.js";
import type { DailyContextSource } from "../dailyContext.js";

/** connect() 결과를 순서대로 흉내내는 최소 가짜 ws(마지막 값은 이후 계속 반복).
 *  실제 KiwoomWs 는 LOGIN 성공 시 connect() resolve 직전에 'connected' 를 emit 한다 — 그 순서를 지킨다. */
function fakeWs(connectResults: Array<"ok" | "fail">) {
    let call = 0;
    const bus = new EventEmitter();
    const ws = Object.assign(bus, {
        connect: vi.fn(async () => {
            const r = connectResults[Math.min(call, connectResults.length - 1)];
            call++;
            if (r === "fail") throw new Error("LOGIN 실패 (805004): 토큰 인증에 실패했습니다");
            bus.emit("connected");
        }),
        getStatus: () => "live" as const,
        close: vi.fn(),
    });
    return ws as unknown as KiwoomWs & { connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}

function makeEngine(connectResults: Array<"ok" | "fail">) {
    const ws = fakeWs(connectResults);
    const kiwoom = { rest: { getMultiQuote: async () => ({ data: { atn_stk_infr: [] } }) } } as unknown as Kiwoom;
    const membership: MembershipSource = { themesOf: () => [], reload: async () => {} };
    const dailyCtx: DailyContextSource = { contextOf: () => undefined, ensure: async () => {} };
    // conditionName="" → 스캐너 없이 watchlist 폴링만(조건검색 WS 왕복을 테스트에서 뺀다).
    const engine = new LiveEngine(kiwoom, ws, membership, dailyCtx, { conditionName: "" });
    const started = vi.fn();
    const reconnected = vi.fn();
    engine.on("started", started);
    engine.on("reconnected", reconnected);
    engine.on("error", () => {}); // EventEmitter 는 'error' 리스너가 없으면 throw
    return { engine, ws, started, reconnected };
}

/** onConnected 는 void 로 띄우는 async — 대기 중인 마이크로태스크를 흘려보낸다. */
const flush = () => vi.advanceTimersByTimeAsync(0);

afterEach(() => {
    vi.useRealTimers();
});

describe("LiveEngine 기동", () => {
    it("첫 연결 성공: 'started' 1회 + 폴링 루프", async () => {
        vi.useFakeTimers();
        const { engine, ws, started } = makeEngine(["ok"]);

        await engine.start();
        await flush();
        expect(started).toHaveBeenCalledTimes(1);
        expect(ws.connect).toHaveBeenCalledTimes(1);

        const ticks: unknown[] = [];
        engine.on("tick", (t) => ticks.push(t));
        await vi.advanceTimersByTimeAsync(5_000);
        expect(ticks.length).toBe(1);

        await engine.stop();
    });

    it("첫 연결 실패는 throw 하되(호출자 로그) 엔진은 살아서 지연 성공에 자력 복구한다", async () => {
        vi.useFakeTimers();
        const { engine, ws, started } = makeEngine(["fail"]);

        await expect(engine.start()).rejects.toThrow(/805004/);
        expect(started).not.toHaveBeenCalled();

        // ws 가 autoRetryFirstConnect 백오프 끝에 LOGIN 성공 → 'connected'.
        // (connect() 는 이미 reject 됐고 wasStarted=false 라 'reconnected' 는 안 뜬다 — 그래서 'connected' 가 필요하다.)
        ws.emit("connected");
        await flush();
        expect(started).toHaveBeenCalledTimes(1);

        const ticks: unknown[] = [];
        engine.on("tick", (t) => ticks.push(t));
        await vi.advanceTimersByTimeAsync(5_000);
        expect(ticks.length).toBe(1); // 복구 후 루프도 산다

        await engine.stop();
    });

    it("재연결: 'started' 는 다시 안 뜨고 'reconnected', 폴링 루프는 한 벌만", async () => {
        vi.useFakeTimers();
        const { engine, ws, started, reconnected } = makeEngine(["ok"]);
        await engine.start();
        await flush();

        ws.emit("connected"); // 끊겼다가 재연결
        await flush();
        expect(started).toHaveBeenCalledTimes(1); // 여전히 1
        expect(reconnected).toHaveBeenCalledTimes(1);

        const ticks: unknown[] = [];
        engine.on("tick", (t) => ticks.push(t));
        await vi.advanceTimersByTimeAsync(5_000);
        expect(ticks.length).toBe(1); // 루프가 두 벌이면 2가 된다

        await engine.stop();
    });

    it("stop() 이후의 'connected' 는 무시한다(종료 후 되살아나지 않게)", async () => {
        vi.useFakeTimers();
        const { engine, ws, started } = makeEngine(["fail"]);

        await expect(engine.start()).rejects.toThrow();
        await engine.stop();

        ws.emit("connected");
        await flush();
        expect(started).not.toHaveBeenCalled();
    });
});
