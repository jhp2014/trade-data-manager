// 패널 탭 — 경로 칩 + 제목 + 탭 뒤 정보(헤더 자리 장부가 "탭"으로 보낸 것) + 최소화(탭에 마우스를 올릴 때만).
// 탭 아래 색띠 = 지금 보는 경로의 색. 경로 칩: 실선 채움 = 그 경로에 고정, 점선 = 활성을 따라감(글자는 지금 보는 경로).
import { useEffect, useState } from "react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { ACTIVE, selectPanelPath, usePanelPath, usePaths } from "../store/paths.js";
import { TabInfoChips } from "../header/TabInfoChips.js";
import { TriggerPopover } from "../ui/popover/TriggerPopover.js";
import { MENU_PAD, MenuItem } from "../ui/popover/menu.js";
import { slotTitle } from "./panelCatalog.js";

export function PanelTab(props: IDockviewPanelHeaderProps): JSX.Element {
    // 제목은 카탈로그에서 — dockview 는 제목을 배치 JSON 에 저장하므로 api.title 은 옛 제목일 수 있다.
    const title = slotTitle(props.api.id);
    const [active, setActive] = useState(props.api.isActive);
    const [visible, setVisible] = useState(props.api.isVisible);
    useEffect(() => {
        const d1 = props.api.onDidActiveChange(() => setActive(props.api.isActive));
        const d2 = props.api.onDidVisibilityChange(() => setVisible(props.api.isVisible));
        return () => {
            d1.dispose();
            d2.dispose();
        };
    }, [props.api]);
    const { path } = usePanelPath(props.api.id);

    return (
        // 위 패딩 2px = 아래 색띠 2px — 글씨가 탭 줄 세로 한가운데 온다.
        // 탭을 누르면(고르면) 그 패널이 보는 경로가 활성 — 본문 누름은 PanelHost(panelCatalog)가 같은 일을 한다.
        // 탭 안 버튼(최소화 · 경로 칩)은 고르기가 아니다 — 치우려는 패널·바꾸려는 경로가 활성이 되면 안 된다.
        <div
            className="hover-host"
            onPointerDown={(e) => {
                if (!(e.target as Element).closest("button")) selectPanelPath(props.api.id);
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", boxSizing: "border-box", padding: "2px 6px 0 8px", fontSize: 12, borderBottom: `2px solid ${path.color}` }}>
            <PathChip panelId={props.api.id} />
            <span style={{ fontWeight: active ? 700 : 400 }}>{title}</span>
            <TabInfoChips panelId={props.api.id} visible={visible} />
            {/* 평소엔 자리도 없다가 마우스를 올리면 탭이 살짝 늘며 나온다(.hover-reveal, styles.css). */}
            <button
                className="hover-reveal"
                title="최소화 — 아래 작업표시줄로(경로·설정은 그대로)"
                onClick={(e) => {
                    e.stopPropagation();
                    props.api.close();
                }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
            >
                −
            </button>
        </div>
    );
}

/** 경로 칩 — 누르면 고르는 메뉴. 점선 = 활성을 따라감(글자는 지금 따라가는 경로), 실선 채움 = 그 경로에 고정. */
function PathChip({ panelId }: { panelId: string }): JSX.Element {
    const { ref, path } = usePanelPath(panelId);
    const following = ref === ACTIVE;
    return (
        <TriggerPopover
            align="start"
            width={180}
            trigger={(_, toggle) => (
                <button
                    title={following ? `활성을 따라감 — 지금 ${path.id}` : `경로 ${path.id} 에 고정`}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                    }}
                    style={{
                        display: "flex", alignItems: "center", gap: 3, cursor: "pointer", lineHeight: "13px",
                        padding: "0 4px", borderRadius: 2, fontSize: 10, fontWeight: 700,
                        border: `1px ${following ? "dashed" : "solid"} ${path.color}`,
                        background: following ? "transparent" : path.color,
                        color: following ? path.color : "#fff",
                    }}
                >
                    {path.id}
                </button>
            )}
        >
            {(close) => <PathMenu panelId={panelId} onClose={close} />}
        </TriggerPopover>
    );
}

function PathMenu({ panelId, onClose }: { panelId: string; onClose: () => void }): JSX.Element {
    const paths = usePaths((st) => st.paths);
    const activeId = usePaths((st) => st.active);
    const bind = usePaths((st) => st.bind);
    const { ref } = usePanelPath(panelId);
    const items = [{ value: ACTIVE, label: `활성 따라가기 (지금 ${activeId})`, color: "var(--text-3)" }, ...paths.map((p) => ({ value: p.id, label: `경로 ${p.id}`, color: p.color }))];
    return (
        <div style={{ overflowY: "auto", padding: MENU_PAD }}>
            {items.map((it) => (
                <MenuItem
                    key={it.value}
                    mark="radio"
                    on={ref === it.value}
                    selected={ref === it.value}
                    onClick={() => {
                        bind(panelId, it.value);
                        onClose();
                    }}
                >
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: it.color, flexShrink: 0 }} />
                    {it.label}
                </MenuItem>
            ))}
        </div>
    );
}
