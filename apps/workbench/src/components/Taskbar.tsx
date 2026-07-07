import { useDock, PRESET_COUNT } from "../store/dock.js";
import { PANEL_CATALOG, type PanelEntry } from "../shell/panelCatalog.js";

const chipStyle: React.CSSProperties = {
    padding: "1px 8px",
    borderRadius: 4,
    border: "1px dashed var(--border-default)",
    background: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    font: "inherit",
};

// 하단 작업표시줄(씨앗) — 현재 작업화면(프리셋) 표시·순환 + 닫힌(최소화) 창 클릭 재오픈.
// 이후 브릭 6에서 종목/날짜/시간 컨텍스트가 여기 구석에 붙는다.
export function Taskbar(): JSX.Element {
    const activePreset = useDock((s) => s.activePreset);
    const savedCount = useDock((s) => s.presets.filter(Boolean).length);
    const cyclePreset = useDock((s) => s.cyclePreset);
    const openPanelIds = useDock((s) => s.openPanelIds);
    const api = useDock((s) => s.api);
    // 카탈로그에 있으나 현재 안 열린 = 최소화된 창. dock 미준비(null)면 비움.
    const closed = openPanelIds === null ? [] : PANEL_CATALOG.filter((p) => !openPanelIds.includes(p.id));
    const reopen = (e: PanelEntry): void => {
        api?.addPanel({ id: e.id, component: e.component, title: e.title });
    };
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 26,
                padding: "0 10px",
                borderTop: "1px solid var(--border-default)",
                background: "var(--bg-secondary)",
                fontSize: 12,
                color: "var(--text-tertiary)",
                flexShrink: 0,
            }}
        >
            <button
                onClick={cyclePreset}
                disabled={savedCount === 0}
                title={savedCount ? "작업화면 순환" : "저장된 작업화면 없음 (설정 → 레이아웃)"}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 8px",
                    borderRadius: 5,
                    border: "1px solid var(--border-subtle)",
                    background: savedCount ? "var(--bg-primary)" : "none",
                    color: activePreset ? "var(--text-primary)" : "var(--text-tertiary)",
                    cursor: savedCount ? "pointer" : "default",
                    font: "inherit",
                }}
            >
                화면 {activePreset ?? "—"}
                {savedCount > 0 && <span style={{ color: "var(--text-tertiary)" }}>· {savedCount}개 저장</span>}
            </button>
            {closed.length > 0 && (
                <>
                    <span style={{ color: "var(--border-default)" }}>│</span>
                    <span style={{ color: "var(--text-tertiary)" }}>최소화</span>
                    {closed.map((e) => (
                        <button key={e.id} onClick={() => reopen(e)} title="다시 열기" style={chipStyle}>
                            {e.title}
                        </button>
                    ))}
                </>
            )}
            <span style={{ marginLeft: "auto" }}>Ctrl+1~{PRESET_COUNT} 전환 · 클릭 순환</span>
        </div>
    );
}
