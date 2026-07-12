import { useUi } from "../../store/ui.js";

// 보드 헤더 컨트롤 — 리스트/테마 모드 토글 + dim 종목 제외사유↔테마칩 토글(전역). 3보드 공용.
export type BoardMode = "flat" | "group";

function seg(active: boolean): React.CSSProperties {
    return {
        border: "none",
        padding: "1px 8px",
        fontSize: 10.5,
        cursor: "pointer",
        font: "inherit",
        background: active ? "var(--bg-active)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
    };
}

export function BoardModeControls({ mode, setMode }: { mode: BoardMode; setMode: (m: BoardMode) => void }): JSX.Element {
    const showReasons = useUi((s) => s.boardShowReasons);
    const toggleReasons = useUi((s) => s.toggleBoardReasons);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", border: "1px solid var(--border-subtle)", borderRadius: 4, overflow: "hidden" }}>
                <button style={seg(mode === "flat")} onClick={() => setMode("flat")} title="거래대금순 리스트">리스트</button>
                <button style={seg(mode === "group")} onClick={() => setMode("group")} title="테마 그룹">테마</button>
            </div>
            <button
                onClick={toggleReasons}
                title={showReasons ? "제외 종목: 제외 사유 표시 중 (클릭: 테마 칩)" : "제외 종목: 테마 칩 표시 중 (클릭: 제외 사유)"}
                style={{ ...seg(false), border: "1px solid var(--border-subtle)", borderRadius: 4, color: showReasons ? "var(--rise)" : "var(--text-tertiary)" }}
            >
                {showReasons ? "사유" : "테마칩"}
            </button>
        </div>
    );
}
