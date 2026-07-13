import { useId, useMemo, useState } from "react";
import { useLiveSnapshot, refreshLiveThemes } from "../api/live.js";
import { useWorkbench } from "../store/workbench.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";
import { BoardHeader, type BoardMode } from "../components/board/BoardModeControls.js";
import { FlatStockList } from "../components/board/FlatStockList.js";
import { buildLiveBoardViewModel } from "../lib/boardViewModel.js";

// 실시간 테마 보드(광역) — apps/live SSE 구독. 리스트(거래대금순)/테마(그룹) 토글, 흐리게=실시간 필터.
// 실시간 버스(liveFocus) 구독 — 복기와 독립. 테마 입력(우클릭 배정)은 StockRow 전역모달(→apps/api).
export function LiveBoardPanel(): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const code = useWorkbench((s) => s.liveFocus.code);
    const setCode = useWorkbench((s) => s.setLiveCode);
    const focusOrigin = useWorkbench((s) => s.liveOrigin);
    const liveFilter = useWorkbench((s) => s.liveFilter);
    const market = useWorkbench((s) => s.boardMarket.live);
    const setBoardMarket = useWorkbench((s) => s.setBoardMarket);
    const originId = useId();
    const [mode, setMode] = useState<BoardMode>("flat");
    const [refreshing, setRefreshing] = useState(false);

    const vm = useMemo(() => (snapshot ? buildLiveBoardViewModel(snapshot.stocks, liveFilter, market) : null), [snapshot, liveFilter, market]);

    // 시트 테마 즉시 반영 — apps/live 멤버십 재로드 요청. 성공하면 다음 SSE 틱에 분류·칩 갱신.
    const refresh = async (): Promise<void> => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await refreshLiveThemes();
        } finally {
            setRefreshing(false);
        }
    };

    if (!snapshot || !vm) return <BoardCenter text={error ? "연결 오류 — 재연결 중…" : "연결 중…"} />;

    const live = snapshot.status === "live";
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardHeader
                dotColor={live ? "var(--rise)" : "var(--text-tertiary)"}
                label={live ? "실시간" : snapshot.status}
                count={snapshot.hot}
                mode={mode}
                setMode={setMode}
                onRefresh={() => void refresh()}
                refreshing={refreshing}
                market={market}
                onMarketToggle={() => setBoardMarket("live", market === "un" ? "krx" : "un")}
            />
            {mode === "flat" ? (
                <FlatStockList stocks={vm.stocks} code={code} onPick={(c) => setCode(c, originId)} empty={live ? "조건 편입 종목 없음 (조건 미선택이면 설정>조건검색)" : "엔진 대기중 — 연결 확인"} />
            ) : (
                <BoardLayout grouped={vm.grouped} parents={vm.parents} focusCode={code} onPick={(c) => setCode(c, originId)} selfOrigin={originId} focusOrigin={focusOrigin} excludedByFilter={vm.excludedByFilter} absentLabel="스캔 밖" />
            )}
        </div>
    );
}
