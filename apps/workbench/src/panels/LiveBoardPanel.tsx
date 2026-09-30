import { useId, useMemo, useState } from "react";
import { refreshLiveThemes } from "../api/live.js";
import { useLiveSnapshot } from "../lib/LiveSnapshotContext.js";
import { useWorkbench } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";
import { useBoardHeader, type BoardMode } from "../components/board/BoardModeControls.js";
import { LiveFilterEditor } from "../components/board/BoardFilterEditor.js";
import { FlatStockList } from "../components/board/FlatStockList.js";
import { buildLiveBoardViewModel } from "../lib/boardViewModel.js";

// 실시간 테마 보드(광역) — apps/live SSE 구독. 리스트(거래대금순)/테마(그룹) 토글, 흐리게=실시간 필터.
// 실시간 버스(liveFocus) 구독 — 복기와 독립. 테마 입력(우클릭 배정)은 StockRow 전역모달(→apps/api).
export function LiveBoardPanel({ panelId }: { panelId: string }): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const code = useWorkbench((s) => s.liveFocus.code);
    const setCode = useWorkbench((s) => s.setLiveCode);
    const focusOrigin = useWorkbench((s) => s.liveOrigin);
    const liveFilter = useWorkbench((s) => s.liveFilter);
    const market = useWorkbench((s) => s.boardMarket.live);
    const setBoardMarket = useWorkbench((s) => s.setBoardMarket);
    const originId = useId();
    const [mode, setMode] = usePanelUi<BoardMode>(panelId, "mode", "amount"); // 거래대금순/등락률순 리스트 · 테마(그룹). 패널별 영속.
    const [refreshing, setRefreshing] = useState(false);

    const vm = useMemo(() => (snapshot ? buildLiveBoardViewModel(snapshot.stocks, liveFilter, market) : null), [snapshot, liveFilter, market]);

    // 시트 테마 즉시 반영 — apps/live 멤버십 재로드 요청. 성공하면 다음 SSE 틱에 분류·칩 갱신.
    const refresh = async (): Promise<void> => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await refreshLiveThemes();
        } catch {
            // 연결 불가 — 표시는 보드 상태(점·라벨)가 이미 말한다. 헤더가 조기 반환 위로 올라가
            // 연결 전에도 새로고침이 눌리므로, 던지게 두면 unhandled rejection 이 된다.
        } finally {
            setRefreshing(false);
        }
    };

    // 헤더 선언 — **조기 반환보다 위**(등록이 깜빡이면 첫 줄이 생멸한다 — useBoardHeader 머리 주석).
    const live = snapshot?.status === "live";
    useBoardHeader({
        panelId,
        dotColor: live ? "var(--rise)" : "var(--text-tertiary)",
        label: !snapshot || live ? undefined : snapshot.status, // 정상(실시간)은 빨간 점이 말해줌 — 비정상 상태만 텍스트로
        count: snapshot && vm ? snapshot.hot : null, // 연결 전엔 자리 비움 — "0종목" 단정 금지

        mode,
        setMode,
        onRefresh: () => void refresh(),
        refreshing,
        market,
        onMarketToggle: () => setBoardMarket("live", market === "un" ? "krx" : "un"),
        filter: liveFilter,
        filterEditor: (close) => <LiveFilterEditor onClose={close} />,
    });

    if (!snapshot || !vm) return <BoardCenter text={error ? "연결 오류 — 재연결 중…" : "연결 중…"} />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            {mode === "group" ? (
                <BoardLayout grouped={vm.grouped} parents={vm.parents} focusCode={code} onPick={(c) => setCode(c, originId)} selfOrigin={originId} focusOrigin={focusOrigin} excludedByFilter={vm.excludedByFilter} absentLabel="스캔 밖" />
            ) : (
                <FlatStockList stocks={vm.stocks} code={code} onPick={(c) => setCode(c, originId)} sort={mode} empty={live ? "조건 편입 종목 없음 (조건 미선택이면 설정>조건검색)" : "엔진 대기중 — 연결 확인"} />
            )}
        </div>
    );
}
