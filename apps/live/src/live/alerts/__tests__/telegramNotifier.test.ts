import { describe, it, expect } from "vitest";
import { TelegramAlertNotifier, loadTelegramBotConfigFromEnv } from "../telegramNotifier.js";
import type { AlertFiring } from "../types.js";

const firing = (code: string, name: string, note?: string): AlertFiring => ({
    ruleId: `r-${code}`,
    code,
    name,
    at: 0,
    features: { price: 71_000, changeRate: 2.1 },
    note,
});

describe("TelegramAlertNotifier", () => {
    it("종목당 1메시지 — 같은 종목 다중 룰은 묶고, 다른 종목은 따로", async () => {
        const sent: string[] = [];
        const n = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async (_t, _c, text) => {
            sent.push(text);
        });
        await n.send([firing("005930", "삼성전자", "밴드 진입"), firing("005930", "삼성전자", "테마 1위"), firing("000660", "SK하이닉스")]);
        expect(sent).toHaveLength(2);
        expect(sent[0]).toContain("삼성전자(005930)");
        expect(sent[0]).toContain("밴드 진입");
        expect(sent[0]).toContain("테마 1위");
        expect(sent[1]).toContain("SK하이닉스(000660)");
    });

    it("전송 실패는 throw 로 전파(호출측 sink 가 로그)", async () => {
        const n = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async () => {
            throw new Error("텔레그램 sendMessage 429: too many requests");
        });
        await expect(n.send([firing("005930", "삼성전자")])).rejects.toThrow(/429/);
    });

    it("env 로드 — 둘 다 있어야 config, 하나라도 없으면 null(로그 degrade)", () => {
        expect(loadTelegramBotConfigFromEnv({ LIVE_TELEGRAM_BOT_TOKEN: "t", LIVE_TELEGRAM_CHAT_ID: "c" } as NodeJS.ProcessEnv)).toEqual({ botToken: "t", chatId: "c" });
        expect(loadTelegramBotConfigFromEnv({ LIVE_TELEGRAM_BOT_TOKEN: "t" } as NodeJS.ProcessEnv)).toBeNull();
        expect(loadTelegramBotConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    });
});
