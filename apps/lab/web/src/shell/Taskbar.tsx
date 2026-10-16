// 작업표시줄(바닥) — 왼쪽: 최소화한 패널 칩(누르면 되살림, × 는 영구 삭제) · 오른쪽: 번호 붙은 화면 버튼.
// 화면 저장·관리는 설정 창(⚙ — 화면 칸)에 있다.
import { useMemo } from "react";
import type { DockviewApi } from "dockview-react";
import { useDock } from "../store/dock.js";
import { usePanelPath } from "../store/paths.js";
import { keyedScreens, useScreens } from "../store/screens.js";
import { PANEL_TYPES, slotTitle } from "./panelCatalog.js";
import { destroyPanel, restorePanel } from "./layout.js";
import { openScreen } from "./screenActions.js";
import { parseSlot } from "./slots.js";

const TYPE_ORDER = new Map(PANEL_TYPES.map((t, i) => [t.base, i]));

/** 칩 순서 — 카탈로그의 타입 순서, 그다음 번호. */
function slotOrder(a: string, b: string): number {
    const sa = parseSlot(a);
    const sb = parseSlot(b);
    return (TYPE_ORDER.get(sa?.base ?? "") ?? 99) - (TYPE_ORDER.get(sb?.base ?? "") ?? 99) || (sa?.n ?? 0) - (sb?.n ?? 0);
}

export function Taskbar({ api }: { api: DockviewApi | null }): JSX.Element {
    const slots = useDock((st) => st.slots);
    const openIds = useDock((st) => st.openIds);
    const minimized = useMemo(() => (openIds ? slots.filter((id) => !openIds.includes(id)).sort(slotOrder) : []), [slots, openIds]);
    const screens = useScreens((st) => st.screens);
    const keys = useScreens((st) => st.keys);
    const activeId = useScreens((st) => st.activeId);
    const keyed = keyedScreens(screens, keys);

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", minHeight: 28, boxSizing: "border-box", background: "var(--surface)", borderTop: "1px solid var(--border)", fontSize: 12 }}>
            <span style={{ color: "var(--text-3)", flexShrink: 0 }}>최소화</span>
            <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 72, overflowX: "auto" }}>
                {minimized.length === 0 && <span style={{ color: "var(--text-3)" }}>—</span>}
                {minimized.map((id) => (
                    <MinimizedChip key={id} id={id} onRestore={() => api && restorePanel(api, id)} onDestroy={() => api && destroyPanel(api, id)} />
                ))}
            </div>
            {keyed.map(({ key, screen }) => (
                <button
                    key={key}
                    title={`Ctrl+${key} — 화면 「${screen.name}」`}
                    disabled={!api}
                    onClick={() => api && openScreen(api, screen)}
                    style={{ ...barBtn, fontWeight: screen.id === activeId ? 700 : 400, background: screen.id === activeId ? "var(--hover)" : "var(--surface)" }}
                >
                    <span className="tabular" style={{ color: "var(--text-3)", marginRight: 4 }}>{key}</span>
                    {screen.name}
                </button>
            ))}
        </div>
    );
}

const barBtn: React.CSSProperties = { padding: "1px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" };

function MinimizedChip({ id, onRestore, onDestroy }: { id: string; onRestore: () => void; onDestroy: () => void }): JSX.Element {
    const color = usePanelPath(id).path.color; // 패널 탭의 색띠와 같은 해석
    return (
        <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", flexShrink: 0 }}>
            <button onClick={onRestore} title="되살리기" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "none", padding: "1px 4px 1px 7px", cursor: "pointer", fontSize: 12 }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: color }} />
                {slotTitle(id)}
            </button>
            <button onClick={onDestroy} title="영구 삭제 — 이 패널의 경로 구독·설정도 지운다" style={{ border: "none", background: "none", padding: "0 5px", cursor: "pointer", opacity: 0.45 }}>
                ×
            </button>
        </span>
    );
}
