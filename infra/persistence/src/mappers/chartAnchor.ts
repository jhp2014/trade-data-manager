// 도메인 차트 앵커 ↔ DB 행 매퍼. 좌표+param 저장 — 값(가격)은 저장하지 않는다(소비 시점 캔들에서 읽음).
// NULL↔undefined 변환만. 저장 규칙(owner grain·field·market 쌍 등)은 도메인(anchorInputError) — 매퍼는 모양만 옮긴다.
import type { AnchorField, AnchorMarket, ChartAnchor, NewChartAnchor } from "@trade-data-manager/market";
import type { ChartAnchorRow, ChartAnchorInsert } from "../schema/curation.js";

export function chartAnchorToRow(a: NewChartAnchor): ChartAnchorInsert {
    return {
        stockCode: a.stockCode,
        tradeDate: a.date,
        tradeTime: a.time ?? null,
        param: a.param,
        anchorDate: a.anchorDate,
        anchorTime: a.anchorTime ?? null,
        field: a.field ?? null,
        market: a.market ?? null,
    };
}

export function rowToChartAnchor(r: ChartAnchorRow): ChartAnchor {
    return {
        id: r.id.toString(),
        stockCode: r.stockCode,
        date: r.tradeDate,
        time: r.tradeTime ?? undefined,
        param: r.param,
        anchorDate: r.anchorDate,
        anchorTime: r.anchorTime ?? undefined,
        field: (r.field as AnchorField | null) ?? undefined,
        market: (r.market as AnchorMarket | null) ?? undefined,
    };
}
