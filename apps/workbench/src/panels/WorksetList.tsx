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
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import type { Group } from "../api/groups.js";
import type { DayPresence } from "../lib/presence.js";
import { weekdayOf } from "../lib/date.js";
import { PresenceBadges, PresenceIcon, GroupNamesCard } from "../components/PresenceBadges.js";
import { ScrollRow } from "../components/ControlChrome.js";
import { HoverCard } from "../components/HoverCard.js";
import { GROUP_PLAIN, PIN } from "../styles/palette.js";
import { useGroupAssign } from "../store/groupAssign.js";
import { ROW_H, rowStarts, stickyHeadsOf, stickyStockAt, stockPushOf, type StickyRowKind } from "./worksetSticky.js";

export interface WorksetEntry {
    date: string;
    code: string;
    presence: DayPresence;
    points: ReviewPointKey[];
}

export interface WorksetLens {
    /** 이 (날짜,종목) 아래에 멤버가 있나 — 종목 행 레일의 기준. */
    dayMember: (e: WorksetEntry) => boolean;
    /** 이 타점이 멤버인가 — 타점 행 레일의 기준. */
    pointMember: (p: ReviewPointKey) => boolean;
}

type Row =
    | { kind: "date"; key: string; date: string; count: number }
    | { kind: "stock"; key: string; entry: WorksetEntry }
    | { kind: "point"; key: string; entry: WorksetEntry; point: ReviewPointKey };

/** 고정 높이(px) — 균일해야 가상화가 재지 않고 앉힌다. 행 안 내용은 한 줄로 자른다.
 *  값은 붙는 머리 산술과 **같은 출처**여야 한다(worksetSticky.ROW_H — 어긋나면 띠가 행 경계를 먹는다). */
const DATE_H = ROW_H.date;
const STOCK_H = ROW_H.stock;
const POINT_H = ROW_H.point;

export function WorksetList({ groups, focus, lens, nameOf, pointGroupsOf, pathOf, onPickDay, onPickPoint, jumpTo }: {
    /** 날짜 내림차순 그룹(패널이 접는다) — 여긴 그리기만. */
    groups: readonly { date: string; stocks: readonly WorksetEntry[] }[];
    focus: { code: string; date: string; time: string | null };
    /** null = 렌즈 없음(집합 미선택·전체). */
    lens: WorksetLens | null;
    nameOf: (code: string) => string | null;
    /** 이 **좌표**(종목,날짜,분)에 직접 붙은 그룹 — 하루 그룹은 여기로 들어오지 않는다(낟알 분리). */
    pointGroupsOf: (p: { stockCode: string; date: string; time: string }) => Group[];
    pathOf: (groupName: string) => string;
    onPickDay: (e: WorksetEntry) => void;
    onPickPoint: (p: ReviewPointKey) => void;
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

    // 붙는 머리 산술의 재료 — 행 종류열과 각 행의 시작 offset(둘 다 순수 함수가 소유, worksetSticky).
    const kinds = useMemo<StickyRowKind[]>(() => rows.map((r) => r.kind), [rows]);
    const starts = useMemo(() => rowStarts(kinds), [kinds]);
    const stickyRef = useRef(-1);
    const scrollRef = useRef<HTMLDivElement>(null);
    const virt = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (i) => (rows[i]?.kind === "date" ? DATE_H : rows[i]?.kind === "stock" ? STOCK_H : POINT_H),
        getItemKey: (i) => rows[i]?.key ?? i,
        overscan: 12,
        // 붙는 머리 **두 층** — 날짜(위) + 그 구간의 종목(아래). 종목까지 붙이는 이유: 타점이 수십 개인
        // 날에서 종목 행이 스크롤 밖으로 밀리면 "이 타점들이 누구 것인지"와 **하루 그룹 배지**가 같이
        // 사라진다(타점 행은 하루 그룹을 반복하지 않기로 했다 — 아래 아이콘 주석).
        rangeExtractor: (range) => {
            // 여긴 **후보**만 고른다(그리기 범위에 넣으려고) — 실제로 붙는 종목은 픽셀로 다시 고른다
            // (stickyStockAt, 아래). 픽셀 선택은 늘 이 후보이거나 그보다 뒤(=이미 보이는 행)다.
            const { date: sticky, stock } = stickyHeadsOf(kinds, range.startIndex);
            stickyRef.current = sticky;
            const base = defaultRangeExtractor(range);
            // 순서 고정: 날짜 → 종목. 둘 다 흐름(non-absolute)에 서므로 **DOM 순서가 곧 위아래**다.
            const extra = [sticky, stock].filter((i) => i >= 0 && !base.includes(i));
            return extra.length > 0 ? [...extra, ...base] : base;
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

    // ⚠ **순서가 있다** — getVirtualItems 가 rangeExtractor 를 돌려 stickyRef 를 갱신하므로, 붙는 종목을
    //    픽셀로 다시 고르는 계산은 그 뒤여야 한다(먼저 재면 직전 렌더의 값으로 고른다).
    const items = virt.getVirtualItems();
    const pinnedStockIdx = stickyStockAt(kinds, starts, stickyRef.current, (virt.scrollOffset ?? 0) + ROW_H.date);

    return (
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
                {items.map((v) => {
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
                        const pinned = v.index === pinnedStockIdx;
                        // 다음 머리가 띠 안으로 들어오면 그만큼 밀려 올라간다(안 밀면 띠가 다음 종목 행을 삼킨다).
                        const push = pinned ? stockPushOf(kinds, starts, v.index, virt.scrollOffset ?? 0) : 0;
                        // 렌즈 흐림은 **내용에만** 준다 — 붙은 머리에 opacity 를 주면 배경까지 반투명이 돼
                        // 그 아래를 지나가는 타점 행이 머리 글자 너머로 비친다(안 붙은 행은 종전대로 행째).
                        const dim = lens !== null && !member;
                        const contentDim: CSSProperties | undefined = dim && pinned ? { opacity: 0.38 } : undefined;
                        return (
                            <button key={r.key} data-row={r.key} onClick={() => onPickDay(e)}
                                onContextMenu={(ev) => {
                                    ev.preventDefault();
                                    useGroupAssign.getState().open({ stockCode: e.code, name: nameOf(e.code) ?? undefined, date: e.date }, { x: ev.clientX, y: ev.clientY });
                                }}
                                style={{
                                // 붙을 땐 날짜 머리 **아래**(top=DATE_H)에 앉고, 그 머리보다 낮은 층(zIndex 2)에 선다.
                                ...(pinned
                                    ? { position: "sticky", top: DATE_H, zIndex: 2, height: v.size, transform: push < 0 ? `translateY(${push}px)` : undefined }
                                    : seat),
                                display: "flex", alignItems: "center", gap: 6, textAlign: "left",
                                border: "none", padding: "0 10px", boxSizing: "border-box", cursor: "pointer", font: "inherit", overflow: "hidden",
                                borderLeft: `3px solid ${selected ? "var(--accent-hover)" : "transparent"}`,
                                // 붙은 동안엔 아래 타점 행과 맞닿아 한 덩어리로 읽히므로 경계를 준다.
                                borderBottom: pinned ? "1px solid var(--border-default)" : undefined,
                                background: selected ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                boxShadow: member ? `inset 3px 0 0 ${PIN}` : undefined,
                                opacity: dim && !pinned ? 0.38 : 1,
                            }}>
                                {/* 종목명은 안 줄인다(작업 여부 판단의 1열) — 아이콘이 넘치면 아이콘 영역만 hover 가로 스크롤. */}
                                <span style={{ flexShrink: 0, color: selected ? "#fff" : "var(--text-primary)", fontWeight: selected ? 700 : 600, whiteSpace: "nowrap", ...contentDim }}>
                                    {nameOf(e.code) ?? e.code}
                                </span>
                                <ScrollRow gap={0} style={{ marginLeft: "auto", minWidth: 0, flexShrink: 1, ...contentDim }}>
                                    <PresenceBadges presence={e.presence} mono={selected} />
                                </ScrollRow>
                            </button>
                        );
                    }

                    const p = r.point;
                    const related = r.entry.code === focus.code && r.entry.date === focus.date;
                    // 선택은 계층적 — day 선택(time null)은 그 날의 **모든** 타점을 포함한다(시트의
                    // "하루 선택은 그 차트의 줄 전부 활성" 규칙과 같은 문장). point 선택이면 그 타점만 주선택.
                    const current = related && (focus.time === null || p.time === focus.time);
                    const pMember = lens ? lens.pointMember(p) : false;
                    const pGroups = pointGroupsOf(p);
                    return (
                        <button key={r.key} data-row={r.key} onClick={() => onPickPoint(p)}
                            onContextMenu={(ev) => {
                                ev.preventDefault();
                                useGroupAssign.getState().open({ stockCode: r.entry.code, name: nameOf(r.entry.code) ?? undefined, date: r.entry.date, time: p.time }, { x: ev.clientX, y: ev.clientY });
                            }}
                            style={{
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
                            {/* 그룹은 아이콘만 + hover 색 카드(경로는 카드 안에서) — 작업 여부 화면이라 이름 칩은 소음.
                                배치 배지(n/m)는 뺐다: "어느 축에 안 꽂았나"는 시트의 질문이다(사용자 확정).
                                ⚠ **낟알은 타점**이다(좌표 라벨 group_members_point) — 옛 코드는 이 자리에 그 날의
                                하루 그룹을 그려서, 종목 행이 이미 말한 것을 타점마다 반복하면서 정작 좌표 라벨은
                                한 번도 안 보였다(2026-09-13 교체). **하루 그룹의 층위 상속은 여기 안 그린다**:
                                깔때기 판정엔 살아 있지만 화면에선 위 종목 행(붙는 머리)이 그 몫을 한다.
                                그림·색·개수 표기는 종목 행 배지와 **같은 한 벌** — 어느 낟알인지는 카드 머리가 말한다. */}
                            {pGroups.length > 0 && (
                                <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                                    <HoverCard card={<GroupNamesCard head="이 타점" names={pGroups.map((g) => pathOf(g.name))} />}>
                                        {/* 손잡이는 **다른 이름**을 쓴다 — data-presence-kind 의 값 공간은 존재 지도
                                            레지스트리 키(PRESENCE_KINDS)고, 좌표 라벨은 거기 일부러 안 들어간 종류다
                                            (presence.ts). 나중에 투영이 추가돼 키가 생기면 선택자가 겹친다. */}
                                        <span data-point-group aria-label="타점 그룹" style={{ display: "inline-flex", color: GROUP_PLAIN }}>
                                            <PresenceIcon kindKey="group-day" name="그룹" />
                                        </span>
                                    </HoverCard>
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
