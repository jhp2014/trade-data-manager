import { useMemo, useRef, useState, useEffect, useCallback, type CSSProperties, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { skeletonsQuery, anchoredChartsQuery, allPointsQuery } from "../api/queries.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import {
    normalizeSkeleton, absoluteSkeleton, trimmedBounds, polylinePoints, pct, lineOpacity, dimOpacity,
    labelPointOf, clusterLabels, lineVisual, keysInRect,
    type LineVisual, type NormalizedSkeleton, type OverlayBounds, type SkeletonAnchor,
} from "./skeleton/skeletonOverlay.js";
import { useOverlayZoom } from "./skeleton/useOverlayZoom.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { ACTIVE, HOVER, PRICE_LINE, seriesColor } from "../styles/palette.js";
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
const GRAIN_KEY = "wb.skeletonOverlayGrain";
const LEVELS_KEY = "wb.skeletonOverlayLevels";
const LABELS_KEY = "wb.skeletonOverlayLabels";
const MINVIEW_KEY = "wb.skeletonOverlayMinuteView";

const PAD = { left: 46, right: 14, top: 12, bottom: 24 };
/** 피벗 점 예산 — **원 개수**로 센다(골격당 피벗 수가 3~6으로 제각각이라 골격 수로 세면 임계가 두 배 흔들린다). */
const DOT_BUDGET = 1200;
/** 라벨 격자 한 칸(화면 px) — 라벨 하나가 차지하는 자리. 이보다 촘촘하면 뭉쳐서 개수 뱃지가 된다. */
const LABEL_CELL = { w: 72, h: 14 };

/** `2026-07-08` → `26.07.08`. 연도를 남기는 건 여러 해가 섞이기 때문(월·일만이면 같은 날로 보인다). */
const fmtDate = (d: string): string => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
const fmtPct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const minutesOf = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));
const hmOf = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };
type XUnit = "day" | "min" | "clock";
const fmtX = (x: number, unit: XUnit): string => (unit === "clock" ? hmOf(x) : `${Math.round(x)}${unit === "day" ? "일" : "분"}`);

export function SkeletonOverlayPanel(): JSX.Element {
    const [anchor, setAnchor] = usePersistedState<SkeletonAnchor>(ANCHOR_KEY, (o) => (o === "first" || o === "last" ? o : null), "last");
    const [grain, setGrain] = usePersistedState<"daily" | "minute">(GRAIN_KEY, (o) => (o === "daily" || o === "minute" ? o : null), "daily");
    const [minuteView, setMinuteView] = usePersistedState<"norm" | "abs">(MINVIEW_KEY, (o) => (o === "norm" || o === "abs" ? o : null), "norm");
    const [showLevels, setShowLevels] = usePersistedState<boolean>(LEVELS_KEY, (o) => (typeof o === "boolean" ? o : null), true);
    const [showLabels, setShowLabels] = usePersistedState<boolean>(LABELS_KEY, (o) => (typeof o === "boolean" ? o : null), true);

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const activePoint = useWorkbench((s) => s.activePoint);

    const feedQ = useQuery(skeletonsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const r = useRankFilterResult();
    const isDaily = grain === "daily";
    const isAbs = !isDaily && minuteView === "abs";
    const xUnit: XUnit = isDaily ? "day" : isAbs ? "clock" : "min";

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

    // 선택 → 골격. 두 모드 다 차트 단위: 필터 없으면 골격 있는 전 차트, 있으면 매칭 타점을 가진 차트만.
    const shapes = useMemo<NormalizedSkeleton[]>(() => {
        const feed = feedQ.data;
        if (!feed) return [];
        const allowed = r.isEmpty ? null : new Set(r.points.map((p) => `${p.stockCode}|${p.date}`));
        const out: NormalizedSkeleton[] = [];
        for (const e of isDaily ? feed.daily : feed.minute) {
            const key = `${e.stockCode}|${e.date}`;
            if (allowed && !allowed.has(key)) continue;
            const owner = { key, stockCode: e.stockCode, date: e.date };
            const n = isAbs ? absoluteSkeleton(e.pivots, e.prevClose, owner) : normalizeSkeleton(e.pivots, anchor, owner);
            if (n) out.push(n);
        }
        return out;
    }, [feedQ.data, r.points, r.isEmpty, isDaily, isAbs, anchor]);

    // 선은 언제나 차트 소유 — 두 모드가 같은 목록을 본다.
    const levelsByChart = useMemo(() => {
        const m = new Map<string, SkeletonWireLevel[]>();
        for (const l of feedQ.data?.levels ?? []) m.set(`${l.stockCode}|${l.date}`, l.levels);
        return m;
    }, [feedQ.data]);

    const population = (isDaily ? feedQ.data?.daily.length : feedQ.data?.minute.length) ?? 0;

    // ── 척도: 자동(현재 선택에서 매번) vs 고정(그 순간의 범위를 붙든다 — 필터 좁히기 전후 비교용).
    const [locked, setLocked] = useState<OverlayBounds | null>(null);
    const autoBounds = useMemo(() => trimmedBounds(shapes, 0.01), [shapes]);
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
    const { transform, reset, zoomed, dragging } = useOverlayZoom(svgRef, drawable, closeBadge);

    // 척도가 바뀌면(필터 변경 등) 뷰포트를 원위치 — 옛 변환이 남아 빈 공간을 보지 않게.
    const boundsKey = bounds ? `${bounds.minX}|${bounds.maxX}|${bounds.minY}|${bounds.maxY}` : "";
    useEffect(() => { reset(); }, [boundsKey, reset]);

    // 변환은 그림이 아니라 **스케일**에 건다 — 선 굵기가 안 늘어나고 눈금이 확대에 맞춰 다시 찍힌다.
    const scales = useMemo<Scales | null>(() => {
        if (!bounds) return null;
        const x = scaleLinear().domain([bounds.minX, bounds.maxX]).range([box.left, box.left + box.width]);
        const y = scaleLinear().domain([bounds.minY, bounds.maxY]).range([box.top + box.height, box.top]);
        return { x: transform.rescaleX(x), y: transform.rescaleY(y) };
    }, [bounds, box.left, box.top, box.width, box.height, transform]);

    // ── 선택(집합)·호버 — 화면 한정. 키가 두 모드 공통 차트키라 해상도를 오가도 선택이 유지된다.
    const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
    const [hovered, setHovered] = useState<string | null>(null);
    const byKey = useMemo(() => new Map(shapes.map((s) => [s.key, s])), [shapes]);
    const activeKey = activePoint ? `${activePoint.code}|${activePoint.date}` : null;
    // 로컬 선택이 없으면 활성 타점의 차트를 단일 선택으로 — 다른 패널과의 링크가 이걸로 이어진다.
    const effSelected = useMemo<ReadonlySet<string>>(
        () => (selectedKeys.size > 0 ? selectedKeys : activeKey && byKey.has(activeKey) ? new Set([activeKey]) : new Set()),
        [selectedKeys, activeKey, byKey],
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
    const dotsForAll = useMemo(() => shapes.reduce((n, s) => n + s.points.length, 0) <= DOT_BUDGET, [shapes]);
    const baseOpacity = lineOpacity(shapes.length);
    const dimmed = dimOpacity(shapes.length);
    const labelAtStart = !isAbs && anchor === "last"; // 절대 배치는 경로 끝(오른쪽)에 라벨

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

    /** 평클릭 = 이동 + 단일 선택(교체). Ctrl+클릭 = 선택 토글만(이동 없음 — 무리를 만드는 중이다). */
    const onLabelClick = useCallback((s: NormalizedSkeleton, ev: { ctrlKey: boolean; metaKey: boolean }): void => {
        if (ev.ctrlKey || ev.metaKey) {
            setSelectedKeys((prev) => {
                const next = new Set(prev.size > 0 ? prev : effSelected); // 활성 타점 폴백 선택도 무리의 시작점이 된다
                if (next.has(s.key)) next.delete(s.key);
                else next.add(s.key);
                return next;
            });
            return;
        }
        setSelectedKeys(new Set([s.key]));
        const pts = pointsByChart.get(s.key);
        if (pts?.length) goToPoint({ code: s.stockCode, date: s.date, time: pts[0].time }, "skeleton-overlay");
        else setFocus({ code: s.stockCode, date: s.date, time: null }, "skeleton-overlay");
    }, [effSelected, pointsByChart, goToPoint, setFocus]);

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
            const hit = keysInRect(shapes, scales.x, scales.y, rect);
            if (hit.length === 0) return;
            setSelectedKeys((prev) => new Set([...(prev.size > 0 ? prev : effSelected), ...hit])); // 합집합(누적)
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        e.preventDefault();
    }, [scales, shapes, effSelected]);

    // 라벨 축약 — 화면 좌표로 묶는다. 확대하면 칸이 쪼개지며 뱃지가 저절로 풀린다(숨김이 아니라 압축).
    // 선택·호버는 묶음에서 빼고 따로 그린다. 그룹 멤버는 안 뺀다 — 이름은 목록이 대고 그림은 색으로 답한다.
    const pinnedKeys = useMemo(() => new Set([...effSelected, ...(hovered ? [hovered] : [])]), [effSelected, hovered]);
    const clusters = useMemo(() => {
        if (!showLabels || !scales) return [];
        const anchors = shapes
            .filter((s) => !pinnedKeys.has(s.key))
            .map((s) => { const p = labelPointOf(s, isAbs ? "first" : anchor); return { key: s.key, x: scales.x(p.x), y: scales.y(p.y) }; });
        return clusterLabels(anchors, LABEL_CELL.w, LABEL_CELL.h);
    }, [showLabels, scales, shapes, anchor, isAbs, pinnedKeys]);

    // 목록 순서 = 라벨 지점의 % 내림차순 — 그림에서 위에 있는 선이 목록에서도 위라 눈이 안 헤맨다.
    const badgeRows = useMemo(() => {
        if (!badge) return [];
        return badge.members
            .map((k) => byKey.get(k))
            .filter((s): s is NormalizedSkeleton => !!s)
            .sort((a, b) => labelPointOf(b, anchor).y - labelPointOf(a, anchor).y);
    }, [badge, byKey, anchor]);
    useEffect(() => { setBadge(null); setBadgeHover(null); }, [boundsKey, anchor, grain, minuteView]);

    const labelOf = (s: NormalizedSkeleton, dotFirst: boolean): JSX.Element => {
        const dot = <span style={labelDot(visualOf(s.key).color)} />;
        const text = (
            <span>
                <span style={{ color: "var(--text-tertiary)" }}>{fmtDate(s.date)}</span> {nameOf(s.stockCode)}
            </span>
        );
        return dotFirst ? <>{dot}{text}</> : <>{text}{dot}</>;
    };

    const labelSideOf = (leftPx: number): CSSProperties =>
        labelAtStart ? { left: leftPx - 2, transform: "translateY(-50%)" } : { left: leftPx + 2, transform: "translate(-100%, -50%)" };

    return (
        <div style={wrap}>
            <div style={header}>
                <ControlBox label="골격">
                    <TextToggle active={isDaily} onClick={() => setGrain("daily")} title="일봉 골격 — 차트 단위(타점이 없어도 나온다)">일봉</TextToggle>
                    <Dot />
                    <TextToggle active={!isDaily} onClick={() => setGrain("minute")} title="분봉 골격 — 그 날 장중 경로(타점 이후까지 보인다)">분봉</TextToggle>
                </ControlBox>
                {!isDaily && (
                    <ControlBox label="배치">
                        <TextToggle active={!isAbs} onClick={() => setMinuteView("norm")} title="기준점 정규화 — 골격끼리 시간이 정렬된다">정규화</TextToggle>
                        <Dot />
                        <TextToggle active={isAbs} onClick={() => setMinuteView("abs")} title="벽시계 배치 — 전일 종가 대비 %, 분봉 차트 보듯">절대</TextToggle>
                    </ControlBox>
                )}
                {!isAbs && (
                    <ControlBox label="기준">
                        <TextToggle active={anchor === "last"} onClick={() => setAnchor("last")} title="마지막 피벗을 원점으로 — 끝이 한 점으로 정렬(뒤로 퍼짐)">마지막 점</TextToggle>
                        <Dot />
                        <TextToggle active={anchor === "first"} onClick={() => setAnchor("first")} title="첫 피벗을 원점으로 — 시작점에서 앞으로 퍼짐">첫 점</TextToggle>
                    </ControlBox>
                )}
                <ControlBox>
                    <TextToggle active={showLevels} onClick={() => setShowLevels(!showLevels)} title="조사 중인 골격의 기준선·D선을 같은 % 공간에 얹는다" activeColor={PRICE_LINE}>선</TextToggle>
                    <TextToggle active={showLabels} onClick={() => setShowLabels(!showLabels)} title="앵커 반대쪽 끝에 종목·날짜 — 뭉치면 개수 뱃지, 눌러서 목록">라벨</TextToggle>
                    <TextToggle active={locked !== null} onClick={() => setLocked(locked ? null : autoBounds)} title="지금 척도를 붙든다 — 필터를 좁혀도 척도가 안 움직여 전후가 비교된다">척도 고정</TextToggle>
                </ControlBox>
                <span style={count}>
                    {shapes.length}개
                    {population > shapes.length && <span style={{ color: "var(--text-tertiary)" }}> / {population}</span>}
                </span>
                {selectedKeys.size > 0 && (
                    <button onClick={() => setSelectedKeys(new Set())} title="다중 선택 해제" style={miniBtn}>선택 {selectedKeys.size} ✕</button>
                )}
                {zoomed && <button onClick={reset} title="원위치(더블클릭도 같음)" style={miniBtn}>원위치 ⤺</button>}
            </div>

            <div ref={wrapRef} onMouseDown={onWrapMouseDown} style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {feedQ.isLoading && <div style={muted}>불러오는 중…</div>}
                {!feedQ.isLoading && shapes.length === 0 && (
                    <div style={muted}>{isDaily ? "일봉 골격이 그려진 차트가 없습니다." : "분봉 골격이 그려진 차트가 없습니다."}</div>
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

                            <g clipPath={`url(#${clipId})`}>
                                {/* 기준선(0%) — 정규화면 앵커 높이, 절대면 전일 종가. 세로선(t=0)은 정규화에서만 뜻이 있다. */}
                                <line x1={box.left} x2={box.left + box.width} y1={scales.y(0)} y2={scales.y(0)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
                                {!isAbs && <line x1={scales.x(0)} x2={scales.x(0)} y1={box.top} y2={box.top + box.height} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />}

                                {shapes.map((s) => {
                                    const { v, color } = visualOf(s.key);
                                    const pts = polylinePoints(s, scales.x, scales.y);
                                    const lit = v.role !== "base";
                                    const inspecting = s.key === inspectKey;
                                    return (
                                        // 선은 순수 그림 — 포인터를 안 받는다(손잡이는 라벨). 캔버스로 옮겨도 조작이 안 바뀐다.
                                        <g key={s.key} opacity={v.dim ? dimmed : lit ? 1 : baseOpacity} style={{ pointerEvents: "none" }}>
                                            {/* 선택에만 넓은 반투명 밑선 — 색만으로는 "붙잡혔다"가 잘 안 읽힌다. */}
                                            {v.role === "selected" && <polyline points={pts} fill="none" stroke={color} strokeWidth={7} strokeLinejoin="round" opacity={0.18} />}
                                            <polyline points={pts} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" />
                                            {(lit || dotsForAll) && s.points.map((p, i) => (
                                                <circle key={i} cx={scales.x(p.x)} cy={scales.y(p.y)} r={lit ? 3 : 2} fill={color} />
                                            ))}
                                            {/* 피벗 값 — 기준 대비 %와 시간. 조사 중인 하나에만(다중이면 수십 벌이 겹친다). */}
                                            {inspecting && s.points.map((p, i) => (p.x === 0 && p.y === 0 ? null : (
                                                <text key={`pv${i}`} x={scales.x(p.x)} y={scales.y(p.y) - 7} textAnchor="middle"
                                                    stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                    style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                                    {fmtPct(p.y)} · {fmtX(p.x, xUnit)}
                                                </text>
                                            )))}
                                            {/* 타점 세로선(분봉) — 이 차트의 타점들이 경로 어디에 서 있나. */}
                                            {inspecting && !isDaily && (pointsByChart.get(s.key) ?? []).map((p) => {
                                                const x = scales.x(minutesOf(p.time) - s.baseT);
                                                const isActive = activePoint && activePoint.code === p.stockCode && activePoint.date === p.date && activePoint.time === p.time;
                                                return (
                                                    <g key={p.time}>
                                                        <line x1={x} x2={x} y1={box.top} y2={box.top + box.height}
                                                            stroke={isActive ? ACTIVE : "var(--text-tertiary)"} strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
                                                        <text x={x} y={box.top + 9} textAnchor="middle"
                                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                            style={{ fontSize: 8.5, fill: isActive ? ACTIVE : "var(--text-tertiary)" }}>
                                                            {p.time.slice(0, 5)}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                            {/* 얹는 선(기준선·D선) — 같은 pct 환산. 조사 중인 하나에만. 기준선(리졸버 확정)은
                                                실선+라벨, 나머지 선은 점선 — 어느 선이 그 기준선인지 그림에서 구분된다. */}
                                            {inspecting && showLevels && (levelsByChart.get(s.key) ?? []).map((lv, i) => {
                                                const yPct = pct(lv.price, s.basePrice);
                                                const y = scales.y(yPct);
                                                return (
                                                    <g key={`lv${i}`}>
                                                        <line x1={box.left} x2={box.left + box.width} y1={y} y2={y}
                                                            stroke={PRICE_LINE} strokeWidth={lv.baseline ? 1.5 : 1} strokeDasharray={lv.baseline ? undefined : "4 3"} opacity={lv.baseline ? 0.95 : 0.6} />
                                                        <text x={box.left + box.width - 4} y={y - 4} textAnchor="end"
                                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                            style={{ fontSize: 9, fill: PRICE_LINE, fontVariantNumeric: "tabular-nums" }}>
                                                            {lv.baseline ? "기준 " : ""}{fmtPct(yPct)}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    );
                                })}
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
                                <button key={`c${c.x}|${c.y}`} onClick={(e) => onLabelClick(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — 클릭=선택·이동 · Ctrl+클릭=다중선택`}
                                    style={{ ...chip, ...labelSideOf(left), top }}>
                                    {labelOf(s, labelAtStart)}
                                </button>
                            );
                        })}
                        {/* 선택·호버 라벨은 묶음 밖 — 언제나 그린다. ⚠ 호버 핸들러 필수: 라벨이 이 블록으로 옮겨
                            그려질 때 원래 엘리먼트가 언마운트라 mouseleave 를 안 쏜다(없으면 호버가 영영 안 풀린다). */}
                        {[...pinnedKeys].map((key) => {
                            const s = byKey.get(key);
                            if (!s) return null;
                            const p = labelPointOf(s, isAbs ? "first" : anchor);
                            const { v, color } = visualOf(key);
                            return (
                                <button key={key} onClick={(e) => onLabelClick(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — 클릭=선택·이동 · Ctrl+클릭=선택 해제`}
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
                    이동마다 선 수백 개가 재조정된다(분리한 이유). */}
                {scales && <CrosshairLayer wrapRef={wrapRef} scales={scales} box={box} xUnit={xUnit} />}
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
                                    </span>
                                </MenuItem>
                            </div>
                        ))}
                    </div>
                </AnchoredPopover>
            )}

            <div style={footer}>
                {isDaily ? "일봉" : isAbs ? "분봉·절대(전일 종가 대비)" : "분봉·정규화"} · 세로 = % · 휠 확대 · 드래그 이동 · Ctrl+클릭/드래그 = 다중선택 · 더블클릭 원위치
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
    // 읽기값은 커서 오른쪽 위 — 오른쪽 가장자리에선 왼쪽으로 뒤집는다(잘리지 않게).
    const flip = pos.x > box.left + box.width - 90;
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: pos.x, top: box.top, width: 1, height: box.height, background: "var(--border-strong)", opacity: 0.7 }} />
            <div style={{ position: "absolute", left: box.left, top: pos.y, height: 1, width: box.width, background: "var(--border-strong)", opacity: 0.7 }} />
            <div style={{
                position: "absolute", top: pos.y - 18, ...(flip ? { right: (box.left + box.width) - pos.x + 6 } : { left: pos.x + 6 }),
                fontSize: 10, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-secondary)",
                background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 3, padding: "1px 5px",
            }}>
                {fmtX(xv, xUnit)} · {fmtPct(yv)}
            </div>
        </div>
    );
}

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
/** 선택된 라벨만 상자를 되받는다 — 클릭이 실제로 먹었다는 신호가 색만으로는 약하다. */
const selectedChip = (color: string): CSSProperties => ({
    background: "var(--bg-secondary)", border: `1px solid ${color}`, borderRadius: 3,
    padding: "1px 4px", textShadow: "none",
});
