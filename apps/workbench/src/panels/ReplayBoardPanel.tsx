import { useId, useMemo, useState } from "react";
import { useWorkbench } from "../store/workbench.js";
import { useDayReplay, useReplayIndex } from "../lib/leanModel.js";
import { kstToUnix } from "../lib/derive.js";
import { buildReplayBoardViewModel } from "../lib/boardViewModel.js";
import { useAnnotatedCodes } from "../lib/useAnnotatedCodes.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";
import { BoardHeader, type BoardMode } from "../components/board/BoardModeControls.js";
import { FlatStockList } from "../components/board/FlatStockList.js";

// 실시간 복기 보드(②) — 전역 시간(Focus.time) 시점의 장중 스냅샷을 market-eye식으로 재현.
// /day-replay 하나로 self-contained(per-minute + 메타). 시간 스크러버는 전역 툴바, top-N 설정은 전역 모달.
export function ReplayBoardPanel({ panelId }: { panelId: string }): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const time = useWorkbench((s) => s.focus.time);
    const setCode = useWorkbench((s) => s.setCode);
    const focusOrigin = useWorkbench((s) => s.lastFocusOrigin);
    const rs = useWorkbench((s) => s.replaySettings);
    const replayFilter = useWorkbench((s) => s.replayFilter);
    const market = useWorkbench((s) => s.boardMarket.replay);
    const setBoardMarket = useWorkbench((s) => s.setBoardMarket);
    const originId = useId(); // 이 보드의 선택 출처 태그(self/external 구분)
    const [mode, setMode] = useState<BoardMode>("group"); // 거래대금순/등락률순 리스트 · 테마(그룹)

    const boardQ = useDayReplay(date);
    const index = useReplayIndex(boardQ.data); // Map<code, ReplayStock> — per-minute + 메타

    const tUnix = kstToUnix(date, time ?? "15:30:00"); // 시간 미설정 시 장마감 근사
    const annotated = useAnnotatedCodes(date);

    const board = useMemo(
        () => (index ? buildReplayBoardViewModel(index, tUnix, rs, annotated, replayFilter, market) : null),
        [index, tUnix, rs, annotated, replayFilter, market],
    );

    if (boardQ.isLoading) return <BoardCenter text={`${date} 로딩중… (복기 데이터)`} />;
    if (boardQ.isError) return <BoardCenter text={`보드 오류: ${(boardQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            {/* label=스크럽 시각 — 시간 설정됐을 때만(미설정 시 상수 라벨 대신 생략, 컨트롤에 폭 양보). */}
            <BoardHeader panelId={panelId} dotColor="var(--plane-eod)" label={time ? time.slice(0, 5) : undefined} count={board.stocks.length} mode={mode} setMode={setMode} market={market} onMarketToggle={() => setBoardMarket("replay", market === "un" ? "krx" : "un")} />
            {mode === "group" ? (
                <BoardLayout key={date} grouped={board.grouped} parents={board.parents} focusCode={code} onPick={(c) => setCode(c, originId)} selfOrigin={originId} focusOrigin={focusOrigin} excludedByFilter={board.excludedByFilter} absentLabel="랭킹 밖" />
            ) : (
                <FlatStockList stocks={board.stocks} code={code} onPick={(c) => setCode(c, originId)} sort={mode} empty="종목 없음" />
            )}
        </div>
    );
}
