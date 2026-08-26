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

// 12×12 라인 아이콘 — 색·굵기는 부모에서 상속(currentColor). 실루엣으로 종류를 가른다.
const ICONS: Record<string, JSX.Element> = {
    // 고가에 걸친 파선 — 차트에서 기준선이 서는 장면 그대로다. 선질까지 같은 이유: 실제 기준선은
    // 파선으로 그어진다(chart/priceLines.ts 의 LineStyle.Dashed). 몸통을 아래로 내린 건 **윗꼬리를
    // 살리려고**다 — 꼬리가 선까지 닿아야 "고가에 그은 값"으로 읽히는데, 12px 에선 꼬리가 짧으면
    // 선·심지·몸통이 T자 한 덩어리로 뭉친다(사용자 확정).
    baseline: (
        <>
            <line x1="1" y1="2.4" x2="11" y2="2.4" strokeDasharray="2.4 1.8" />
            <line x1="6" y1="2.4" x2="6" y2="10.6" strokeWidth="1.1" />
            <rect x="4.3" y="6.2" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" />
        </>
    ),
    "ignore-candle": ( // 금지 표식 — "없는 셈 치는 봉"
        <>
            <circle cx="6" cy="6" r="4.4" />
            <line x1="2.9" y1="9.1" x2="9.1" y2="2.9" />
        </>
    ),
    // 분봉 = **잘게 꺾인 경로** — 장중 경로라는 뜻이 실루엣에 있다. 파선(옛)은 일봉과 구분이 약했다(사용자 확정).
    point: <polygon points="2,2.8 10,2.8 6,10" fill="currentColor" stroke="none" />, // 차트의 타점 ▼ 와 같은 모양
    // 그룹 둘 — **같은 색**이라(둘 다 그룹이다) 실루엣이 층위를 가른다.
    "group-day": ( // 담긴 것들(층) — 하루째 담는다
        <>
            <rect x="1.4" y="1.9" width="9.2" height="3.2" rx="0.9" />
            <rect x="1.4" y="6.9" width="9.2" height="3.2" rx="0.9" />
        </>
    ),
    "group-point": ( // 통 하나 + 그 위의 ▼ — 담기는 게 타점이라는 뜻이 그림에 있다
        <>
            <polygon points="3.6,1.2 8.4,1.2 6,4.6" fill="currentColor" stroke="none" />
            <rect x="1.4" y="6.5" width="9.2" height="3.6" rx="0.9" />
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
    // 타점은 배지에서 뺀다 — 작업셋은 자식 행으로, 차트는 ▼ 마커로 어차피 보인다(사용자 확정).
    // 레지스트리에서 빼지 않는 이유: 필터의 타점/!타점과 "타점 찍을 날" 프리셋은 살아야 한다.
    const active = PRESENCE_KINDS.filter((k) => k.key !== "point").map((k) => ({ kind: k, n: k.countOf(presence) })).filter((e) => e.n > 0);
    if (active.length === 0) return null;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 10, lineHeight: 1, whiteSpace: "nowrap", ...style }}>
            {active.map(({ kind, n }) => {
                // 이름을 가진 종류(그룹 둘)는 색 카드가 대신 말한다 — 어느 그룹인지가 색으로 바로 들어와야
                // 한다(사용자 확정). 무엇이 그런 종류인지는 **레지스트리가** 안다(namesOf).
                const names = kind.namesOf?.(presence);
                const icon = (
                    <span
                        key={kind.key}
                        data-presence-kind={kind.key}
                        aria-label={n > 1 ? `${kind.name} ${n}` : kind.name}
                        title={names ? undefined : tipOf(kind, n)}
                        style={{ display: "inline-flex", alignItems: "center", color: mono ? "#fff" : kind.color }}
                    >
                        <PresenceIcon kindKey={kind.key} name={kind.name} />
                    </span>
                );
                return names
                    ? <HoverCard key={kind.key} card={<GroupNamesCard names={names} />}>{icon}</HoverCard>
                    : icon;
            })}
        </span>
    );
}
