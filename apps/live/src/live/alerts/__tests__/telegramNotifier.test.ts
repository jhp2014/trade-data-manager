import { describe, it, expect } from "vitest";
import { TelegramAlertNotifier, loadTelegramBotConfigFromEnv, renderTelegramHtml } from "../telegramNotifier.js";
import type { NotifyMessage } from "../message.js";

const msg = (blocks: NotifyMessage["blocks"], replyTo?: number): NotifyMessage => ({ kind: "firing", priority: "high", blocks, replyTo });
/** 한도(4096)를 확실히 넘기는 pre 본문 — 200자 × 60줄. */
const bigText = Array.from({ length: 60 }, () => "가".repeat(200)).join("\n");

describe("renderTelegramHtml", () => {
    it("이스케이프 — 뉴스 제목의 < & 가 태그로 새지 않는다(parse_mode 400 방지)", () => {
        expect(renderTelegramHtml(msg([{ kind: "text", text: '특징주 <급등> & "속보"' }]))).toEqual(['특징주 &lt;급등&gt; &amp; "속보"']);
    });

    it("블록 서식 — bold/pre/link, href 속성값도 이스케이프", () => {
        const [html] = renderTelegramHtml(
            msg([
                { kind: "text", text: "삼성전자", bold: true },
                { kind: "pre", text: "1. A +1%\n2. B +2%" },
                { kind: "link", text: "뉴스 <1>", url: "https://x.test/?a=1&b=2" },
            ]),
        );
        expect(html).toBe('<b>삼성전자</b>\n<pre>1. A +1%\n2. B +2%</pre>\n<a href="https://x.test/?a=1&amp;b=2">뉴스 &lt;1&gt;</a>');
    });

    it("4096 분할 — 조각마다 한도 이하 + 태그 균형(pre 가 열린 채 끝나지 않는다)", () => {
        const chunks = renderTelegramHtml(msg([{ kind: "pre", text: bigText }]));
        expect(chunks.length).toBeGreaterThan(1);
        for (const c of chunks) {
            expect(c.length).toBeLessThanOrEqual(4096);
            expect((c.match(/<pre>/g) ?? []).length).toBe((c.match(/<\/pre>/g) ?? []).length);
        }
    });

    it("한 줄이 통째로 한도를 넘으면 그 줄만 줄여 담는다(조각은 여전히 한도 이하)", () => {
        const chunks = renderTelegramHtml(msg([{ kind: "text", text: "&".repeat(3_000) }])); // 이스케이프 5배 팽창
        for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4096);
        expect(chunks.join("")).toContain("…");
    });
});

describe("TelegramAlertNotifier", () => {
    it("send — message_id 반환(컨텍스트 후속의 답장 앵커) + replyTo 전달", async () => {
        const calls: Array<{ html: string; replyTo?: number }> = [];
        const n = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async (_t, _c, html, replyTo) => {
            calls.push({ html, replyTo });
            return 111;
        });
        expect(await n.send(msg([{ kind: "text", text: "hello" }]))).toBe(111);
        expect(calls).toEqual([{ html: "hello", replyTo: undefined }]);

        calls.length = 0;
        await n.send(msg([{ kind: "text", text: "후속" }], 111));
        expect(calls[0].replyTo).toBe(111);
    });

    it("분할 뒷조각은 첫 조각에 답장으로 묶인다(순서·묶음 보장)", async () => {
        const seen: Array<number | undefined> = [];
        let next = 500;
        const n = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async (_t, _c, _html, replyTo) => {
            seen.push(replyTo);
            return next++;
        });
        await n.send(msg([{ kind: "pre", text: bigText }]));
        expect(seen.length).toBeGreaterThan(1);
        expect(seen[0]).toBeUndefined(); // 첫 조각은 답장 아님
        expect(seen.slice(1).every((r) => r === 500)).toBe(true); // 뒷조각은 전부 첫 조각에
    });

    it("전송 실패는 throw 로 전파(호출측 NotifyQueue 가 재시도)", async () => {
        const bad = new TelegramAlertNotifier({ botToken: "t", chatId: "c" }, async () => {
            throw new Error("텔레그램 sendMessage 429: too many requests");
        });
        await expect(bad.send(msg([{ kind: "text", text: "x" }]))).rejects.toThrow(/429/);
    });

    it("env 로드 — 둘 다 있어야 config, 하나라도 없으면 null(로그 degrade)", () => {
        expect(loadTelegramBotConfigFromEnv({ LIVE_TELEGRAM_BOT_TOKEN: "t", LIVE_TELEGRAM_CHAT_ID: "c" } as NodeJS.ProcessEnv)).toEqual({ botToken: "t", chatId: "c" });
        expect(loadTelegramBotConfigFromEnv({ LIVE_TELEGRAM_BOT_TOKEN: "t" } as NodeJS.ProcessEnv)).toBeNull();
        expect(loadTelegramBotConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    });
});
