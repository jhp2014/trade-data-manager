import { describe, it, expect } from "vitest";
import { NtfyNotifier, loadNtfyConfigFromEnv } from "../ntfyNotifier.js";
import type { NotifyPriority } from "../notifyQueue.js";

describe("NtfyNotifier", () => {
    it("env 로드 — 토픽 필수, 서버 기본 ntfy.sh", () => {
        expect(loadNtfyConfigFromEnv({ LIVE_NTFY_TOPIC: "tdm-abc" } as NodeJS.ProcessEnv)).toEqual({ server: "https://ntfy.sh", topic: "tdm-abc" });
        expect(loadNtfyConfigFromEnv({ LIVE_NTFY_TOPIC: "t", LIVE_NTFY_SERVER: "https://my.ntfy" } as NodeJS.ProcessEnv)).toEqual({ server: "https://my.ntfy", topic: "t" });
        expect(loadNtfyConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    });

    it("sendText — server/topic 으로 POST, priority 전달(기본 default)", async () => {
        const calls: Array<{ url: string; text: string; priority: NotifyPriority }> = [];
        const n = new NtfyNotifier({ server: "https://ntfy.sh", topic: "tdm-abc" }, async (url, text, priority) => {
            calls.push({ url, text, priority });
        });
        await n.sendText("🔔 발화", { priority: "high" });
        await n.sendText("하트비트");
        expect(calls).toEqual([
            { url: "https://ntfy.sh/tdm-abc", text: "🔔 발화", priority: "high" },
            { url: "https://ntfy.sh/tdm-abc", text: "하트비트", priority: "default" },
        ]);
    });

    it("전송 실패는 throw 로 전파(호출측 NotifyQueue 가 재시도)", async () => {
        const n = new NtfyNotifier({ server: "https://ntfy.sh", topic: "t" }, async () => {
            throw new Error("ntfy POST 429: limit");
        });
        await expect(n.sendText("x")).rejects.toThrow(/429/);
    });
});
