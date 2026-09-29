// 기본 분봉 차트의 거래대금 pane 우상단 — **지금 타점(시간선)에 붙은 라벨**. 좌상단 조건 그룹 칩(GroupChipCard)의 짝.
// 직접 붙인 라벨 = 그룹 색 · 하위 라벨을 거쳐 적용되는 조상 = 같은 색을 흐리게(라벨 [탐색]의 ● / ○ 와 같은 구분).
// 표기는 GroupChips 문법(색 글자 + · 구분, 경로는 hover) — 헤더 칩과 같은 말투. 라벨이 없으면 아예 안 선다.
// 하루 라벨(▣)은 안 싣는다 — 차트 헤더의 그룹 칩이 이미 말한다.
import { useGroups } from "../lib/GroupsContext.js";
import { groupColor } from "../styles/palette.js";
import type { Group } from "../api/groups.js";

export function PointLabelCard({ code, date, time }: {
    code: string;
    date: string;
    /** 시간선(HH:MM:SS). null = 시간선 없음 → 안 선다. */
    time: string | null;
}): JSX.Element | null {
    const g = useGroups();
    if (time === null || !code) return null;
    const ref = { stockCode: code, date, time };
    const direct = g.pointGroupsOf(ref);
    const directNames = new Set(direct.map((x) => x.name));
    const via = g.appliedPointGroupNamesOf(ref)
        .filter((n) => !directNames.has(n))
        .map((n) => g.groupByName.get(n))
        .filter((x): x is Group => x !== undefined);
    if (direct.length === 0 && via.length === 0) return null;
    const items = [...direct.map((x) => ({ group: x, via: false })), ...via.map((x) => ({ group: x, via: true }))];
    return (
        // 겉은 좌상단 칩과 같은 고스트 카드(.plane-ctl). 감싸개(MinuteChart)가 손을 안 받으므로 카드가 되받는다.
        <div className="plane-ctl" style={{
            display: "flex", alignItems: "center", gap: 4, pointerEvents: "auto", whiteSpace: "nowrap",
            padding: "2px 8px", fontSize: 10.5, lineHeight: "16px", maxWidth: "100%", overflow: "hidden",
        }}>
            {items.map(({ group, via: isVia }, i) => (
                <span key={group.name} style={{ display: "contents" }}>
                    {i > 0 && <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>·</span>}
                    {/* 넘치면 이름이 줄어든다(말줄임) — 전문·경로는 hover. */}
                    <span title={`${g.pathLabel(group.name, group.name)}${isVia ? " — 하위 라벨을 거쳐 적용" : ""}`}
                        style={{ color: groupColor(group.name), fontWeight: 600, opacity: isVia ? 0.45 : 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {group.name}
                    </span>
                </span>
            ))}
        </div>
    );
}
