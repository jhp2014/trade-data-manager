// 작업셋 목록 — 날짜 > 종목 > 타점 3층 트리를 **평탄화해 가상화**한 리스트(ItemRows 와 같은 수법).
//
// 왜 가상화인가: 월 "전체" 시선이 생기면서 최악 케이스가 전 모수(수천 종목 행 + 타점 행)가 됐다.
// 비용은 항목 수가 아니라 DOM 노드 수가 정한다(ItemRows 머리 주석의 명제) — 잘라 그리면 상한이 없다.
// ItemRows 를 안 쓰는 이유: 그 목록은 날짜/시각/종목 3열 계약이고, 여긴 행 종류가 셋(날짜 머리·종목·
// 타점)에 배지·그룹 칩·렌즈까지 실린다 — "패널만의 것은 그 패널의 규칙"(ItemRows 머리 주석)이라
// 검증된 수법(고정 높이·scrollToIndex)만 가져온다 — 붙는 머리는 거기서 안 베낀다(바로 아래).
//
// 붙는 머리(날짜·종목)는 **띠 층 하나**가 그린다 — 자리(어디 앉나)와 생김새(어떻게 생겼나)를 가른 것.
// 같은 행을 "누울 때 / 붙을 때" 두 벌 스타일로 그리면 한쪽만 바뀌는 어긋남이 조용히 생긴다: 실제로
// 종목 행은 `<button>` 이라 흐름에 서는 순간 auto 폭이 **fit-content** 로 계산돼(폼컨트롤 퀴크) 붙을
// 때만 폭이 줄었다 — seat 의 width:100% 가 그걸 가리고 있었을 뿐이다. 이제 붙든 눕든 자리는 절대배치
// 한 가지고, `pinned` 는 **의도된 차이**(경계선·흐림 주는 곳)에만 쓴다.
//
// 렌즈(집합): 멤버 행 = 좌측 보라 레일(PIN — 작업셋 의미색), 비멤버 = 흐리게(클릭은 산다).
// 종목 행은 **그 날 밑에 멤버 타점이 하나라도 있으면** 멤버다 — 부모가 자식 멤버십을 대표해야
// 훑기가 성립한다(멤버 타점 하나 있는 날이 흐리면 "이 날에 멤버가 있다"가 안 보인다).
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import type { Group } from "../api/groups.js";
import { weekdayOf } from "../lib/date.js";
import { PresenceBadges, PresenceIcon, GroupNamesCard } from "../components/PresenceBadges.js";
import { ScrollRow } from "../components/ControlChrome.js";
import { HoverCard } from "../components/HoverCard.js";
import { GROUP_PLAIN, PIN, groupColor } from "../styles/palette.js";
import { useGroupAssign } from "../store/groupAssign.js";
import { ROW_H, bandHOf, indexAt, rowStarts, stickyDateOf, stickyStockAt, stockPushOf, type StickyRowKind } from "./worksetSticky.js";
import { MarkDiamond } from "../chart/markerGlyphs.js";
import type { WorksetRow } from "./workset/rows.js";

export type { WorksetEntry } from "./workset/rows.js";
import type { WorksetEntry } from "./workset/rows.js";

export interface WorksetLens {
    /** 이 (날짜,종목) 아래에 멤버가 있나 — 종목 행 레일의 기준. */
    dayMember: (e: WorksetEntry) => boolean;
    /** 이 타점이 멤버인가 — 타점 행 레일의 기준. */
    pointMember: (p: ReviewPointKey) => boolean;
}

type Row = WorksetRow;

/** 고정 높이(px) — 균일해야 가상화가 재지 않고 앉힌다. 행 안 내용은 한 줄로 자른다.
 *  값은 붙는 머리 산술과 **같은 출처**여야 한다(worksetSticky.ROW_H — 어긋나면 띠가 행 경계를 먹는다). */
const DATE_H = ROW_H.date;
const STOCK_H = ROW_H.stock;

/** 하루 두 종류를 **같은 높이의 종단 짝**으로 접는다 — 붙는 머리 산술이 한 벌로 남는 이유. */
const stickyKindOf = (r: Row): StickyRowKind =>
    r.kind === "dayStock" ? "stock" : r.kind === "dayCell" ? "point" : r.kind;

export function WorksetList({ rows, focus, lens, nameOf, pointGroupsOf, pathOf, onPickDay, onPickPoint, onPickCell, onToggleCollapse, jumpTo }: {
    /**
     * 평탄화된 행들(빌드는 `workset/rows.ts` 순수 함수) — 여긴 그리기만.
     * **순회도 이 배열에서 나온다**(walkableOf) — 두 벌이면 접힘이 반영 안 된 유령 행을 밟는다.
     */
    rows: readonly Row[];
    focus: { code: string; date: string; time: string | null };
    /** null = 렌즈 없음(집합 미선택·전체). */
    lens: WorksetLens | null;
    nameOf: (code: string) => string | null;
    /** 이 **좌표**(종목,날짜,분)에 직접 붙은 그룹 — 하루 그룹은 여기로 들어오지 않는다(낟알 분리). */
    pointGroupsOf: (p: { stockCode: string; date: string; time: string }) => Group[];
    pathOf: (groupName: string) => string;
    onPickDay: (e: WorksetEntry) => void;
    onPickPoint: (p: ReviewPointKey) => void;
    /** 하루 우주의 좌표 클릭 — 시선 이동(좌클릭=시선 채널 그대로). */
    onPickCell?: (code: string, date: string, time: string) => void;
    /** 종목 머리 접기/펴기 — 접힘은 패널이 소유한다(빌더가 자식 행을 안 만드는 그 집합). */
    onToggleCollapse?: (code: string) => void;
    /** 찾아가기 — nonce 가 바뀔 때만 그 (날짜,종목)으로(없으면 같은 종목의 아무 날짜로). ItemRows.jumpTo 선례. */
    jumpTo?: { date: string; code: string; nonce: number };
}): JSX.Element {
    // 붙는 머리 산술의 재료 — 행 종류열과 각 행의 시작 offset(둘 다 순수 함수가 소유, worksetSticky).
    // 하루 우주의 두 종류는 **높이가 같은** 종단 짝으로 접어 넣는다(dayStock↔stock 24 · dayCell↔point 22)
    // — 산술이 보는 건 높이와 "머리인가"뿐이라, 접어 넣으면 띠·밀어올리기 코드가 한 벌로 남는다.
    const kinds = useMemo<StickyRowKind[]>(() => rows.map((r) => stickyKindOf(r)), [rows]);
    const hasDateHead = useMemo(() => rows.some((r) => r.kind === "date"), [rows]);
    const bandH = bandHOf(hasDateHead);
    const starts = useMemo(() => rowStarts(kinds), [kinds]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const virt = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (i) => {
            const k = rows[i] ? stickyKindOf(rows[i]!) : "point";
            return ROW_H[k]; // ⚠ 가상화기와 붙는 머리 산술이 **같은 수**를 봐야 한다(지역 상수 금지)
        },
        getItemKey: (i) => rows[i]?.key ?? i,
        overscan: 12,
        // rangeExtractor 없음 — 붙는 머리는 가상 범위에 끼워 넣는 게 아니라 **띠 층이 rows 에서 직접**
        // 그린다(아래). 그 층이 그리는 행은 이 목록에서 빼므로 한 행은 여전히 DOM 에 하나다.
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

    const items = virt.getVirtualItems();
    const scrollOffset = virt.scrollOffset ?? 0;
    // 붙는 머리 둘 — 날짜(위) + 그 구간의 종목(아래). 종목까지 붙이는 이유: 타점이 수십 개인 날에서
    // 종목 행이 스크롤 밖으로 밀리면 "이 타점들이 누구 것인지"와 **하루 그룹 배지**가 같이 사라진다
    // (타점 행은 하루 그룹을 반복하지 않기로 했다 — 아래 아이콘 주석).
    const pinnedDateIdx = stickyDateOf(kinds, indexAt(starts, scrollOffset));
    const pinnedStockIdx = stickyStockAt(kinds, starts, pinnedDateIdx, scrollOffset + (hasDateHead ? ROW_H.date : 0));
    const pinnedDate = pinnedDateIdx >= 0 ? rows[pinnedDateIdx] : undefined;
    const pinnedStock = pinnedStockIdx >= 0 ? rows[pinnedStockIdx] : undefined;
    // 다음 머리가 띠 안으로 들어오면 그만큼 밀려 올라간다(안 밀면 띠가 다음 종목 행을 삼킨다).
    const stockPush = stockPushOf(kinds, starts, pinnedStockIdx, scrollOffset, bandH);

    /** 행의 **자리** — 붙든 눕든 절대배치 한 가지다(폭·높이가 모드에 따라 안 갈린다). */
    const seatAt = (top: number, h: number): CSSProperties => ({
        position: "absolute", top: 0, left: 0, width: "100%", height: h, transform: `translateY(${top}px)`,
    });

    const dateHead = (r: Extract<Row, { kind: "date" }>, seat: CSSProperties): JSX.Element => (
        <div key={r.key} data-divider={r.date} style={{
            ...seat,
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

    const stockRow = (r: Extract<Row, { kind: "stock" }>, seat: CSSProperties, pinned: boolean): JSX.Element => {
        const e = r.entry;
        const selected = e.code === focus.code && e.date === focus.date;
        const member = lens ? lens.dayMember(e) : false;
        // 렌즈 흐림은 붙었을 땐 **내용에만** 준다 — 붙은 머리에 opacity 를 주면 배경까지 반투명이 돼
        // 그 아래를 지나가는 타점 행이 머리 글자 너머로 비친다(안 붙은 행은 종전대로 행째).
        const dim = lens !== null && !member;
        const contentDim: CSSProperties | undefined = dim && pinned ? { opacity: 0.38 } : undefined;
        return (
            // 선택을 제 손으로 칠하는 행이라 포커스 링은 끈다(row-self-marked, theme.css) — 안 끄면
            // 클릭으로 잡힌 포커스가 남아 있다가 w/s 로 옮겨간 뒤에도 그 행에 테두리가 켜진다.
            <button key={r.key} data-row={r.key} className="row-self-marked" onClick={() => onPickDay(e)}
                onContextMenu={(ev) => {
                    ev.preventDefault();
                    useGroupAssign.getState().open({ stockCode: e.code, name: nameOf(e.code) ?? undefined, date: e.date }, { x: ev.clientX, y: ev.clientY });
                }}
                style={{
                ...seat,
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
    };

    const pointRow = (r: Extract<Row, { kind: "point" }>, seat: CSSProperties): JSX.Element => {
        const p = r.point;
        const related = r.entry.code === focus.code && r.entry.date === focus.date;
        // 선택은 계층적 — day 선택(time null)은 그 날의 **모든** 타점을 포함한다(시트의
        // "하루 선택은 그 차트의 줄 전부 활성" 규칙과 같은 문장). point 선택이면 그 타점만 주선택.
        const current = related && (focus.time === null || p.time === focus.time);
        const pMember = lens ? lens.pointMember(p) : false;
        const pGroups = pointGroupsOf(p);
        return (
            <button key={r.key} data-row={r.key} className="row-self-marked" onClick={() => onPickPoint(p)}
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
    };

    /** 하루 종목 머리 — 접기 손잡이 + 이름 + ◇·◆ 수. 날짜가 상수라 이게 유일한 머리다. */
    const dayStockRow = (r: Extract<Row, { kind: "dayStock" }>, seat: CSSProperties, pinned: boolean): JSX.Element => {
        const selected = r.code === focus.code;
        return (
            <div key={r.key} data-row={r.key} style={{
                ...seat,
                display: "flex", alignItems: "center", gap: 6, padding: "0 10px", boxSizing: "border-box",
                background: "var(--bg-tertiary)", overflow: "hidden",
                borderLeft: `3px solid ${selected ? "var(--accent-hover)" : "transparent"}`,
                borderBottom: pinned ? "1px solid var(--border-default)" : undefined,
            }}>
                <button onClick={() => onToggleCollapse?.(r.code)} className="row-self-marked"
                    title={r.collapsed ? "펴기 — 이 종목의 좌표가 다시 서고 순회에도 든다" : "접기 — 자식 행이 사라지고 w/s 순회에서도 빠진다"}
                    style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 11, color: "var(--text-tertiary)", padding: 0, width: 12 }}>
                    {r.collapsed ? "▸" : "▾"}
                </button>
                <span style={{ flexShrink: 0, fontWeight: 600, whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                    {nameOf(r.code) ?? r.code}
                </span>
                <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    {r.labels > 0 && <span className="tabular" style={{ color: PIN }} title="이 종목의 라벨 좌표 수">◆ {r.labels}</span>}
                    <span className="tabular" title="조건이 뽑은 좌표 수">◇ {r.hits}</span>
                </span>
            </div>
        );
    };

    /** 하루 좌표 한 줄 — 표식 두 칸(◇ 후보 / ◆ 라벨)이 셋을 말한다. */
    const dayCellRow = (r: Extract<Row, { kind: "dayCell" }>, seat: CSSProperties): JSX.Element => {
        const c = r.cell;
        // 좌표 행은 **시각이 맞아야** 현재다 — `time === null`(하루 선택)을 참으로 치면 그 종목의
        // 좌표 다섯 줄이 전부 칠해져 w/s 커서가 화면에서 안 읽힌다(종단 종목 행의 규칙을 잘못 따라온 자리).
        const current = c.code === focus.code && r.date === focus.date && focus.time === c.time;
        const pGroups = pointGroupsOf({ stockCode: c.code, date: r.date, time: c.time });
        return (
            <button key={r.key} data-row={r.key} className="row-self-marked"
                onClick={() => onPickCell?.(c.code, r.date, c.time)}
                onContextMenu={(ev) => {
                    ev.preventDefault();
                    useGroupAssign.getState().open({ stockCode: c.code, name: nameOf(c.code) ?? undefined, date: r.date, time: c.time }, { x: ev.clientX, y: ev.clientY });
                }}
                title="좌클릭 = 시선 이동 · 우클릭 = 그룹 배정(좌표 라벨)"
                style={{
                    ...seat, display: "flex", alignItems: "center", gap: 6, textAlign: "left",
                    border: "none", borderBottom: "1px solid var(--border-subtle)", padding: "0 10px 0 22px", boxSizing: "border-box",
                    cursor: "pointer", font: "inherit", overflow: "hidden",
                    borderLeft: `3px solid ${current ? "var(--accent-primary)" : "transparent"}`,
                    background: current ? "var(--bg-active)" : "transparent",
                }}>
                {/* 표식 두 칸 — 차트의 두 줄을 가로로 옮긴 것(같은 글리프·같은 크기). 셋이 칸 조합으로 갈린다. */}
                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, width: 22 }}>
                    <span style={{ width: 9, display: "inline-flex", justifyContent: "center" }}>
                        {c.hit !== null && <MarkDiamond filled={false} />}
                    </span>
                    <span style={{ width: 9, display: "inline-flex", justifyContent: "center" }}>
                        {c.labeled && <MarkDiamond filled color={pGroups[0] ? groupColor(pGroups[0].name) : PIN} />}
                    </span>
                </span>
                <span className="tabular" style={{ flexShrink: 0, width: 40, fontSize: 12, color: current ? "var(--accent-primary)" : "var(--text-secondary)", fontWeight: current ? 700 : 400 }}>
                    {c.time.slice(0, 5)}
                </span>
                <span className="tabular" style={{ flexShrink: 0, width: 50, textAlign: "right", fontSize: 11.5, color: (c.hit?.ratePct ?? 0) >= 0 ? "var(--rise)" : "var(--fall)" }}>
                    {c.hit?.ratePct !== null && c.hit?.ratePct !== undefined ? `${c.hit.ratePct.toFixed(1)}%` : "—"}
                </span>
                {pGroups.length > 0 && (
                    <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <HoverCard card={<GroupNamesCard head="이 좌표" names={pGroups.map((g) => pathOf(g.name))} />}>
                            <span data-point-group aria-label="타점 그룹" style={{ display: "inline-flex", color: GROUP_PLAIN }}>
                                <PresenceIcon kindKey="group-day" name="그룹" />
                            </span>
                        </HoverCard>
                    </span>
                )}
            </button>
        );
    };

    return (
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
                {/* 붙는 띠 — 흐름에 선 **높이 0 래퍼 하나**(자리를 안 먹으니 총 높이 계산에 안 낀다).
                    안의 두 행은 목록과 같은 절대배치 자리에 앉고, 여기 것은 **뷰포트 기준**이라 날짜는 0,
                    종목은 24(+밀어올리기)다. 밀려 올라간 종목 머리는 날짜 머리 **밑**으로 들어가야 하므로
                    위아래는 **z 값으로 박는다** — DOM 순서에 맡기면 두 줄 순서를 바꾸는 것만으로 뒤집히고,
                    그 증상은 밀어올리는 동안에만 보여서 조용히 지나간다. */}
                <div style={{ position: "sticky", top: 0, zIndex: 3, height: 0 }}>
                    {pinnedDate?.kind === "date" && dateHead(pinnedDate, { ...seatAt(0, DATE_H), zIndex: 1 })}
                    {pinnedStock?.kind === "stock" && stockRow(pinnedStock, { ...seatAt(DATE_H + stockPush, STOCK_H), zIndex: 0 }, true)}
                    {pinnedStock?.kind === "dayStock" && dayStockRow(pinnedStock, { ...seatAt(stockPush, STOCK_H), zIndex: 0 }, true)}
                </div>
                {items.map((v) => {
                    if (v.index === pinnedDateIdx || v.index === pinnedStockIdx) return null; // 띠가 이미 그렸다
                    const r = rows[v.index]!;
                    const seat = seatAt(v.start, v.size);
                    if (r.kind === "date") return dateHead(r, seat);
                    if (r.kind === "stock") return stockRow(r, seat, false);
                    if (r.kind === "dayStock") return dayStockRow(r, seat, false);
                    if (r.kind === "dayCell") return dayCellRow(r, seat);
                    return pointRow(r, seat);
                })}
            </div>
        </div>
    );
}
