// 도메인 타점 앵커 ↔ DB 행 매퍼. 좌표+param 저장 — 값(가격)은 저장하지 않는다(소비 시점 캔들에서 읽음).
// NULL↔undefined 변환만. field·market 쌍 검증은 도메인(isValidAnchorShape) — 매퍼는 모양만 옮긴다.
import type { AnchorMarket, PointAnchor, PriceLineField } from "@trade-data-manager/market";
import type { PointAnchorRow, PointAnchorInsert } from "../schema/curation.js";

export function pointAnchorToRow(a: PointAnchor): PointAnchorInsert {
    return {
        stockCode: a.stockCode,
        tradeDate: a.date,
        tradeTime: a.time,
        param: a.param,
        anchorDate: a.anchorDate,
        anchorTime: a.anchorTime ?? null,
        field: a.field ?? null,
        market: a.market ?? null,
    };
}

export function rowToPointAnchor(r: PointAnchorRow): PointAnchor {
    return {
        stockCode: r.stockCode,
        date: r.tradeDate,
        time: r.tradeTime,
        param: r.param,
        anchorDate: r.anchorDate,
        anchorTime: r.anchorTime ?? undefined,
        field: (r.field as PriceLineField | null) ?? undefined,
        market: (r.market as AnchorMarket | null) ?? undefined,
    };
}
