import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnchoredChart, ChartAnchor, ChartAnchorReader, ChartAnchorStore, NewChartAnchor } from "@trade-data-manager/market";
import { BASELINE_PARAM } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { chartAnchors } from "../schema/curation.js";
import { chartAnchorToRow, rowToChartAnchor } from "../mappers/chartAnchor.js";

/** Drizzle 구현 — surrogate id PK. 좌표 저장(값 아님) → in-place 수정 없음(add/list/remove 만). */
export class DrizzleChartAnchorRepository implements ChartAnchorReader, ChartAnchorStore {
    constructor(private readonly db: Database) {}

    async add(anchors: NewChartAnchor[]): Promise<ChartAnchor[]> {
        if (anchors.length === 0) return [];
        // 멱등 중복 방어 — 같은 (차트, param, 좌표, field, market) 행이 있으면 그 행을 돌려준다.
        // 한 건씩 조회→삽입: 사람 편집(클릭) 규모라 배치 최적화보다 규칙이 한눈에 보이는 게 낫다.
        // 이건 왕복을 아끼는 앞단일 뿐이고, 원자적 방어는 DB 유니크(uq_chart_anchor_identity)가 한다 —
        // 쓰는 프로세스가 둘이면 "조회 후 삽입"은 둘 다 못 찾고 둘 다 넣는다.
        const out: ChartAnchor[] = [];
        for (const a of anchors) {
            const existing = await this.db
                .select()
                .from(chartAnchors)
                .where(and(...this.identityConds(a)))
                .limit(1);
            if (existing.length > 0) {
                out.push(rowToChartAnchor(existing[0]));
                continue;
            }
            const [row] = await this.db.insert(chartAnchors).values(chartAnchorToRow(a)).returning();
            out.push(rowToChartAnchor(row));
        }
        return out;
    }

    async listByChart(stockCode: string, date: string): Promise<ChartAnchor[]> {
        const rows = await this.db
            .select()
            .from(chartAnchors)
            .where(and(eq(chartAnchors.stockCode, stockCode), eq(chartAnchors.tradeDate, date)))
            .orderBy(asc(chartAnchors.id));
        return rows.map(rowToChartAnchor);
    }

    async listAll(): Promise<ChartAnchor[]> {
        const rows = await this.db.select().from(chartAnchors);
        return rows.map(rowToChartAnchor);
    }

    async listAnchoredCharts(): Promise<Omit<AnchoredChart, "name">[]> {
        // 기준선(=선)이 있는 (종목,날짜)로 집계 — 선 개수. 종목명은 app 레이어가 market.stock_master 로
        // 붙인다(물리 분리라 조인 불가). 날짜 내림차순, 같은 날 종목코드 오름차순.
        const rows = await this.db
            .select({
                stockCode: chartAnchors.stockCode,
                date: chartAnchors.tradeDate,
                count: sql<number>`count(*)::int`,
            })
            .from(chartAnchors)
            .where(eq(chartAnchors.param, BASELINE_PARAM))
            .groupBy(chartAnchors.stockCode, chartAnchors.tradeDate)
            .orderBy(desc(chartAnchors.tradeDate), asc(chartAnchors.stockCode));
        return rows.map((r) => ({ stockCode: r.stockCode, date: r.date, count: Number(r.count) }));
    }

    async remove(anchor: NewChartAnchor): Promise<void> {
        // add 의 멱등 판정과 **같은 술어** — 넣을 때 "이미 있다"고 본 행이 지울 때 지목되는 행이다.
        await this.db.delete(chartAnchors).where(and(...this.identityConds(anchor)));
    }

    async removeByParam(stockCode: string, date: string, param: string): Promise<void> {
        await this.db
            .delete(chartAnchors)
            .where(and(eq(chartAnchors.stockCode, stockCode), eq(chartAnchors.tradeDate, date), eq(chartAnchors.param, param)));
    }

    async removeByPoint(stockCode: string, date: string, time: string): Promise<void> {
        // trade_time 이 그 시각인 행만 — NULL(차트 소유)은 eq 가 걸러내므로 선·무시 캔들은 안전하다.
        await this.db
            .delete(chartAnchors)
            .where(and(eq(chartAnchors.stockCode, stockCode), eq(chartAnchors.tradeDate, date), eq(chartAnchors.tradeTime, time)));
    }

    /** 멱등 판정 술어 — NULL 컬럼(time·anchorTime·field·market)은 eq(null)이 항상 거짓이라 isNull 로 갈라 댄다. */
    private identityConds(a: NewChartAnchor): SQL[] {
        return [
            eq(chartAnchors.stockCode, a.stockCode),
            eq(chartAnchors.tradeDate, a.date),
            a.time == null ? isNull(chartAnchors.tradeTime) : eq(chartAnchors.tradeTime, a.time),
            eq(chartAnchors.param, a.param),
            eq(chartAnchors.anchorDate, a.anchorDate),
            a.anchorTime == null ? isNull(chartAnchors.anchorTime) : eq(chartAnchors.anchorTime, a.anchorTime),
            a.field == null ? isNull(chartAnchors.field) : eq(chartAnchors.field, a.field),
            a.market == null ? isNull(chartAnchors.market) : eq(chartAnchors.market, a.market),
        ];
    }
}
