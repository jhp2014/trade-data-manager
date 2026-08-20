// 작업셋 목록 — 날짜 > 종목 > 타점 3층 트리를 **평탄화해 가상화**한 리스트(ItemRows 와 같은 수법).
//
// 왜 가상화인가: 월 "전체" 시선이 생기면서 최악 케이스가 전 모수(수천 종목 행 + 타점 행)가 됐다.
// 비용은 항목 수가 아니라 DOM 노드 수가 정한다(ItemRows 머리 주석의 명제) — 잘라 그리면 상한이 없다.
// ItemRows 를 안 쓰는 이유: 그 목록은 날짜/시각/종목 3열 계약이고, 여긴 행 종류가 셋(날짜 머리·종목·
// 타점)에 배지·그룹 칩·렌즈까지 실린다 — "패널만의 것은 그 패널의 규칙"(ItemRows 머리 주석)이라
// 검증된 수법(고정 높이·rangeExtractor 붙는 머리·scrollToIndex)만 가져온다.
//
// 렌즈(집합): 멤버 행 = 좌측 보라 레일(PIN — 작업셋 의미색), 비멤버 = 흐리게(클릭은 산다).
// 종목 행은 **그 날 밑에 멤버 타점이 하나라도 있으면** 멤버다 — 부모가 자식 멤버십을 대표해야
// 훑기가 성립한다(멤버 타점 하나 있는 날이 흐리면 "이 날에 멤버가 있다"가 안 보인다).
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { ReviewPointListItem } from "../api/reviewPoints.js";
import type { Group } from "../api/groups.js";
import type { DayPresence } from "../lib/presence.js";
import { weekdayOf } from "../lib/date.js";
import { PresenceBadges, PresenceIcon } from "../components/PresenceBadges.js";
import { ScrollRow } from "../components/ControlChrome.js";
import { PlacementBadge } from "../components/Placement.js";
import { GROUP_PLAIN, PIN } from "../styles/palette.js";

export interface WorksetEntry {
    date: string;
    code: string;
    presence: DayPresence;
    points: ReviewPointListItem[];
}

export interface WorksetLens {
    /** 이 (날짜,종목) 아래에 멤버가 있나 — 종목 행 레일의 기준. */
    dayMember: (e: WorksetEntry) => boolean;
    /** 이 타점이 멤버인가 — 타점 행 레일의 기준. */
    pointMember: (p: ReviewPointListItem) => boolean;
}

type Row =
    | { kind: "date"; key: string; date: string; count: number }
    | { kind: "stock"; key: string; entry: WorksetEntry }
    | { kind: "point"; key: string; entry: WorksetEntry; point: ReviewPointListItem };

/** 고정 높이(px) — 균일해야 가상화가 재지 않고 앉힌다. 행 안 내용은 한 줄로 자른다. */
const DATE_H = 24;
const STOCK_H = 24;
const POINT_H = 22;

export function WorksetList({ groups, focus, lens, nameOf, placedOf, axisTotal, groupsOf, pathOf, onPickDay, onPickPoint, jumpTo }: {
    /** 날짜 내림차순 그룹(패널이 접는다) — 여긴 그리기만. */
    groups: readonly { date: string; stocks: readonly WorksetEntry[] }[];
    focus: { code: string; date: string; time: string | null };
    /** null = 렌즈 없음(집합 미선택·전체). */
    lens: WorksetLens | null;
    nameOf: (code: string) => string | null;
    placedOf: (p: ReviewPointListItem) => number;
    axisTotal: number;
    groupsOf: (p: ReviewPointListItem) => Group[];
    pathOf: (groupName: string) => string;
    onPickDay: (e: WorksetEntry) => void;
    onPickPoint: (p: ReviewPointListItem) => void;
    /** 찾아가기 — nonce 가 바뀔 때만 그 (날짜,종목)으로(없으면 같은 종목의 아무 날짜로). ItemRows.jumpTo 선례. */
    jumpTo?: { date: string; code: string; nonce: number };
}): JSX.Element {
    const rows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        for (const g of groups) {
            out.push({ kind: "date", key: `@${g.date}`, date: g.date, count: g.stocks.length });
            for (const e of g.stocks) {
                out.push({ kind: "stock", key: `${e.date}|${e.code}`, entry: e });
                for (const p of e.points) out.push({ kind: "point", key: `${e.date}|${e.code}|${p.time}`, entry: e, point: p });
            }
        }
        return out;
    }, [groups]);

    const dateIdx = useMemo(() => rows.flatMap((r, i) => (r.kind === "date" ? [i] : [])), [rows]);
    const stickyRef = useRef(-1);
    const scrollRef = useRef<HTMLDivElement>(null);
    const virt = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (i) => (rows[i]?.kind === "date" ? DATE_H : rows[i]?.kind === "stock" ? STOCK_H : POINT_H),
        getItemKey: (i) => rows[i]?.key ?? i,
        overscan: 12,
        // 붙는 날짜 머리 — 지금 구간의 날짜를 범위 밖이어도 늘 그린다(ItemRows 의 rangeExtractor 그대로).
        rangeExtractor: (range) => {
            let sticky = -1;
            for (const i of dateIdx) {
                if (i <= range.startIndex) sticky = i;
                else break;
            }
            stickyRef.current = sticky;
            const base = defaultRangeExtractor(range);
            return sticky >= 0 && !base.includes(sticky) ? [sticky, ...base] : base;
        },
    });

    // 찾아가기 — 정확한 (날짜,종목) 우선, 없으면 같은 종목의 첫 행. 도착이 전부라 즉시 이동(ItemRows 주석).
    const lastJump = useRef(-1);
    useEffect(() => {
        if (!jumpTo || jumpTo.nonce === lastJump.current) return;
        lastJump.current = jumpTo.nonce;
        const exactKey = `${jumpTo.date}|${jumpTo.code}`;
        let i = rows.findIndex((r) => r.kind === "stock" && r.key === exactKey);
        if (i < 0) i = rows.findIndex((r) => r.kind === "stock" && r.entry.code === jumpTo.code);
        if (i >= 0) virt.scrollToIndex(i, { align: "auto" });
    }, [jumpTo, rows, virt]);

    // 목록 정체가 갈리면(월·집합·필터 변경) 맨 위로 — 가상화기 API 로(직접 scrollTop 금지, ItemRows 주석).
    const firstKey = rows[0]?.key;
    useLayoutEffect(() => { virt.scrollToOffset(0); }, [firstKey, virt]);

    return (
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
                {virt.getVirtualItems().map((v) => {
                    const r = rows[v.index]!;
                    const seat: CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", height: v.size, transform: `translateY(${v.start}px)` };

                    if (r.kind === "date") {
                        const pinned = v.index === stickyRef.current;
                        return (
                            <div key={r.key} data-divider={r.date} style={{
                                ...(pinned ? { position: "sticky", top: 0, zIndex: 3, height: v.size } : seat),
                                display: "flex", alignItems: "center", gap: 7, padding: "0 10px", boxSizing: "border-box",
                                background: "var(--bg-primary)", borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-default)",
                            }}>
                                <span style={{ width: 3, height: 12, borderRadius: 2, background: "var(--accent-primary)", flexShrink: 0 }} />
                                <span className="tabular" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
                                    {`${r.date.replace(/-/g, ".")} (${weekdayOf(r.date)})`}
                                </span>
                                {/* 그 날의 표시 항목 수 — 훑을 때 밀도 파악용(표시 수 기준이라 화면과 안 어긋난다). */}
                                <span className="tabular" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.count}</span>
                            </div>
                        );
                    }

                    if (r.kind === "stock") {
                        const e = r.entry;
                        const selected = e.code === focus.code && e.date === focus.date;
                        const member = lens ? lens.dayMember(e) : false;
                        return (
                            <button key={r.key} data-row={r.key} onClick={() => onPickDay(e)} style={{
                                ...seat, display: "flex", alignItems: "center", gap: 6, textAlign: "left",
                                border: "none", padding: "0 10px", boxSizing: "border-box", cursor: "pointer", font: "inherit", overflow: "hidden",
                                borderLeft: `3px solid ${selected ? "var(--accent-hover)" : "transparent"}`,
                                background: selected ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                boxShadow: member ? `inset 3px 0 0 ${PIN}` : undefined,
                                opacity: lens && !member ? 0.38 : 1,
                            }}>
                                {/* 종목명은 안 줄인다(작업 여부 판단의 1열) — 아이콘이 넘치면 아이콘 영역만 hover 가로 스크롤. */}
                                <span style={{ flexShrink: 0, color: selected ? "#fff" : "var(--text-primary)", fontWeight: selected ? 700 : 600, whiteSpace: "nowrap" }}>
                                    {nameOf(e.code) ?? e.code}
                                </span>
                                <ScrollRow gap={0} style={{ marginLeft: "auto", minWidth: 0, flexShrink: 1 }}>
                                    <PresenceBadges presence={e.presence} mono={selected} />
                                </ScrollRow>
                            </button>
                        );
                    }

                    const p = r.point;
                    const related = r.entry.code === focus.code && r.entry.date === focus.date;
                    const current = related && p.time === focus.time;
                    const pMember = lens ? lens.pointMember(p) : false;
                    const pGroups = groupsOf(p);
                    return (
                        <button key={r.key} data-row={r.key} onClick={() => onPickPoint(p)} style={{
                            ...seat, display: "flex", alignItems: "center", gap: 6, textAlign: "left",
                            border: "none", borderBottom: "1px solid var(--border-subtle)", padding: "0 10px 0 22px", boxSizing: "border-box",
                            cursor: "pointer", font: "inherit", overflow: "hidden",
                            borderLeft: `3px solid ${current ? "var(--accent-primary)" : related ? "var(--accent-soft)" : "transparent"}`,
                            background: current ? "var(--bg-active)" : related ? "var(--accent-soft)" : "transparent",
                            boxShadow: pMember ? `inset 3px 0 0 ${PIN}` : undefined,
                            opacity: lens && !pMember ? 0.38 : 1,
                        }}>
                            <span className="tabular" style={{ flexShrink: 0, width: 40, color: current ? "var(--accent-primary)" : "var(--text-secondary)", fontWeight: current ? 700 : 400, fontSize: 12 }}>
                                {p.time.slice(0, 5)}
                            </span>
                            {p.memo && (
                                <span title={p.memo} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)", fontSize: 12 }}>
                                    {p.memo}
                                </span>
                            )}
                            {/* 그룹은 아이콘만(이름은 hover) — 작업 여부 화면이라 이름 칩은 소음이다(존재 배지와 같은 원칙). */}
                            {pGroups.length > 0 && (
                                <span
                                    data-presence-kind="group"
                                    title={`그룹: ${pGroups.map((g) => pathOf(g.name)).join(", ")}`}
                                    style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", color: GROUP_PLAIN }}
                                >
                                    <PresenceIcon kindKey="group" name="그룹" />
                                </span>
                            )}
                            {axisTotal > 0 && <PlacementBadge placed={placedOf(p)} total={axisTotal} style={{ marginLeft: pGroups.length > 0 ? 0 : "auto" }} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
