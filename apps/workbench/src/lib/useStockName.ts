import { useQuery } from "@tanstack/react-query";
import { stockMetaQuery } from "../api/queries.js";

// 종목명(마스터 메타, 날짜무관·경량 조회). 차트·뉴스 패널이 큰 보드 응답 대신 이걸로 이름만 얻는다.
export function useStockName(code: string): string | null {
    return useQuery(stockMetaQuery(code)).data?.[0]?.name ?? null;
}
