// 정규화 겹치기의 **데이터 절반** — 슬롯(시선 1 + 고정 N)을 chartQuery 벌크로 해소해
// 정규화 선·캔들·수준선을 한 벌로 낸다. 옛 useOverlayData(깔때기 구독 + 골격 feed)의 후임.
//
// ## 모수는 명시 등록이다(사용자 확정 — 깔때기 구독 폐기)
// 깔때기가 접어 준 월 전체를 다 그리던 옛 모수는 "전체 겹쳐 훑기"가 실제로 안 쓰인다는 실측으로 은퇴했다.
// 여기 모수는 **시선(focus 자동 교체) + 고정(라벨 클릭, 리셋 없음)** 뿐이다 — 수 개~십수 개라
// 항목당 GET /chart 하나(chartQuery 벌크)가 감당되고, 차트 패널과 캐시 한 벌을 공유한다.
//
// ## 정규화 공간 — overlay.ts 머리 주석의 그 공간을 여기서 만든다
//   · 일봉: basePrice = D−1 종가(시장 토글), baseRate = 0, x = **전일(D−1) 기준** 거래일 오프셋(당일 = +1).
//   · 분봉: basePrice = 전일 UN 종가(번들 basePrice — %p 공간의 분모), baseRate = 원점(타점 시각
//     종가)의 전일比%, x = 타점 시각 대비 분. 테마 선과 세로 간격이 보존되는 그 공간이다.
// 재료 결손(전일 종가 없음·원점 분봉 미수집)은 **결손으로 센다** — 지어내지 않는다.
import { useCallback, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { candlePrice, beatsAsBaseline, anchorCoordKey } from "@trade-data-manager/market/domain";
import type { ChartAnchor } from "@trade-data-manager/wire";
import { allAnchorsQuery, chartQuery } from "../../api/queries.js";
import type { ChartBundle } from "../../api/chart.js";
import { useWorkbench } from "../../store/workbench.js";
import { useChartPoints } from "../../lib/useChartPoints.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { usePersistedState } from "../../store/persist.js";
import { minutesOfDay } from "../../lib/date.js";
import { chartKeyOf, pointKey } from "../../lib/pointKey.js";
import { parsePins, pinKey, type NormPin } from "./normShared.js";
import { pct, type ChartLine, type OverlayLine, type PointLine } from "./overlay.js";
import { anchorCandles, dailyOverlayCandles, type ViewCandle } from "./candles.js";
import { buildMarks, displayOf, type NormMark } from "./anchorDisplay.js";
import type { NormLevel } from "./LevelsLayer.js";
import type { ZeroLine } from "./useOverlayToggles.js";

const priceOf = (s: string | undefined): number | null => candlePrice(s);

export interface NormItemsView {
    lines: OverlayLine[];
    byKey: ReadonlyMap<string, OverlayLine>;
    /** 항목별 캔들(선과 같은 값 공간) — 캔들 모드가 그린다. */
    candlesByKey: ReadonlyMap<string, ViewCandle[]>;
    /** 차트키 → 수준선(기준선 후보 전부 + 최저가 승자 표시). 앵커 복제본을 번들 캔들로 해소한 것. */
    levelsByChart: ReadonlyMap<string, NormLevel[]>;
    /** 차트키 → 상단 표식(이 패널 grain 의 앵커만) — 표식 층이 그린다. 표기 규칙은 anchorDisplay. */
    marksByChart: ReadonlyMap<string, NormMark[]>;
    /** 시선 선 키들 — 강조(selected 역할)와 파생(테마·거래대금) 대상. */
    subjectKeys: ReadonlySet<string>;
    pinnedKeys: ReadonlySet<string>;
    /** 등록 항목 수(시선 ∪ 고정, 결손 포함). */
    population: number;
    missing: number;
    loading: boolean;
    nameOf: (code: string) => string;
    isPinned: (line: OverlayLine) => boolean;
    /** 라벨 클릭 = 고정 토글(사용자 확정 — 헤더 버튼이 아니라 라벨이 손잡이다. 시선 이동은 Ctrl+클릭). */
    togglePin: (line: OverlayLine) => void;
    clearPins: () => void;
    pinCount: number;
}

/** 선 하나의 재료 명세 — (차트, 시각?) 튜플. 시각 없음 = 차트 단위(일봉). */
interface ItemSpec {
    code: string;
    date: string;
    time?: string;
    pinned: boolean;
    subject: boolean;
}

const pinOf = (it: ItemSpec): NormPin => (it.time === undefined ? { code: it.code, date: it.date } : { code: it.code, date: it.date, time: it.time });

export function useNormLines(grain: "daily" | "minute", dailyMarket: "krx" | "un", zeroLine: ZeroLine): NormItemsView {
    const isDaily = grain === "daily";
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const activePoint = useWorkbench((s) => s.activePoint);
    const { nameOf: rawNameOf } = useStockNames();
    const nameOf = useCallback((code: string): string => rawNameOf(code) ?? code, [rawNameOf]);

    const [pins, setPins] = usePersistedState<NormPin[]>(`wb.normPins.${grain}`, parsePins, []);

    // 시선 — 일봉은 focus 차트, 분봉은 고른 타점(없으면 focus 차트의 전 타점: 복제본 셀렉터라 왕복 0).
    const chartPoints = useChartPoints(isDaily ? "" : focusCode, focusDate);
    const gaze = useMemo<NormPin[]>(() => {
        if (!focusCode || !focusDate) return [];
        if (isDaily) return [{ code: focusCode, date: focusDate }];
        if (activePoint && activePoint.code === focusCode && activePoint.date === focusDate) {
            return [{ code: activePoint.code, date: activePoint.date, time: activePoint.time }];
        }
        return chartPoints.map((p) => ({ code: p.stockCode, date: p.date, time: p.time }));
    }, [isDaily, focusCode, focusDate, activePoint, chartPoints]);

    // 항목 = 고정 + (고정에 없는) 시선. 시선이 고정과 겹치면 그 고정이 시선 강조를 겸한다(중복 그리기 없음).
    const items = useMemo<ItemSpec[]>(() => {
        const gazeKeys = new Set(gaze.map(pinKey));
        const out: ItemSpec[] = pins.map((p) => ({
            code: p.code, date: p.date, ...(p.time !== undefined ? { time: p.time } : {}),
            pinned: true, subject: gazeKeys.has(pinKey(p)),
        }));
        const seen = new Set(pins.map(pinKey));
        for (const g of gaze) {
            if (seen.has(pinKey(g))) continue;
            out.push({ code: g.code, date: g.date, ...(g.time !== undefined ? { time: g.time } : {}), pinned: false, subject: true });
        }
        return out;
    }, [pins, gaze]);

    // 번들 — 같은 차트의 타점 여럿이 한 번들을 공유한다(요청은 차트 단위, 키는 차트 패널과 공유).
    const charts = useMemo(() => {
        const m = new Map<string, { code: string; date: string }>();
        for (const it of items) m.set(chartKeyOf(it.code, it.date), { code: it.code, date: it.date });
        return [...m.values()];
    }, [items]);
    const bundles = useQueries({
        queries: charts.map((c) => chartQuery(c.code, c.date)),
        combine: (results) => {
            const m = new Map<string, ChartBundle>();
            let pending = 0;
            results.forEach((r, i) => {
                if (r.data) m.set(chartKeyOf(charts[i].code, charts[i].date), r.data as ChartBundle);
                else if (r.isLoading) pending += 1;
            });
            return { m, pending };
        },
    });

    // 표기 대상 앵커 — 복제본 테이블에서 이 항목 차트들 것만(수 개라 필터가 싸다).
    // param 필터는 표기 레지스트리(anchorDisplay)가 진다 — 기준선 하나가 아니라 등록된 전부.
    const chartKeySet = useMemo(() => new Set(charts.map((c) => chartKeyOf(c.code, c.date))), [charts]);
    const anchorSelect = useCallback(
        (all: ChartAnchor[]) => all.filter((a) => displayOf(a.param) !== undefined && chartKeySet.has(chartKeyOf(a.stockCode, a.date))),
        [chartKeySet],
    );
    const displayAnchors = useQuery({ ...allAnchorsQuery(), select: anchorSelect }).data ?? [];

    return useMemo<NormItemsView>(() => {
        const lines: OverlayLine[] = [];
        const candlesByKey = new Map<string, ViewCandle[]>();
        const levelsByChart = new Map<string, NormLevel[]>();
        const marksByChart = new Map<string, NormMark[]>();
        const subjectKeys = new Set<string>();
        const pinnedKeys = new Set<string>();
        let missing = 0;

        for (const it of items) {
            const ck = chartKeyOf(it.code, it.date);
            const bundle = bundles.m.get(ck);
            if (!bundle) continue; // 로딩 중 — 결손과 구분(loading 이 따로 말한다)

            let line: OverlayLine | null = null;
            let candles: ViewCandle[] = [];
            if (isDaily) {
                line = dailyLineOf(bundle, dailyMarket, { key: ck, chartKey: ck, stockCode: it.code, date: it.date });
                if (line) candles = dailyOverlayCandles(bundle.daily, { basePrice: line.basePrice, baseT: line.baseT }, dailyMarket);
            } else if (it.time !== undefined) {
                const pk = pointKey({ stockCode: it.code, date: it.date, time: it.time });
                line = minuteLineOf(bundle, it.time, { key: pk, chartKey: ck, stockCode: it.code, date: it.date });
                if (line) candles = anchorCandles(bundle.minutes, { basePrice: line.basePrice, baseRate: line.baseRate, baseT: line.baseT });
            }
            if (!line) { missing += 1; continue; }
            lines.push(line);
            candlesByKey.set(line.key, candles);
            if (it.subject) subjectKeys.add(line.key);
            if (it.pinned) pinnedKeys.add(line.key);
            if (!levelsByChart.has(ck)) {
                const mine = displayAnchors.filter((a) => chartKeyOf(a.stockCode, a.date) === ck);
                // 수준선은 선과 **같은 스케일**이어야 한다: 일봉 뷰는 수정주가 공간(1), 분봉 뷰는 원주가 공간(rawScale).
                const { levels, winnerCoord } = levelsOf(bundle, mine, isDaily ? 1 : (bundle.rawScale ?? 1));
                const zero = isDaily ? null : zeroLevelOf(bundle, zeroLine);
                levelsByChart.set(ck, zero ? [...levels, zero] : levels);
                // 표식은 **패널 grain 의 앵커만** — 승자 좌표는 수준선 계산의 것을 그대로 물려받는다
                // (다른 grain 의 승자면 이 패널엔 "후보" 표식만 남는다 — 태그의 grain 접두가 그 설명이다).
                marksByChart.set(ck, buildMarks(mine, {
                    minutePanel: !isDaily,
                    dailyIndexOf: (d) => bundle.daily.findIndex((c) => c.date === d),
                    winnerCoord,
                }));
            }
        }

        const byKey = new Map(lines.map((l) => [l.key, l] as const));
        const keyOfLine = (line: OverlayLine): string =>
            pinKey(line.kind === "point" ? { code: line.stockCode, date: line.date, time: line.time } : { code: line.stockCode, date: line.date });
        const isPinned = (line: OverlayLine): boolean => pins.some((p) => pinKey(p) === keyOfLine(line));
        return {
            lines, byKey, candlesByKey, levelsByChart, marksByChart, subjectKeys, pinnedKeys,
            population: items.length, missing, loading: bundles.pending > 0,
            nameOf,
            isPinned,
            togglePin: (line) => {
                const k = keyOfLine(line);
                setPins((prev) => (prev.some((p) => pinKey(p) === k)
                    ? prev.filter((p) => pinKey(p) !== k)
                    : [...prev, pinOf({ code: line.stockCode, date: line.date, ...(line.kind === "point" ? { time: line.time } : {}), pinned: true, subject: false })]));
            },
            clearPins: () => setPins([]),
            pinCount: pins.length,
        };
    }, [items, bundles, isDaily, dailyMarket, zeroLine, displayAnchors, pins, setPins, nameOf]);
}

/**
 * 일봉 선 — 원점 = D−1 종가(시장 토글). D−1 결측(상장일 등)은 당일 시가 폴백(basePrice 규칙과 동일).
 *
 * ## x 의 원점도 **전일**이다(사용자 확정)
 * `baseT = last − 1` 이라 D−1 이 x=0 — 원점 (0,0)이 **선 위의 한 점**이 된다(옛 D=0 에선 원점이
 * 선 밖의 허공이었다). 당일 D 는 +1(DAILY_EVENT_X)이고, 캔들도 같은 baseT 를 받아 함께 움직인다.
 */
function dailyLineOf(
    bundle: ChartBundle,
    market: "krx" | "un",
    owner: { key: string; chartKey: string; stockCode: string; date: string },
): ChartLine | null {
    const daily = bundle.daily;
    if (daily.length === 0) return null;
    const last = daily.length - 1;
    const basePrice = daily.length >= 2 ? priceOf(daily[last - 1][market].close) : priceOf(daily[last][market].open);
    if (basePrice === null) return null;
    // 원점 = 전일(D−1). 봉이 하나뿐이면 그 자신이 원점이지만, 그 경우 점이 2개 미만이라 아래에서 걸러진다.
    const baseT = daily.length >= 2 ? last - 1 : last;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < daily.length; i++) {
        const c = priceOf(daily[i][market].close);
        if (c === null) continue; // 값 없는 봉은 건너뛴다(0% 평탄값을 지어내지 않는다)
        points.push({ x: i - baseT, y: pct(c, basePrice) });
    }
    if (points.length < 2) return null;
    return { kind: "chart", ...owner, basePrice, baseRate: 0, baseT, points };
}

/** 분봉 선 — %p 공간(분모=전일 UN 종가), 원점 = 타점 시각 UN 종가. 하루 전체(타점 이후 포함). */
function minuteLineOf(
    bundle: ChartBundle,
    time: string,
    owner: { key: string; chartKey: string; stockCode: string; date: string },
): PointLine | null {
    const basePrice = bundle.basePrice?.un ?? null;
    if (basePrice === null || basePrice <= 0) return null; // 전일 종가 결손 — %p 분모가 없다
    const t0 = minutesOfDay(time);
    const points: { x: number; y: number }[] = [];
    let splitIdx = -1;
    for (const m of bundle.minutes) {
        const c = priceOf(m.un.close);
        if (c === null) continue;
        const x = minutesOfDay(m.time) - t0;
        if (x === 0) splitIdx = points.length;
        points.push({ x, y: pct(c, basePrice) });
    }
    if (splitIdx < 0 || points.length < 2) return null; // 원점(타점 시각) 분봉 미수집 — 결손
    const baseRate = points[splitIdx].y;
    return {
        kind: "point", ...owner, time,
        basePrice, baseRate, baseT: t0, splitIdx,
        points: points.map((p) => ({ x: p.x, y: p.y - baseRate })),
    };
}

/**
 * 수준선 — 이 차트의 기준선 후보 전부를 번들 캔들에서 해소하고, **가격 최저**(도메인 단일 규칙
 * beatsAsBaseline — 서버 리졸버·차트 하늘색 선과 같은 함수)를 기준선으로 표시한다.
 *
 * ## 스케일 (viewScale)
 * 번들은 두 스케일을 같이 싣는다: `daily` = 수정주가(전 구간 오늘 스케일), `minutes` = 원주가(그 날 값).
 * 감자·액분이 차트 날짜 뒤에 있었던 종목은 둘이 배율만큼 다른 자에 있어, 섞어서 %로 환산하면 선이 엉뚱한
 * 높이에 선다. 그래서 **후보를 전부 수정주가 스케일로 모은 뒤**(분봉 앵커만 rawScale 로 되돌린다) 화면 공간의
 * 스케일로 함께 내린다 — 일봉 뷰는 수정주가 공간이라 1, 분봉 뷰는 원주가 공간이라 rawScale.
 * 최저 선택도 이 한 스케일에서 이뤄진다(자가 다른 값끼리 겨루면 "최저"가 뒤집힌다).
 */
function levelsOf(
    bundle: ChartBundle,
    anchors: readonly ChartAnchor[],
    viewScale: number,
): { levels: NormLevel[]; winnerCoord: string | null } {
    const rawScale = bundle.rawScale ?? 1; // 없으면(옛 서버) 1 — 계수가 없던 시절의 동작
    const resolved: { price: number; coord: string; minute: boolean }[] = [];
    for (const a of anchors) {
        if (!displayOf(a.param)?.line) continue; // 가로선을 받는 param 만(표기 레지스트리가 가른다)
        if (a.field == null || a.market == null) continue;
        const raw = a.anchorTime
            ? bundle.minutes.find((m) => m.date === a.anchorDate && m.time === a.anchorTime)?.[a.market]?.[a.field]
            : bundle.daily.find((d) => d.date === a.anchorDate)?.[a.market]?.[a.field];
        const price = candlePrice(raw);
        if (price === null) continue;
        const adj = a.anchorTime && rawScale > 0 ? price / rawScale : price; // 원주가(분봉 앵커)만 되돌린다
        resolved.push({ price: adj * viewScale, coord: anchorCoordKey(a), minute: a.anchorTime != null });
    }
    if (resolved.length === 0) return { levels: [], winnerCoord: null };
    let winner = resolved[0];
    for (const r of resolved) if (beatsAsBaseline(r, winner)) winner = r;
    return {
        levels: resolved.map((r) => ({ price: r.price, baseline: r === winner, minute: r.minute })),
        winnerCoord: winner.coord,
    };
}

/**
 * 전일 종가선(0%) — **분봉 전용**. 분봉 뷰는 타점 시각을 원점으로 끌어내린 %p 공간이라 "진짜 0%"가
 * 화면에서 사라진다(선마다 `y = −baseRate` 로 흩어진다). 그 자리를 되돌려 놓는 선이다.
 *
 * 재료는 번들의 시장별 기준가 하나뿐이고, 환산은 수준선과 **같은 식**(pct − baseRate)이라 선마다
 * 제 높이에 선다 — 그래서 이건 공용 가로선이 아니라 **항목마다 하나**다(주인이 색을 준다).
 * 일봉엔 안 붙는다: 거기선 y=0 자체가 전일 종가라 이미 가로 0선이 그 자리다.
 */
function zeroLevelOf(bundle: ChartBundle, zeroLine: ZeroLine): NormLevel | null {
    if (zeroLine === "off") return null;
    const price = bundle.basePrice?.[zeroLine] ?? null;
    if (price === null || price <= 0) return null; // 기준가 결손 — 지어내지 않는다
    return { price, baseline: false, zero: zeroLine };
}
