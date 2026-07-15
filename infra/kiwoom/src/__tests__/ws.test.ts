// KiwoomWs 연결 수명 — 특히 **최초** 연결 실패 정책(autoRetryFirstConnect).
// 배경(2026-07-15 실측): 무효 캐시 토큰으로 LOGIN 805004 → 상주 데몬(apps/live)이 영구 사망했다.
// forceTokenRefresh 는 원래 있었지만 "다음 시도"가 없어 격발되지 못한 반쪽 메커니즘이었다.
// 기본값(false)은 CLI·recon 계약(첫 실패 즉시 전파)이라 함께 못박는다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KiwoomWs } from "../ws/client.js";

const hoisted = vi.hoisted(() => ({ instances: [] as any[] }));

// 'ws' 를 가짜 소켓으로 대체 — 테스트가 open/message/close 를 직접 몰아준다.
vi.mock("ws", async () => {
    const { EventEmitter } = await import("node:events");
    class FakeSocket extends EventEmitter {
        sent: any[] = [];
        constructor(public url: string) {
            super();
            hoisted.instances.push(this);
        }
        send(raw: string): void {
            this.sent.push(JSON.parse(raw));
        }
        close(): void {
            this.emit("close", 1000);
        }
        terminate(): void {
            this.emit("close", 1006);
        }
    }
    return { default: FakeSocket };
});

const instances = hoisted.instances;

/** 소켓을 열고 LOGIN 응답을 준다. code=0 이면 성공. */
async function loginRespond(sock: any, code: number): Promise<void> {
    sock.emit("open"); // 클라이언트가 LOGIN 프레임 전송
    await Promise.resolve();
    sock.emit(
        "message",
        Buffer.from(JSON.stringify({ trnm: "LOGIN", return_code: code, return_msg: code === 0 ? "" : "토큰이 유효하지 않습니다" })),
    );
    await Promise.resolve();
}

beforeEach(() => {
    instances.length = 0;
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("KiwoomWs 최초 연결 실패 정책", () => {
    it("autoRetryFirstConnect=true: LOGIN 거부 후 백오프 재시도하고, 그 시도는 토큰을 강제 재발급한다", async () => {
        const getToken = vi.fn(async (force?: boolean) => (force ? "fresh-token" : "stale-cached-token"));
        const ws = new KiwoomWs({ wsUrl: "wss://mock", getToken, autoRetryFirstConnect: true });
        const connected = vi.fn();
        ws.on("connected", connected);

        const first = ws.connect();
        await vi.advanceTimersByTimeAsync(0); // getToken 마이크로태스크
        expect(instances.length).toBe(1);
        expect(getToken).toHaveBeenNthCalledWith(1, false); // 첫 시도는 캐시 토큰(= 오늘 밤 무효였던 그것)

        await loginRespond(instances[0], 805004);
        await expect(first).rejects.toThrow(/LOGIN 실패 \(805004\)/); // 호출자에겐 그대로 알린다

        await vi.advanceTimersByTimeAsync(1_000); // BACKOFF_MIN
        expect(instances.length).toBe(2); // ← 재시도(이게 없어서 엔진이 죽었다)
        expect(getToken).toHaveBeenNthCalledWith(2, true); // ← forceTokenRefresh 격발 = 무효 캐시 자가치유

        await loginRespond(instances[1], 0);
        expect(connected).toHaveBeenCalledTimes(1); // 지연 성공을 소비자가 알 수 있다
        expect(ws.getStatus()).toBe("live");

        ws.close();
    });

    it("기본값(미지정): 첫 실패는 재시도하지 않는다 — CLI·recon 즉시 실패 계약", async () => {
        const getToken = vi.fn(async () => "t");
        const ws = new KiwoomWs({ wsUrl: "wss://mock", getToken });

        const first = ws.connect();
        await vi.advanceTimersByTimeAsync(0);
        await loginRespond(instances[0], 805004);
        await expect(first).rejects.toThrow(/LOGIN 실패/);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(instances.length).toBe(1); // 매달리지 않는다

        ws.close();
    });

    it("첫 연결 성공 뒤 끊기면 'connected'+'reconnected' 둘 다 — 재연결은 옵션과 무관하게 늘 동작", async () => {
        const getToken = vi.fn(async () => "t");
        const ws = new KiwoomWs({ wsUrl: "wss://mock", getToken }); // 기본값이어도 재연결은 한다
        const connected = vi.fn();
        const reconnected = vi.fn();
        ws.on("connected", connected);
        ws.on("reconnected", reconnected);

        const first = ws.connect();
        await vi.advanceTimersByTimeAsync(0);
        await loginRespond(instances[0], 0);
        await first;
        expect(connected).toHaveBeenCalledTimes(1);
        expect(reconnected).not.toHaveBeenCalled(); // 최초엔 안 뜬다

        instances[0].emit("close", 1006); // 끊김
        await vi.advanceTimersByTimeAsync(1_000);
        expect(instances.length).toBe(2);
        await loginRespond(instances[1], 0);
        expect(connected).toHaveBeenCalledTimes(2);
        expect(reconnected).toHaveBeenCalledTimes(1);

        ws.close();
    });
});
