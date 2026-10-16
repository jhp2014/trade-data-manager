// 평면 목록 — 테마로 묶지 않고 거래대금순 또는 등락률순 한 줄 목록. workbench components/board/FlatStockList.tsx.
import { useMemo } from "react";
import { StockRow } from "./StockRow.js";
import { Center } from "../ui/chrome.js";
import type { BoardStock, OnInspect } from "./boardTypes.js";

export type BoardSort = "amount" | "rate";

export function FlatStockList({ stocks, code, onPick, onInspect, sort }: {
    stocks: BoardStock[];
    code: string;
    onPick: (code: string) => void;
    onInspect?: OnInspect;
    sort: BoardSort;
}): JSX.Element {
    const rows = useMemo(
        () => [...stocks].sort((a, b) => (sort === "rate" ? b.changeRate - a.changeRate : b.amount - a.amount)),
        [stocks, sort],
    );
    if (rows.length === 0) return <Center>종목 없음</Center>;
    return (
        // 줄이 길고 많다 — 한 줄 건너 옅은 바탕(.stock-list-striped)으로 이름과 숫자를 눈으로 잇는다.
        <div className="stock-list-striped" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {rows.map((s, i) => (
                <StockRow key={s.code} s={s} rank={i + 1} selected={s.code === code} onPick={onPick} onInspect={onInspect} />
            ))}
        </div>
    );
}
