import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { ChartAnchor, ChartAnchorReader, ChartAnchorStore, NewChartAnchor } from "@trade-data-manager/market";
import { ChartAnchorController } from "../curation/chartAnchor.controller.js";
import type { MasterCache } from "../board/masterCache.js";

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
        listAnchoredCharts: () => Promise.resolve([]),
        removeById: (id) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); return Promise.resolve(); },
        removeByParam: (stockCode, date, param) => {
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].stockCode === stockCode && rows[i].date === date && rows[i].param === param) rows.splice(i, 1);
            return Promise.resolve();
        },
    };
}

const master = { attachNames: (r: unknown[]) => Promise.resolve(r as never) } as unknown as MasterCache;

describe("ChartAnchorController — 골격 집합 규칙", () => {
    let repo: ReturnType<typeof memoryRepo>;
    let c: ChartAnchorController;
    const pivot = (anchorDate: string, over: Partial<NewChartAnchor> = {}): NewChartAnchor =>
        ({ ...CHART, param: "skeleton", anchorDate, field: "high", market: "un", ...over });

    beforeEach(() => {
        repo = memoryRepo();
        c = new ChartAnchorController(repo, master);
    });

    it("피벗을 쌓는다 — 골격은 다중 param(교체가 아니라 누적)", async () => {
        await c.add(pivot("2026-06-22", { field: "open" }));
        await c.add(pivot("2026-06-24"));
        expect(repo.rows).toHaveLength(2);
    });

    it("차트 날짜 이후·당일 캔들은 거부 — 타점 이후 정보 차단", async () => {
        await expect(c.add(pivot(CHART.date))).rejects.toThrow(BadRequestException);
        await expect(c.add(pivot("2026-07-03"))).rejects.toThrow(/차트 날짜 이전/);
        expect(repo.rows).toHaveLength(0);
    });

    it("같은 캔들 高+低 는 거부 — 순서를 파생할 수 없게 된다", async () => {
        await c.add(pivot("2026-06-24"));
        await expect(c.add(pivot("2026-06-24", { field: "low" }))).rejects.toThrow(/선후를 알 수 없/);
        // 시·종은 순서가 정해지므로 허용.
        await c.add(pivot("2026-06-24", { field: "close" }));
        expect(repo.rows).toHaveLength(2);
    });

    it("한 골격에 일봉·분봉 혼합 거부", async () => {
        await c.add(pivot("2026-06-24"));
        await expect(c.add(pivot("2026-06-25", { anchorTime: "09:30:00" }))).rejects.toThrow(/섞을 수 없/);
    });

    it("다른 param(기준선)은 집합 규칙을 안 탄다 — 당일 캔들에도 그을 수 있다", async () => {
        await c.add({ ...CHART, param: "baseline", anchorDate: CHART.date, field: "high", market: "un" });
        expect(repo.rows).toHaveLength(1);
    });

    it("행 단위 규칙도 그대로 — 분봉 피벗의 krx 는 거부", async () => {
        await expect(c.add(pivot("2026-06-24", { anchorTime: "09:30:00", market: "krx" }))).rejects.toThrow(/market 은 'un'/);
    });

    it("골격은 차트 소유 — 타점 시각을 실으면 거부", async () => {
        await expect(c.add(pivot("2026-06-24", { time: "09:30:00" }))).rejects.toThrow(/차트 소유/);
    });
});
