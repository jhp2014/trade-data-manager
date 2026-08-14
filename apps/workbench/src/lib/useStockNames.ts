// 종목명 한 벌 — "이 코드의 이름이 뭐냐"를 묻는 모든 화면이 같은 자를 쓴다.
//
// 사전이 통째로 클라에 있으므로(StockNamesContext) 여기는 **그 사전을 보여주는 얇은 겹**이다.
// 옛 본문(피드에서 먼저 찾고 → 남은 코드를 400개씩 나눠 묻고 → 조각 응답을 합치기)과, 그 시절
// 호출부가 코드 목록을 모아 넘기던 인자는 전부 사라졌다 — 사전은 전량이라 물을 목록이 필요 없다.
import { useStockNamesDict, type StockNamesView } from "./StockNamesContext.js";

export type StockNames = Pick<StockNamesView, "nameOf" | "isLoading">;

export function useStockNames(): StockNames {
    return useStockNamesDict();
}
