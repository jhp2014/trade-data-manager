// 큐레이션 존재 배지 — 한 (종목,날짜)에 어떤 수동 데이터가 있는지 작은 아이콘으로.
//
// **아이콘인 이유**: 이 줄은 종류가 최대 7개까지 늘어서는 자리다. 글자 배지(기·골·분…)는 폭은 같지만
// 서로 닮아서 훑을 때 구분이 안 되고, 종류가 늘수록 약자가 억지스러워진다. 모양은 개수가 늘어도
// 서로 안 닮는다 — 그림 자체가 차트 위의 그것(선·지그재그·▼)을 닮게 그려서, 배지와 화면의 그것이
// 눈으로 이어진다. 색도 차트가 쓰는 같은 개념색(palette)이라 두 겹으로 짝지어진다.
//
// 규칙: **있는 종류만** 그리고, 2개부터 개수를 옆에 붙인다. 상세(무슨 그룹인지)는 툴팁이 말한다.
// 접근성·테스트 손잡이로 각 배지에 aria-label 과 data-presence-kind 를 단다(모양은 읽을 수 없으므로).
import type { CSSProperties } from "react";
import { PRESENCE_KINDS, type DayPresence } from "../lib/presence.js";

// 12×12 라인 아이콘 — 색·굵기는 부모에서 상속(currentColor). 골격 둘은 **같은 색**이라(차트가 그렇다)
// 실선/파선으로 가른다: 분봉 골격이 더 잘게 끊긴 경로라는 뜻이 그림에 그대로 있다.
const ICONS: Record<string, JSX.Element> = {
    baseline: <line x1="1" y1="7.5" x2="11" y2="7.5" />, // 그은 선
    "ignore-candle": ( // 금지 표식 — "없는 셈 치는 봉"
        <>
            <circle cx="6" cy="6" r="4.4" />
            <line x1="2.9" y1="9.1" x2="9.1" y2="2.9" />
        </>
    ),
    skeleton: <polyline points="1.5,9.5 4.5,3.5 7,7 10.5,1.8" />, // 피벗 경로
    "skeleton-minute": <polyline points="1.5,9.5 4.5,3.5 7,7 10.5,1.8" strokeDasharray="2 1.3" />,
    point: <polygon points="2,2.8 10,2.8 6,10" fill="currentColor" stroke="none" />, // 차트의 타점 ▼ 와 같은 모양
    group: ( // 담긴 것들(층)
        <>
            <rect x="1.4" y="1.9" width="9.2" height="3.2" rx="0.9" />
            <rect x="1.4" y="6.9" width="9.2" height="3.2" rx="0.9" />
        </>
    ),
    comment: ( // 말풍선
        <>
            <rect x="1.3" y="1.9" width="9.4" height="6.4" rx="1.4" />
            <polyline points="3.9,8.3 3.9,10.8 6.6,8.3" />
        </>
    ),
};

function PresenceIcon({ kindKey, name }: { kindKey: string; name: string }): JSX.Element {
    const shape = ICONS[kindKey];
    // 레지스트리에 param 이 늘었는데 아이콘을 안 그렸을 때 — 조용히 사라지는 대신 이름 첫 글자로 선다.
    if (!shape) return <span style={{ fontWeight: 700 }}>{name.slice(0, 1)}</span>;
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            {shape}
        </svg>
    );
}

export function PresenceBadges({ presence, style }: { presence: DayPresence | null; style?: CSSProperties }): JSX.Element | null {
    if (!presence) return null;
    const active = PRESENCE_KINDS.map((k) => ({ kind: k, n: k.countOf(presence) })).filter((e) => e.n > 0);
    if (active.length === 0) return null;
    const tip = active
        .map(({ kind, n }) => (kind.key === "group" ? `그룹: ${presence.groups.join(", ")}` : n > 1 ? `${kind.name} ${n}` : kind.name))
        .join(" · ");
    return (
        <span title={tip} style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 10, lineHeight: 1, whiteSpace: "nowrap", ...style }}>
            {active.map(({ kind, n }) => (
                <span
                    key={kind.key}
                    data-presence-kind={kind.key}
                    aria-label={n > 1 ? `${kind.name} ${n}` : kind.name}
                    style={{ display: "inline-flex", alignItems: "center", gap: 1, color: kind.color }}
                >
                    <PresenceIcon kindKey={kind.key} name={kind.name} />
                    {n > 1 ? <span className="tabular" style={{ fontWeight: 600 }}>{n}</span> : null}
                </span>
            ))}
        </span>
    );
}
