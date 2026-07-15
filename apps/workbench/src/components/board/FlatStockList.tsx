import { useMemo } from "react";
import { StockRow } from "./StockRow.js";
import { BoardCenter, type BoardStock } from "./BoardCard.js";
import type { BoardSort } from "./BoardModeControls.js";

// flat 리스트 — sort 기준 내림차순 StockRow. 실시간 테마·테마[장 마감]·[복기] 보드 공용(테마 그룹 대신 flat 뷰).
export function FlatStockList({ stocks, code, onPick, sort, empty = "종목 없음" }: {
    stocks: BoardStock[];
    code: string;
    onPick: (code: string) => void;
    sort: BoardSort;
    empty?: string;
}): JSX.Element {
    const rows = useMemo(
        () => [...stocks].sort((a, b) => (sort === "rate" ? b.changeRate - a.changeRate : b.amount - a.amount)),
        [stocks, sort],
    );
    if (rows.length === 0) return <BoardCenter text={empty} />;
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {rows.map((s, i) => (
                <StockRow key={s.code} s={s} rank={i + 1} selected={s.code === code} onPick={onPick} />
            ))}
        </div>
    );
}
