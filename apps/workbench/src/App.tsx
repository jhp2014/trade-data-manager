import { useWorkbench } from "./store/workbench.js";
import { WorkbenchShell } from "./shell/WorkbenchShell.js";
import { GearButton } from "./components/Modal.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { AssignThemeModal } from "./components/AssignThemeModal.js";
import { Taskbar } from "./components/Taskbar.js";
import { useUi } from "./store/ui.js";
import { useKeymap } from "./keymap/useKeymap.js";

// 전역 툴바 — 종목·날짜·시간(전역값). 시간 스크러버가 Focus.time 을 움직여 복기 보드·차트가 반응.
// 설정은 우상단 전역 버튼 1개(패널별 gear 없음).
const SESSION_START_MIN = 8 * 60; // 08:00
const SESSION_END_MIN = 20 * 60; // 20:00
function minToTime(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
}
function timeToMin(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function FocusToolbar({ onSettings }: { onSettings: () => void }): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const time = useWorkbench((s) => s.focus.time);
    const setDate = useWorkbench((s) => s.setDate);
    const setCode = useWorkbench((s) => s.setCode);
    const setTime = useWorkbench((s) => s.setTime);

    const curMin = time ? timeToMin(time) : 15 * 60 + 30; // 기본 15:30
    const inputStyle: React.CSSProperties = {
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "3px 8px",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        font: "inherit",
    };
    return (
        <div
            style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-default)",
                background: "var(--bg-secondary)",
                fontSize: 13,
                color: "var(--text-secondary)",
            }}
        >
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                종목
                <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="005930" style={{ ...inputStyle, width: 90 }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                날짜
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </label>
            {/* 시간 스크러버(전역, 08:00~20:00) — 복기 보드/차트 마커의 시점 커서 */}
            <span className="tabular" style={{ fontWeight: 700, color: "var(--text-primary)", width: 44 }}>{minToTime(curMin).slice(0, 5)}</span>
            <input
                type="range"
                min={SESSION_START_MIN}
                max={SESSION_END_MIN}
                value={curMin}
                onChange={(e) => setTime(minToTime(Number(e.target.value)))}
                style={{ flex: 1, minWidth: 120, accentColor: "var(--accent-primary)" }}
            />
            <GearButton onClick={onSettings} />
        </div>
    );
}

export function App(): JSX.Element {
    useKeymap(); // 전역 단축키 디스패처(1회 마운트).
    const settingsOpen = useUi((s) => s.settingsOpen);
    const openSettings = useUi((s) => s.openSettings);
    const closeSettings = useUi((s) => s.closeSettings);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)" }}>
            <FocusToolbar onSettings={() => openSettings()} />
            <WorkbenchShell />
            <Taskbar />
            {settingsOpen && <SettingsModal onClose={closeSettings} />}
            <AssignThemeModal />
        </div>
    );
}
