import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { ChartAnchor, ChartAnchorReader, ChartAnchorStore, NewChartAnchor, ReviewPointStore } from "@trade-data-manager/market";
import { ChartAnchors } from "../curation/chartAnchors.js";

const CHART = { stockCode: "005930", date: "2026-07-02" };

/** 인메모리 저장소 — 컨트롤러의 검증·라우팅만 본다(멱등·정렬은 저장소 테스트 담당). */
function memoryRepo(): ChartAnchorReader & ChartAnchorStore & { rows: ChartAnchor[] } {
    let seq = 0;
    const rows: ChartAnchor[] = [];
    return {
        rows,
        add(anchors: NewChartAnchor[]) {
            const created = anchors.map((a) => ({ ...a, id: String(++seq) }));
            rows.push(...created);
            return Promise.resolve(created);
        },
        listByChart: (stockCode, date) => Promise.resolve(rows.filter((r) => r.stockCode === stockCode && r.date === date)),
        listAll: () => Promise.resolve(rows),
        // 자연키 삭제 — 좌표 8필드가 전부 같은 행 하나. NULL 과 undefined 를 같게 보려고 ?? null 로 맞춘다.
        remove: (a) => {
            const same = (x?: string | null, y?: string | null): boolean => (x ?? null) === (y ?? null);
            const i = rows.findIndex(
                (r) =>
                    r.stockCode === a.stockCode && r.date === a.date && same(r.time, a.time) && r.param === a.param &&
                    r.anchorDate === a.anchorDate && same(r.anchorTime, a.anchorTime) && same(r.field, a.field) && same(r.market, a.market),
            );
            if (i >= 0) rows.splice(i, 1);
            return Promise.resolve();
        },
        removeByParam: (stockCode, date, param) => {
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].stockCode === stockCode && rows[i].date === date && rows[i].param === param) rows.splice(i, 1);
            return Promise.resolve();
        },
        removeByPoint: (stockCode, date, time) => {
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].stockCode === stockCode && rows[i].date === date && rows[i].time === time) rows.splice(i, 1);
            return Promise.resolve();
        },
    };
}

const pointStore = (removed: string[]): ReviewPointStore => ({
    upsert: () => Promise.resolve(),
    remove: (c, d, t) => { removed.push(`${c}|${d}|${t}`); return Promise.resolve(); },
});

describe("ChartAnchors 유스케이스 — 행 단위 규칙", () => {
    let repo: ReturnType<typeof memoryRepo>;
    let c: ChartAnchors;

    beforeEach(() => {
        repo = memoryRepo();
        c = new ChartAnchors(repo, pointStore([]));
    });

    it("레지스트리에 없는 param 은 거부 — 은퇴한 골격 param 포함", async () => {
        await expect(c.add({ ...CHART, param: "skeleton", anchorDate: "2026-06-24", field: "high", market: "un" }))
            .rejects.toThrow(BadRequestException);
        await expect(c.add({ ...CHART, param: "skeleton-minute", anchorDate: CHART.date, anchorTime: "09:40:00", field: "high", market: "un" }))
            .rejects.toThrow(/레지스트리 키만/);
        expect(repo.rows).toHaveLength(0);
    });

    it("기준선은 다중 — 당일 캔들에도 그을 수 있다", async () => {
        await c.add({ ...CHART, param: "baseline", anchorDate: CHART.date, field: "high", market: "un" });
        await c.add({ ...CHART, param: "baseline", anchorDate: "2026-06-24", field: "low", market: "krx" });
        expect(repo.rows).toHaveLength(2);
    });

    it("기준선의 분봉 앵커에 krx 는 거부 — 분봉 앵커는 'un' 고정", async () => {
        await expect(c.add({ ...CHART, param: "baseline", anchorDate: "2026-06-24", anchorTime: "09:30:00", field: "high", market: "krx" }))
            .rejects.toThrow(/market 은 'un'/);
    });

    it("차트 소유 param 에 타점 시각을 실으면 거부(owner 게이트)", async () => {
        await expect(c.add({ ...CHART, time: "09:30:00", param: "baseline", anchorDate: "2026-06-24", field: "high", market: "un" }))
            .rejects.toThrow(/차트 소유/);
    });

    it("무시 캔들은 시각 앵커 — field·market 을 실으면 거부, 분봉 좌표도 거부(candles: daily)", async () => {
        await c.add({ ...CHART, param: "ignore-candle", anchorDate: "2026-06-24" });
        await expect(c.add({ ...CHART, param: "ignore-candle", anchorDate: "2026-06-25", field: "high", market: "un" }))
            .rejects.toThrow(/시각 앵커/);
        await expect(c.add({ ...CHART, param: "ignore-candle", anchorDate: CHART.date, anchorTime: "09:30:00" }))
            .rejects.toThrow(/일봉 캔들에만/);
        expect(repo.rows).toHaveLength(1);
    });
});

// 규칙 ④ — 타점 삭제 cascade 의 소유가 유스케이스로 온 이유: 컨트롤러에 살면 repo 직접 호출 경로가 우회한다.
describe("ChartAnchors 유스케이스 — 타점 삭제 cascade", () => {
    it("소유 앵커를 **먼저** 지운다 — 사이에서 죽어도 고아(주인 없는 앵커)가 안 남는 순서", async () => {
        const repo = memoryRepo();
        const calls: string[] = [];
        const origRemoveByPoint = repo.removeByPoint.bind(repo);
        repo.removeByPoint = (c, d, t) => { calls.push("anchors"); return origRemoveByPoint(c, d, t); };
        const removed: string[] = [];
        const points = pointStore(removed);
        const orig = points.remove.bind(points);
        points.remove = (c, d, t) => { calls.push("point"); return orig(c, d, t); };

        const uc = new ChartAnchors(repo, points);
        // 타점 소유 앵커는 현재 레지스트리에 없다 — cascade 기계 자체는 남아 있어야 하므로
        // (미래의 point 소유 param·마이그레이션 전 잔재) repo 에 직접 심어 검증한다.
        await repo.add([{ ...CHART, time: "10:00:00", param: "legacy-point-owned", anchorDate: CHART.date, anchorTime: "09:40:00", field: "high", market: "un" }]);
        await uc.removePoint(CHART.stockCode, CHART.date, "10:00:00");

        expect(calls).toEqual(["anchors", "point"]); // 앵커 먼저 — 최악의 잔재가 "앵커 없는 타점"이 되게
        expect(repo.rows.filter((r) => r.time === "10:00:00")).toHaveLength(0);
        expect(removed).toEqual([`${CHART.stockCode}|${CHART.date}|10:00:00`]);
    });
});
