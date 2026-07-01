import type { FunctionComponent } from "react";
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { ChartPanel } from "../panels/ChartPanel.js";

// dockview 도킹 셸 껍데기 — 지금은 차트 패널 하나만 등록한다(탭·분할·플로팅은 셸이 이미 제공).
// 레이아웃 JSON persist·다패널·기존앱 흡수는 후속.
const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
    chart: () => <ChartPanel />,
};

function onReady(event: DockviewReadyEvent): void {
    event.api.addPanel({ id: "chart-1", component: "chart", title: "차트" });
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
