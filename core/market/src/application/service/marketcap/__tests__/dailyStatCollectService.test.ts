import { describe, it, expect } from "vitest";
import type { DailyStockStat, DateRange, MissingStatFill } from "#domain";
import type { DailyScanRepository, DailyStockStatsProvider, DailyStockStatStore } from "#port/collect";
import { DailyStatCollectService } from "../dailyStatCollectService.js";

const stat = (stockCode: string, date: string): DailyStockStat => ({
    stockCode,
    date,
    marketCap: "1000",
    listShares: "10",
    sectTpNm: null,
});

/** listTradedDates 만 쓰는 서비스라 나머지는 안 부른다(부르면 테스트가 터지게 둔다). */
function scanRepo(dates: string[]): DailyScanRepository {
    const boom = () => {
        throw new Error("이 서비스는 이 메서드를 쓰지 않는다");
    };
    return {
        listTradedDates: () => Promise.resolve(dates),
        listDailyCandlesByDate: boom,
        getPreviousTradingDate: boom,
        getLatestDailyDate: boom,
        listTradedStockCodes: boom,
    };
}

function store(
    saved: DailyStockStat[],
    gaps: MissingStatFill = { inherited: 0, unresolved: 0 },
    ranges?: DateRange[],
): DailyStockStatStore {
    return {
        saveDailyStats: (rows) => {
            saved.push(...rows);
            return Promise.resolve();
        },
        fillMissingTradedDays: (range: DateRange) => {
            ranges?.push(range);
            return Promise.resolve(gaps);
        },
    };
}

const noGaps: MissingStatFill = { inherited: 0, unresolved: 0 };

describe("DailyStatCollectService", () => {
    const range: DateRange = { from: "2026-06-25", to: "2026-06-26" };

    it("거래일 목록으로 구동한다 — 달력이 아니라 일봉이 거래일을 정한다", async () => {
        const asked: string[] = [];
        const saved: DailyStockStat[] = [];
        const source: DailyStockStatsProvider = {
            getDailyStats: (date) => {
                asked.push(date);
                return Promise.resolve([stat("A", date)]);
            },
        };
        const svc = new DailyStatCollectService({
            source,
            scanRepo: scanRepo(["2026-06-25", "2026-06-26"]),
            repo: store(saved),
        });
        const r = await svc.collect(range);
        expect(asked.sort()).toEqual(["2026-06-25", "2026-06-26"]);
        expect(r).toEqual({ range, dates: 2, stored: 2, failed: [], gaps: noGaps });
        expect(saved).toHaveLength(2);
    });

    it("날짜 실패는 격리한다 — 하루가 죽어도 나머지는 저장된다", async () => {
        const saved: DailyStockStat[] = [];
        const source: DailyStockStatsProvider = {
            getDailyStats: (date) =>
                date === "2026-06-25"
                    ? Promise.reject(new Error("소스 장애"))
                    : Promise.resolve([stat("A", date)]),
        };
        const svc = new DailyStatCollectService({
            source,
            scanRepo: scanRepo(["2026-06-25", "2026-06-26"]),
            repo: store(saved),
        });
        const r = await svc.collect(range);
        expect(r.failed).toEqual(["2026-06-25"]);
        expect(r.stored).toBe(1);
        expect(saved.map((s) => s.date)).toEqual(["2026-06-26"]);
    });

    it("휴장일(빈 응답)은 실패가 아니다 — 0행 저장", async () => {
        const saved: DailyStockStat[] = [];
        const svc = new DailyStatCollectService({
            source: { getDailyStats: () => Promise.resolve([]) },
            scanRepo: scanRepo(["2026-06-25"]),
            repo: store(saved),
        });
        const r = await svc.collect(range);
        expect(r).toEqual({ range, dates: 1, stored: 0, failed: [], gaps: noGaps });
    });

    it("수집 뒤 누락분 후처리를 같은 범위로 한 번 부르고, 건수를 결과에 싣는다", async () => {
        const ranges: DateRange[] = [];
        const svc = new DailyStatCollectService({
            source: { getDailyStats: () => Promise.resolve([]) },
            scanRepo: scanRepo(["2026-06-25"]),
            repo: store([], { inherited: 3, unresolved: 2 }, ranges),
        });
        const r = await svc.collect(range);
        expect(ranges).toEqual([range]);
        expect(r.gaps).toEqual({ inherited: 3, unresolved: 2 });
    });

    it("거래일이 0건이어도 안전하다(승계는 여전히 돈다)", async () => {
        const svc = new DailyStatCollectService({
            source: { getDailyStats: () => Promise.reject(new Error("불려선 안 됨")) },
            scanRepo: scanRepo([]),
            repo: store([]),
        });
        const r = await svc.collect(range);
        expect(r).toEqual({ range, dates: 0, stored: 0, failed: [], gaps: noGaps });
    });
});
