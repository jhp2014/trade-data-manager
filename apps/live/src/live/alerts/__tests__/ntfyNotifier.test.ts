import { describe, it, expect } from "vitest";
import { NtfyNotifier, loadNtfyConfigFromEnv } from "../ntfyNotifier.js";
import { textMessage, type NotifyMessage, type NotifyPriority } from "../message.js";

describe("NtfyNotifier", () => {
    it("env 로드 — 토픽 필수, 서버 기본 ntfy.sh", () => {
        expect(loadNtfyConfigFromEnv({ LIVE_NTFY_TOPIC: "tdm-abc" } as NodeJS.ProcessEnv)).toEqual({ server: "https://ntfy.sh", topic: "tdm-abc" });
        expect(loadNtfyConfigFromEnv({ LIVE_NTFY_TOPIC: "t", LIVE_NTFY_SERVER: "https://my.ntfy" } as NodeJS.ProcessEnv)).toEqual({ server: "https://my.ntfy", topic: "t" });
        expect(loadNtfyConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    });

    it("send — server/topic 으로 POST, 메시지 우선순위를 헤더로 전달", async () => {
        const calls: Array<{ url: string; text: string; priority: NotifyPriority }> = [];
        const n = new NtfyNotifier({ server: "https://ntfy.sh", topic: "tdm-abc" }, async (url, text, priority) => {
            calls.push({ url, text, priority });
        });
        await n.send(textMessage("🔔 발화", "high", "firing"));
        await n.send(textMessage("하트비트", "min"));
        expect(calls).toEqual([
            { url: "https://ntfy.sh/tdm-abc", text: "🔔 발화", priority: "high" },
            { url: "https://ntfy.sh/tdm-abc", text: "하트비트", priority: "min" },
        ]);
    });

    it("서식 없는 전송로 — 블록을 평문으로 낮추고(태그 없음) 답장 앵커는 없다(null)", async () => {
        const sent: string[] = [];
        const n = new NtfyNotifier({ server: "https://ntfy.sh", topic: "t" }, async (_u, text) => {
            sent.push(text);
        });
        const msg: NotifyMessage = {
            kind: "context",
            priority: "min",
            replyTo: 42, // 지원 안 함 — 무시된다
            blocks: [
                { kind: "text", text: "삼성전자", bold: true },
                { kind: "pre", text: "1. A +1%" },
                { kind: "link", text: "뉴스", url: "https://x.test" },
            ],
        };
        expect(await n.send(msg)).toBeNull();
        expect(sent).toEqual(["삼성전자\n1. A +1%\n뉴스 https://x.test"]);
    });

    it("전송 실패는 throw 로 전파(호출측 NotifyQueue 가 재시도)", async () => {
        const n = new NtfyNotifier({ server: "https://ntfy.sh", topic: "t" }, async () => {
            throw new Error("ntfy POST 429: limit");
        });
        await expect(n.send(textMessage("x", "high"))).rejects.toThrow(/429/);
    });
});
