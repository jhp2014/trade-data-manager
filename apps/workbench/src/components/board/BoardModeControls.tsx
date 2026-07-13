import { useUi } from "../../store/ui.js";
import { RefreshIcon } from "./boardIcons.js";

// 보드 헤더 컨트롤 — 가벼운 텍스트 세그먼트(테두리·채움 없음). 리스트/테마 고정 2버튼 + 필터칩 토글.
export type BoardMode = "flat" | "group";

function txtBtn(active: boolean, activeColor = "var(--text-primary)"): React.CSSProperties {
    return {
        border: "none",
        background: "none",
        padding: "0 3px",
        cursor: "pointer",
        font: "inherit",
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        color: active ? activeColor : "var(--text-tertiary)",
    };
}

export function BoardModeControls({ mode, setMode }: { mode: BoardMode; setMode: (m: BoardMode) => void }): JSX.Element {
    const showReasons = useUi((s) => s.boardShowReasons);
    const toggleReasons = useUi((s) => s.toggleBoardReasons);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 1 }}>
                <button style={txtBtn(mode === "flat")} onClick={() => setMode("flat")} title="거래대금순 리스트">리스트</button>
                <span style={{ color: "var(--border-default)" }}>·</span>
                <button style={txtBtn(mode === "group")} onClick={() => setMode("group")} title="테마 그룹">테마</button>
            </span>
            <button
                style={txtBtn(showReasons, "var(--accent-primary)")}
                onClick={toggleReasons}
                title={showReasons ? "필터 칩 켜짐 (제외 사유 표시, 클릭: 끄기)" : "필터 칩 꺼짐 (클릭: 켜기)"}
            >
                필터칩
            </button>
        </div>
    );
}

// 보드 공용 헤더 — 작은 색 점 + 라벨(상태/시간/장마감) + 종목수 + 우측 컨트롤. 컴팩트.
// onRefresh 주면 모드 토글 왼쪽에 새로고침 버튼(실시간 보드: 시트 테마 즉시 반영).
// market/onMarketToggle 주면 기준 시장(KRX/UN) 토글 — 보드별 독립(% 표시·weakHigh 술어 기준).
export function BoardHeader({ dotColor, label, count, mode, setMode, onRefresh, refreshing, market, onMarketToggle }: {
    dotColor: string;
    label: string;
    count: number;
    mode: BoardMode;
    setMode: (m: BoardMode) => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    market?: "krx" | "un";
    onMarketToggle?: () => void;
}): JSX.Element {
    return (
        <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
            <span style={{ color: dotColor }}>{label}</span>
            <span className="tabular">{count}종목</span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {market && onMarketToggle && (
                    <button style={{ ...txtBtn(true, "var(--accent-primary)"), minWidth: 26, textAlign: "center" }} onClick={onMarketToggle} title={`기준 시장 전환 (현재 ${market.toUpperCase()} 전일종가 기준 %)`}>
                        {market.toUpperCase()}
                    </button>
                )}
                {onRefresh && (
                    <button className="icon-btn" style={{ width: "auto", padding: 0 }} disabled={refreshing} onClick={onRefresh} title="테마 새로고침 (시트 배정·수동편집 반영)">
                        <RefreshIcon spinning={refreshing} />
                    </button>
                )}
                <BoardModeControls mode={mode} setMode={setMode} />
            </span>
        </div>
    );
}
