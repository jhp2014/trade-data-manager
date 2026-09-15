import { useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { daySummaryQuery } from "../api/queries.js";
import { buildThemeBoardViewModel } from "../lib/boardViewModel.js";
import { useAnnotatedCodes } from "../lib/useAnnotatedCodes.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";
import { BoardHeader, type BoardMode } from "../components/board/BoardModeControls.js";
import { BoardFilterEditor } from "../components/board/BoardFilterEditor.js";
import { FlatStockList } from "../components/board/FlatStockList.js";
import { ROW_NAV_ORIGIN, usePublishRowNav } from "../lib/rowNav.js";
import type { BoardNav } from "../components/board/boardNav.js";

// 테마 보드(EOD) — day-summary 일봉 한 방. 상단은 NavRail 만(설정은 전역 모달, 시간/날짜는 전역 툴바).
// 설정(개별/미분류 표시·필터)은 store.themeBoardSettings 구독.
export function ThemeBoardPanel({ panelId }: { panelId: string }): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);
    const focusOrigin = useWorkbench((s) => s.lastFocusOrigin);
    const st = useWorkbench((s) => s.themeBoardSettings);
    const boardFilter = useWorkbench((s) => s.boardFilter);
    const market = useWorkbench((s) => s.boardMarket.theme);
    const setBoardMarket = useWorkbench((s) => s.setBoardMarket);
    const originId = useId(); // 이 보드의 선택 출처 태그(self/external 구분)
    // w/s 순회 — publish 는 **여기(패널 최상단)** 에서. 아래 로딩·오류 조기 반환이 후보 자격을 깜빡이면
    // 그 창의 w/s 가 다른 패널로 새어 전역 Focus 를 끌고 간다(boardNav 머리 주석).
    // 출처는 ROW_NAV_ORIGIN(바깥) — 도착한 종목의 카드가 승격·스크롤되게.
    const navRef = usePublishRowNav("theme-board");
    const nav = useMemo<BoardNav>(() => ({ navRef, pick: (c: string) => setCode(c, ROW_NAV_ORIGIN) }), [navRef, setCode]);
    const [mode, setMode] = usePanelUi<BoardMode>(panelId, "mode", "group"); // 거래대금순/등락률순 리스트 · 테마(그룹). 패널별 영속.

    const summaryQ = useQuery(daySummaryQuery(date));
    const annotated = useAnnotatedCodes(date);
    const board = useMemo(() => (summaryQ.data ? buildThemeBoardViewModel(summaryQ.data, annotated, boardFilter, market) : null), [summaryQ.data, annotated, boardFilter, market]);

    // ⚠ 잣대는 "board 가 있나"가 아니라 **본문을 그리나**다 — 재조회 실패는 캐시 data 를 남긴 채 isError 만
    //    세우므로(board non-null) 그걸로 재면 오류 화면인데 옛 본문 클로저로 걷는다.
    const bodyShown = !!board && !summaryQ.isLoading && !summaryQ.isError;
    if (!bodyShown) navRef.current = () => {};
    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardHeader navOwner="theme-board" panelId={panelId} dotColor="var(--plane-eod)" count={board.stocks.length} mode={mode} setMode={setMode} market={market} onMarketToggle={() => setBoardMarket("theme", market === "un" ? "krx" : "un")} filter={boardFilter} filterEditor={(close) => <BoardFilterEditor onClose={close} />} />
            {mode === "group" ? (
                <BoardLayout key={date} grouped={board.grouped} parents={board.parents} focusCode={code} onPick={(c) => setCode(c, originId)} selfOrigin={originId} focusOrigin={focusOrigin} excludedByFilter={board.excludedByFilter} nav={nav} absentLabel="보드 밖" showIndividuals={st.showIndividuals} showUnclassified={st.showUnclassified} />
            ) : (
                <FlatStockList stocks={board.stocks} code={code} onPick={(c) => setCode(c, originId)} nav={nav} sort={mode} empty="종목 없음" />
            )}
        </div>
    );
}
