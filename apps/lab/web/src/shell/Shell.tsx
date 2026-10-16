import { DockviewReact, themeLight, type DockviewApi, type DockviewReadyEvent, type IDockviewHeaderActionsProps } from "dockview-react";
import { HeaderButtons } from "../header/HeaderButtons.js";
import { panelComponents } from "./panelCatalog.js";
import { PanelTab } from "./PanelTab.js";
import { restoreLayout } from "./layout.js";

// dockview 도킹 셸 — 패널 목록은 panelCatalog, 배치 저장/복원은 layout.
const components = panelComponents();

/** 그룹 탭 줄 오른쪽 — **활성 패널의** 정보 판·컨트롤 판 버튼(그룹당 한 벌, dockview 가 탭 전환마다 activePanel 을 갱신한다). */
function HeaderActions(props: IDockviewHeaderActionsProps): JSX.Element {
    return <HeaderButtons panelId={props.activePanel?.id} />;
}

export function Shell({ onApi }: { onApi: (api: DockviewApi) => void }): JSX.Element {
    const onReady = (e: DockviewReadyEvent): void => {
        restoreLayout(e.api);
        onApi(e.api);
    };
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
