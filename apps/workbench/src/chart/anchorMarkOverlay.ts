// 차트 패널의 앵커 표식 — **배치 계산**(순수) + 차트에 붙이는 훅.
//
// 정규화 패널의 표식(AnchorMarksLayer)과 같은 어휘를 쓰되, x 를 만드는 자가 다르다: 여긴
// lightweight-charts 의 `timeToCoordinate` 다. 공용 재료(레지스트리·표식 목록·계단식 쌓기)는
// lib/anchorMarks.ts, 이 파일은 **이 화면의 자와 자리**만 안다.
//
// ## 두 층으로 갈리는 자리
// 칩(x만 필요·툴팁/클릭 있음)은 SVG 오버레이가 그리고, 드롭선(가격축까지 따라야 함·상호작용 없음)은
// primitive 가 그린다. 계단식 쌓기는 **여기서 한 번** 돌아 두 층이 같은 줄 수를 본다.
//
// ## `xOf === null` 과 "상자 밖"은 다른 사건이다
//   · null = 그 봉이 시리즈에 없다(일봉 2년 창 밖 등) → **표식 자체를 버린다**. x 를 지어내지 않는다.
//   · 상자 밖 = 봉은 있는데 스크롤 밖이다 → ◀▶ 칩으로 "저 밖에 있다"까지만 말한다(드롭선 없음).
// 이 구분이 이 화면의 계약이다 — 합치면 "데이터에 없는 것"과 "지금 안 보이는 것"이 한 덩어리가 된다.
import { useEffect, useMemo, type RefObject } from "react";
import type { IChartApi, Time } from "lightweight-charts";
import { BASELINE_PARAM, IGNORE_CANDLE_PARAM } from "@trade-data-manager/market/domain";
import { HIGH_GAP, MARK_H, MARK_ROW_H, stackMarkRows, type AnchorMark } from "../lib/anchorMarks.js";
import { ANCHOR_LINE_COLOR } from "../lib/chartFrame.js";
import { IGNORED_CANDLE, PRICE_LINE } from "../styles/palette.js";
import type { DropLines, DropLineSpec } from "./dropLine.js";

/**
 * 표식 칩의 색 — **그 표식이 가리키는 선/마커의 색**을 그대로 쓴다(정규화는 "색=주인 항목"인데
 * 차트는 주인이 하나뿐이라 색이 비어 있다). 승자 칩과 하늘색 가로선이 같은 색이라 눈이 둘을 잇는다.
 */
export function markColor(m: AnchorMark): string {
    if (m.param === IGNORE_CANDLE_PARAM) return IGNORED_CANDLE;
    if (m.param === BASELINE_PARAM) return m.solid ? ANCHOR_LINE_COLOR : PRICE_LINE;
    return PRICE_LINE; // 새 param 의 기본값 — 제 색이 필요하면 여기 한 줄
}

/** 칩 한 장의 자리 — x 는 중심, y 는 윗변(둘 다 컨테이너 좌표). */
export interface ChipPlacement {
    mark: AnchorMark;
    x: number;
    y: number;
    color: string;
}

export interface AnchorMarkLayout {
    chips: ChipPlacement[];
    /** 그림 상자 폭(가격 축 제외) — 오른쪽 ▶ 칩이 제 자리를 찾는 데 쓴다. */
    width: number;
    drops: DropLineSpec[];
    /** 창 밖(왼/오른) 표식 — 개수와 툴팁만 진다. `at` 은 눌렀을 때 갈 곳. */
    offLeft: AnchorMark[];
    offRight: AnchorMark[];
}

export interface LayoutArgs {
    marks: readonly AnchorMark[];
    /** 화면 x(px). 그 봉이 시리즈에 없으면 null — 그 표식은 버린다. */
    xOf: (m: AnchorMark) => number | null;
    /** 그 봉의 고가(시리즈 축 단위: 일봉=원, 분봉=%). 캔들 결손이면 null — 드롭선을 안 긋는다. */
    highOf: (m: AnchorMark) => number | null;
    /** 봉 위 기존 마커(등락률·거래대금)가 그 봉에 있나 — 있으면 드롭선 끝을 그만큼 더 띄운다. */
    hasMarkerAt: (m: AnchorMark) => boolean;
    /** primitive 에 넘길 봉 시각. */
    timeOf: (m: AnchorMark) => Time;
    /** 그림 상자 폭(가격 축 제외) — 이 밖은 ◀▶. */
    width: number;
    /** 칩 첫 줄의 y(px) — 분봉은 타점 ▼ 자리를 비켜 내려온다. */
    topPad: number;
    /** 기존 마커 한 장의 세로 예약분(px) — 실측으로 정한 값. */
    markerReserve: number;
}

/** 표식 목록 → 칩 자리 + 드롭선 spec. 화면 상태를 안 보므로 그대로 테스트된다. */
export function layoutAnchorMarks(a: LayoutArgs): AnchorMarkLayout {
    const inView: { item: AnchorMark; x: number }[] = [];
    const offLeft: AnchorMark[] = [];
    const offRight: AnchorMark[] = [];
    for (const m of a.marks) {
        const x = a.xOf(m);
        if (x === null) continue; // 그 봉이 시리즈에 없다 — 결손은 결손
        if (x < 0) offLeft.push(m);
        else if (x > a.width) offRight.push(m);
        else inView.push({ item: m, x });
    }
    const placed = stackMarkRows(inView);
    const chipY = (row: number): number => a.topPad + row * MARK_ROW_H;

    // 봉당 드롭선 하나 — 같은 봉에 표식이 여럿이면(기준+무시) 칩만 쌓이고 선은 하나다.
    // 색·투명도는 그 봉의 **채운 칩**이 있으면 그것을 따른다(없으면 첫 칩) — 후보만의 봉은 선도 흐리다.
    const byBar = new Map<string, { m: AnchorMark; x: number; maxRow: number; solid: boolean }>();
    for (const p of placed) {
        const k = `${p.item.anchorDate}|${p.item.anchorTime ?? ""}`;
        const cur = byBar.get(k);
        if (!cur) {
            byBar.set(k, { m: p.item, x: p.x, maxRow: p.row, solid: p.item.solid });
            continue;
        }
        cur.maxRow = Math.max(cur.maxRow, p.row);
        if (p.item.solid && !cur.solid) {
            cur.solid = true;
            cur.m = p.item; // 색의 주인이 채운 칩으로 넘어간다
        }
    }

    const drops: DropLineSpec[] = [];
    for (const b of byBar.values()) {
        const high = a.highOf(b.m);
        if (high === null) continue; // 고가를 모른다 — 끝점을 지어내지 않는다
        drops.push({
            time: a.timeOf(b.m),
            value: high,
            fromY: chipY(b.maxRow) + MARK_H + 2,
            gap: HIGH_GAP + (a.hasMarkerAt(b.m) ? a.markerReserve : 0),
            color: markColor(b.m),
            opacity: b.solid ? 0.8 : 0.45,
        });
    }

    return {
        chips: placed.map((p) => ({ mark: p.item, x: p.x, y: chipY(p.row), color: markColor(p.item) })),
        width: a.width,
        drops,
        offLeft,
        offRight,
    };
}

/** 기존 마커 한 장의 세로 예약분(px) — 등락률·거래대금 원 칩 + 글자. 실측으로 확정할 값. */
export const MARKER_RESERVE = 16;

/** 칩 첫 줄의 기본 여백(px). 분봉은 타점 ▼(14px)를 비켜 더 내려온다. */
export const CHIP_TOP_PAD = 2;
export const CHIP_TOP_PAD_MINUTE = 18;

/**
 * 배치 계산 + 드롭선 push. 재계산 신호는 `overlayTick`(pan/zoom)과 `gen`(시리즈 재생성) —
 * **gen 을 빠뜨리면** StrictMode 이중 effect·Fast Refresh 뒤 새 primitive 에 spec 이 안 실려
 * 드롭선만 조용히 사라진다(데이터 push 가 겪었던 그 버그와 같은 형태).
 */
export function useAnchorMarkOverlay(args: {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    dropRef: RefObject<DropLines | null>;
    overlayTick: number;
    gen: number;
    marks: readonly AnchorMark[];
    xOf: (m: AnchorMark) => number | null;
    highOf: (m: AnchorMark) => number | null;
    hasMarkerAt: (m: AnchorMark) => boolean;
    timeOf: (m: AnchorMark) => Time;
    topPad: number;
}): AnchorMarkLayout {
    const { chartRef, containerRef, dropRef, overlayTick, gen, marks, xOf, highOf, hasMarkerAt, timeOf, topPad } = args;
    const layout = useMemo<AnchorMarkLayout>(() => {
        void overlayTick; // 위치 재계산 의존(값 자체는 안 쓴다)
        void gen;
        const el = containerRef.current;
        const chart = chartRef.current;
        if (!el || !chart || marks.length === 0) return { chips: [], width: 0, drops: [], offLeft: [], offRight: [] };
        // 그림 상자 = 컨테이너 − 우측 가격 축. 칩이 축 위로 넘어가면 눈금을 가린다.
        const axisW = (() => {
            try {
                return chart.priceScale("right").width();
            } catch {
                return 0;
            }
        })();
        return layoutAnchorMarks({
            marks, xOf, highOf, hasMarkerAt, timeOf, topPad,
            width: Math.max(0, el.clientWidth - axisW),
            markerReserve: MARKER_RESERVE,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overlayTick, gen, marks, xOf, highOf, hasMarkerAt, timeOf, topPad]);

    useEffect(() => {
        dropRef.current?.setLines(layout.drops);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout, gen]);

    return layout;
}
