// 큐레이션 존재 배지 — 한 (종목,날짜)에 어떤 수동 데이터가 있는지 작은 아이콘으로.
//
// **아이콘만, 숫자 없음** — 작업 대상 패널은 "작업 여부"를 판단하는 화면이라 유무가 본론이고,
// 개수·그룹명 같은 상세는 아이콘별 hover 툴팁이 말한다(숫자가 붙으면 줄이 표처럼 무거워진다).
// 그림 자체가 차트 위의 그것(선·지그재그·▼)을 닮게 그려서 배지와 화면의 그것이 눈으로 이어지고,
// 색도 차트가 쓰는 같은 개념색(palette)이라 두 겹으로 짝지어진다.
//
// 규칙: **있는 종류만** 그린다. mono(선택 행)면 전부 흰색 — 파란 선택 배경 위에서 종류색은 안 읽힌다
// (색 정보는 어차피 툴팁이 대신 말한다). 접근성·테스트 손잡이로 aria-label 과 data-presence-kind.
import type { CSSProperties } from "react";
import { PRESENCE_KINDS, type DayPresence, type PresenceKindDef } from "../lib/presence.js";

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

/** 종류 아이콘 하나 — 작업셋 밖(타점 행의 그룹 표시 등)에서도 같은 그림을 쓰라고 노출한다. */
export function PresenceIcon({ kindKey, name }: { kindKey: string; name: string }): JSX.Element {
    const shape = ICONS[kindKey];
    // 레지스트리에 param 이 늘었는데 아이콘을 안 그렸을 때 — 조용히 사라지는 대신 이름 첫 글자로 선다.
    if (!shape) return <span style={{ fontWeight: 700 }}>{name.slice(0, 1)}</span>;
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            {shape}
        </svg>
    );
}

/** 아이콘별 툴팁 — 개수·그룹명 같은 상세는 전부 여기로(화면은 유무만). */
function tipOf(kind: PresenceKindDef, n: number, p: DayPresence): string {
    if (kind.key === "group") return `그룹: ${p.groups.join(", ")}`;
    return n > 1 ? `${kind.name} ${n}` : kind.name;
}

export function PresenceBadges({ presence, mono = false, style }: {
    presence: DayPresence | null;
    /** 선택 행(파란 배경) — 종류색 대신 흰색 단색으로(대비). */
    mono?: boolean;
    style?: CSSProperties;
}): JSX.Element | null {
    if (!presence) return null;
    const active = PRESENCE_KINDS.map((k) => ({ kind: k, n: k.countOf(presence) })).filter((e) => e.n > 0);
    if (active.length === 0) return null;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 10, lineHeight: 1, whiteSpace: "nowrap", ...style }}>
            {active.map(({ kind, n }) => (
                <span
                    key={kind.key}
                    data-presence-kind={kind.key}
                    aria-label={n > 1 ? `${kind.name} ${n}` : kind.name}
                    title={tipOf(kind, n, presence)}
                    style={{ display: "inline-flex", alignItems: "center", color: mono ? "#fff" : kind.color }}
                >
                    <PresenceIcon kindKey={kind.key} name={kind.name} />
                </span>
            ))}
        </span>
    );
}
