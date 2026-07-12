import { useUi } from "../../store/ui.js";

// 보드 헤더 — 라벨(상태/시간/장마감) + 종목수 + 컨트롤. 3보드 공통·컴팩트(실시간 테마 크기).
export type BoardMode = "flat" | "group";

function ListIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
    );
}
function ThemeIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}
function FilterIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
        </svg>
    );
}

function segBtn(active: boolean, first: boolean): React.CSSProperties {
    return {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderLeft: first ? "none" : "1px solid var(--border-default)",
        padding: "2px 8px",
        cursor: "pointer",
        font: "inherit",
        background: active ? "var(--accent-primary)" : "var(--bg-primary)",
        color: active ? "#fff" : "var(--text-secondary)",
    };
}

export function BoardModeControls({ mode, setMode }: { mode: BoardMode; setMode: (m: BoardMode) => void }): JSX.Element {
    const showReasons = useUi((s) => s.boardShowReasons);
    const toggleReasons = useUi((s) => s.toggleBoardReasons);
    return (
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
            <button style={segBtn(false, true)} onClick={() => setMode(mode === "flat" ? "group" : "flat")} title={mode === "flat" ? "리스트 (클릭: 테마 그룹)" : "테마 그룹 (클릭: 리스트)"}>
                {mode === "flat" ? <ListIcon /> : <ThemeIcon />}
            </button>
            <button style={segBtn(showReasons, false)} onClick={toggleReasons} title={showReasons ? "필터 칩 켜짐 (제외 사유 표시, 클릭: 끄기)" : "필터 칩 꺼짐 (클릭: 켜기)"}>
                <FilterIcon />
            </button>
        </div>
    );
}

// 보드 공용 헤더 — 좌측 라벨(상태/시간/장마감) + 종목수 + 우측 컨트롤. 컴팩트(위아래 좁게).
export function BoardHeader({ left, count, mode, setMode }: {
    left: React.ReactNode;
    count: number;
    mode: BoardMode;
    setMode: (m: BoardMode) => void;
}): JSX.Element {
    return (
        <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {left}
            <span className="tabular">{count}종목</span>
            <span style={{ marginLeft: "auto" }}>
                <BoardModeControls mode={mode} setMode={setMode} />
            </span>
        </div>
    );
}
