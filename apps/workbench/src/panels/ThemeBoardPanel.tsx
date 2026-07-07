import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { daySummaryQuery } from "../api/queries.js";
import { buildThemeBoardViewModel } from "../lib/boardViewModel.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";

// 이슈정리 보드(EOD) — day-summary 일봉 한 방. 상단은 NavRail 만(설정은 전역 모달, 시간/날짜는 전역 툴바).
// 설정(개별/미분류 표시·필터)은 store.issueSettings 구독.
export function ThemeBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);
    const st = useWorkbench((s) => s.issueSettings);

    const summaryQ = useQuery(daySummaryQuery(date));
    const board = useMemo(() => (summaryQ.data ? buildThemeBoardViewModel(summaryQ.data, st) : null), [summaryQ.data, st]);

    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardLayout key={date} grouped={board.grouped} parents={board.parents} focusCode={code} onPick={setCode} showIndividuals={st.showIndividuals} showUnclassified={st.showUnclassified} />
        </div>
    );
}
