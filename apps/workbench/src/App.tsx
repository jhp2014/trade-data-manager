import { WorkbenchShell } from "./shell/WorkbenchShell.js";
import { FunnelProvider } from "./panels/filter/FunnelContext.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { AssignThemeModal } from "./components/AssignThemeModal.js";
import { GroupAssignPopover } from "./components/GroupAssignPopover.js";
import { Taskbar } from "./components/Taskbar.js";
import { useUi } from "./store/ui.js";
import { useKeymap } from "./keymap/useKeymap.js";
import { useChartHotkeys } from "./lib/chartHooks.js";
import { useRowNavHotkeys } from "./lib/rowNav.js";

// 셸 = 도킹 그리드(WorkbenchShell) + 하단 작업표시줄(Taskbar: 프리셋·최소화창·종목/날짜/시간·설정).
// 상단 전역 툴바는 폐지 — 컨텍스트는 작업표시줄 우측 구석으로 이전.
export function App(): JSX.Element {
    useKeymap(); // 전역 단축키 디스패처(1회 마운트).
    // 행 순회(w/s) — 등록은 여기 1회, 걷는 주체는 소유자 규칙이 고른다(시트 우선·작업셋 폴백, lib/rowNav).
    useRowNavHotkeys();
    useChartHotkeys(); // 차트 단축키(space·1~9·a/d·shift·ctrl·f) 전역 1회 등록 — focus 따라감, 차트 여러 개여도 무충돌.
    const settingsOpen = useUi((s) => s.settingsOpen);
    const closeSettings = useUi((s) => s.closeSettings);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)" }}>
            {/* 깔때기 계산 한 벌(FunnelContext) — 소비 패널 다섯이 같은 정산을 나눠 본다.
                재료(그룹 사전·축)는 이보다 바깥(main)에서 이미 한 벌로 서 있다. */}
            <FunnelProvider>
                <WorkbenchShell />
                <Taskbar />
            </FunnelProvider>
            {settingsOpen && <SettingsModal onClose={closeSettings} />}
            <AssignThemeModal />
            <GroupAssignPopover />
        </div>
    );
}
