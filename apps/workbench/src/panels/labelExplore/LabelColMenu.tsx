// 라벨 열 고르기 판 — ◆ 타점 / ▣ 하루 두 절, 절마다 그룹 트리(부모 다음 자식) + 자손 포함 개수.
// 탐색판 「조건 그룹」 판과 같은 결: ✓ 토글 · 상한 10(두 절 합산) · 고른 순서 = 번호.
// **자동 항목은 없다** — 보고 싶은 것만 고른다(사용자 확정, decisions 「라벨 타점 [탐색]」).
//
// · 절이 곧 종류(scope)다 — 같은 이름을 다른 종류로 바꾸는 토글은 없다(라벨 조건의 "입구 = scope").
// · 고른 것 중 목록에 안 서는 것(라벨이 다 떨어진 그룹)은 절 아래 흐린 줄로 세운다 — 숨기면 체크를 못 푼다.
//   사전에서 지워진 이름은 세지도 세우지도 않는다(토글 한 번에 걸러진 목록으로 다시 써서 청소 — 탐색판 선례).
import { useMemo } from "react";
import { useGroups } from "../../lib/GroupsContext.js";
import { labelCountsOf, labelTreeRows } from "../../lib/groupTree.js";
import { AnchoredPopover } from "../../ui/popover/AnchoredPopover.js";
import { MENU_PAD, MenuHead, MenuItem } from "../../ui/popover/menu.js";
import { MAX_GROUPS } from "../dailyExplore/exploreRows.js";
import { labelColKey, type LabelCol, type LabelScope } from "./labelRows.js";

export function LabelColMenu({ anchor, cols, onPick, onClose }: {
    anchor: { x: number; y: number };
    /** 지금 고른 열(사전에 살아 있는 것만 — 호출부가 거른다). */
    cols: readonly LabelCol[];
    onPick: (next: LabelCol[]) => void;
    onClose: () => void;
}): JSX.Element {
    const g = useGroups();
    const pointRows = useMemo(() => labelTreeRows(g.groups, g.grainSets.pointGrain), [g.groups, g.grainSets.pointGrain]);
    const dayRows = useMemo(() => labelTreeRows(g.groups, g.grainSets.dayGrain), [g.groups, g.grainSets.dayGrain]);
    const pointCounts = useMemo(() => labelCountsOf(g.pointMemberships, g.groupByName), [g.pointMemberships, g.groupByName]);
    const dayCounts = useMemo(() => labelCountsOf(g.memberships, g.groupByName), [g.memberships, g.groupByName]);
    const picked = new Set(cols.map(labelColKey));
    const full = cols.length >= MAX_GROUPS;

    const toggle = (c: LabelCol): void => {
        const k = labelColKey(c);
        onPick(picked.has(k) ? cols.filter((x) => labelColKey(x) !== k) : [...cols, c]);
    };

    const section = (scope: LabelScope): JSX.Element[] => {
        const rows = scope === "point" ? pointRows : dayRows;
        const counts = scope === "point" ? pointCounts : dayCounts;
        const listed = new Set(rows.map((r) => r.group.name));
        const items = rows.map(({ group, depth }) => {
            const c: LabelCol = { name: group.name, scope };
            const on = picked.has(labelColKey(c));
            return (
                <MenuItem key={`${scope}:${group.name}`} mark="check" on={on} disabled={!on && full}
                    why={`최대 ${MAX_GROUPS}개 — 하나를 빼야 더 고를 수 있습니다`}
                    title={depth > 0 ? `${group.parentName} 아래 — 부모 열을 고르면 이 그룹 라벨도 ○ 로 잡힙니다` : on ? "열에서 빼기" : "열로 세우기"}
                    trailing={counts.get(group.name) ?? 0} onClick={() => toggle(c)}>
                    <span style={{ paddingLeft: depth * 12 }}>{group.name}</span>
                </MenuItem>
            );
        });
        for (const c of cols) {
            if (c.scope !== scope || listed.has(c.name)) continue;
            items.push(
                <MenuItem key={`${scope}:${c.name}:missing`} mark="check" on dim trailing="라벨 없음" onClick={() => toggle(c)}
                    title={`이 종류(${scope === "point" ? "타점" : "하루"})의 라벨이 하나도 없는 그룹 — 체크를 풀면 열에서 빠집니다`}>
                    {c.name}
                </MenuItem>,
            );
        }
        return items;
    };
    const pointItems = section("point");
    const dayItems = section("day");

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} width={250} padding={0} placement="beside" offset={6}>
            <div style={{ maxHeight: 360, overflowY: "auto", padding: MENU_PAD }}>
                <MenuHead title="그 분 좌표에 붙인 라벨 — 개수 = 타점 수(하위 포함)">◆ 타점 라벨</MenuHead>
                {pointItems.length > 0 ? pointItems : <div style={emptyNote}>타점 라벨이 없습니다 — 차트 봉 우클릭으로 붙입니다</div>}
                <MenuHead sep title="그 종목·날에 붙인 라벨 — 그날 모든 타점이 ○ 로 물려받는다. 개수 = 차트 수(하위 포함)">▣ 하루 라벨</MenuHead>
                {dayItems.length > 0 ? dayItems : <div style={emptyNote}>하루 라벨이 없습니다 — 차트·목록 우클릭으로 붙입니다</div>}
                <div style={{ ...emptyNote, borderTop: "1px solid var(--border-subtle)", marginTop: 4, paddingTop: 5 }}>
                    {cols.length} / {MAX_GROUPS} · 번호 = 고른 순서
                </div>
            </div>
        </AnchoredPopover>
    );
}

const emptyNote: React.CSSProperties = { padding: "3px 12px", fontSize: 10.5, color: "var(--text-tertiary)" };
