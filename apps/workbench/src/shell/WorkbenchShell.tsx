import type { FunctionComponent } from "react";
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { ChartPanel } from "../panels/ChartPanel.js";
import { ThemeBoardPanel } from "../panels/ThemeBoardPanel.js";

// dockview 도킹 셸 — 패널을 컴포넌트 맵으로 등록한다(탭·분할·플로팅·persist 는 셸이 제공).
// 레이아웃 JSON persist·기존앱 흡수는 후속.
const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
    themeBoard: () => <ThemeBoardPanel />,
    chart: () => <ChartPanel />,
};

function onReady(event: DockviewReadyEvent): void {
    // 테마보드(좌) | 차트(우) 초기 분할.
    const board = event.api.addPanel({ id: "theme-board-1", component: "themeBoard", title: "테마보드" });
    event.api.addPanel({
        id: "chart-1",
        component: "chart",
        title: "차트",
        position: { referencePanel: board, direction: "right" },
    });
}

export function WorkbenchShell(): JSX.Element {
    return (
        <div style={{ flex: 1, minHeight: 0 }}>
            <DockviewReact
                components={components}
                onReady={onReady}
                className="dockview-theme-light"
            />
        </div>
    );
}
