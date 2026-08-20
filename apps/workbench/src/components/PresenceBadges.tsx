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
import { HoverCard } from "./HoverCard.js";
import { groupColor } from "../styles/palette.js";

// 12×12 라인 아이콘 — 색·굵기는 부모에서 상속(currentColor). 골격 둘은 **같은 색**이라(차트가 그렇다)
// 실루엣으로 가른다: 일봉=굵직한 꺾임, 분봉=잘게 꺾인 경로(장중 경로라는 뜻이 그림에 있다).
const ICONS: Record<string, JSX.Element> = {
    baseline: ( // 선에 걸친 캔들 — 차트에서 기준선이 서는 장면(선 위로 봉이 걸린) 그대로
        <>
            <line x1="1" y1="8" x2="11" y2="8" />
            <line x1="6" y1="1.5" x2="6" y2="10.5" strokeWidth="1" />
            <rect x="4.4" y="3.5" width="3.2" height="5" rx="0.6" fill="currentColor" stroke="none" />
        </>
    ),
    "ignore-candle": ( // 금지 표식 — "없는 셈 치는 봉"
        <>
            <circle cx="6" cy="6" r="4.4" />
            <line x1="2.9" y1="9.1" x2="9.1" y2="2.9" />
        </>
    ),
    skeleton: <polyline points="1.5,9.5 4.5,3.5 7,7 10.5,1.8" />, // 피벗 경로(굵직한 꺾임 = 일봉)
    // 분봉 = **잘게 꺾인 경로** — 장중 경로라는 뜻이 실루엣에 있다. 파선(옛)은 일봉과 구분이 약했다(사용자 확정).
    "skeleton-minute": <polyline points="1,8.5 2.8,5.5 4.4,7.8 6,3 7.6,6.5 9.2,4.2 11,7.2" strokeWidth="1.3" />,
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

/** 아이콘별 네이티브 툴팁 — 개수 같은 한 줄 상세. 그룹은 색이 정보라 HoverCard 가 대신한다. */
function tipOf(kind: PresenceKindDef, n: number): string {
    return n > 1 ? `${kind.name} ${n}` : kind.name;
}

/** 그룹 hover 카드 내용 — groupColor 로 묶임이 읽히는 이름들, **세로 나열**(가로 한 줄은 여럿일 때 안 읽힌다). */
export function GroupNamesCard({ names }: { names: readonly string[] }): JSX.Element {
    return (
        <span style={{ display: "flex", flexDirection: "column", gap: 2, fontWeight: 600 }}>
            {names.map((n) => (
                <span key={n} style={{ color: groupColor(n) }}>{n}</span>
            ))}
        </span>
    );
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
            {active.map(({ kind, n }) => {
                const icon = (
                    <span
                        key={kind.key}
                        data-presence-kind={kind.key}
                        aria-label={n > 1 ? `${kind.name} ${n}` : kind.name}
                        title={kind.key === "group" ? undefined : tipOf(kind, n)}
                        style={{ display: "inline-flex", alignItems: "center", color: mono ? "#fff" : kind.color }}
                    >
                        <PresenceIcon kindKey={kind.key} name={kind.name} />
                    </span>
                );
                // 그룹만 색 카드 — 어느 그룹인지가 색으로 바로 들어와야 한다(사용자 확정).
                return kind.key === "group"
                    ? <HoverCard key={kind.key} card={<GroupNamesCard names={presence.groups} />}>{icon}</HoverCard>
                    : icon;
            })}
        </span>
    );
}
