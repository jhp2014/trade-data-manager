// 테마 오버레이의 **상태와 계산** — "내 종목이 꺾인 그 순간들에 테마는 어디 있었나".
//
// ## 좌표 이사 — 절대 공간을 통째로 평행이동한다(사용자 확정)
// themeLines 는 절대 공간(x=벽시계 분, y=전일 종가 대비 %)을 내고, 여기서 앵커 타점의 (t₀, r_앵커(t₀))를
// 빼서 뷰 공간에 놓는다. 멤버를 각자 자기 값으로 재기저하지 **않는다** — 타점 시각의 앵커 대비 %p 간격이
// 그대로 보존돼야 "내 종목 기준 테마가 어디에 있나"가 읽힌다. 절대값 복원도 상수 하나(+t₀ / +baseRate)다.
//
// ## 멤버 자격과 그리는 범위는 **다른 창**이다(사용자 확정)
//  · 자격(누가 그려지나) = **타점 앞뒤 기본 창** — 14시 타점인데 09시에 떴던 종목까지 들면
//    "그때 같이 움직인 무리"라는 뜻이 흐려진다.
//  · 그리는 범위 = **하루 전체(장 마감까지)** — 뽑힌 멤버는 끝까지 보여야 미래 동조가 읽힌다.
//    (초기 창으로 자르면 확대·이동해도 그 밖은 영영 빈 선이다 — 캔들과 같은 이유.)
//
// ## 테마 모드 — 한 화면에 두 질문을 겹치지 않는다(사용자 확정)
// 테마 선(무채색 얇은 선 30개)과 다른 타점의 골격선(역시 무채색 얇은 선 수십~수백)이 같이 깔리면
// 어느 게 어느 쪽인지 눈으로 안 갈린다 — 색을 더 벌려도 겹치는 순간 같은 문제라 **구조로 푼다**.
// 그 규칙(`lineShown`·`swapped`)이 골격선 층의 렌더를 좌우하므로 여기서 내보낸다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { minuteOfDayOf, selectHotUniverse } from "@trade-data-manager/market/domain";
import type { DayReplay } from "@trade-data-manager/wire";
import { seriesColor } from "../../styles/palette.js";
import { amountLevelOf, type AmountLookup } from "./amountLayer.js";
import { POINT_FRAME, type PointLine } from "./overlay.js";
import { amountRuns, type AmountRun } from "../canvas/amountRuns.js";
import { hotCodesInRange, themeLines, type ThemeLine } from "./themeSkeleton.js";

/** 뷰 공간으로 옮겨진 테마 선 한 벌 + 절대값 복원 상수. */
export interface ThemeOverlay {
    /** 앵커 타점의 키 — 이게 바뀌면 호버·뱃지를 접는다. */
    key: string;
    /** 원점 시각(벽시계 분) — x + t₀ 가 벽시계를 되찾는다. */
    t0: number;
    /** 원점 등락률 — y + baseRate 가 전일比 %를 되찾는다. */
    baseRate: number;
    lines: ThemeLine[];
}

/** 거터에 세운 이름 하나 — `labelY` 는 세로로 벌린 뒤의 자리, `anchorY` 는 선이 실제로 있는 높이. */
export interface ThemeView {
    /** 펼쳐진 테마(없으면 null). */
    overlay: ThemeOverlay | null;
    /** 테마가 펼쳐진 상태인가 — 골격선 층의 표시 규칙이 갈린다. */
    mode: boolean;
    /**
     * 지금 **다른 골격선**을 보고 있나 — 그러면 테마를 접는다(뱃지 무리를 켠 것도 같은 뜻).
     * 손을 떼면 즉시 되돌아온다.
     */
    swapped: boolean;
    /** 테마 모드에서 이 골격선을 그리나 — 선택선·짚은 것·뱃지 무리만. */
    lineShown: (key: string) => boolean;
    /** 종목 → 고정 색. **선이 아니라 라벨의 점에만** 쓴다(선을 칠하면 30선이 무지개가 된다). */
    colorOf: (code: string) => string;
    /** 종목 → 분당 색 런(굵기). 전부 미리 굽는다 — 테마 전체의 자금 유입 타이밍이 한 화면에 깔린다. */
    runs: ReadonlyMap<string, AmountRun[]> | null;
    /** 손이 올라간 선(들) — 뭉친 뱃지면 그 무리 전부. */
    hovered: ReadonlySet<string> | null;
    setHovered: (codes: readonly string[] | null) => void;
    /** 이름을 못 단 종목 목록(뱃지 클릭). */
    badge: { x: number; y: number; members: string[] } | null;
    openBadge: (at: { x: number; y: number }, members: string[]) => void;
    closeBadge: () => void;
}

export interface UseThemeOverlayArgs {
    enabled: boolean;
    /** 테마를 펼칠 대상 — 짚은 타점 하나. 없으면 안 펼친다. */
    target: PointLine | null;
    snapshot: DayReplay | undefined;
    /** 보드 hot 판정의 상한(거래대금·등락률 top-N) — 화면에서 보던 것과 같은 무리가 나오게 보드 규칙을 그대로 쓴다. */
    hot: { amountN: number; rateN: number };
    lookup: AmountLookup;
    /** 굵기를 켰나 — 선 굵기 채널의 스위치. */
    amountWidthOn: boolean;
    /** 값 라벨을 켰나 — 라벨의 재료도 같은 런이라, 굵기가 꺼져 있어도 이게 켜져 있으면 굽는다(앵커 쪽 amountTarget 과 같은 규칙). */
    amountLabelsOn: boolean;
    /** 지금 짚은 골격선(테마 접기 판정). */
    hoveredLine: string | null;
    /** 단일 선택된 골격선 키. */
    singleKey: string | null;
    /** 뭉친 라벨로 켠 무리(있으면 테마를 접는다). */
    groupSet: ReadonlySet<string> | null;
}

export function useThemeOverlay(args: UseThemeOverlayArgs): ThemeView {
    const { enabled, target, snapshot, hot, lookup, amountWidthOn, amountLabelsOn, hoveredLine, singleKey, groupSet } = args;

    const [hoveredCodes, setHoveredCodes] = useState<readonly string[] | null>(null);
    const [badge, setBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);

    const overlay = useMemo<ThemeOverlay | null>(() => {
        if (!enabled || !target || !snapshot) return null;
        const src = snapshot.stocks;
        const t0 = target.baseT;
        const baseRate = target.baseRate;
        const hotFrom = Math.max(0, t0 - POINT_FRAME.back);
        const hotTo = t0 + POINT_FRAME.forward;
        const hotCodes = hotCodesInRange(src, hotFrom, hotTo, minuteOfDayOf, (snaps) => selectHotUniverse(snaps, hot.amountN, hot.rateN));
        const lines = themeLines(target, src, hotCodes, minuteOfDayOf, { from: 0, to: 1439 })
            .map((l) => ({ ...l, points: l.points.map((p) => ({ x: p.x - t0, y: p.y - baseRate })) }));
        return { key: target.key, t0, baseRate, lines };
    }, [enabled, target, snapshot, hot.amountN, hot.rateN]);

    // 대상이 바뀌면 호버·뱃지를 접는다 — 다른 날의 무리라 그대로 두면 뜻이 안 맞는다.
    useEffect(() => { setHoveredCodes(null); setBadge(null); }, [overlay?.key]);

    const hovered = useMemo(() => (hoveredCodes ? new Set(hoveredCodes) : null), [hoveredCodes]);

    const colorOf = useMemo(() => {
        const m = new Map<string, string>();
        overlay?.lines.forEach((l, i) => m.set(l.code, seriesColor(i)));
        return (code: string): string => m.get(code) ?? "var(--text-secondary)";
    }, [overlay]);

    // 런은 굵기 **또는** 값 라벨이 켜져 있으면 굽는다 — 값 라벨의 재료가 같은 런이라, 굵기만 보고 거르면
    // "값 ON·굵기 OFF"에서 앵커 라벨만 서고 멤버 라벨이 조용히 빈다(앵커 쪽 amountTarget 과 같은 게이트).
    const runs = useMemo(() => {
        if (!overlay || (!amountWidthOn && !amountLabelsOn)) return null;
        const m = new Map<string, AmountRun[]>();
        for (const l of overlay.lines) {
            const at = lookup.amountAt(l.code);
            if (at) m.set(l.code, amountRuns(l.points, overlay.t0, at, amountLevelOf));
        }
        return m;
    }, [overlay, lookup, amountWidthOn, amountLabelsOn]);

    const mode = overlay !== null;
    const swapped = mode && ((hoveredLine !== null && hoveredLine !== singleKey) || (groupSet?.size ?? 0) > 0);
    const lineShown = useCallback(
        (key: string): boolean => !mode || key === singleKey || key === hoveredLine || (groupSet?.has(key) ?? false),
        [mode, singleKey, hoveredLine, groupSet],
    );

    return {
        overlay, mode, swapped, lineShown, colorOf, runs,
        hovered,
        setHovered: setHoveredCodes,
        badge,
        openBadge: (at, members) => setBadge({ ...at, members }),
        closeBadge: () => setBadge(null),
    };
}
