// 종목명 한 벌 — "이 코드의 이름이 뭐냐"를 묻는 모든 화면이 같은 자를 쓴다.
//
// 이제 사전이 통째로 클라에 있으므로(StockNamesContext) 여기는 **그 사전을 보여주는 얇은 겹**이다.
// 옛 본문(피드에서 먼저 찾고 → 남은 코드를 400개씩 나눠 묻고 → 조각 응답을 합치기)은 전부 사라졌다.
// `codes` 인자를 남긴 건 호출부 호환 때문만이 아니다: 이름을 **언제 못 찾는지**를 이 훅이 계속 말할 수
// 있어야 해서다(isLoading). 인자 자체는 이제 조회에 안 쓴다.
import { useStockNamesDict, type StockNamesView } from "./StockNamesContext.js";

export type StockNames = Pick<StockNamesView, "nameOf" | "isLoading">;

/**
 * @param _codes 이름이 필요한 코드들 — **더는 조회에 쓰지 않는다**(사전이 이미 전량이다).
 *   호출부가 목록을 모으는 수고를 지금 당장 걷어내지 않으려고 인자를 남겼다.
 */
export function useStockNames(_codes?: readonly string[]): StockNames {
    return useStockNamesDict();
}
