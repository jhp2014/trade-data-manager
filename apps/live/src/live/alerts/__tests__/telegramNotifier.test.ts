import { describe, it, expect } from "vitest";
import { TelegramAlertNotifier, loadTelegramBotConfigFromEnv } from "../telegramNotifier.js";
import { buildAlertMessages } from "../format.js";
import type { AlertFiring } from "../types.js";

const firing = (code: string, name: string, at = 0, note?: string): AlertFiring => ({
    ruleId: `r-${code}`,
    code,
    name,
    at,
    features: { price: 71_000, changeRate: 2.1 },
    note,
});

describe("buildAlertMessages", () => {
    it("종목당 1메시지 — 같은 종목 다중 조건은 묶고, 다른 종목은 따로", () => {
        const msgs = buildAlertMessages([firing("005930", "삼성전자", 0, "돌파"), firing("005930", "삼성전자", 0, "테마 1위"), firing("000660", "SK하이닉스", 0)], 0);
        expect(msgs).toHaveLength(2);
        expect(msgs[0]).toContain("삼성전자(005930)");
        expect(msgs[0]).toContain("돌파");
        expect(msgs[0]).toContain("테마 1위");
        expect(msgs[1]).toContain("SK하이닉스(000660)");
    });

    it("30초+ 지연 배달이면 원발화 시각 표기, 즉시 배달이면 없음", () => {
        const at = Date.UTC(2026, 6, 15, 0, 41, 22); // KST 09:41:22
        expect(buildAlertMessages([firing("005930", "삼성전자", at)], at + 5_000)[0]).not.toContain("지연");
        const delayed = buildAlertMessages([firing("005930", "삼성전자", at)], at + 120_000)[0];
        expect(delayed).toContain("09:41:22 발화(지연 전송)");
    });
});

describe("TelegramAlertNotifier", () => {
    it("sendText — 전송 실패는 throw 로 전파(호출측 NotifyQueue 가 재시도)", async () => {
        const sent: string[] = [];
        const ok = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async (_t, _c, text) => {
            sent.push(text);
        });
        await ok.sendText("hello");
        expect(sent).toEqual(["hello"]);

        const bad = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async () => {
            throw new Error("텔레그램 sendMessage 429: too many requests");
        });
        await expect(bad.sendText("x")).rejects.toThrow(/429/);
    });

    it("env 로드 — 둘 다 있어야 config, 하나라도 없으면 null(로그 degrade)", () => {
        expect(loadTelegramBotConfigFromEnv({ LIVE_TELEGRAM_BOT_TOKEN: "t", LIVE_TELEGRAM_CHAT_ID: "c" } as NodeJS.ProcessEnv)).toEqual({ botToken: "t", chatId: "c" });
        expect(loadTelegramBotConfigFromEnv({ LIVE_TELEGRAM_BOT_TOKEN: "t" } as NodeJS.ProcessEnv)).toBeNull();
        expect(loadTelegramBotConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    });
});
