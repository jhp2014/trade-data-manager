// 골격 겹쳐 그리기의 **떠 있는 창들** — 뭉친 라벨의 멤버 목록(뱃지 팝오버)과 그룹 메뉴 두 벌.
// 상태(badge·groupMenu)는 패널·선택 훅이 들고, 여기는 그리기와 그룹 사전 배선만 진다.
import { useMemo } from "react";
import { labelPointOf, type OverlayLine, type SkeletonAnchor } from "./skeletonOverlay.js";
import { BulkGroupMenu } from "./ChartGroupMenu.js";
import type { GroupMenuState } from "./useOverlaySelection.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import { shortDate } from "../../lib/date.js";

export interface OverlayMenusProps {
    badge: { x: number; y: number; members: string[] } | null;
    onCloseBadge: () => void;
    byKey: ReadonlyMap<string, OverlayLine>;
    labelAnchorMode: SkeletonAnchor;
    /** 목록 행 점의 색 — 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */
    groupColorOf: (key: string) => string;
    nameOf: (code: string) => string;
    onLabelClick: (s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    setHovered: (key: string | null) => void;
    groupMenu: GroupMenuState | null;
    onCloseGroupMenu: () => void;
}

export function OverlayMenus(p: OverlayMenusProps): JSX.Element {
    const { badge, byKey, labelAnchorMode, groupMenu } = p;
    // 그룹 사전 — 컨텍스트라 패널(발끝 표기)·데이터 훅(차트 그룹 필터 판정)과 같은 인스턴스를 본다.
    const groupsView = useGroups();

    // 목록 순서 = 라벨 지점의 % 내림차순 — 그림에서 위에 있는 선이 목록에서도 위라 눈이 안 헤맨다.
    const badgeRows = useMemo(() => {
        if (!badge) return [];
        return badge.members
            .map((k) => byKey.get(k))
            .filter((s): s is OverlayLine => !!s)
            .sort((a, b) => labelPointOf(b, labelAnchorMode).y - labelPointOf(a, labelAnchorMode).y);
    }, [badge, byKey, labelAnchorMode]);

    return (
        <>
            {/* 뭉친 라벨의 멤버 목록 — 행 점이 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */}
            {badge && (
                <AnchoredPopover anchor={badge} onClose={p.onCloseBadge} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>{badge.members.length}개 골격</MenuLabel>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {badgeRows.map((s) => (
                            <div key={s.key} onMouseEnter={() => p.setHovered(s.key)} onMouseLeave={() => p.setHovered(null)}>
                                {/* ⚠ 닫기 전에 호버를 **손으로** 푼다 — 목록이 사라지면 이 행은 언마운트라
                                    mouseleave 가 영영 안 온다(라벨에서 겪은 것과 같은 부류의 누수).
                                    거기선 노드를 안 부수는 게 답이지만, 여기선 닫는 게 목적이라 풀어 주는 게 답이다. */}
                                <MenuItem onClick={() => { p.onLabelClick(s, { ctrlKey: false, metaKey: false }); p.setHovered(null); p.onCloseBadge(); }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 3, background: p.groupColorOf(s.key), flexShrink: 0 }} />
                                        <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{shortDate(s.date)}</span>
                                        <span>{p.nameOf(s.stockCode)}</span>
                                        {s.kind === "point" && <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{s.time.slice(0, 5)}</span>}
                                    </span>
                                </MenuItem>
                            </div>
                        ))}
                    </div>
                </AnchoredPopover>
            )}

            {/* 그룹 메뉴 — 같은 창, 다른 정션: 차트 라벨은 chart_tags, 타점 마커는 review_point_tags. */}
            {groupMenu?.kind === "chart" && (
                <BulkGroupMenu anchor={groupMenu} targets={groupMenu.charts} scope="day" label={groupMenu.label} onClose={p.onCloseGroupMenu}
                    hasGroup={(c, id) => groupsView.chartGroupNamesOf(c).includes(id)}
                    inheritedVia={(c, id) => groupsView.inheritedViaOf(c, id)?.name ?? null}
                    toggle={(c, id, on) => groupsView.toggleChart(c, id, on)} />
            )}
            {groupMenu?.kind === "point" && (
                <BulkGroupMenu anchor={groupMenu} targets={groupMenu.points} scope="point" label={groupMenu.label} onClose={p.onCloseGroupMenu}
                    hasGroup={(pt, id) => groupsView.has(pt, id)}
                    inheritedVia={(pt, id) => groupsView.inheritedViaOf(pt, id)?.name ?? null}
                    toggle={(pt, id, on) => groupsView.toggle(pt, id, on)} />
            )}
        </>
    );
}
