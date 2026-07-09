import { WorkbenchShell } from "./shell/WorkbenchShell.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { AssignThemeModal } from "./components/AssignThemeModal.js";
import { Taskbar } from "./components/Taskbar.js";
import { useUi } from "./store/ui.js";
import { useKeymap } from "./keymap/useKeymap.js";
import { useChartHotkeys } from "./lib/chartHooks.js";

// 셸 = 도킹 그리드(WorkbenchShell) + 하단 작업표시줄(Taskbar: 프리셋·최소화창·종목/날짜/시간·설정).
// 상단 전역 툴바는 폐지 — 컨텍스트는 작업표시줄 우측 구석으로 이전.
export function App(): JSX.Element {
    useKeymap(); // 전역 단축키 디스패처(1회 마운트).
    useChartHotkeys(); // 차트 단축키(space·1~9·a/d·shift·ctrl·f) 전역 1회 등록 — focus 따라감, 차트 여러 개여도 무충돌.
    const settingsOpen = useUi((s) => s.settingsOpen);
    const closeSettings = useUi((s) => s.closeSettings);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)" }}>
            <WorkbenchShell />
            <Taskbar />
            {settingsOpen && <SettingsModal onClose={closeSettings} />}
            <AssignThemeModal />
        </div>
    );
}
