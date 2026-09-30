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
import { panelComponents, panelTypeOf, planeOf } from "./panelCatalog.js";
import { rowNavOwnerOfBase, useRowNavRole } from "../lib/rowNav.js";
import { duplicatePanel } from "../lib/openPanel.js";
import { HeaderButtons } from "../components/header/HeaderButtons.js";
import { TabInfoChips } from "../components/header/TabInfoChips.js";

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
    // 정보 칩은 그룹마다 **보이는 탭**에만 붙는다(isVisible) — api.isActive 는 화면 전체에 하나라
    // 다른 그룹을 누를 때마다 온 탭 줄이 출렁인다.
    const [visible, setVisible] = useState(props.api.isVisible);
    useEffect(() => {
        const d1 = props.api.onDidTitleChange(() => setTitle(props.api.title));
        const d2 = props.api.onDidActiveChange(() => setActive(props.api.isActive));
        const d3 = props.api.onDidVisibilityChange(() => setVisible(props.api.isVisible));
        return () => {
            d1.dispose();
            d2.dispose();
            d3.dispose();
        };
    }, [props.api]);
    // 플레인 탭 구분(점 없이 UI 색으로) — 실시간=앰버 / 복기=teal. 텍스트색 + 옅은 배경 + 하단 2px 색띠(배경 겹쳐도 또렷).
    const plane = planeOf(props.api.id);
    const color = `var(--plane-${plane})`;
    // 복제 입구 — 인스턴스 생성의 유일한 정문(복제 가능 타입에만). 헤더 구조가 제각각인 패널들을
    // 재편하지 않고도 전 타입이 한 번에 정문을 얻는 자리라 탭이다(2026-09-16 확정).
    const duplicable = panelTypeOf(props.api.id)?.duplicable === true;
    // w/s 순회 자리 — 걷는 중 = 채운 칩, 참여 = 옅은 글자만(테두리·바탕 없음), 빠짐·후보 아님 = 없음(lib/rowNav 「참여」).
    // 두 상태가 **같은 상자**(투명 테두리까지)라 참여 → 걷는 중에서 바탕만 채워지고 제목은 안 밀린다.
    // 탭이 이 표시를 맡는 이유: 배경 탭이어도 보이고, 판 컨트롤은 접혀 있어도 된다.
    const walkRole = useRowNavRole(rowNavOwnerOfBase(panelTypeOf(props.api.id)?.idBase));
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", padding: "0 8px", fontSize: 12, color, background: `var(--plane-${plane}-soft)`, borderBottom: `2px solid ${color}` }}>
            {(walkRole === "walk" || walkRole === "join") && (
                <span title={walkRole === "walk" ? "w/s 가 이 창을 걷는다 (q: 다음 참여 창으로)" : "w/s 순회 참여 — q 로 여기로 옮길 수 있다"}
                    style={{
                        fontSize: 10.5, lineHeight: "14px", padding: "0 4px", borderRadius: 3, fontWeight: 700, flexShrink: 0,
                        border: "1px solid transparent",
                        ...(walkRole === "walk"
                            ? { background: "var(--walk)", color: "#fff" }
                            : { color: "var(--walk-faint)" }), // 굵기도 같게 — 700/400 이면 폭이 1px 남짓 갈려 제목이 밀린다
                    }}>w/s</span>
            )}
            <span style={{ fontWeight: active ? 700 : 400, opacity: active ? 1 : 0.85 }}>{title}</span>
            <TabInfoChips panelId={props.api.id} visible={visible} />
            {duplicable && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        duplicatePanel(props.api.id);
                    }}
                    title="복제 — 지금 설정 사본으로 새 창"
                    style={{ background: "none", border: "none", color: "inherit", opacity: 0.55, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "0 2px" }}
                >
                    ⧉
                </button>
            )}
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

// 그룹 헤더 우측 액션 — **활성 패널의 모음 버튼 둘**(ⓘ 정보 · 슬라이더 컨트롤). 컨트롤은 어차피
// 활성 패널 대상이라 그룹당 한 벌이면 되고, activePanel 은 dockview 가 탭 전환마다 갱신해 준다.
// (옛 플로팅 ↔ 도킹 토글 ⧉ 은 기능째 은퇴 — 미사용, 2026-09-30 사용자 확정. 저장 배치에 이미 떠 있는
// 그룹은 그대로 로드되고, 탭 드래그로 그리드에 되붙일 수 있다.)
function HeaderActions(props: IDockviewHeaderActionsProps): JSX.Element {
    return <HeaderButtons panelId={props.activePanel?.id} />;
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
