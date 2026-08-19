// (종목·날짜·시각) 목록 — 깔때기 결과 목록과 집합 사이드바가 글자 단위로 같은 것을 쓴다.
//
// 규칙 둘은 여기 산다(둘 다 결과 목록에서 검증된 것):
// ① **같은 (날짜·종목)은 한 덩어리로.** 타점 해상도에서는 한 차트가 여러 줄이 되는데, 날짜와 이름이
//    매 줄 반복되면 몇 개의 차트를 보고 있는지가 안 읽힌다. 첫 줄에만 쓰고 왼쪽 세로선으로 묶는다.
// ② **줄 클릭은 그 항목으로 이동.** time 이 있으면 타점, 없으면 하루(타점 없는 하루도 선택이다).
//
// ## 왜 `<table>` 이 아닌가 · 왜 가상화인가
// 비용은 항목 수가 아니라 **DOM 노드 수**가 정한다(골격 패널에서 배운 것과 같은 명제). 1,000행 ×
// 4열이면 이미 4천 노드고, 그래서 예전엔 달을 페이지로 잘라 `MAX_ROWS` 로 막고 있었다. 가상화는
// 보이는 구간만 그려 그 상한 자체를 없앤다.
//
// 그래서 표를 걷었다: 어떤 가상화든 잘라낸 줄을 `transform: translateY` 로 앉히는데 `<tr>` 은 그걸
// 제대로 못 받는다. 열 폭은 어차피 `tableLayout:fixed` 로 손이 정하고 있었으므로 grid 로 옮기는
// 값은 거의 0이었다.
//
// 스크롤 상자를 **이 컴포넌트가 소유한다** — 가상화기는 스크롤 원소가 있어야 하고, 그걸 바깥에서
// 빌리면 여러 목록이 한 상자를 공유할 때 오프셋 보정이 필요해진다. 대신 구분줄(`divider`)을 같은
// 배열에 섞어 "표현 안 됨" 같은 머리를 목록 **안에서** 그린다.
//
// 달 페이지·"찾아가기" 고정 줄처럼 **결과 목록만의 것**은 여기 없다 — 그건 그 패널의 규칙이지
// 이 목록의 규칙이 아니다.
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { shortDate } from "../lib/date.js";
import { flattenRows, type FlatRow } from "../panels/filter/resultRows.js";
import { ACTIVE, ACTIVE_SOFT, FAIL } from "../styles/palette.js";

export interface RowItem {
    stockCode: string;
    date: string;
    time?: string;
}

/** 목록 한 토막 — 머리(label)가 있으면 구분줄이 먼저 서고, 그 아래로 항목들이 붙는다. */
export interface ItemSection {
    /** 이 토막의 머리. 없으면 구분줄 없이 항목만(단일 목록의 기본형). */
    label?: string;
    /** 머리를 경고 결로(결손 목록). */
    warn?: boolean;
    /** **정렬된** 항목들 — 묶기가 "같은 차트는 붙어 있다"를 가정한다(resultRows 머리 주석). */
    items: readonly RowItem[];
    /** 구분줄에 붙일 툴팁. */
    title?: string;
}

/** 줄 높이(px) — 균일해야 가상화가 재지 않고 앉힌다. padding 3px 두 번 + 글자 한 줄. */
const ROW_H = 20;
const DIVIDER_H = 22;
/** 열 머리 높이 — 붙는 구분줄이 그 **아래**에 서야 하므로 값이 필요하다(둘 다 top 고정이라). */
const HEAD_H = 18;

export function ItemRows({ sections, showTime, nameOf, isActive, onPick, extra, jumpTo }: {
    sections: readonly ItemSection[];
    /** 시각 열을 그릴까 — 타점 해상도일 때만. */
    showTime: boolean;
    nameOf: (code: string) => string;
    isActive?: (it: RowItem) => boolean;
    onPick: (it: RowItem) => void;
    /** 패널 고유의 마지막 열(결과 목록의 "막은 필터"). 없으면 안 그린다. */
    extra?: { header: string; width: number; render: (it: RowItem) => ReactNode };
    /**
     * 선택 줄로 스크롤 — 가상화라 안 그려진 줄에는 ref 를 못 건다(그게 예전 방식이었다). 대신
     * **`isActive` 로 찾아** 인덱스로 옮긴다: 어느 줄이 선택인지 판정하는 잣대가 두 벌이 되면
     * 강조된 줄과 옮겨 간 줄이 언젠가 어긋난다(하루 선택은 그 차트의 줄 **전부**가 활성이다).
     * `nonce` 가 바뀔 때만 움직인다 — 같은 선택이어도 "찾아가기"를 다시 누르면 가야 하고, 반대로
     * 스크롤을 손으로 옮긴 뒤 재렌더가 났다고 끌려가면 안 된다.
     */
    jumpTo?: { nonce: number };
}): JSX.Element {
    // 한 배열로 편다 — 구분줄과 항목이 섞인 채 한 벌이라야 가상화가 자리를 계산한다.
    const rows = useMemo<FlatRow<RowItem>[]>(() => {
        const out: FlatRow<RowItem>[] = [];
        for (const s of sections) {
            if (s.items.length === 0) continue;
            if (s.label !== undefined) out.push({ kind: "divider", key: `@${s.label}`, label: s.label, ...(s.warn === true ? { warn: true } : null) });
            out.push(...flattenRows(s.items));
        }
        return out;
    }, [sections]);

    /** 구분줄의 인덱스들 — 붙는 머리를 고를 때 쓴다(오름차순). */
    const dividerIdx = useMemo(() => rows.flatMap((r, i) => (r.kind === "divider" ? [i] : [])), [rows]);
    /** 지금 화면 맨 위가 어느 토막 안인가 — 그 토막의 구분줄이 위에 붙는다. */
    const stickyRef = useRef(-1);

    const scrollRef = useRef<HTMLDivElement>(null);
    const virt = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (i) => (rows[i]?.kind === "divider" ? DIVIDER_H : ROW_H),
        getItemKey: (i) => rows[i]?.key ?? i,
        overscan: 12,
        /**
         * 붙는 구분줄 — 지금 토막의 머리를 **범위 밖이어도 늘 그린다**. 안 그러면 달 하나가 화면보다
         * 길어지는 순간 "지금 몇 월을 보고 있나"가 사라진다(여러 달을 한 목록에 이어 놓은 이상 그건
         * 목록의 뜻 자체다). 그리는 자리는 아래에서 갈린다: 이 하나만 sticky 로 위에 앉고 나머지는
         * 제자리에 눕는다.
         */
        rangeExtractor: (range) => {
            let sticky = -1;
            for (const i of dividerIdx) {
                if (i <= range.startIndex) sticky = i;
                else break;
            }
            stickyRef.current = sticky;
            const base = defaultRangeExtractor(range);
            return sticky >= 0 && !base.includes(sticky) ? [sticky, ...base] : base;
        },
    });

    // 찾아가기 — 활성 줄의 인덱스를 찾아 가운데로. 없으면 아무것도 안 한다(달이 다르거나 집합 밖).
    const lastJump = useRef(-1);
    useEffect(() => {
        if (!jumpTo || jumpTo.nonce === lastJump.current || !isActive) return;
        lastJump.current = jumpTo.nonce;
        const i = rows.findIndex((r) => r.kind === "item" && isActive(r.item));
        // ⚠ 즉시 이동이다(smooth 아님). 부드러운 이동은 **도착을 보장하지 않는다**: 페이지가 그리지
        // 않는 상태(백그라운드 탭·안 보이는 패널)면 애니메이션이 아예 안 돌아 조용히 제자리에 남고,
        // 가상 목록은 그 사이 구간을 다시 계산할 근거도 없다. "찾아가기"는 도달이 전부인 손잡이라
        // 연출보다 도착이 먼저다 — 800줄을 훑는 연출이 딱히 읽히지도 않는다.
        if (i >= 0) virt.scrollToIndex(i, { align: "center" });
    }, [jumpTo, rows, virt, isActive]);

    // 목록 내용이 통째로 갈리면(달 바꾸기·필터 편집) 맨 위로 — 남은 스크롤 위치는 새 목록에서
    // 아무 뜻이 없고, 빈 화면처럼 보이는 자리에 떨어지기 쉽다.
    //
    // ⚠ **가상화기의 API 로 옮긴다**(`el.scrollTop = 0` 아님). DOM 에 직접 쓰면 스크롤 이벤트가 안 나
    // 가상화기가 그 사실을 **못 배운다** — 스크롤바는 맨 위인데 목록은 아까 보던 중간을 그리는 어긋남이
    // 그대로 남는다(실제로 그렇게 났다). 화면에 보이는 창은 DOM 이 아니라 가상화기의 오프셋이 정한다.
    const firstKey = rows[0]?.key;
    useLayoutEffect(() => { virt.scrollToOffset(0); }, [firstKey, virt]);

    const cols = gridCols(showTime, extra?.width);
    return (
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
            {/* 열 머리 — 스크롤 상자 안 상단 고정. 목록이 길어지면 무엇의 열인지 잊는다. */}
            <div style={{
                position: "sticky", top: 0, zIndex: 3, height: HEAD_H, display: "grid", gridTemplateColumns: cols,
                background: "var(--bg-primary)", color: "var(--text-tertiary)", fontSize: 10.5,
            }}>
                <span style={{ padding: "3px 10px" }}>날짜</span>
                {showTime && <span style={{ padding: "3px 0" }}>시각</span>}
                <span style={{ padding: "3px 0" }}>종목</span>
                {extra && <span style={{ padding: "3px 0" }}>{extra.header}</span>}
            </div>

            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
                {virt.getVirtualItems().map((v) => {
                    const r = rows[v.index]!;
                    const seat: CSSProperties = {
                        position: "absolute", top: 0, left: 0, width: "100%", height: v.size,
                        transform: `translateY(${v.start}px)`,
                    };
                    if (r.kind === "divider") {
                        // 지금 토막의 머리만 위에 붙는다 — 흐름에서 빼서 sticky 로 앉히고(그래서 transform
                        // 을 안 준다), 나머지 구분줄은 제자리에 누워 스크롤과 함께 지나간다.
                        const pinned = v.index === stickyRef.current;
                        return (
                            <div key={r.key} data-divider={r.label} style={{
                                ...(pinned
                                    ? { position: "sticky", top: HEAD_H, zIndex: 2, height: v.size }
                                    : seat),
                                display: "flex", alignItems: "flex-end",
                                padding: "0 10px 2px", fontSize: 10, fontWeight: 700,
                                color: r.warn === true ? FAIL : "var(--text-tertiary)",
                                background: "var(--bg-primary)",
                            }}>
                                {r.label}
                            </div>
                        );
                    }
                    const it = r.item;
                    const active = isActive?.(it) ?? false;
                    return (
                        <div key={r.key} data-row={r.key} onClick={() => onPick(it)}
                            style={{
                                ...seat, display: "grid", gridTemplateColumns: cols, alignItems: "center",
                                // 덩어리 안쪽 줄은 위 선을 없애 한 블록으로 보이게 한다.
                                borderTop: r.first ? "1px solid var(--border-subtle)" : "none",
                                background: active ? ACTIVE_SOFT : "transparent",
                                cursor: "pointer",
                            }}>
                            <span style={{
                                padding: "0 10px", color: "var(--text-secondary)",
                                borderLeft: active ? `2px solid ${ACTIVE}` : r.tied ? "2px solid var(--border-default)" : "2px solid transparent",
                            }}>
                                {r.first ? shortDate(it.date) : ""}
                            </span>
                            {showTime && (
                                <span style={{ color: active ? ACTIVE : "var(--accent-primary)", fontWeight: active ? 700 : 400 }}>
                                    {it.time?.slice(0, 5) ?? "—"}
                                </span>
                            )}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 700 : 400 }}>
                                {r.first ? nameOf(it.stockCode) : ""}
                            </span>
                            {extra && (
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {extra.render(it)}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** 열 폭 — 표의 `tableLayout:fixed` + `<col>` 이 하던 일. 머리와 줄이 **같은 값**을 써야 어긋나지 않는다. */
const gridCols = (showTime: boolean, extraW?: number): string =>
    ["74px", showTime ? "52px" : null, "minmax(0,1fr)", extraW !== undefined ? `${extraW}px` : null]
        .filter((c) => c !== null).join(" ");
