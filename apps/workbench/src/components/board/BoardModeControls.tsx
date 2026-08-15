import type { ReactNode } from "react";
import { isBoardFilterActive, type BoardFilterExpr } from "@trade-data-manager/market/domain";
import { useUi } from "../../store/ui.js";
import { useWorkbench } from "../../store/workbench.js";
import { TextToggle, Dot, Sep, ControlGroup, ControlBar, PanelHeader } from "../ControlChrome.js";
import { HeaderPopover } from "../HeaderPopover.js";

// 보드 헤더 컨트롤 — 차트 툴바와 같은 계열(ControlChrome 공용 조각).
// 거래대금·등락률 = flat 리스트의 정렬 기준, 테마 = 그룹 뷰. 셋은 상호배타(3택1).
export type BoardMode = "amount" | "rate" | "group";
export type BoardSort = Exclude<BoardMode, "group">; // flat 리스트 정렬 기준(= 테마 아닌 BoardMode)

export function BoardModeControls({ mode, setMode }: { mode: BoardMode; setMode: (m: BoardMode) => void }): JSX.Element {
    return (
        <ControlGroup gap={1}>
            <TextToggle active={mode === "amount"} onClick={() => setMode("amount")} title="거래대금 많은 순 리스트">거래대금</TextToggle>
            <Dot />
            <TextToggle active={mode === "rate"} onClick={() => setMode("rate")} title="등락률 높은 순 리스트">등락률</TextToggle>
            <Dot />
            <TextToggle active={mode === "group"} onClick={() => setMode("group")} title="테마 그룹">테마</TextToggle>
        </ControlGroup>
    );
}

// 보드 공용 헤더 — 작은 색 점(플레인·상태) + 종목수 + 우측 컨트롤 바. 컴팩트.
// 컨트롤은 정렬/뷰 │ 표시 │ 액션·시장 으로 묶고, 통째로 접힘(패널별 영속) + 폭 부족 시 가로 휠.
// label 은 값이 있을 때만 — 복기 스크럽 시각·비정상 상태처럼 점 색이 못 말해주는 것만 넘긴다(상수 라벨 금지).
// onRefresh 주면 새로고침(실시간 보드: 시트 테마 즉시 반영).
// market/onMarketToggle 주면 기준 시장(KRX/UN) 토글 — 보드별 독립(% 표시·weakHigh 술어 기준).
// filter/filterEditor 주면 배제 필터 버튼 — 팝오버로 에디터가 열린다(옛 독립 "… 필터" 패널의 대체).
// 버튼은 접히는 ControlBar 밖(좌측 상태 영역)에 둔다: 필터가 걸려 있다는 사실은 접힘과 무관하게 보여야
// "왜 종목이 안 보이지" 사고가 안 난다(활성 = 강조색 + 그룹 수).
export function BoardHeader({ panelId, dotColor, label, count, mode, setMode, onRefresh, refreshing, market, onMarketToggle, filter, filterEditor }: {
    panelId: string;
    dotColor: string;
    label?: string;
    count: number;
    mode: BoardMode;
    setMode: (m: BoardMode) => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    market?: "krx" | "un";
    onMarketToggle?: () => void;
    filter?: BoardFilterExpr;
    filterEditor?: (close: () => void) => ReactNode;
}): JSX.Element {
    const showReasons = useUi((s) => s.boardShowReasons);
    const toggleReasons = useUi((s) => s.toggleBoardReasons);
    const collapsed = useWorkbench((s) => s.panelControlsCollapsed[panelId]) ?? false;
    const toggleControls = useWorkbench((s) => s.togglePanelControls);
    const filterOn = filter ? isBoardFilterActive(filter) : false;
    return (
        <PanelHeader chrome={false} gap={6} padding="3px 10px"
            style={{ fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
            {label && <span style={{ color: dotColor, whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>}
            <span className="tabular" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{count}종목</span>
            {filter && filterEditor && (
                <HeaderPopover
                    width={400}
                    trigger={(open, toggle) => (
                        <TextToggle
                            active={filterOn || open}
                            activeColor="var(--accent-primary)"
                            onClick={toggle}
                            title={filterOn ? `배제 필터 ${filter.groups.length}개 적용중 (클릭: 편집)` : "배제 필터 (클릭: 편집)"}
                        >
                            필터{filterOn ? ` ${filter.groups.length}` : ""}
                        </TextToggle>
                    )}
                >
                    {filterEditor}
                </HeaderPopover>
            )}
            <ControlBar collapsed={collapsed} onToggle={() => toggleControls(panelId)}>
                {/* 정렬/뷰 — 상호배타 3택1. */}
                <BoardModeControls mode={mode} setMode={setMode} />
                <Sep />
                {/* 표시 — dim 종목에 무엇을 보여줄지. */}
                <ControlGroup>
                    <TextToggle
                        active={showReasons}
                        activeColor="var(--accent-primary)"
                        onClick={toggleReasons}
                        title={showReasons ? "필터 칩 켜짐 (제외 사유 표시, 클릭: 끄기)" : "필터 칩 꺼짐 (클릭: 켜기)"}
                    >
                        필터칩
                    </TextToggle>
                </ControlGroup>
                {(onRefresh || market) && <Sep />}
                {/* 액션 · 시장(UN/KRX 단일 토글). */}
                <ControlGroup>
                    {onRefresh && (
                        <TextToggle
                            active={refreshing === true}
                            activeColor="var(--accent-primary)"
                            disabled={refreshing}
                            onClick={onRefresh}
                            title="테마 새로고침 (시트 배정·수동편집 반영)"
                        >
                            새로고침
                        </TextToggle>
                    )}
                    {market && onMarketToggle && (
                        <TextToggle active activeColor="var(--accent-primary)" onClick={onMarketToggle} title={`기준 시장 전환 (현재 ${market.toUpperCase()} 전일종가 기준 %)`}>
                            <span style={{ display: "inline-block", minWidth: 26, textAlign: "center" }}>{market.toUpperCase()}</span>
                        </TextToggle>
                    )}
                </ControlGroup>
            </ControlBar>
        </PanelHeader>
    );
}
