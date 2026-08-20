// 작업셋 패널 표현 컴포넌트 — 월 선택 팝오버·조준 아이콘·날짜 헤더·종목명·타점 행·존재 필터 칩 줄.
// WorksetPanel 본문(데이터 합본)에서 분리한 순수 표현 조각.
import type { ReviewPointListItem } from "../api/reviewPoints.js";
import type { Group } from "../api/groups.js";
import { weekdayOf } from "../lib/date.js";
import { hasActiveFilter, PRESENCE_KINDS, type PresenceFilter } from "../lib/presence.js";
import { PlacementBadge } from "../components/Placement.js";
import { HeaderPopover } from "../components/HeaderPopover.js";
import { GroupChips } from "../components/GroupChips.js";
import { ScrollRow } from "../components/ControlChrome.js";

function fmtDateHeader(date: string): string {
    return `${date.replace(/-/g, ".")} (${weekdayOf(date)})`;
}

// 월 선택 — 팝오버는 HeaderPopover(document.body portal). 패널 안에서 absolute 로 열면
// dockview 패널 경계에 잘려 목록이 안 보인다(옛 버그). 헤더 좌측 컨트롤이라 align="start",
// 고르고 끝나는 메뉴라 바깥 클릭으로 닫는다.
export function MonthPicker({ month, months, onPick }: { month: string; months: string[]; onPick: (m: string) => void }): JSX.Element {
    return (
        <HeaderPopover
            width={100}
            align="start"
            closeOnOutside
            trigger={(open, toggle) => (
                <button
                    onClick={toggle}
                    title="월 변경"
                    style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "none", background: "none", padding: "2px 3px", cursor: "pointer", font: "inherit" }}
                >
                    <span className="tabular" style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{month.replace("-", ".")}</span>
                    <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: "var(--text-secondary)", transform: open ? "rotate(180deg)" : "none" }}
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
            )}
        >
            {(close) => (
                <div style={{ overflowY: "auto", padding: "2px 0" }}>
                    {months.length === 0 && <div style={{ padding: "5px 12px", color: "var(--text-tertiary)", fontSize: 12 }}>없음</div>}
                    {months.map((m) => (
                        <button
                            key={m}
                            onClick={() => { onPick(m); close(); }}
                            className="tabular"
                            style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: m === month ? "var(--accent-soft)" : "transparent", color: "var(--text-primary)", padding: "5px 12px", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: m === month ? 700 : 400 }}
                        >
                            {m.replace("-", ".")}
                        </button>
                    ))}
                </div>
            )}
        </HeaderPopover>
    );
}

// 조준(현재 위치로 이동) 아이콘 — 핀이 "현재 종목 위치로 스크롤"임을 나타낸다.
export function LocateIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="1.5" fill="var(--accent-primary)" stroke="none" />
            <line x1="12" y1="1.5" x2="12" y2="4.5" />
            <line x1="12" y1="19.5" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="4.5" y2="12" />
            <line x1="19.5" y1="12" x2="22.5" y2="12" />
        </svg>
    );
}

// 날짜 그룹 구분선 — 타점 행(회색 밴드)과 확실히 구분되도록 흰 밴드 + 좌측 accent 틱 + 볼드 날짜로 강조.
// sticky 로 스크롤 중 현재 날짜가 상단에 고정 → "여기서부터 새 날짜 그룹" 신호.
export function DateHeader({ date }: { date: string }): JSX.Element {
    return (
        <div
            style={{
                position: "sticky",
                top: 0,
                zIndex: 3,
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 10px",
                background: "var(--bg-primary)",
                borderTop: "1px solid var(--border-strong)",
                borderBottom: "1px solid var(--border-default)",
            }}
        >
            <span style={{ width: 3, height: 12, borderRadius: 2, background: "var(--accent-primary)", flexShrink: 0 }} />
            <span className="tabular" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
                {fmtDateHeader(date)}
            </span>
        </div>
    );
}

/**
 * 존재 필터 칩 줄 — 종류마다 3상(무관 → 있음 → 없음 !취소선) 순환, 켜진 칩들은 AND.
 * 항상 보이는 줄이다: 접어두면 "왜 목록이 비었지" 사고가 난다(활성 필터는 화면에 있어야 한다).
 * hidden = 이 달에서 필터로 숨은 항목 수 — 0 이 "없음"인지 "다 걸러짐"인지 줄 스스로 말한다.
 */
export function PresenceFilterRow({ filter, hidden, onCycle, onClear }: {
    filter: PresenceFilter;
    hidden: number;
    onCycle: (kindKey: string) => void;
    onClear: () => void;
}): JSX.Element {
    const active = hasActiveFilter(filter);
    return (
        <ScrollRow gap={4} style={{ flexShrink: 0, padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
            {PRESENCE_KINDS.map((k) => {
                const st = filter[k.key] ?? "any";
                const on = st !== "any";
                return (
                    <button
                        key={k.key}
                        onClick={() => onCycle(k.key)}
                        title={`${k.name} — ${st === "any" ? "무관(클릭: 있는 날만)" : st === "has" ? "있는 날만(클릭: 없는 날만)" : "없는 날만(클릭: 해제)"}`}
                        style={{
                            flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 10.5, fontWeight: on ? 700 : 400,
                            padding: "1px 6px", borderRadius: 3, lineHeight: 1.5, whiteSpace: "nowrap",
                            border: `1px ${st === "not" ? "dashed" : "solid"} ${on ? k.color : "transparent"}`,
                            background: st === "has" ? `${k.color.startsWith("#") ? `${k.color}1a` : "transparent"}` : "transparent",
                            color: on ? k.color : "var(--text-tertiary)",
                            textDecoration: st === "not" ? "line-through" : "none",
                        }}
                    >
                        {st === "not" ? `!${k.name}` : k.name}
                    </button>
                );
            })}
            {active && (
                <>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }}>{hidden > 0 ? `${hidden} 숨김` : ""}</span>
                    <button
                        onClick={onClear}
                        title="존재 필터 전부 해제"
                        style={{ flexShrink: 0, marginLeft: "auto", border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: 10.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}
                    >
                        해제 ⤺
                    </button>
                </>
            )}
        </ScrollRow>
    );
}

export function Name({ name, code, color, strong }: { name: string | null; code: string; color?: string; strong?: boolean }): JSX.Element {
    return (
        <span style={{ minWidth: 0, color: color ?? "var(--text-primary)", fontWeight: strong ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name ?? code}
        </span>
    );
}

export function PointRow({
    p,
    related,
    current,
    placed,
    axisTotal,
    groups,
    pathOf,
    onClick,
}: {
    p: ReviewPointListItem;
    related?: boolean;
    current?: boolean;
    placed: number; // 배치된 축 수
    axisTotal: number; // 축 총수(0 = 배치 기능 미사용 → 배지 숨김)
    /** 이 타점에 적용되는 그룹(직접 ∪ 하루 상속) — 타점 낟알의 소속을 행에서 바로 보인다. */
    groups: Group[];
    pathOf: (groupName: string) => string;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                textAlign: "left",
                border: "none",
                borderLeft: `3px solid ${current ? "var(--accent-primary)" : related ? "var(--accent-soft)" : "transparent"}`,
                borderBottom: "1px solid var(--border-subtle)",
                padding: "3px 10px 3px 22px",
                cursor: "pointer",
                font: "inherit",
                background: current ? "var(--bg-active)" : related ? "var(--accent-soft)" : "transparent",
            }}
        >
            <span className="tabular" style={{ flexShrink: 0, width: 40, color: current ? "var(--accent-primary)" : "var(--text-secondary)", fontWeight: current ? 700 : 400, fontSize: 12 }}>
                {p.time.slice(0, 5)}
            </span>
            {p.memo && (
                <span title={p.memo} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)", fontSize: 12 }}>
                    {p.memo}
                </span>
            )}
            {/* 타점 소속 그룹 — short(값만)·잘림(스크롤 없음): 밀집 행이라 폭 대신 툴팁이 전체를 말한다. */}
            {groups.length > 0 && <GroupChips groups={groups} short pathOf={pathOf} style={{ marginLeft: "auto", maxWidth: 120, flexShrink: 1 }} />}
            {axisTotal > 0 && <PlacementBadge placed={placed} total={axisTotal} style={{ marginLeft: groups.length > 0 ? 0 : "auto" }} />}
        </button>
    );
}
