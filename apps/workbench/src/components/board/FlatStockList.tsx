import { useMemo, useRef } from "react";
import { StockRow } from "./StockRow.js";
import { BoardCenter, type BoardStock } from "./BoardCard.js";
import type { BoardSort } from "./BoardModeControls.js";
import { stepInList } from "./boardNavOrder.js";
import type { BoardNav } from "./boardNav.js";

// flat 리스트 — sort 기준 내림차순 StockRow. 실시간 테마·테마[장 마감]·[복기] 보드 공용(테마 그룹 대신 flat 뷰).
// nav 를 주면 w/s 순회의 후보가 된다 — 걷는 순서는 **화면에 보이는 그 순서**(정렬 기준 그대로).
export function FlatStockList({ stocks, code, onPick, sort, empty = "종목 없음", nav }: {
    stocks: BoardStock[];
    code: string;
    onPick: (code: string) => void;
    sort: BoardSort;
    empty?: string;
    nav?: BoardNav;
}): JSX.Element {
    const rows = useMemo(
        () => [...stocks].sort((a, b) => (sort === "rate" ? b.changeRate - a.changeRate : b.amount - a.amount)),
        [stocks, sort],
    );
    // w/s 순회 — 목록 순서 그대로 걷고, 도착한 행을 화면 안으로 끌어온다(그룹 뷰의 카드 승격에 해당하는 일).
    const rowEls = useRef(new Map<string, HTMLElement>());
    if (nav) {
        nav.navRef.current = (dir): void => {
            const next = stepInList(rows.map((s) => s.code), code || null, dir);
            if (!next) return;
            nav.pick(next);
            rowEls.current.get(next)?.scrollIntoView({ block: "nearest" });
        };
    }
    if (rows.length === 0) return <BoardCenter text={empty} />;
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {rows.map((s, i) => (
                <div key={s.code} ref={(el) => { if (el) rowEls.current.set(s.code, el); else rowEls.current.delete(s.code); }}>
                    <StockRow s={s} rank={i + 1} selected={s.code === code} onPick={onPick} />
                </div>
            ))}
        </div>
    );
}
