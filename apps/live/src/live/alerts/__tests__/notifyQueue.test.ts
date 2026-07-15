import { describe, it, expect } from "vitest";
import { NotifyQueue, type NotifyTransport } from "../notifyQueue.js";
import type { AlertFiring } from "../types.js";

const firing = (code: string, at: number): AlertFiring => ({
    ruleId: `r-${code}`,
    code,
    name: `${code}명`,
    at,
    features: { price: 10_000, changeRate: 1.2 },
});

/** 실패 토글 가능한 스텁 트랜스포트. */
function makeTransport(): { transport: NotifyTransport; sent: string[]; state: { fail: boolean } } {
    const sent: string[] = [];
    const state = { fail: false };
    return {
        transport: {
            sendText: async (t: string) => {
                if (state.fail) throw new Error("boom");
                sent.push(t);
            },
        },
        sent,
        state,
    };
}

describe("NotifyQueue", () => {
    it("정상 경로 — push 즉시 다음 tick 에 배달, 종목당 1메시지", async () => {
        const { transport, sent } = makeTransport();
        const q = new NotifyQueue(transport);
        q.push([firing("005930", 1_000), firing("005930", 1_000), firing("000660", 1_000)], 1_000);
        await q.tick(2_000);
        expect(sent).toHaveLength(2); // 같은 종목 2건 묶임 + 다른 종목 1건
        expect(q.stats().pending).toBe(0);
        expect(q.stats().lastOkAt).toBe(2_000);
    });

    it("실패 → 큐 단위 백오프(5s→30s), 회복 후 배달·연속실패 리셋", async () => {
        const { transport, sent, state } = makeTransport();
        const errs: unknown[] = [];
        const q = new NotifyQueue(transport, undefined, (e) => errs.push(e));
        state.fail = true;
        q.push([firing("005930", 0)], 0);
        await q.tick(0); // 실패 1 → retryAt=5s
        expect(q.stats().consecutiveFailures).toBe(1);
        await q.tick(3_000); // 백오프 창 안 — 시도 안 함
        expect(errs).toHaveLength(1);
        await q.tick(5_000); // 실패 2 → retryAt=+30s
        expect(q.stats().consecutiveFailures).toBe(2);
        state.fail = false;
        await q.tick(20_000); // 아직 백오프 창 안
        expect(sent).toHaveLength(0);
        await q.tick(35_000); // 회복 배달
        expect(sent).toHaveLength(1);
        expect(q.stats().consecutiveFailures).toBe(0);
        expect(q.stats().pending).toBe(0);
    });

    it("TTL 10분 초과 항목은 폐기(onDrop) — 죽은 알람이 살아나지 않는다", async () => {
        const { transport, sent, state } = makeTransport();
        const drops: string[] = [];
        const q = new NotifyQueue(transport, (d) => drops.push(d.summary));
        state.fail = true;
        q.push([firing("005930", 0)], 0);
        await q.tick(0); // 실패(무장)
        state.fail = false;
        await q.tick(601_000); // TTL 초과 — 전송 전에 폐기
        expect(sent).toHaveLength(0);
        expect(drops).toHaveLength(1);
        expect(q.stats().droppedEntries).toBe(1);
        expect(q.stats().pending).toBe(0);
    });

    it("지연 배달(30s+)이면 메시지에 원발화 시각 표기", async () => {
        const { transport, sent, state } = makeTransport();
        const q = new NotifyQueue(transport);
        state.fail = true;
        q.push([firing("005930", 0)], 0);
        await q.tick(0); // 실패
        state.fail = false;
        await q.tick(120_000); // 2분 지연 배달
        expect(sent).toHaveLength(1);
        expect(sent[0]).toContain("발화(지연 전송)");
    });

    it("pushText 는 그대로 배달(하트비트·헬스 알림 경로)", async () => {
        const { transport, sent } = makeTransport();
        const q = new NotifyQueue(transport);
        q.pushText("✅ 알람 시스템 정상", 0);
        await q.tick(1_000);
        expect(sent).toEqual(["✅ 알람 시스템 정상"]);
    });

    it("우선순위 전달 — 발화=high, pushText 기본 default·지정값 유지", async () => {
        const got: Array<string | undefined> = [];
        const q = new NotifyQueue({
            sendText: async (_t, opts) => {
                got.push(opts?.priority);
            },
        });
        q.push([firing("005930", 0)], 0);
        q.pushText("회복", 0);
        q.pushText("🚨 이상", 0, "urgent");
        q.pushText("하트비트", 0, "min");
        await q.tick(1_000);
        expect(got).toEqual(["high", "default", "urgent", "min"]);
    });

    it("전송로 없음(null) — 큐만 비우고 조용히(로그는 sink 소관)", async () => {
        const q = new NotifyQueue(null);
        q.push([firing("005930", 0)], 0);
        await q.tick(1_000);
        expect(q.stats().pending).toBe(0);
        expect(q.stats().consecutiveFailures).toBe(0);
    });
});
