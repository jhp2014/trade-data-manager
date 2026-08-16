import { useMemo, type ReactNode } from "react";
import { isBoardFilterActive, type BoardFilterExpr } from "@trade-data-manager/market/domain";
import { useUi } from "../../store/ui.js";
import { TextToggle, PanelHeader } from "../ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../HeaderControls.js";
import { HeaderPopover } from "../HeaderPopover.js";

// 보드 헤더 — 컨트롤은 선언으로 내려갔다(HeaderControls). 보드 셋(실시간·복기·테마)이 같은 선언을 쓴다.
// 거래대금·등락률 = flat 리스트의 정렬 기준, 테마 = 그룹 뷰. 셋은 상호배타라 순환이다.
export type BoardMode = "amount" | "rate" | "group";
export type BoardSort = Exclude<BoardMode, "group">; // flat 리스트 정렬 기준(= 테마 아닌 BoardMode)

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
    const filterOn = filter ? isBoardFilterActive(filter) : false;

    // 컨트롤 선언 — 보드 셋(실시간·복기·테마)이 같은 문구를 쓴다. 있고 없고는 available 이 정한다
    // (새로고침·시장은 실시간 보드에만 있다) — 값에 따라 뜨고 지는 게 아니라 패널 정체성이다.
    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "mode", name: "정렬·뷰", help: "무엇을 기준으로 줄 세울까 · 테마는 그룹 뷰",
            values: [{ v: "amount", label: "거래대금" }, { v: "rate", label: "등락률" }, { v: "group", label: "테마" }],
            value: mode, set: (v) => setMode(v as BoardMode),
        },
        {
            kind: "toggle", id: "reasons", name: "필터칩", activeColor: "var(--accent-primary)",
            help: "가려진 종목에 제외 사유 칩을 붙인다", on: showReasons, set: toggleReasons,
        },
        {
            kind: "action", id: "refresh", name: "새로고침", available: !!onRefresh, disabled: refreshing,
            help: "테마 새로고침(시트 배정·수동편집 반영)", run: () => onRefresh?.(),
        },
        {
            kind: "choice", id: "market", name: "기준 시장", available: !!market && !!onMarketToggle,
            help: "% 의 분모가 되는 전일종가를 어느 시장에서 볼까",
            values: [{ v: "krx", label: "KRX" }, { v: "un", label: "UN" }],
            value: market ?? "krx", set: () => onMarketToggle?.(),
        },
    ], [mode, setMode, showReasons, toggleReasons, onRefresh, refreshing, market, onMarketToggle]);
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
            <HeaderControls controls={controls} storageKey={`wb.headerPins.board.${panelId}`} />
        </PanelHeader>
    );
}
