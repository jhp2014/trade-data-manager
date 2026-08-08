import { useMemo, useRef, useState, useEffect, useCallback, type CSSProperties, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { skeletonsQuery, anchoredChartsQuery, allPointsQuery } from "../api/queries.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import {
    normalizeSkeleton, absoluteSkeleton, pointSkeletons, dailyFrame, pointUnitFrame, absoluteFrame, splitAtX, polylinePoints, pct, minutesOf,
    lineOpacity, dimOpacity, labelPointOf, clusterLabels, lineVisual, keysInRect,
    type LineVisual, type NormalizedSkeleton, type OverlayBounds, type SkeletonAnchor,
} from "./skeleton/skeletonOverlay.js";
import { useOverlayZoom, type ZoomRegion } from "./skeleton/useOverlayZoom.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { useTags } from "../lib/useTags.js";
import { pointKey, pointKeyOf, parsePointKey, type PointRef } from "../lib/pointKey.js";
import { evalTagExpr, isTagExprEmpty } from "./rank/tagFilter.js";
import { BulkTagMenu } from "./skeleton/ChartTagMenu.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { ACTIVE, HOVER, PRICE_LINE, seriesColor, tagColor } from "../styles/palette.js";
import type { SkeletonWireLevel } from "../api/skeletons.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";

// 골격 겹쳐 그리기 — 차트를 골격으로 축약해 **한 화면에서 서로 비교**하는 주 작업면.
//
// 왜 대표 골격을 역산해 그리지 않는가: 축 값 → 골격은 역함수가 없다(같은 기울기·기간을 내는 골격이 여럿).
// 남는 자유도를 규범값으로 채우면 그림은 나오지만 실제로 존재하는 상황인지 아무도 모른다. 그래서 실물을 겹친다.
//
// ## 단위는 언제나 차트다 — 앵커 소유 구조 그대로
// 일봉·분봉 골격 둘 다 차트(종목,날짜) 소유. 선 하나 = 차트 하나, 타점이 0개여도 나온다.
// 분봉은 하루 경로 전체라 타점 이후까지 보인다("어디까지 갔나") — 타점 문맥의 절단은 축의 몫이다.
//
// ## 척도는 공통이다 — 골격별로 다시 늘리지 않는다
// 크기가 곧 비교 기준인데 각자 화면에 꽉 채우면 20% 되돌림과 60% 되돌림이 같은 그림이 된다.
// 이상치 하나가 나머지를 누르는 문제는 **초기 범위를 분위수로 좁히고** 확대·이동으로 닿게 해서 푼다.
//
// ## 손잡이는 라벨뿐 — 선은 순수 그림
// 뭉친 곳에서 선 호버는 원래 신뢰할 수 없다(브라우저는 맨 위에 그려진 걸 주지 겨냥한 걸 주지 않는다).
// 라벨은 앵커 반대쪽 끝, 즉 선들이 **가장 벌어진 자리**에 붙으므로 손잡이로 더 낫다. 덕분에 히트 영역용
// 투명 선이 없고, 나중에 선을 캔버스로 옮겨도 조작이 하나도 안 바뀐다.
//
// ## 상세 정보의 밀도 규칙 — "지금 조사 중인 하나"에만
// 피벗 값 라벨·기준선(D선)은 호버(우선) 또는 단일 선택에만 붙는다. 다중 선택은 무리를 만드는 손짓이라
// 상세를 다 띄우면 수십 벌이 겹친다 — 색·굵기로만 답하고, 상세는 하나를 짚었을 때 준다.
const ANCHOR_KEY = "wb.skeletonOverlayAnchor";
const MINVIEW_KEY = "wb.skeletonOverlayMinuteView";

const PAD = { left: 46, right: 14, top: 12, bottom: 24 };
/** 피벗 점 예산 — **원 개수**로 센다(골격당 피벗 수가 3~6으로 제각각이라 골격 수로 세면 임계가 두 배 흔들린다). */
const DOT_BUDGET = 1200;
/** 라벨 격자 한 칸(화면 px) — 라벨 하나가 차지하는 자리. 이보다 촘촘하면 뭉쳐서 개수 뱃지가 된다. */
const LABEL_CELL = { w: 72, h: 14 };

/** `2026-07-08` → `26.07.08`. 연도를 남기는 건 여러 해가 섞이기 때문(월·일만이면 같은 날로 보인다). */
const fmtDate = (d: string): string => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
const fmtPct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const hmOf = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

/** 화면의 선 하나 — 차트 단위(NormalizedSkeleton) 또는 타점 단위(time·splitIdx 가 있는 PointSkeleton). */
type Line = NormalizedSkeleton & { time?: string; splitIdx?: number };

type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };
type XUnit = "day" | "min" | "clock";
const fmtX = (x: number, unit: XUnit): string => (unit === "clock" ? hmOf(x) : `${Math.round(x)}${unit === "day" ? "일" : "분"}`);

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — 시나리오가 "일봉에서 무리 → 분봉으로 확인"의 동시 사용이라
 *  토글 하나로는 두 그림을 오가며 볼 수 없다. grain 은 패널 정체성이라 마운트 후 안 바뀐다. */
export function SkeletonOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    const [anchor, setAnchor] = usePersistedState<SkeletonAnchor>(ANCHOR_KEY, (o) => (o === "first" || o === "last" ? o : null), "last");
    const [minuteView, setMinuteView] = usePersistedState<"norm" | "abs">(MINVIEW_KEY, (o) => (o === "norm" || o === "abs" ? o : null), "norm");
    const [showLevels, setShowLevels] = usePersistedState<boolean>(`wb.skeletonOverlayLevels.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);
    const [showLabels, setShowLabels] = usePersistedState<boolean>(`wb.skeletonOverlayLabels.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const activePoint = useWorkbench((s) => s.activePoint);

    const feedQ = useQuery(skeletonsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const r = useRankFilterResult();
    const isDaily = grain === "daily";
    const isAbs = !isDaily && minuteView === "abs";
    /** 분봉 정규화 = **타점 단위**(사용자 확정): 선 하나 = 타점 하나(자기 시각 피벗이 원점). */
    const isPointUnit = !isDaily && !isAbs;
    const xUnit: XUnit = isDaily ? "day" : isAbs ? "clock" : "min";

    // 분봉 필터 확정 규칙(사용자 확정 — 후자): 필터는 **타점 알갱이**로 작동한다. 정규화(타점 단위) 뷰는
    // 매칭 타점만, 절대 뷰는 매칭 타점이 하나도 없는 차트를 선째 제외하고 남는 차트도 걸러진 마커는 뺀다.
    // "매칭 타점을 가진 차트" 식의 차트 단위 우회는 일봉 패널 전용으로 남는다.
    const filterActive = !r.isEmpty;
    const matchedPks = useMemo<ReadonlySet<string> | null>(
        () => (!isDaily && filterActive ? new Set(r.points.map((p) => pointKey(p))) : null),
        [isDaily, filterActive, r.points],
    );

    // 종목명 — r.nameOf 는 타점 목록에서 모으므로 타점 없는 차트는 코드만 남는다. 앵커 걸린 차트 피드가
    // 이름을 달고 오니(서버 MasterCache.attachNames) 그걸 먼저 보고, 없으면 기존 경로.
    const chartsQ = useQuery(anchoredChartsQuery());
    const nameOf = useMemo(() => {
        const m = new Map<string, string>();
        for (const c of chartsQ.data ?? []) if (c.name) m.set(c.stockCode, c.name);
        return (code: string): string => m.get(code) ?? r.nameOf(code);
    }, [chartsQ.data, r.nameOf]);

    // 차트의 타점들 — 분봉 모드의 타점 세로선 + 클릭 이동 대상. 필터와 무관한 전체(선은 사실을 그린다).
    const pointsByChart = useMemo(() => {
        const m = new Map<string, ReviewPointListItem[]>();
        for (const p of pointsQ.data ?? []) {
            const k = `${p.stockCode}|${p.date}`;
            const list = m.get(k);
            if (list) list.push(p);
            else m.set(k, [p]);
        }
        for (const list of m.values()) list.sort((a, b) => (a.time < b.time ? -1 : 1));
        return m;
    }, [pointsQ.data]);

    // ── 차트 단위 필터 — **일봉 패널 전용**: 골격의 모집단이 차트라, 타점 조건과 차트 조건을 갈라서 판정한다.
    //  · 밴드·계산축 값구간·시간대 = **타점 전용 조건**(차트엔 그 값이 없다) → 활성이면 매칭 타점을 가진
    //    차트만(타점 없는 차트는 판정 자체가 안 되므로 빠진다 — 헤더의 두 숫자가 그 사실을 보이게 한다).
    //  · 날짜·태그 = 차트에서도 판정 가능 → 차트 자체로 평가한다. 태그는 **차트 직접 부착 ∪ 그 타점들의
    //    태그**(상속 포함)라 어느 쪽에 붙었든 잡힌다. 이 경로가 타점 경로의 상위집합이라 합집합이 필요 없다.
    // 분봉 패널은 이 우회를 안 탄다(사용자 확정) — 절대 뷰는 매칭 타점의 차트만, 정규화 뷰는 선=타점이라
    // matchedPks 가 직접 거른다(아래 pointLines).
    const tagsView = useTags();
    const rankBands = useWorkbench((s) => s.rankBands);
    const axisValueRanges = useWorkbench((s) => s.axisValueRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const tagExpr = useWorkbench((s) => s.tagExpr);
    const pointOnlyActive =
        Object.values(rankBands).some((b) => b && (b.lo || b.hi)) ||
        Object.values(axisValueRanges).some((v) => v && v.length > 0) ||
        timeRanges.length > 0;

    const chartAllowed = useMemo<ReadonlySet<string> | null>(() => {
        if (!isDaily) {
            if (!filterActive) return null;
            return new Set(r.points.map((p) => `${p.stockCode}|${p.date}`)); // 매칭 타점 없는 차트는 선째 제외
        }
        if (pointOnlyActive) return new Set(r.points.map((p) => `${p.stockCode}|${p.date}`));
        const dateActive = dateRanges.length > 0;
        const tagActive = !isTagExprEmpty(tagExpr);
        if (!dateActive && !tagActive) return null; // 무필터 = 전 차트
        const feed = feedQ.data;
        if (!feed) return new Set();
        const out = new Set<string>();
        for (const e of feed.daily) {
            const key = `${e.stockCode}|${e.date}`;
            if (dateActive && !dateRanges.some((rg) => e.date >= rg.from && e.date <= rg.to)) continue;
            if (tagActive) {
                const ids = new Set(tagsView.chartTagIdsOf(e));
                for (const p of pointsByChart.get(key) ?? []) for (const id of tagsView.tagIdsOf(p)) ids.add(id);
                if (!evalTagExpr([...ids], tagExpr)) continue;
            }
            out.add(key);
        }
        return out;
    }, [isDaily, filterActive, pointOnlyActive, r.points, dateRanges, tagExpr, feedQ.data, tagsView, pointsByChart]);

    // "선택만 보기"(분봉 전용) — 일봉 패널에서 만든 선택 무리만 남긴다. 선택이 비면 제한 없음(빈 화면 함정 방지).
    const [onlySelected, setOnlySelected] = useState(false);
    const skeletonSelection = useWorkbench((s) => s.skeletonSelection);
    const onlyCharts = !isDaily && onlySelected && skeletonSelection.size > 0 ? skeletonSelection : null;

    // 차트 단위 선(일봉·분봉 절대) — 타점 단위 뷰에선 비어 있다(선의 모집단이 다르다).
    const shapes = useMemo<NormalizedSkeleton[]>(() => {
        const feed = feedQ.data;
        if (!feed || isPointUnit) return [];
        const out: NormalizedSkeleton[] = [];
        for (const e of isDaily ? feed.daily : feed.minute) {
            const key = `${e.stockCode}|${e.date}`;
            if (chartAllowed && !chartAllowed.has(key)) continue;
            if (onlyCharts && !onlyCharts.has(key)) continue;
            const owner = { key, stockCode: e.stockCode, date: e.date };
            const n = isAbs ? absoluteSkeleton(e.pivots, e.prevClose, owner) : normalizeSkeleton(e.pivots, anchor, owner);
            if (n) out.push(n);
        }
        return out;
    }, [feedQ.data, chartAllowed, onlyCharts, isDaily, isAbs, isPointUnit, anchor]);

    // 타점 단위 선(분봉 정규화) — 골격 하나를 타점마다 재정규화. 필터는 타점 알갱이(matchedPks)로 직접.
    const pointLines = useMemo<Line[]>(() => {
        const feed = feedQ.data;
        if (!feed || !isPointUnit) return [];
        const out: Line[] = [];
        for (const e of feed.minute) {
            const key = `${e.stockCode}|${e.date}`;
            if (onlyCharts && !onlyCharts.has(key)) continue;
            const pts = (pointsByChart.get(key) ?? [])
                .map((rp) => ({ pk: pointKey(rp), time: rp.time }))
                .filter((p) => !matchedPks || matchedPks.has(p.pk));
            if (pts.length > 0) out.push(...pointSkeletons(e.pivots, pts, { key, stockCode: e.stockCode, date: e.date }));
        }
        return out;
    }, [feedQ.data, isPointUnit, onlyCharts, pointsByChart, matchedPks]);

    const lines: Line[] = isPointUnit ? pointLines : shapes;

    // 선은 언제나 차트 소유 — 모든 뷰가 같은 목록을 본다(타점 단위 선은 chartKey 로 찾는다).
    const levelsByChart = useMemo(() => {
        const m = new Map<string, SkeletonWireLevel[]>();
        for (const l of feedQ.data?.levels ?? []) m.set(`${l.stockCode}|${l.date}`, l.levels);
        return m;
    }, [feedQ.data]);

    // 모집단 — 차트 단위 뷰는 차트 수, 타점 단위 뷰는 분봉 골격 차트 위의 타점 수(필터 전).
    const population = useMemo(() => {
        const feed = feedQ.data;
        if (!feed) return 0;
        if (isDaily) return feed.daily.length;
        if (!isPointUnit) return feed.minute.length;
        return feed.minute.reduce((n, e) => n + (pointsByChart.get(`${e.stockCode}|${e.date}`)?.length ?? 0), 0);
    }, [feedQ.data, isDaily, isPointUnit, pointsByChart]);

    // ── 척도: 기본 창(뷰마다 다른 규칙) vs 고정(그 순간의 범위를 붙든다 — 필터 좁히기 전후 비교용).
    //  · 일봉 정규화 = 상수 창(−60~+10일 · −60~+40%) — 필터가 바뀌어도 같은 되돌림이 같은 크기로 선다.
    //  · 분봉 타점 정규화 = 양의 쪽 마진만(+10분·+5%), 음의 쪽은 데이터만큼(관심사가 타점 이전이다).
    //  · 분봉 절대 = 고정 프레임(±15분 · −5~+30%).
    const [locked, setLocked] = useState<OverlayBounds | null>(null);
    const autoBounds = useMemo(
        () => (lines.length === 0 ? null : isDaily ? dailyFrame(anchor) : isAbs ? absoluteFrame(lines) : pointUnitFrame(lines, 0.01)),
        [isDaily, isAbs, anchor, lines],
    );
    const bounds = locked ?? autoBounds;

    const wrapRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setSize({ w: es[0].contentRect.width, h: es[0].contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };
    const drawable = bounds !== null && box.width > 0 && box.height > 0;

    // ── 뭉친 라벨의 멤버 목록. 그래프를 만지면(팬·확대) 닫는다 — d3 가 SVG mousedown 을 삼켜
    //    팝오버의 바깥클릭 감지가 그래프 위에서 안 뜨기 때문(제스처 콜백이 그 자리를 대신한다).
    const [badge, setBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
    const closeBadge = useCallback(() => setBadge(null), []);
    // 제스처 영역 — 아래 스트립=시간축, 왼쪽 스트립=% 축(모서리는 시간축 우선). 스트립에선 그 축만 확대된다.
    const regionOf = useCallback(
        (x: number, y: number): ZoomRegion => (y > box.top + box.height ? "x" : x < box.left ? "y" : "body"),
        [box.top, box.height, box.left],
    );
    const { tx, ty, reset, zoomed, dragging } = useOverlayZoom(svgRef, drawable, regionOf, closeBadge);

    // 척도가 바뀌면(필터 변경 등) 뷰포트를 원위치 — 옛 변환이 남아 빈 공간을 보지 않게.
    const boundsKey = bounds ? `${bounds.minX}|${bounds.maxX}|${bounds.minY}|${bounds.maxY}` : "";
    useEffect(() => { reset(); }, [boundsKey, reset]);

    // 변환은 그림이 아니라 **스케일**에 건다 — 선 굵기가 안 늘어나고 눈금이 확대에 맞춰 다시 찍힌다.
    // 축별 변환 두 벌(tx·ty)이라 가로만 당기고 세로만 당기는 손짓이 성립한다.
    const scales = useMemo<Scales | null>(() => {
        if (!bounds) return null;
        const x = scaleLinear().domain([bounds.minX, bounds.maxX]).range([box.left, box.left + box.width]);
        const y = scaleLinear().domain([bounds.minY, bounds.maxY]).range([box.top + box.height, box.top]);
        return { x: tx.rescaleX(x), y: ty.rescaleY(y) };
    }, [bounds, box.left, box.top, box.width, box.height, tx, ty]);

    // ── 선택(집합)·호버 — 차트 선택은 **store 공유**(skeletonSlice): 일봉 패널에서 만든 무리를
    //    분봉 패널이 "선택만 보기"로 받는다. 키가 차트키라 두 패널이 같은 집합을 그대로 쓴다.
    const selectedKeys = skeletonSelection;
    const setSelectedKeys = useWorkbench((s) => s.setSkeletonSelection);
    // 타점 선택 — 차트 선택과 **별개 집합**(그룹핑 대상이 다르다: 차트 태그 vs 타점 태그).
    // 절대 뷰에선 마커의, 타점 단위 뷰에선 선 자체의 선택 집합이다.
    const [selectedPks, setSelectedPks] = useState<ReadonlySet<string>>(() => new Set());
    const [hovered, setHovered] = useState<string | null>(null);
    const byKey = useMemo(() => new Map(lines.map((s) => [s.key, s])), [lines]);
    // 이 뷰의 선이 쓰는 선택 채널 — 타점 단위면 pk 집합, 차트 단위면 차트키 집합. 문법은 하나다.
    const activeSelection = isPointUnit ? selectedPks : selectedKeys;
    const setActiveSelection = isPointUnit ? setSelectedPks : setSelectedKeys;
    const activeKey = activePoint
        ? isPointUnit
            ? activePoint.time && pointKeyOf(activePoint.code, activePoint.date, activePoint.time)
            : `${activePoint.code}|${activePoint.date}`
        : null;
    // 로컬 선택이 없으면 활성 타점(의 차트)을 단일 선택으로 — 다른 패널과의 링크가 이걸로 이어진다.
    const effSelected = useMemo<ReadonlySet<string>>(
        () => (activeSelection.size > 0 ? activeSelection : activeKey && byKey.has(activeKey) ? new Set([activeKey]) : new Set()),
        [activeSelection, activeKey, byKey],
    );

    // 그룹 = 뭉친 라벨 무리. 목록이 열려 있으면 계속 켜둔다(마우스를 목록으로 옮겨도 짝이 유지되게).
    const [badgeHover, setBadgeHover] = useState<readonly string[] | null>(null);
    const groupList = badge?.members ?? badgeHover;
    const groupSet = useMemo(() => (groupList ? new Set(groupList) : null), [groupList]);
    const groupColorOf = useMemo(() => {
        const m = new Map<string, string>();
        groupList?.forEach((k, i) => m.set(k, seriesColor(i)));
        return (key: string): string => m.get(key) ?? "var(--text-secondary)";
    }, [groupList]);

    const clipId = "skeleton-overlay-clip";
    const dotsForAll = useMemo(() => lines.reduce((n, s) => n + s.points.length, 0) <= DOT_BUDGET, [lines]);
    const baseOpacity = lineOpacity(lines.length);
    const dimmed = dimOpacity(lines.length);
    // 라벨이 붙는 끝 — 타점 단위는 **과거 쪽 끝(왼쪽)**(미래 점선 쪽은 결과라 손잡이를 안 둔다),
    // 절대 배치는 경로 끝(오른쪽), 정규화는 앵커 반대쪽.
    const labelAnchorMode: SkeletonAnchor = isPointUnit ? "last" : isAbs ? "first" : anchor;
    const labelAtStart = isPointUnit || (!isAbs && anchor === "last");

    // 상세(피벗 값·기준선·타점 세로선)를 받을 "지금 조사 중인 하나" — 호버 우선, 없으면 단일 선택.
    const inspectKey = hovered ?? (effSelected.size === 1 ? [...effSelected][0] : null);

    // 역할 판정은 순수 함수(lineVisual)가, 색 배정은 여기가 한다 — 팔레트는 화면의 몫이라 규칙 층에 안 들인다.
    const visualOf = useCallback((key: string): { v: LineVisual; color: string } => {
        const v = lineVisual(key, { selected: effSelected, hovered, group: groupSet });
        const color = v.role === "selected" ? ACTIVE
            : v.role === "group" ? groupColorOf(key)
                : v.role === "hovered" ? HOVER
                    : "var(--text-secondary)";
        return { v, color };
    }, [effSelected, hovered, groupSet, groupColorOf]);

    /** 평클릭 = 이동 + 단일 선택(교체). Ctrl+클릭 = 선택 토글만(이동 없음 — 무리를 만드는 중이다).
     *  타점 단위 선(time 있음)은 자기 타점으로 바로 이동하고 선택은 pk 채널을 쓴다 — 문법은 같다. */
    const onLabelClick = useCallback((s: Line, ev: { ctrlKey: boolean; metaKey: boolean }): void => {
        if (ev.ctrlKey || ev.metaKey) {
            setActiveSelection((prev: ReadonlySet<string>) => {
                const next = new Set(prev.size > 0 ? prev : effSelected); // 활성 타점 폴백 선택도 무리의 시작점이 된다
                if (next.has(s.key)) next.delete(s.key);
                else next.add(s.key);
                return next;
            });
            return;
        }
        setActiveSelection(new Set([s.key]));
        if (s.time) {
            goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "skeleton-overlay");
            return;
        }
        const pts = pointsByChart.get(s.chartKey);
        if (pts?.length) goToPoint({ code: s.stockCode, date: s.date, time: pts[0].time }, "skeleton-overlay");
        else setFocus({ code: s.stockCode, date: s.date, time: null }, "skeleton-overlay");
    }, [setActiveSelection, effSelected, pointsByChart, goToPoint, setFocus]);

    // ── 타점 마커(분봉 **절대 뷰** 전용 — 정규화 뷰는 선 자체가 타점이라 마커가 없다).
    // 타점이 경로 어디에 서 있나 + 타점 단위 손잡이(이동·선택·태그). y 는 그 시각의 경로 피벗에서 찾는다:
    // 유효한 분봉 골격은 모든 타점 시각에 피벗을 갖는다(합성 규칙 — 손 피벗이 있으면 그것, 없으면 합성 종가).
    // 필터가 활성이면 걸러진 타점의 마커는 뺀다(확정 규칙 — 남은 차트라도 매칭 타점만 손잡이를 받는다).
    type Marker = { pk: string; ref: PointRef; s: NormalizedSkeleton; x: number; y: number };
    const markers = useMemo<Marker[]>(() => {
        if (!isAbs) return [];
        const out: Marker[] = [];
        for (const s of shapes) {
            for (const rp of pointsByChart.get(s.chartKey) ?? []) {
                const pk = pointKey(rp);
                if (matchedPks && !matchedPks.has(pk)) continue;
                const px = minutesOf(rp.time) - s.baseT;
                const at = s.points.find((q) => q.x === px);
                if (at) out.push({ pk, ref: rp, s, x: px, y: at.y });
            }
        }
        return out;
    }, [isAbs, shapes, pointsByChart, matchedPks]);
    const markerByPk = useMemo(() => new Map(markers.map((m) => [m.pk, m])), [markers]);

    // 타점 선택 → 그 차트의 **이후 구간 점선**(사용자 확정: "여기까지 보고 들어갔다" 이후는 결과다).
    // 한 차트에 선택 타점이 여럿이면 가장 이른 시각 기준(이후 = 그 타점 뒤 전부).
    const splitXByChart = useMemo(() => {
        const m = new Map<string, number>();
        for (const pk of selectedPks) {
            const mk = markerByPk.get(pk);
            if (!mk) continue;
            const cur = m.get(mk.s.key);
            if (cur == null || mk.x < cur) m.set(mk.s.key, mk.x);
        }
        return m;
    }, [selectedPks, markerByPk]);

    // ── Ctrl+드래그 사각 선택 — d3-zoom 의 기본 filter 가 ctrl+mousedown 을 무시하므로 이 이벤트는 우리 것.
    const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const marqueeRef = useRef<typeof marquee>(null);
    const onWrapMouseDown = useCallback((e: React.MouseEvent): void => {
        if (!(e.ctrlKey || e.metaKey) || !wrapRef.current || !scales) return;
        const wr = wrapRef.current.getBoundingClientRect();
        const start = { x0: e.clientX - wr.left, y0: e.clientY - wr.top, x1: e.clientX - wr.left, y1: e.clientY - wr.top };
        setMarquee(start);
        marqueeRef.current = start;
        const move = (me: MouseEvent): void => {
            const cur = marqueeRef.current;
            if (!cur) return;
            const next = { ...cur, x1: me.clientX - wr.left, y1: me.clientY - wr.top };
            marqueeRef.current = next;
            setMarquee(next);
        };
        const up = (): void => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            const rect = marqueeRef.current;
            marqueeRef.current = null;
            setMarquee(null);
            if (!rect || (Math.abs(rect.x1 - rect.x0) < 4 && Math.abs(rect.y1 - rect.y0) < 4)) return; // 클릭 오인 방지
            // 라벨 지점 판정 — 이 뷰의 선택 채널로 담는다(차트 단위=차트키, 타점 단위=pk. 문법은 하나).
            const hit = keysInRect(lines, labelAnchorMode, scales.x, scales.y, rect);
            if (hit.length > 0) setActiveSelection((prev: ReadonlySet<string>) => new Set([...(prev.size > 0 ? prev : effSelected), ...hit])); // 합집합(누적)
            // 타점 마커도 같은 드래그로 담는다(절대 뷰) — 잡힌 종류가 곧 뜻이다(라벨=차트 선택, 마커=타점 선택).
            const [l, rr] = rect.x0 <= rect.x1 ? [rect.x0, rect.x1] : [rect.x1, rect.x0];
            const [t, b] = rect.y0 <= rect.y1 ? [rect.y0, rect.y1] : [rect.y1, rect.y0];
            const mhit = markers.filter((m) => { const mx = scales.x(m.x); const my = scales.y(m.y); return mx >= l && mx <= rr && my >= t && my <= b; }).map((m) => m.pk);
            if (mhit.length > 0) setSelectedPks((prev) => new Set([...prev, ...mhit]));
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        e.preventDefault();
    }, [scales, lines, effSelected, labelAnchorMode, markers, setActiveSelection]);

    // 라벨 축약 — 화면 좌표로 묶는다. 확대하면 칸이 쪼개지며 뱃지가 저절로 풀린다(숨김이 아니라 압축).
    // 선택·호버는 묶음에서 빼고 따로 그린다. 그룹 멤버는 안 뺀다 — 이름은 목록이 대고 그림은 색으로 답한다.
    const pinnedKeys = useMemo(() => new Set([...effSelected, ...(hovered ? [hovered] : [])]), [effSelected, hovered]);
    const clusters = useMemo(() => {
        if (!showLabels || !scales) return [];
        const anchors = lines
            .filter((s) => !pinnedKeys.has(s.key))
            .map((s) => { const p = labelPointOf(s, labelAnchorMode); return { key: s.key, x: scales.x(p.x), y: scales.y(p.y) }; });
        return clusterLabels(anchors, LABEL_CELL.w, LABEL_CELL.h);
    }, [showLabels, scales, lines, labelAnchorMode, pinnedKeys]);

    // ── 태그 메뉴 — 라벨/마커 우클릭(단일) / 헤더 태그 버튼(선택 일괄). 그룹핑의 입력 지점.
    // 어느 정션에 쓰느냐는 여기 규약이다: 차트 라벨 → 차트 태그 / 타점 마커 → 타점 태그. DB 사전은 하나.
    type TagMenuState =
        | { kind: "chart"; x: number; y: number; charts: { stockCode: string; date: string }[]; label: string }
        | { kind: "point"; x: number; y: number; points: PointRef[]; label: string };
    const [tagMenu, setTagMenu] = useState<TagMenuState | null>(null);
    /** 선 라벨 우클릭 — 이 선의 정션으로 간다: 타점 단위 선은 타점 태그, 차트 단위 선은 차트 태그. */
    const openTagMenuFor = useCallback((s: Line, ev: { clientX: number; clientY: number; preventDefault: () => void }): void => {
        ev.preventDefault();
        if (s.time) {
            setTagMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points: [{ stockCode: s.stockCode, date: s.date, time: s.time }], label: `${nameOf(s.stockCode)} ${s.time.slice(0, 5)}` });
            return;
        }
        setTagMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts: [{ stockCode: s.stockCode, date: s.date }], label: `${nameOf(s.stockCode)} ${fmtDate(s.date)}` });
    }, [nameOf]);
    const openTagMenuForSelection = useCallback((ev: { clientX: number; clientY: number }): void => {
        const charts = [...effSelected]
            .map((k) => byKey.get(k))
            .filter((s): s is Line => !!s)
            .map((s) => ({ stockCode: s.stockCode, date: s.date }));
        if (charts.length === 0) return;
        setTagMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts, label: charts.length === 1 ? `${nameOf(charts[0].stockCode)} ${fmtDate(charts[0].date)}` : `선택 ${charts.length}개` });
    }, [effSelected, byKey, nameOf]);
    const openPointTagMenu = useCallback((points: PointRef[], label: string, ev: { clientX: number; clientY: number; preventDefault?: () => void }): void => {
        ev.preventDefault?.();
        if (points.length > 0) setTagMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points, label });
    }, []);

    /** 마커 평클릭 = 그 타점으로 이동 + 단일 선택. Ctrl = 타점 선택 토글(차트 라벨과 같은 손짓). */
    const onMarkerClick = useCallback((m: Marker, ev: { ctrlKey: boolean; metaKey: boolean }): void => {
        if (ev.ctrlKey || ev.metaKey) {
            setSelectedPks((prev) => {
                const next = new Set(prev);
                if (next.has(m.pk)) next.delete(m.pk);
                else next.add(m.pk);
                return next;
            });
            return;
        }
        setSelectedPks(new Set([m.pk]));
        goToPoint({ code: m.ref.stockCode, date: m.ref.date, time: m.ref.time }, "skeleton-overlay");
    }, [goToPoint]);

    // 목록 순서 = 라벨 지점의 % 내림차순 — 그림에서 위에 있는 선이 목록에서도 위라 눈이 안 헤맨다.
    const badgeRows = useMemo(() => {
        if (!badge) return [];
        return badge.members
            .map((k) => byKey.get(k))
            .filter((s): s is Line => !!s)
            .sort((a, b) => labelPointOf(b, labelAnchorMode).y - labelPointOf(a, labelAnchorMode).y);
    }, [badge, byKey, labelAnchorMode]);
    useEffect(() => { setBadge(null); setBadgeHover(null); setPointBadge(null); }, [boundsKey, anchor, grain, minuteView]);

    // 마커 라벨 축약 — 차트 라벨과 **별개 격자**(마커는 경로 위에 몰려 있어 더 촘촘한 칸을 쓴다).
    const [pointBadge, setPointBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
    const markerClusters = useMemo(() => {
        if (!showLabels || !scales || markers.length === 0) return [];
        const anchors = markers
            .filter((m) => !selectedPks.has(m.pk))
            .map((m) => ({ key: m.pk, x: scales.x(m.x), y: scales.y(m.y) }));
        return clusterLabels(anchors, 72, 13); // 칩에 종목명이 붙어 차트 라벨과 같은 폭 예산
    }, [showLabels, scales, markers, selectedPks]);

    // 타점 단위 선은 시각까지 — `26.07.08 삼성전자 09:30`(같은 차트의 타점 여러 개가 선 여러 개로 선다).
    const labelOf = (s: Line, dotFirst: boolean): JSX.Element => {
        const dot = <span style={labelDot(visualOf(s.key).color)} />;
        const text = (
            <span>
                <span style={{ color: "var(--text-tertiary)" }}>{fmtDate(s.date)}</span> {nameOf(s.stockCode)}
                {s.time && <span style={{ color: "var(--text-tertiary)" }}> {s.time.slice(0, 5)}</span>}
            </span>
        );
        return dotFirst ? <>{dot}{text}</> : <>{text}{dot}</>;
    };

    const labelSideOf = (leftPx: number): CSSProperties =>
        labelAtStart ? { left: leftPx - 2, transform: "translateY(-50%)" } : { left: leftPx + 2, transform: "translate(-100%, -50%)" };

    /** 마커 칩 — ▾시각. 컴포넌트가 아니라 함수인 이유: 패널 상태를 잔뜩 닫아 갖는데 매 렌더 새 컴포넌트면
     *  리액트가 매번 언마운트/마운트를 반복한다(호버가 튄다). */
    const markerChip = (m: Marker, left: number, top: number): JSX.Element => {
        const isSel = selectedPks.has(m.pk);
        const isActive = !!activePoint && activePoint.code === m.ref.stockCode && activePoint.date === m.ref.date && activePoint.time === m.ref.time;
        const color = isSel || isActive ? ACTIVE : "var(--text-secondary)";
        return (
            <button key={m.pk} onClick={(e) => onMarkerClick(m, e)}
                onContextMenu={(e) => openPointTagMenu([m.ref], `${nameOf(m.ref.stockCode)} ${m.ref.time.slice(0, 5)}`, e)}
                onMouseEnter={() => setHovered(m.s.key)} onMouseLeave={() => setHovered(null)}
                title={`${nameOf(m.ref.stockCode)} 타점 ${m.ref.time.slice(0, 5)} — 클릭=이동·선택 · Ctrl+클릭=다중선택 · 우클릭=타점 태그`}
                style={{ ...chip, ...markerChipPos(left, top), color, fontWeight: isSel || isActive ? 700 : 400, ...(isSel ? selectedChip(ACTIVE) : {}) }}>
                {/* 종목명 포함(사용자 확정) — 절대 배치는 여러 종목이 같은 벽시계에 겹쳐 시각만으론 누군지 모른다. */}
                ▾{m.ref.time.slice(0, 5)} {nameOf(m.ref.stockCode)}
            </button>
        );
    };

    return (
        <div style={wrap}>
            <div style={header}>
                {!isDaily && (
                    <ControlBox label="배치">
                        <TextToggle active={!isAbs} onClick={() => setMinuteView("norm")} title="기준점 정규화 — 골격끼리 시간이 정렬된다">정규화</TextToggle>
                        <Dot />
                        <TextToggle active={isAbs} onClick={() => setMinuteView("abs")} title="벽시계 배치 — 전일 종가 대비 %, 분봉 차트 보듯">절대</TextToggle>
                    </ControlBox>
                )}
                {/* 기준 토글은 일봉 전용 — 분봉 정규화는 타점 단위(원점=자기 시각 피벗)라 앵커 선택이 소멸했다. */}
                {isDaily && (
                    <ControlBox label="기준">
                        <TextToggle active={anchor === "last"} onClick={() => setAnchor("last")} title="마지막 피벗을 원점으로 — 끝이 한 점으로 정렬(뒤로 퍼짐)">마지막 점</TextToggle>
                        <Dot />
                        <TextToggle active={anchor === "first"} onClick={() => setAnchor("first")} title="첫 피벗을 원점으로 — 시작점에서 앞으로 퍼짐">첫 점</TextToggle>
                    </ControlBox>
                )}
                <ControlBox>
                    {!isDaily && (
                        <TextToggle active={onlySelected} onClick={() => setOnlySelected(!onlySelected)}
                            title="골격 패널의 차트 선택만 남긴다 — 일봉에서 무리를 만들고 여기서 분봉 경로를 확인. 선택이 비면 전체">
                            선택만
                        </TextToggle>
                    )}
                    <TextToggle active={showLevels} onClick={() => setShowLevels(!showLevels)} title="조사 중인 골격의 기준선·D선을 같은 % 공간에 얹는다" activeColor={PRICE_LINE}>선</TextToggle>
                    <TextToggle active={showLabels} onClick={() => setShowLabels(!showLabels)} title="앵커 반대쪽 끝에 종목·날짜 — 뭉치면 개수 뱃지, 눌러서 목록">라벨</TextToggle>
                    <TextToggle active={locked !== null} onClick={() => setLocked(locked ? null : autoBounds)} title="지금 척도를 붙든다 — 필터를 좁혀도 척도가 안 움직여 전후가 비교된다">척도 고정</TextToggle>
                </ControlBox>
                <span style={count}>
                    {lines.length}개
                    {population > lines.length && <span style={{ color: "var(--text-tertiary)" }}> / {population}</span>}
                </span>
                {/* 차트 선택 손잡이는 차트 단위 뷰에서만 — 타점 단위 뷰의 문법은 아래 타점 버튼이다. */}
                {!isPointUnit && effSelected.size > 0 && (
                    <button onClick={(e) => openTagMenuForSelection(e)} title="선택된 차트들에 태그 붙이기/떼기 — 그룹은 태그다" style={miniBtn}>
                        차트 {effSelected.size} 태그
                    </button>
                )}
                {!isPointUnit && selectedKeys.size > 0 && (
                    <button onClick={() => setSelectedKeys(new Set())} title="차트 선택 해제" style={miniBtn}>✕</button>
                )}
                {selectedPks.size > 0 && (
                    <button onClick={(e) => openPointTagMenu(
                        [...selectedPks].map((pk) => markerByPk.get(pk)?.ref ?? parsePointKey(pk)).filter((p): p is PointRef => p !== null),
                        `타점 ${selectedPks.size}개`, e)}
                        title="선택된 타점들에 태그 붙이기/떼기(타점 태그)" style={miniBtn}>
                        타점 {selectedPks.size} 태그
                    </button>
                )}
                {selectedPks.size > 0 && (
                    <button onClick={() => setSelectedPks(new Set())} title="타점 선택 해제" style={miniBtn}>✕</button>
                )}
                {zoomed && <button onClick={reset} title="원위치(더블클릭도 같음)" style={miniBtn}>원위치 ⤺</button>}
            </div>

            <div ref={wrapRef} onMouseDown={onWrapMouseDown} style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {feedQ.isLoading && <div style={muted}>불러오는 중…</div>}
                {!feedQ.isLoading && lines.length === 0 && (
                    <div style={muted}>
                        {isDaily ? "일봉 골격이 그려진 차트가 없습니다."
                            : isPointUnit ? "분봉 골격 위 타점이 없습니다(필터·선택만 보기에 걸렸을 수도)."
                                : "분봉 골격이 그려진 차트가 없습니다."}
                    </div>
                )}
                <svg ref={svgRef} width={size.w} height={size.h} onDoubleClick={reset}
                    style={{ display: "block", cursor: dragging ? "grabbing" : "default", touchAction: "none" }}>
                    <defs>
                        <clipPath id={clipId}><rect x={box.left} y={box.top} width={box.width} height={box.height} /></clipPath>
                    </defs>
                    {scales && bounds && (
                        <>
                            {/* 눈금 — 확대하면 d3 가 새 구간에 맞춰 다시 뽑는다(축이 곧 정보라 라벨이 따라와야 한다). */}
                            {scales.y.ticks(5).map((v) => (
                                <g key={`y${v}`}>
                                    <line x1={box.left} x2={box.left + box.width} y1={scales.y(v)} y2={scales.y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
                                    <text x={box.left - 5} y={scales.y(v) + 3} textAnchor="end" style={axisText}>{v.toFixed(0)}%</text>
                                </g>
                            ))}
                            {scales.x.ticks(6).map((v) => (
                                <text key={`x${v}`} x={scales.x(v)} y={size.h - 8} textAnchor="middle" style={axisText}>{fmtX(v, xUnit)}</text>
                            ))}

                            {/* 원점(0%·t=0) — **축 위 화살표**(사용자 확정). 화면을 가로지르는 흐린 점선은 그림에 묻혀
                                안 읽히고, 진하게 하면 골격을 가린다. xy 좌표축처럼 축에서 0을 가리키게 하면 둘 다 없다.
                                x=0 은 정규화 배치에서만 뜻이 있다(절대는 벽시계라 0시가 무의미). 클립 밖 = 축 여백에 그린다. */}
                            {(() => {
                                const zy = scales.y(0);
                                const zx = scales.x(0);
                                const bottom = box.top + box.height;
                                return (
                                    <>
                                        {/* 눈금 숫자가 축에서 5px 앞에 끝나므로 화살표는 6px 안쪽까지만(겹침 방지). */}
                                        {zy >= box.top && zy <= bottom && (
                                            <polygon points={`${box.left - 1},${zy} ${box.left - 6},${zy - 4} ${box.left - 6},${zy + 4}`} fill="var(--text-secondary)" />
                                        )}
                                        {!isAbs && zx >= box.left && zx <= box.left + box.width && (
                                            <polygon points={`${zx},${bottom + 1} ${zx - 4.5},${bottom + 8} ${zx + 4.5},${bottom + 8}`} fill="var(--text-secondary)" />
                                        )}
                                    </>
                                );
                            })()}

                            <g clipPath={`url(#${clipId})`}>

                                {lines.map((s) => {
                                    const { v, color } = visualOf(s.key);
                                    const pts = polylinePoints(s, scales.x, scales.y);
                                    const lit = v.role !== "base";
                                    const inspecting = s.key === inspectKey;
                                    return (
                                        // 선은 순수 그림 — 포인터를 안 받는다(손잡이는 라벨). 캔버스로 옮겨도 조작이 안 바뀐다.
                                        <g key={s.key} opacity={v.dim ? dimmed : lit ? 1 : baseOpacity} style={{ pointerEvents: "none" }}>
                                            {/* 선택에만 넓은 반투명 밑선 — 색만으로는 "붙잡혔다"가 잘 안 읽힌다. */}
                                            {v.role === "selected" && <polyline points={pts} fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round" opacity={0.18} />}
                                            {/* 미래는 점선 — 타점 단위 선은 원점(자기 시각) 이후 전부, 절대 뷰는 선택 타점 이후.
                                                타점까지가 판단, 이후는 결과라는 같은 문장이다. */}
                                            {(() => {
                                                const splitX = isPointUnit ? 0 : splitXByChart.get(s.key);
                                                if (splitX == null) return <polyline points={pts} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" />;
                                                const { past, future } = splitAtX(s.points, splitX);
                                                return (
                                                    <>
                                                        {past.length >= 2 && <polyline points={polylinePoints({ ...s, points: past }, scales.x, scales.y)} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" />}
                                                        {future.length >= 2 && <polyline points={polylinePoints({ ...s, points: future }, scales.x, scales.y)} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" strokeDasharray="4 4" />}
                                                    </>
                                                );
                                            })()}
                                            {/* 합성점(타점 종가)은 속 빈 원 — 손으로 찍은 점과 구분된다. */}
                                            {(lit || dotsForAll) && s.points.map((p, i) => (
                                                p.synthetic
                                                    ? <circle key={i} cx={scales.x(p.x)} cy={scales.y(p.y)} r={lit ? 3 : 2} fill="var(--bg-primary)" stroke={color} strokeWidth={1.2} />
                                                    : <circle key={i} cx={scales.x(p.x)} cy={scales.y(p.y)} r={lit ? 3 : 2} fill={color} />
                                            ))}
                                            {/* 피벗 값 — 조사 중인 하나에만(다중이면 수십 벌이 겹친다). **두 좌표를 갈라 놓는다**(사용자 확정):
                                                %는 점 옆, 시간은 점에서 시간축까지 **점선 수직선**을 내려 그 발치에서 읽는다.
                                                점 옆에 둘을 붙이면 라벨이 서로 겹치고, 무엇보다 "이 점이 축의 어디냐"가 눈으로 안 잡힌다. */}
                                            {inspecting && s.points.map((p, i) => {
                                                if (p.x === 0 && p.y === 0) return null;
                                                const px = scales.x(p.x);
                                                const py = scales.y(p.y);
                                                return (
                                                    <g key={`pv${i}`}>
                                                        <line x1={px} x2={px} y1={py} y2={box.top + box.height} stroke={color} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.55} />
                                                        <text x={px} y={box.top + box.height - 4} textAnchor="middle"
                                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                            style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                                            {fmtX(p.x, xUnit)}
                                                        </text>
                                                        <text x={px} y={py + (p.synthetic ? 13 : -7)} textAnchor="middle"
                                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                            style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                                            {fmtPct(p.y)}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                            {/* 타점 세로선(절대 뷰) — "선택·조사 중인 것에만". 시간 라벨은 마커 칩의 몫(선은 위치만).
                                                타점 단위 뷰엔 없다 — 원점 세로선(t=0)이 곧 그 타점이다. */}
                                            {inspecting && isAbs && (pointsByChart.get(s.chartKey) ?? []).map((p) => {
                                                const x = scales.x(minutesOf(p.time) - s.baseT);
                                                const isActive = activePoint && activePoint.code === p.stockCode && activePoint.date === p.date && activePoint.time === p.time;
                                                return (
                                                    <line key={p.time} x1={x} x2={x} y1={box.top} y2={box.top + box.height}
                                                        stroke={isActive ? ACTIVE : "var(--text-tertiary)"} strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
                                                );
                                            })}
                                        </g>
                                    );
                                })}

                                {/* 선택된 타점의 세로선(절대 뷰) — 조사 중이 아니어도 붙잡은 타점의 시각은 계속 보인다. */}
                                {isAbs && [...selectedPks].map((pk) => {
                                    const m = markerByPk.get(pk);
                                    if (!m) return null;
                                    const x = scales.x(m.x);
                                    return <line key={`sv${pk}`} x1={x} x2={x} y1={box.top} y2={box.top + box.height} stroke={ACTIVE} strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />;
                                })}

                                {/* 얹는 선(기준선·D선) — 같은 pct 환산. **주인이 스타일을 정한다**(사용자 확정):
                                    단일 선택 = 하늘색·라벨 오른쪽 / 호버 = 앰버·라벨 왼쪽. **둘 다 실선**이다 —
                                    색과 라벨 위치만으로 이미 갈리고, 점선은 가격 수준선을 읽기 어렵게만 했다(사용자 확정).
                                    다중 선택이면 호버 것만(수십 벌이 겹치므로).
                                    기준선 여부는 선 모양이 아니라 라벨의 "기준" 접두어 — 어차피 최저가 규칙이라 아래가 기준선. */}
                                {showLevels && scales && (() => {
                                    const single = effSelected.size === 1 ? [...effSelected][0] : null;
                                    const owners: { s: NormalizedSkeleton; color: string; right: boolean }[] = [];
                                    const sel = single ? byKey.get(single) : null;
                                    if (sel) owners.push({ s: sel, color: ACTIVE, right: true });
                                    const hov = hovered && hovered !== single ? byKey.get(hovered) : null;
                                    if (hov) owners.push({ s: hov, color: HOVER, right: false });
                                    return owners.map(({ s, color, right }) => (
                                        <g key={`lvl-${s.key}`} style={{ pointerEvents: "none" }}>
                                            {(levelsByChart.get(s.chartKey) ?? []).map((lv, i) => {
                                                const yPct = pct(lv.price, s.basePrice);
                                                const y = scales.y(yPct);
                                                return (
                                                    <g key={i}>
                                                        <line x1={box.left} x2={box.left + box.width} y1={y} y2={y}
                                                            stroke={color} strokeWidth={lv.baseline ? 1.4 : 1} opacity={0.85} />
                                                        <text x={right ? box.left + box.width - 4 : box.left + 4} y={y - 4} textAnchor={right ? "end" : "start"}
                                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                            style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                                            {lv.baseline ? "기준 " : ""}{fmtPct(yPct)}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    ));
                                })()}
                            </g>
                        </>
                    )}
                </svg>

                {/* 라벨 층 — HTML(칩 폭 계산 공짜 + d3 가 SVG mousedown 을 삼키는 문제 회피). 컨테이너는 포인터 통과. */}
                {scales && showLabels && (
                    <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
                        {clusters.map((c) => {
                            const left = c.x - box.left;
                            const top = c.y - box.top;
                            if (c.members.length > 1) {
                                const off: CSSProperties = labelAtStart
                                    ? { left: left + 6, transform: "translateY(-50%)" }
                                    : { left: left - 6, transform: "translate(-100%, -50%)" };
                                return (
                                    <button key={`c${c.x}|${c.y}`} onClick={(e) => setBadge({ x: e.clientX, y: e.clientY, members: c.members })}
                                        onMouseEnter={() => setBadgeHover(c.members)} onMouseLeave={() => setBadgeHover(null)}
                                        title={`${c.members.length}개 뭉침 — 올리면 무리가 켜지고, 누르면 목록`}
                                        style={{ ...chip, ...off, top, ...badgeChip }}>
                                        {c.members.length}
                                    </button>
                                );
                            }
                            const s = byKey.get(c.members[0]);
                            if (!s) return null;
                            return (
                                <button key={`c${c.x}|${c.y}`} onClick={(e) => onLabelClick(s, e)} onContextMenu={(e) => openTagMenuFor(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — 클릭=선택·이동 · Ctrl+클릭=다중선택 · 우클릭=태그`}
                                    style={{ ...chip, ...labelSideOf(left), top }}>
                                    {labelOf(s, labelAtStart)}
                                </button>
                            );
                        })}
                        {/* 타점 마커 칩(분봉) — ▾시각. 차트 라벨과 같은 문법: 클릭=이동·선택, Ctrl=다중, 우클릭=**타점** 태그,
                            뭉치면 ▾N 뱃지 → 목록. 마커 호버는 그 차트 선도 켠다(어느 경로의 타점인지 보이게). */}
                        {markerClusters.map((c) => {
                            const left = c.x - box.left;
                            const top = c.y - box.top;
                            if (c.members.length > 1) {
                                return (
                                    <button key={`m${c.x}|${c.y}`} onClick={(e) => setPointBadge({ x: e.clientX, y: e.clientY, members: c.members })}
                                        title={`타점 ${c.members.length}개 뭉침 — 눌러서 목록`}
                                        style={{ ...chip, ...markerChipPos(left, top), ...badgeChip }}>
                                        ▾{c.members.length}
                                    </button>
                                );
                            }
                            const m = markerByPk.get(c.members[0]);
                            if (!m) return null;
                            return markerChip(m, left, top);
                        })}
                        {/* 선택된 마커는 묶음 밖 — 언제나 그린다(차트 라벨과 같은 이유). */}
                        {[...selectedPks].map((pk) => {
                            const m = markerByPk.get(pk);
                            if (!m) return null;
                            return markerChip(m, scales.x(m.x) - box.left, scales.y(m.y) - box.top);
                        })}
                        {/* 선택·호버 라벨은 묶음 밖 — 언제나 그린다. ⚠ 호버 핸들러 필수: 라벨이 이 블록으로 옮겨
                            그려질 때 원래 엘리먼트가 언마운트라 mouseleave 를 안 쏜다(없으면 호버가 영영 안 풀린다). */}
                        {[...pinnedKeys].map((key) => {
                            const s = byKey.get(key);
                            if (!s) return null;
                            const p = labelPointOf(s, labelAnchorMode);
                            const { v, color } = visualOf(key);
                            return (
                                <button key={key} onClick={(e) => onLabelClick(s, e)} onContextMenu={(e) => openTagMenuFor(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — 클릭=선택·이동 · Ctrl+클릭=선택 해제 · 우클릭=태그`}
                                    style={{
                                        ...chip, ...labelSideOf(scales.x(p.x) - box.left), top: scales.y(p.y) - box.top,
                                        color, fontWeight: 700,
                                        // 선택된 것에만 상자 — 상태를 가진 컨트롤이라 그렇게 보여야 한다(눈으로 찾기도 쉽다).
                                        ...(v.role === "selected" ? selectedChip(color) : {}),
                                    }}>
                                    {labelOf(s, labelAtStart)}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 사각 선택 상자(Ctrl+드래그) */}
                {marquee && (
                    <div style={{
                        position: "absolute", pointerEvents: "none",
                        left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
                        width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
                        border: `1px dashed ${ACTIVE}`, background: "rgba(14,165,233,0.08)",
                    }} />
                )}

                {/* 크로스헤어 — 자기 상태(마우스 좌표)만 다시 그린다. 부모 렌더에 mousemove 를 태우면
                    이동마다 선 수백 개가 재조정된다(분리한 이유). 팬 중엔 숨긴다(사용자 확정). */}
                {scales && !dragging && <CrosshairLayer wrapRef={wrapRef} scales={scales} box={box} xUnit={xUnit} />}
            </div>

            {/* 뭉친 라벨의 멤버 목록 — 행 점이 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */}
            {badge && (
                <AnchoredPopover anchor={badge} onClose={closeBadge} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>{badge.members.length}개 골격</MenuLabel>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {badgeRows.map((s) => (
                            <div key={s.key} onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}>
                                <MenuItem onClick={() => { onLabelClick(s, { ctrlKey: false, metaKey: false }); closeBadge(); }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 3, background: groupColorOf(s.key), flexShrink: 0 }} />
                                        <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(s.date)}</span>
                                        <span>{nameOf(s.stockCode)}</span>
                                        {s.time && <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{s.time.slice(0, 5)}</span>}
                                    </span>
                                </MenuItem>
                            </div>
                        ))}
                    </div>
                </AnchoredPopover>
            )}

            {/* 뭉친 마커의 타점 목록 — 행 호버 = 그 차트 선이 켜진다. */}
            {pointBadge && (
                <AnchoredPopover anchor={pointBadge} onClose={() => setPointBadge(null)} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>{pointBadge.members.length}개 타점</MenuLabel>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {pointBadge.members.map((pk) => {
                            const m = markerByPk.get(pk);
                            if (!m) return null;
                            return (
                                <div key={pk} onMouseEnter={() => setHovered(m.s.key)} onMouseLeave={() => setHovered(null)}>
                                    <MenuItem onClick={() => { onMarkerClick(m, { ctrlKey: false, metaKey: false }); setPointBadge(null); }}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{m.ref.time.slice(0, 5)}</span>
                                            <span>{nameOf(m.ref.stockCode)}</span>
                                            <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(m.ref.date)}</span>
                                        </span>
                                    </MenuItem>
                                </div>
                            );
                        })}
                    </div>
                </AnchoredPopover>
            )}

            {/* 태그 메뉴 — 같은 창, 다른 정션: 차트 라벨은 chart_tags, 타점 마커는 review_point_tags. */}
            {tagMenu?.kind === "chart" && (
                <BulkTagMenu anchor={tagMenu} targets={tagMenu.charts} label={tagMenu.label} onClose={() => setTagMenu(null)}
                    hasTag={(c, id) => tagsView.chartTagIdsOf(c).includes(id)}
                    toggle={(c, id, on) => tagsView.toggleChart(c, id, on)} />
            )}
            {tagMenu?.kind === "point" && (
                <BulkTagMenu anchor={tagMenu} targets={tagMenu.points} label={tagMenu.label} onClose={() => setTagMenu(null)}
                    hasTag={(p, id) => tagsView.has(p, id)}
                    toggle={(p, id, on) => tagsView.toggle(p, id, on)} />
            )}

            <div style={footer}>
                {/* 조사 중인 선의 태그 — 그룹 소속이 발끝에서 바로 읽힌다(따로 열어보지 않게).
                    타점 단위 선은 타점 태그(차트 태그 상속 포함), 차트 단위 선은 차트 태그. */}
                {(() => {
                    const s = inspectKey ? byKey.get(inspectKey) : null;
                    const ids = s ? (s.time ? tagsView.tagIdsOf({ stockCode: s.stockCode, date: s.date, time: s.time }) : tagsView.chartTagIdsOf(s)) : [];
                    if (!s || ids.length === 0) return null;
                    return (
                        <span style={{ marginRight: 8 }}>
                            {ids.map((id) => {
                                const name = tagsView.tagById.get(id)?.name;
                                return name ? <span key={id} style={{ color: tagColor(name), fontWeight: 600, marginRight: 5 }}>{name}</span> : null;
                            })}
                            ·
                        </span>
                    );
                })()}
                {isDaily ? "일봉" : isAbs ? "분봉·절대(전일 종가 대비)" : "분봉·타점 정규화(선 1 = 타점 1, 원점 이후 점선=미래)"} · 세로 = % · 휠 = 가로 확대 · 축 드래그 = 그 축 확대 · 드래그 이동 · Ctrl+클릭/드래그 = 다중선택 · 우클릭 = 태그 · 더블클릭 원위치
                {locked && <span style={{ color: "var(--text-secondary)" }}> · 척도 고정됨</span>}
            </div>
        </div>
    );
}

/** 크로스헤어 — 마우스 위치의 (시간, %) 읽기. 상태를 여기 가둬 부모(선 수백 개)가 이동마다 안 그려지게. */
function CrosshairLayer({ wrapRef, scales, box, xUnit }: {
    wrapRef: RefObject<HTMLDivElement | null>;
    scales: Scales;
    box: { left: number; top: number; width: number; height: number };
    xUnit: XUnit;
}): JSX.Element | null {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const move = (e: MouseEvent): void => {
            const r = el.getBoundingClientRect();
            setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        };
        const leave = (): void => setPos(null);
        el.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", leave);
        return () => {
            el.removeEventListener("mousemove", move);
            el.removeEventListener("mouseleave", leave);
        };
    }, [wrapRef]);

    if (!pos || pos.x < box.left || pos.x > box.left + box.width || pos.y < box.top || pos.y > box.top + box.height) return null;
    const xv = scales.x.invert(pos.x);
    const yv = scales.y.invert(pos.y);
    // 읽기값은 커서 옆이 아니라 **축 가장자리 뱃지**(사용자 확정) — 차트 보던 습관 그대로 축에서 읽는다.
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* 점선 헤어라인 — 배경 없는 0폭 div 에 dashed border(1px div 배경으로는 점선이 안 된다). */}
            <div style={{ position: "absolute", left: pos.x, top: box.top, width: 0, height: box.height, borderLeft: "1px dashed var(--border-strong)", opacity: 0.8 }} />
            <div style={{ position: "absolute", left: box.left, top: pos.y, height: 0, width: box.width, borderTop: "1px dashed var(--border-strong)", opacity: 0.8 }} />
            {/* y 뱃지 — 왼쪽 % 축 위(눈금 숫자가 서는 자리, 오른끝을 축에 맞춘다). */}
            <div style={{ ...axisBadge, left: box.left - 2, top: pos.y - 7, transform: "translateX(-100%)" }}>{fmtPct(yv)}</div>
            {/* x 뱃지 — 아래 시간축 위. */}
            <div style={{ ...axisBadge, left: pos.x, bottom: 2, transform: "translateX(-50%)" }}>{fmtX(xv, xUnit)}</div>
        </div>
    );
}

/** 크로스헤어 축 뱃지 — 축 눈금 위에 얹히므로 불투명 배경으로 아래 숫자를 덮는다(겹쳐 보이면 둘 다 못 읽는다). */
const axisBadge: CSSProperties = {
    position: "absolute", fontSize: 9.5, lineHeight: "13px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-default)",
    borderRadius: 3, padding: "0 4px",
};

const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const header: CSSProperties = { flexShrink: 0, display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexWrap: "wrap" };
const footer: CSSProperties = { flexShrink: 0, padding: "3px 10px", borderTop: "1px solid var(--border-default)", fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const count: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const muted: CSSProperties = { position: "absolute", inset: 0, color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px", pointerEvents: "none" };
const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer", whiteSpace: "nowrap" };
// 라벨 — 상자 없이 후광 글자 + 그 선 색의 점(F안). 점이 끝점 좌표에 정확히 얹혀 어느 선인지 말한다.
const chip: CSSProperties = {
    position: "absolute", pointerEvents: "auto", cursor: "pointer", whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 3,
    fontFamily: "var(--font-sans)", fontSize: 9, lineHeight: "11px", fontVariantNumeric: "tabular-nums",
    padding: 0, border: "none", background: "none", color: "var(--text-primary)",
    textShadow: "0 0 3px var(--bg-primary), 0 0 3px var(--bg-primary), 0 0 2px var(--bg-primary)",
};
// 뱃지는 상자 유지 — 누르면 목록이 열리는 컨트롤이라 그렇게 보여야 한다.
const badgeChip: CSSProperties = {
    padding: "0 4px", borderRadius: 6, background: "var(--bg-secondary)",
    border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textShadow: "none",
};
const labelDot = (color: string): CSSProperties => ({ width: 4, height: 4, borderRadius: 2, background: color, flexShrink: 0 });
/** 마커 칩 자리 — 점 위 가운데(경로에 그려진 합성점 바로 위에 얹힌다). */
const markerChipPos = (left: number, top: number): CSSProperties => ({ left, top: top - 4, transform: "translate(-50%, -100%)" });
/** 선택된 라벨만 상자를 되받는다 — 클릭이 실제로 먹었다는 신호가 색만으로는 약하다. */
const selectedChip = (color: string): CSSProperties => ({
    background: "var(--bg-secondary)", border: `1px solid ${color}`, borderRadius: 3,
    padding: "1px 4px", textShadow: "none",
});
