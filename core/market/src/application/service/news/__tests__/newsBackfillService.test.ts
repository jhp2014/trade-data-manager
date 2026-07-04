import { describe, it, expect } from "vitest";
import { NewsBackfillService } from "../newsBackfillService.js";
import type { DateRange, NewsHeadline } from "#domain";
import type { NewsSource, StockNewsRepository } from "#port/outbound";

const hl = (srno: string, date: string, time: string, stockCodes: string[] = []): NewsHeadline => ({
    srno,
    date,
    time,
    title: `t${srno}`,
    sourceCode: "6",
    sourceName: "연합뉴스",
    categoryCode: "03",
    stockCodes,
});

const isBeforeOrEq = (h: NewsHeadline, a: { date: string; time: string }) =>
    h.date < a.date || (h.date === a.date && h.time <= a.time);

/** 교정된 어댑터 계약을 흉내: ≤anchor 항목을 내림차순으로 최대 pageSize 개. */
class FakeNewsSource implements NewsSource {
    calls = 0;
    constructor(
        private all: NewsHeadline[],
        private pageSize = 2,
    ) {
        this.all = [...all].sort((x, y) => (x.date === y.date ? y.time.localeCompare(x.time) : y.date.localeCompare(x.date)));
    }
    async fetchBefore(anchor?: { date: string; time: string }): Promise<NewsHeadline[]> {
        this.calls++;
        const pool = anchor ? this.all.filter((h) => isBeforeOrEq(h, anchor)) : this.all;
        return pool.slice(0, this.pageSize);
    }
}

class FakeRepo implements StockNewsRepository {
    saved = new Map<string, NewsHeadline>(); // srno → headline (upsert dedup)
    saveCalls = 0;
    rowsSeen = 0;
    async saveHeadlines(headlines: NewsHeadline[]): Promise<void> {
        this.saveCalls++;
        this.rowsSeen += headlines.length;
        for (const h of headlines) this.saved.set(h.srno, h);
    }
    async getHeadlines(): Promise<NewsHeadline[]> {
        return [];
    }
    async recentHeadlines(): Promise<NewsHeadline[]> {
        return [];
    }
}

describe("NewsBackfillService", () => {
    it("범위 내 전부 수집·dedup, from 미만 날짜는 저장 안 함(자정 크로스에서 종료)", async () => {
        const data = [
            hl("626d", "2026-06-26", "23:00:00"),
            hl("626c", "2026-06-26", "12:00:00"),
            hl("626b", "2026-06-26", "09:00:00"),
            hl("626a", "2026-06-26", "00:00:30"),
            hl("625z", "2026-06-25", "23:40:00"), // from 미만 → 제외
            hl("625y", "2026-06-25", "10:00:00"),
        ];
        const source = new FakeNewsSource(data, 2);
        const repo = new FakeRepo();
        const range: DateRange = { from: "2026-06-26", to: "2026-06-26" };
        const r = await new NewsBackfillService({ source, repo }).backfill(range);

        expect([...repo.saved.keys()].sort()).toEqual(["626a", "626b", "626c", "626d"]); // 0626 만, 0625 제외
        expect(r.headlines).toBeGreaterThanOrEqual(4);
        expect(r.range).toEqual(range);
    });

    it("페이지 겹침(앵커 항목 재등장)을 제거해 중복 저장하지 않는다", async () => {
        const data = [
            hl("d", "2026-06-26", "23:00:00"),
            hl("c", "2026-06-26", "22:00:00"),
            hl("b", "2026-06-26", "21:00:00"),
            hl("a", "2026-06-26", "20:00:00"),
        ];
        const repo = new FakeRepo();
        await new NewsBackfillService({ source: new FakeNewsSource(data, 2), repo }).backfill({
            from: "2026-06-26",
            to: "2026-06-26",
        });
        // 4건 모두, 정확히 한 번씩(겹침으로 인한 재저장은 upsert 로 흡수되지만 rowsSeen 도 4 근처여야).
        expect(repo.saved.size).toBe(4);
        expect(repo.rowsSeen).toBeLessThanOrEqual(5); // 겹침 슬라이스로 최소화(이상적 4, 경계 1 허용)
    });

    it("앵커 아래로 더 없는 소스(보관 경계)에도 forced-step 으로 유계 종료(무한루프 없음)", async () => {
        // ≤anchor 한 건만 있고 그 아래는 없음 → stall. forced-step 이 from 밑/연속한도까지 내려간 뒤 종료해야.
        const onlyOne: NewsSource = {
            async fetchBefore(anchor) {
                const it = hl("only", "2026-06-26", "12:00:00");
                const le = !anchor || it.date < anchor.date || (it.date === anchor.date && it.time <= anchor.time);
                return le ? [it] : [];
            },
        };
        const repo = new FakeRepo();
        const r = await new NewsBackfillService({ source: onlyOne, repo }).backfill({ from: "2026-06-26", to: "2026-06-26" });
        expect(r.pages).toBeLessThan(40); // forced 한도 내 유계 종료(루프 안 됨)
        expect(repo.saved.size).toBe(1);
    });

    it("wrap-stall 을 forced-step 으로 넘어 stall 아래 데이터까지 수집", async () => {
        // a(13:00) 와 b(11:00) 사이 (11:00,13:00] 앵커는 wrap 으로 빈 응답(b 를 못 줌) → stall.
        // forced-step 이 11:00 까지 내려가야 b 도달. 페이지=1 로 강제 페이지네이션.
        const data = [hl("a", "2026-06-26", "13:00:00"), hl("b", "2026-06-26", "11:00:00")];
        const withGap: NewsSource = {
            async fetchBefore(anchor) {
                const within = data.filter(
                    (h) => !anchor || h.date < anchor.date || (h.date === anchor.date && h.time <= anchor.time),
                );
                // wrap 갭: (11:00, 13:00] 앵커에선 ≤anchor 인 b 를 못 돌려줌(stall 재현).
                if (anchor && anchor.date === "2026-06-26" && anchor.time > "11:00:00" && anchor.time <= "13:00:00") {
                    return within.filter((h) => h.time > "13:00:00"); // 사실상 빈 응답
                }
                return within.slice(0, 1); // 페이지=1
            },
        };
        const repo = new FakeRepo();
        await new NewsBackfillService({ source: withGap, repo }).backfill({ from: "2026-06-26", to: "2026-06-26" });
        expect([...repo.saved.keys()].sort()).toEqual(["a", "b"]); // forced-step 으로 b(11:00) 까지 도달
    });
});
