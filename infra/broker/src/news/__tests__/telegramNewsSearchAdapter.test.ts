import { describe, it, expect } from "vitest";
import type { TelegramMessage, TelegramSearchOptions } from "@trade-data-manager/telegram";
import { TelegramNewsSearchAdapter, type TelegramSearchSource } from "../telegramNewsSearchAdapter.js";

const msg = (
    id: number,
    date: Date,
    text: string,
    webpage?: TelegramMessage["webpage"],
): TelegramMessage => ({ id, date, text, webpage });

function fakeSource(
    out: TelegramMessage[],
    capture?: (p: { peer: string; query: string; opts?: TelegramSearchOptions }) => void,
): TelegramSearchSource {
    return {
        async searchChannel(peer, query, opts) {
            capture?.({ peer, query, opts });
            return out;
        },
    };
}

describe("TelegramNewsSearchAdapter", () => {
    it("메시지 → NewsItem 매핑 + peer 표시명 해석 + URL 추출", async () => {
        const at = new Date("2026-06-29T06:17:00Z");
        const out = [msg(42, at, "[속보] 삼성전자 신고가\nhttps://n.news.naver.com/a/1")];
        const labels = new Map([["-100123", "주식 급등일보"]]);

        const [item] = await new TelegramNewsSearchAdapter(fakeSource(out), labels).search("삼성전자", {
            channel: "-100123",
        });

        expect(item).toEqual({
            source: "telegram",
            channel: "주식 급등일보",
            at,
            text: "[속보] 삼성전자 신고가\nhttps://n.news.naver.com/a/1",
            url: "https://n.news.naver.com/a/1",
            ref: "-100123#42",
        });
    });

    it("표시명 없는 peer 는 peer 문자열을 그대로 channel 로", async () => {
        const out = [msg(1, new Date(), "본문")];
        const [item] = await new TelegramNewsSearchAdapter(fakeSource(out), new Map()).search("x", {
            channel: "@unknown",
        });
        expect(item.channel).toBe("@unknown");
        expect(item.url).toBeUndefined();
    });

    it("본문 빈 메시지(서비스/미디어-only)는 제외", async () => {
        const out = [msg(1, new Date(), ""), msg(2, new Date(), "유효")];
        const items = await new TelegramNewsSearchAdapter(fakeSource(out), new Map()).search("x", {
            channel: "@c",
        });
        expect(items).toHaveLength(1);
        expect(items[0].ref).toBe("@c#2");
    });

    it("URL-only 메시지는 링크 미리보기 제목/URL 을 본문으로 승격", async () => {
        const url = "https://n.news.naver.com/a/9";
        const out = [
            msg(7, new Date(), url, { title: "한화오션, 7%대 강세", url, siteName: "네이버뉴스" }),
        ];
        const [item] = await new TelegramNewsSearchAdapter(fakeSource(out), new Map()).search("한화오션", {
            channel: "@c",
        });
        expect(item.text).toBe("한화오션, 7%대 강세"); // URL 대신 미리보기 제목
        expect(item.url).toBe(url);
    });

    it("본문 텍스트가 있으면 미리보기 제목보다 본문 우선", async () => {
        const out = [
            msg(8, new Date(), "사람이 쓴 코멘트\nhttps://x.com/1", { title: "기사 제목", url: "https://x.com/1" }),
        ];
        const [item] = await new TelegramNewsSearchAdapter(fakeSource(out), new Map()).search("x", {
            channel: "@c",
        });
        expect(item.text).toBe("사람이 쓴 코멘트\nhttps://x.com/1");
        expect(item.url).toBe("https://x.com/1"); // 미리보기 URL 우선
    });

    it("질의 옵션(channel·since·until·limit)을 소스로 전달", async () => {
        let seen: { peer: string; query: string; opts?: TelegramSearchOptions } | undefined;
        const since = new Date("2026-06-01T00:00:00Z");
        await new TelegramNewsSearchAdapter(fakeSource([], (p) => (seen = p)), new Map()).search("키워드", {
            channel: "@c",
            since,
            limit: 10,
        });
        expect(seen?.peer).toBe("@c");
        expect(seen?.query).toBe("키워드");
        expect(seen?.opts).toEqual({ since, until: undefined, limit: 10 });
    });
});
