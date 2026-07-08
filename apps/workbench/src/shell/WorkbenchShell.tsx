import { useEffect, useState, type FunctionComponent } from "react";
import {
    DockviewReact,
    themeLight,
    type DockviewReadyEvent,
    type IDockviewPanelProps,
    type IDockviewHeaderActionsProps,
    type IDockviewPanelHeaderProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { ChartPanel } from "../panels/ChartPanel.js";
import { ThemeBoardPanel } from "../panels/ThemeBoardPanel.js";
import { ReplayBoardPanel } from "../panels/ReplayBoardPanel.js";
import { WorksetPanel } from "../panels/WorksetPanel.js";
import { HypothesisPanel } from "../panels/HypothesisPanel.js";
import { HypothesisGraphPanel } from "../panels/HypothesisGraphPanel.js";
import { HypothesisFilterPanel } from "../panels/HypothesisFilterPanel.js";
import { BoardFilterPanel } from "../panels/BoardFilterPanel.js";
import { HtsNewsPanel } from "../panels/HtsNewsPanel.js";
import { TelegramNewsPanel } from "../panels/TelegramNewsPanel.js";
import { useDock } from "../store/dock.js";
import { PANEL_CATALOG, type PanelEntry } from "./panelCatalog.js";

// dockview 도킹 셸 — 패널을 컴포넌트 맵으로 등록한다(탭·분할·플로팅·persist 는 셸이 제공).
// 레이아웃 JSON persist·기존앱 흡수는 후속.
const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
    themeBoard: () => <ThemeBoardPanel />,
    boardFilter: () => <BoardFilterPanel />,
    replayBoard: () => <ReplayBoardPanel />,
    workset: () => <WorksetPanel />,
    hypothesis: () => <HypothesisPanel />,
    hypothesisGraph: () => <HypothesisGraphPanel />,
    hypothesisFilter: () => <HypothesisFilterPanel />,
    chart: () => <ChartPanel />,
    htsNews: () => <HtsNewsPanel />,
    telegramNews: () => <TelegramNewsPanel />,
};

function entry(id: string): PanelEntry {
    const found = PANEL_CATALOG.find((p) => p.id === id);
    if (!found) throw new Error(`unknown panel: ${id}`);
    return found;
}

function onReady(event: DockviewReadyEvent): void {
    const api = event.api;
    // 프리셋 전환·작업표시줄이 조작할 수 있게 api 를 dock 스토어에 노출.
    useDock.getState().setApi(api);
    // 이슈정리 보드(좌) | 차트(우) + 나머지는 이슈정리 보드에 탭으로. 필요시 드래그로 띄우거나(플로팅) 분할.
    const board = api.addPanel({ ...entry("theme-board-1") });
    api.addPanel({ ...entry("chart-1"), position: { referencePanel: board, direction: "right" } });
    for (const id of ["replay-board-1", "workset-1", "hypothesis-1", "hypothesis-graph-1", "hts-news-1", "telegram-news-1"]) {
        api.addPanel({ ...entry(id), position: { referencePanel: board, direction: "within" } }); // 이슈정리와 탭 그룹
    }
    // 열린 패널 추적 → 작업표시줄 "닫힌 창" 목록.
    const sync = (): void => useDock.getState().setOpenPanels(api.panels.map((p) => p.id));
    api.onDidAddPanel(sync);
    api.onDidRemovePanel(sync);
    sync();
}

// 커스텀 탭 — 기본 X 대신 "−"(최소화) 버튼. 닫아도 사라지지 않고 작업표시줄로 회수되므로 최소화로 표기.
function PanelTab(props: IDockviewPanelHeaderProps): JSX.Element {
    const [title, setTitle] = useState(props.api.title);
    const [active, setActive] = useState(props.api.isActive);
    useEffect(() => {
        const d1 = props.api.onDidTitleChange(() => setTitle(props.api.title));
        const d2 = props.api.onDidActiveChange(() => setActive(props.api.isActive));
        return () => {
            d1.dispose();
            d2.dispose();
        };
    }, [props.api]);
    // 활성 탭은 진하게(text-primary+bold), 비활성은 text-secondary. 커스텀 탭이라 색을 직접 준다(div→자식 상속).
    const color = active ? "var(--text-primary)" : "var(--text-secondary)";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", padding: "0 8px", fontSize: 12, color }}>
            <span style={{ fontWeight: active ? 600 : 400 }}>{title}</span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    props.api.close();
                }}
                title="최소화 (작업표시줄로)"
                style={{ background: "none", border: "none", color: "inherit", opacity: 0.55, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
            >
                −
            </button>
        </div>
    );
}

// 그룹 헤더 우측 액션 — 플로팅 ↔ 도킹 토글(dockview 는 드래그 기본 UI 가 없어 버튼으로 트리거).
// 플로팅: 그리드 위에 떠서 겹침. 도킹: 기존 그리드 그룹 오른쪽으로 복귀.
function HeaderActions(props: IDockviewHeaderActionsProps): JSX.Element {
    const floating = props.api.location.type === "floating";
    const toggle = (): void => {
        if (floating) {
            const target = props.containerApi.groups.find((g) => g.api.location.type === "grid" && g.id !== props.group.id);
            props.api.moveTo(target ? { group: target, position: "right" } : { position: "center" });
        } else {
            props.containerApi.addFloatingGroup(props.group, { position: { left: 140, top: 90 }, width: 580, height: 440 });
        }
    };
    return (
        <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 6px" }}>
            <button
                onClick={toggle}
                title={floating ? "도킹으로 복귀" : "플로팅 창으로 띄우기"}
                style={{ padding: "0 6px", color: floating ? "var(--accent-primary)" : "var(--text-tertiary)", fontSize: 14, lineHeight: 1, cursor: "pointer" }}
            >
                {floating ? "⊟" : "⧉"}
            </button>
        </div>
    );
}

export function WorkbenchShell(): JSX.Element {
    return (
        <div style={{ flex: 1, minHeight: 0 }}>
            <DockviewReact
                components={components}
                onReady={onReady}
                defaultTabComponent={PanelTab}
                rightHeaderActionsComponent={HeaderActions}
                theme={themeLight}
            />
        </div>
    );
}
