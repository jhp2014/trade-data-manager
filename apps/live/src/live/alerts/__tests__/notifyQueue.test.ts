import { describe, it, expect } from "vitest";
import { NotifyQueue, type NotifyTransport } from "../notifyQueue.js";
import { plainText, textMessage, type NotifyMessage, type NotifyPriority } from "../message.js";

const firingMsg = (code: string): NotifyMessage => ({ kind: "firing", priority: "high", blocks: [{ kind: "text", text: `🔔 ${code}명(${code})` }] });

/** 실패 토글 가능한 스텁 트랜스포트 — 배달된 메시지를 원형 그대로 모은다. */
function makeTransport(): { transport: NotifyTransport; sent: NotifyMessage[]; state: { fail: boolean } } {
    const sent: NotifyMessage[] = [];
    const state = { fail: false };
    return {
        transport: {
            send: async (msg: NotifyMessage) => {
                if (state.fail) throw new Error("boom");
                sent.push(msg);
                return 1;
            },
        },
        sent,
        state,
    };
}

describe("NotifyQueue", () => {
    it("정상 경로 — push 즉시 다음 tick 에 배달", async () => {
        const { transport, sent } = makeTransport();
        const q = new NotifyQueue(transport);
        q.push(firingMsg("005930"), 1_000);
        q.push(firingMsg("000660"), 1_000);
        await q.tick(2_000);
        expect(sent).toHaveLength(2);
        expect(q.stats().pending).toBe(0);
        expect(q.stats().lastOkAt).toBe(2_000);
        expect(q.stats().enqueuedFirings).toBe(2);
    });

    it("실패 → 큐 단위 백오프(5s→30s), 회복 후 배달·연속실패 리셋", async () => {
        const { transport, sent, state } = makeTransport();
        const errs: unknown[] = [];
        const q = new NotifyQueue(transport, undefined, (e) => errs.push(e));
        state.fail = true;
        q.push(firingMsg("005930"), 0);
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
        q.push(firingMsg("005930"), 0);
        await q.tick(0); // 실패(무장)
        state.fail = false;
        await q.tick(601_000); // TTL 초과 — 전송 전에 폐기
        expect(sent).toHaveLength(0);
        expect(drops).toEqual(["🔔 005930명(005930)"]);
        expect(q.stats().droppedEntries).toBe(1);
        expect(q.stats().pending).toBe(0);
    });

    it("지연 배달(30s+)이면 원발화 시각을 배달 시점에 덧붙인다(적재 시점엔 알 수 없다)", async () => {
        const { transport, sent, state } = makeTransport();
        const q = new NotifyQueue(transport);
        state.fail = true;
        q.push(firingMsg("005930"), 0);
        await q.tick(0); // 실패
        state.fail = false;
        await q.tick(120_000); // 2분 지연 배달
        expect(sent).toHaveLength(1);
        expect(plainText(sent[0])).toContain("발화(지연 전송)");
    });

    it("지연 표기는 발화만 — 헬스/하트비트엔 안 붙는다", async () => {
        const { transport, sent, state } = makeTransport();
        const q = new NotifyQueue(transport);
        state.fail = true;
        q.pushText("✅ 알람 시스템 정상", 0, "min");
        await q.tick(0);
        state.fail = false;
        await q.tick(120_000);
        expect(plainText(sent[0])).toBe("✅ 알람 시스템 정상");
    });

    it("pushText 는 그대로 배달(하트비트·헬스 알림 경로)", async () => {
        const { transport, sent } = makeTransport();
        const q = new NotifyQueue(transport);
        q.pushText("✅ 알람 시스템 정상", 0);
        await q.tick(1_000);
        expect(sent.map(plainText)).toEqual(["✅ 알람 시스템 정상"]);
        expect(q.stats().enqueuedFirings).toBe(0); // 발화 아님 — 요약 카운트에 안 잡힘
    });

    it("우선순위 전달 — 발화=high, pushText 기본 default·지정값 유지", async () => {
        const got: NotifyPriority[] = [];
        const q = new NotifyQueue({
            send: async (msg) => {
                got.push(msg.priority);
                return null;
            },
        });
        q.push(firingMsg("005930"), 0);
        q.pushText("회복", 0);
        q.pushText("🚨 이상", 0, "urgent");
        q.pushText("하트비트", 0, "min");
        await q.tick(1_000);
        expect(got).toEqual(["high", "default", "urgent", "min"]);
    });

    it("전송로 없음(null) — 큐만 비우고 조용히(로그는 sink 소관)", async () => {
        const q = new NotifyQueue(null);
        q.push(firingMsg("005930"), 0);
        await q.tick(1_000);
        expect(q.stats().pending).toBe(0);
        expect(q.stats().consecutiveFailures).toBe(0);
    });
});

describe("textMessage", () => {
    it("기본 갈래는 health — 발화 카운트·지연 표기 대상이 아니다", () => {
        expect(textMessage("x", "min").kind).toBe("health");
    });
});
