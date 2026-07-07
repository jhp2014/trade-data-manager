import { useDock, PRESET_COUNT } from "../store/dock.js";

// 하단 작업표시줄(씨앗) — 지금은 현재 작업화면(프리셋) 표시 + 클릭 순환만.
// 이후 브릭에서 닫힌 창 회수·종목/날짜/시간 컨텍스트가 여기 붙는다.
export function Taskbar(): JSX.Element {
    const activePreset = useDock((s) => s.activePreset);
    const savedCount = useDock((s) => s.presets.filter(Boolean).length);
    const cyclePreset = useDock((s) => s.cyclePreset);
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
            <span style={{ marginLeft: "auto" }}>Ctrl+1~{PRESET_COUNT} 전환 · 클릭 순환</span>
        </div>
    );
}
