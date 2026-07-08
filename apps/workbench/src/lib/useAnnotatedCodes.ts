// 주어진 날짜에 복기 타점 또는 가격선 주석이 있는 종목코드 집합 — 이슈/복기 보드에서 "주석 있는 종목" 좌측 바 표시용.
// 작업셋이 이미 쓰는 두 쿼리(priceLinedStocks·allPoints, 캐시됨)를 재사용 → 백엔드 0. 그 보드 날짜의 주석만.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { priceLinedStocksQuery, allPointsQuery } from "../api/queries.js";

export function useAnnotatedCodes(date: string): Set<string> {
    const linesQ = useQuery(priceLinedStocksQuery());
    const pointsQ = useQuery(allPointsQuery());
    return useMemo(() => {
        const set = new Set<string>();
        for (const s of linesQ.data ?? []) if (s.date === date) set.add(s.stockCode);
        for (const p of pointsQ.data ?? []) if (p.date === date) set.add(p.stockCode);
        return set;
    }, [linesQ.data, pointsQ.data, date]);
}
