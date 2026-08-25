import { useEffect, useState } from "react";
import {
    DockviewReact,
    themeLight,
    type DockviewReadyEvent,
    type IDockviewHeaderActionsProps,
    type IDockviewPanelHeaderProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { loadLastLayout, useDock } from "../store/dock.js";
import { panelComponents, planeOf } from "./panelCatalog.js";

// dockview 도킹 셸 — 패널 목록·렌더는 전부 panelCatalog 가 소유하고, 여기는 셸(탭·헤더 액션·복원)만.
const components = panelComponents();

/**
 * 부팅 배치 — **마지막 배치를 이어받는다.** 없거나 깨졌으면 기본 배치는 **빈 도화지**다(사용자 확정):
 * 열린 창이 하나도 없고, 아래 작업표시줄에서 필요한 것만 꺼낸다. 옛 하드코딩 기본 배치(이슈정리 보드 +
 * 차트 + 탭 13개)는 새로고침마다 그걸 다시 밀어 넣어, 손으로 맞춘 자리를 매번 덮었다.
 *
 * ⚠ 자동저장이 붙은 뒤로는 **꼬인 배치가 영구히 남는다**(예전엔 F5 가 곧 리셋이었다). 탈출 사다리가
 *   두 칸 있다: Ctrl+숫자(굳혀 둔 프리셋) → 설정 > 레이아웃 "기본 배치로 되돌리기"(도화지).
 */
function onReady(event: DockviewReadyEvent): void {
    const api = event.api;
    // 프리셋 전환·작업표시줄이 조작할 수 있게 api 를 dock 스토어에 노출.
    useDock.getState().setApi(api);

    const last = loadLastLayout();
    if (last) {
        try {
            api.fromJSON(last);
        } catch {
            api.clear(); // sanitize 로도 못 살린 배치 → 도화지에서 다시 시작
        }
    }

    // 열린 패널 추적 → 작업표시줄 "닫힌 창" 목록.
    const sync = (): void => useDock.getState().setOpenPanels(api.panels.map((p) => p.id));
    api.onDidAddPanel(sync);
    api.onDidRemovePanel(sync);
    sync();
    // 손대는 족족 저장(디바운스). 프리셋과 달리 "저장" 손짓이 없어 여기가 유일한 기록 지점이다.
    api.onDidLayoutChange(() => useDock.getState().rememberLayout());
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

/**
 * 도화지 안내 — dockview 의 기본 워터마크는 **빈 div** 라 아무 말도 안 한다. 창이 하나도 없을 때
 * 여는 길(작업표시줄)을 가리키지 않으면 첫 부팅이 막다른 화면이 된다. 포인터는 통과시킨다.
 */
function EmptyHint(): JSX.Element {
    return (
        <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6, pointerEvents: "none",
            color: "var(--text-tertiary)", fontSize: 13,
        }}>
            <span>열린 창이 없습니다</span>
            <span style={{ fontSize: 12 }}>아래 작업표시줄에서 창을 열거나, Ctrl+1~5 로 저장한 화면을 불러옵니다</span>
        </div>
    );
}

export function WorkbenchShell(): JSX.Element {
    const openPanelIds = useDock((s) => s.openPanelIds);
    return (
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <DockviewReact
                components={components}
                onReady={onReady}
                defaultTabComponent={PanelTab}
                rightHeaderActionsComponent={HeaderActions}
                theme={themeLight}
            />
            {openPanelIds !== null && openPanelIds.length === 0 && <EmptyHint />}
        </div>
    );
}
