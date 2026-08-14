import { useStockNamesDict } from "./StockNamesContext.js";

/**
 * 종목명 하나. 모르면 null — 부르는 쪽이 대개 `name ?? code` 로 자기 표기를 고르기 때문에
 * 여기서 코드로 대체하지 않는다(사전의 nameOf 와 그 점만 다르다).
 */
export function useStockName(code: string): string | null {
    const { nameOf } = useStockNamesDict();
    if (!code) return null;
    const name = nameOf(code);
    return name === code ? null : name;
}
