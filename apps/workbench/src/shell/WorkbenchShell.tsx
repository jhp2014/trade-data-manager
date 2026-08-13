import { useEffect, useState } from "react";
import {
    DockviewReact,
    themeLight,
    type DockviewReadyEvent,
    type IDockviewHeaderActionsProps,
    type IDockviewPanelHeaderProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useDock } from "../store/dock.js";
import { panelComponents, panelEntry, planeOf } from "./panelCatalog.js";

// dockview 도킹 셸 — 패널 목록·렌더는 전부 panelCatalog 가 소유하고, 여기는 셸(탭·헤더 액션·기본 배치)만.
const components = panelComponents();

// 기본 배치의 탭 순서 — 카탈로그 순서와 별개인 **레이아웃 결정**이라 여기 남긴다.
// 카탈로그에 없는 id 는 panelEntry 가 부팅 때 던진다(오타 즉시 발각). 여기 없는 패널(차트2·필터류 등)은
// 처음엔 안 열리고 작업표시줄에서 꺼낸다.
const TAB_PANELS = [
    "live-board-1", "live-watchlist-1", "live-alert-log-1", "live-universe-rules-1", "live-news-1", "live-telegram-1",
    "replay-board-1", "workset-1", "history-1", "rank-sheet-1", "rank-point-1", "hts-news-1", "telegram-news-1",
];

function onReady(event: DockviewReadyEvent): void {
    const api = event.api;
    // 프리셋 전환·작업표시줄이 조작할 수 있게 api 를 dock 스토어에 노출.
    useDock.getState().setApi(api);
    // 이슈정리 보드(좌) | 차트(우) + 나머지는 이슈정리 보드에 탭으로. 필요시 드래그로 띄우거나(플로팅) 분할.
    const boardEntry = panelEntry("theme-board-1");
    const board = api.addPanel({ id: boardEntry.id, component: boardEntry.component, title: boardEntry.title });
    const { component: chartComponent, title: chartTitle } = panelEntry("chart-1");
    api.addPanel({ id: "chart-1", component: chartComponent, title: chartTitle, position: { referencePanel: board, direction: "right" } });
    for (const id of TAB_PANELS) {
        const { component, title } = panelEntry(id);
        api.addPanel({ id, component, title, position: { referencePanel: board, direction: "within" } }); // 이슈정리와 탭 그룹
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
    // 플레인 탭 구분(점 없이 UI 색으로) — 실시간=앰버 / 복기=teal. 텍스트색 + 옅은 배경 + 하단 2px 색띠(배경 겹쳐도 또렷).
    const plane = planeOf(props.api.id);
    const color = `var(--plane-${plane})`;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", padding: "0 8px", fontSize: 12, color, background: `var(--plane-${plane}-soft)`, borderBottom: `2px solid ${color}` }}>
            <span style={{ fontWeight: active ? 700 : 400, opacity: active ? 1 : 0.85 }}>{title}</span>
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
