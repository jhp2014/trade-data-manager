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

// id 는 옮기지 않는다 — 좌표가 정체성이라 계약에 id 가 없다(도메인 ChartAnchor 주석 참조).
// 저장소 안에서는 그대로 살아 있다(PK·그린 순서 정렬 기준).
export function rowToChartAnchor(r: ChartAnchorRow): ChartAnchor {
    return {
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
