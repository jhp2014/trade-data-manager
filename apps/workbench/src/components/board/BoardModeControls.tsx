import { useUi } from "../../store/ui.js";

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
export function BoardHeader({ dotColor, label, count, mode, setMode }: {
    dotColor: string;
    label: string;
    count: number;
    mode: BoardMode;
    setMode: (m: BoardMode) => void;
}): JSX.Element {
    return (
        <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
            <span style={{ color: dotColor }}>{label}</span>
            <span className="tabular">{count}종목</span>
            <span style={{ marginLeft: "auto" }}>
                <BoardModeControls mode={mode} setMode={setMode} />
            </span>
        </div>
    );
}
