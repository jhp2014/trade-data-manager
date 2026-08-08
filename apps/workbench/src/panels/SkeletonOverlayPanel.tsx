import { useMemo, useRef, useState, useEffect, useCallback, type CSSProperties, type RefObject } from "react";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { minuteOfDayOf, selectHotUniverse, amountBucketIndex } from "@trade-data-manager/market/domain";
import { AMOUNT_LEVEL_OF_BUCKET, AMOUNT_LEVEL_WIDTH, AMOUNT_LEVEL_EDGES_EOK } from "../chart/chartUtils.js";
import {
    dailyFrame, pointUnitFrame, absoluteFrame, splitAtX, polylinePoints, pct, minutesOf,
    lineOpacity, dimOpacity, labelPointOf, clusterLabels, lineVisual, keysInRect,
    amountRuns, minuteIndexOf, minuteAmountOf, pickAmountLabels, spreadByY, segmentIndexOf, LEVEL_MISSING, type AmountRun,
    type LineVisual, type NormalizedSkeleton, type OverlayLine, type OverlayBounds, type SkeletonAnchor,
} from "./skeleton/skeletonOverlay.js";
import { useOverlayData, type OverlayMarker } from "./skeleton/useOverlayData.js";
import { useDaySnapshot } from "./skeleton/useDaySnapshot.js";
import { themeLines, hotCodesInRange, readingsAt, layoutAxisColumns, type ThemeReading } from "./skeleton/themeSkeleton.js";
import { useOverlayZoom, type ZoomRegion } from "./skeleton/useOverlayZoom.js";
import { useMarquee, type MarqueeRect } from "./skeleton/useMarquee.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { useTags } from "../lib/useTags.js";
import { pointKeyOf, parsePointKey, chartKeyOf, type PointRef } from "../lib/pointKey.js";
import { BulkTagMenu } from "./skeleton/ChartTagMenu.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { ACTIVE, HOVER, PRICE_LINE, seriesColor, tagColor } from "../styles/palette.js";
import { fmtEok } from "../lib/format.js";

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
/** 라벨 칩과 끝점 사이 간격 — 피벗 손잡이(r=7) 밖에 서야 점 호버를 안 가로챈다. */
const LABEL_GAP = 9;
/** 핀 시각의 테마 값 한 칸(화면 px) — 세로로 이만큼 안에 들면 옆 열로 민다. */
const THEME_READING_CELL = { w: 78, h: 12 };
/**
 * 금액 라벨의 자리 규칙(화면 px). `w` = 가로 격자 한 칸이자 **겹침 판정 밴드 폭**(라벨 폭과 같게 잡아
 * 한 밴드 안은 반드시 겹치고 밴드끼리는 안 겹치게), `gap` = 세로로 벌릴 때의 최소 간격.
 */
const AMOUNT_LABEL_CELL = { w: 52, gap: 12 };
/**
 * 무리(선택·그룹) 안에서 안 짚은 선의 진하기. 색은 그대로 두고 이만큼만 물러난다 —
 * 목록 행을 훑을 때 짚은 하나가 무리 안에서도 또렷이 서게(굵기 차이만으론 약했다, 사용자 지적).
 * 무리 밖(dim)보다는 진하다: 무리에 속한다는 사실 자체는 계속 보여야 한다.
 */
const RECEDE_OPACITY = 0.3;

/** `2026-07-08` → `26.07.08`. 연도를 남기는 건 여러 해가 섞이기 때문(월·일만이면 같은 날로 보인다). */
const fmtDate = (d: string): string => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
const fmtPct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
/** 자정 기준 분 → HH:MM. 먼저 반올림하고 시·분을 한 값에서 뽑는다 — 따로 뽑으면 599.7분이 "09:00"이 된다. */
const hmOf = (m: number): string => {
    const t = Math.round(m);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 거래대금 구간 인덱스 → 굵기 단계. 구간 아래(-1)는 0단계. */
const amountLevelOf = (won: number): number => {
    const b = amountBucketIndex(won);
    return b < 0 ? 0 : AMOUNT_LEVEL_OF_BUCKET[b];
};

/**
 * 런의 획 굵기 — 단계 × 선의 배수. 재료 없음(분봉 결손)은 **가장 가늘게**: 조용한 것과 같은 굵기로
 * 그리면 "거래가 없었다"와 "모른다"가 한 모양이 된다.
 */
const runWidth = (level: number, scale: number): number =>
    (level === LEVEL_MISSING ? AMOUNT_LEVEL_WIDTH[0] * 0.6 : AMOUNT_LEVEL_WIDTH[level] ?? AMOUNT_LEVEL_WIDTH[0]) * scale;

/** 런의 화면 좌표 폴리라인 — 런은 꼭짓점을 다 들고 있으므로 그대로 이어 그린다(모서리가 안 잘린다). */
const runPoints = (r: AmountRun, scales: Scales): string =>
    r.points.map((p) => `${scales.x(p.x).toFixed(2)},${scales.y(p.y).toFixed(2)}`).join(" ");
/** 원점 좌표축의 색 — 눈금 격자(border-subtle)보다 진하고 골격 색과는 겹치지 않는 중성색. */
const AXIS_LINE = "var(--text-secondary)";

/** 화면의 선 하나 — kind 판별 유니온(차트 단위 ChartSkeleton / 타점 단위 PointSkeleton). */
type Line = OverlayLine;

type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };
type XUnit = "day" | "min" | "clock";
const fmtX = (x: number, unit: XUnit): string => (unit === "clock" ? hmOf(x) : `${Math.round(x)}${unit === "day" ? "일" : "분"}`);

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — 시나리오가 "일봉에서 무리 → 분봉으로 확인"의 동시 사용이라
 *  토글 하나로는 두 그림을 오가며 볼 수 없다. grain 은 패널 정체성이라 마운트 후 안 바뀐다. */
export function SkeletonOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    const [anchor, setAnchor] = usePersistedState<SkeletonAnchor>(ANCHOR_KEY, (o) => (o === "first" || o === "last" ? o : null), "last");
    const [minuteView, setMinuteView] = usePersistedState<"norm" | "abs">(MINVIEW_KEY, (o) => (o === "norm" || o === "abs" ? o : null), "norm");
    // 미래 포함(분봉 타점 정규화 전용) — 기본 창은 타점 이전이 주인공이라 미래를 마진만 남기고 자른다.
    // "타점 뒤로 어디까지 갔나"를 볼 땐 이 토글이 창을 데이터까지 넓힌다(축소로도 닿지만 한 번에 보게).
    const [showFuture, setShowFuture] = usePersistedState<boolean>("wb.skeletonOverlayFuture", (o) => (typeof o === "boolean" ? o : null), false);
    const [showLevels, setShowLevels] = usePersistedState<boolean>(`wb.skeletonOverlayLevels.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);
    const [showLabels, setShowLabels] = usePersistedState<boolean>(`wb.skeletonOverlayLabels.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const activePoint = useWorkbench((s) => s.activePoint);

    const isDaily = grain === "daily";
    const isAbs = !isDaily && minuteView === "abs";
    /** 분봉 정규화 = **타점 단위**(사용자 확정): 선 하나 = 타점 하나(자기 시각 피벗이 원점). */
    const isPointUnit = !isDaily && !isAbs;
    const xUnit: XUnit = isDaily ? "day" : isAbs ? "clock" : "min";

    // "선택만 보기"(분봉 전용) — 일봉 패널에서 만든 선택 무리만 남긴다. 선택이 비면 제한 없음(빈 화면 함정 방지).
    const [onlySelected, setOnlySelected] = useState(false);
    const skeletonSelection = useWorkbench((s) => s.skeletonSelection);
    const onlyCharts = !isDaily && onlySelected && skeletonSelection.size > 0 ? skeletonSelection : null;

    // 태그 한 벌 — 태그 메뉴·발끝 표기(여기) + 차트 태그 필터 판정(데이터 훅)이 같은 인스턴스를 쓴다.
    const tagsView = useTags();
    // 데이터 절반 — 조립·필터 판정은 전부 useOverlayData. 이 컴포넌트엔 렌더 상태(선택·호버·확대·메뉴)만 남는다.
    const { feedLoading, lines, markers, markerByPk, population, missingPrevClose, levelsByChart, pointsByChart, nameOf } =
        useOverlayData({ isDaily, isAbs, isPointUnit }, anchor, onlyCharts, tagsView);

    // ── 척도: 기본 창(뷰마다 다른 규칙) vs 고정(그 순간의 범위를 붙든다 — 필터 좁히기 전후 비교용).
    //  · 일봉 정규화 = 상수 창(−60~+10일 · −60~+40%) — 필터가 바뀌어도 같은 되돌림이 같은 크기로 선다.
    //  · 분봉 타점 정규화 = 양의 쪽 마진만(+10분·+5%), 음의 쪽은 데이터만큼(관심사가 타점 이전이다).
    //  · 분봉 절대 = 고정 프레임(±15분 · −5~+30%).
    const [locked, setLocked] = useState<OverlayBounds | null>(null);
    const autoBounds = useMemo(
        () => (lines.length === 0 ? null : isDaily ? dailyFrame(anchor) : isAbs ? absoluteFrame(lines) : pointUnitFrame(lines, 0.01, showFuture)),
        [isDaily, isAbs, anchor, showFuture, lines],
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
    // 마커 뱃지 목록 — 차트 라벨 뱃지와 별개 상태(마커는 경로 위에 몰려 별개 격자를 쓴다). 선언을 badge 옆에
    // 두는 이유: 아래 "뷰 전환 시 닫기" effect 가 셋을 한꺼번에 닫는다(상태와 소비가 떨어져 있으면 하나가 빠진다).
    const [pointBadge, setPointBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
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
            : chartKeyOf(activePoint.code, activePoint.date)
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
    // 라벨이 붙는 끝 — 골격 종목 이름은 **언제나 경로의 왼쪽 끝**(사용자 확정).
    // 절대 배치에선 예전에 오른쪽 끝이었는데, 테마 라벨도 오른쪽 끝이라 **둘이 겹쳤다**.
    // 골격=왼쪽 / 테마=오른쪽으로 갈라 두면 자리 싸움이 없다.
    // (타점 단위는 원래도 왼쪽 — 미래 점선 쪽은 결과라 손잡이를 안 둔다.)
    const labelAnchorMode: SkeletonAnchor = isPointUnit || isAbs ? "last" : anchor;
    const labelAtStart = isPointUnit || isAbs || anchor === "last";

    // 상세(피벗 값·기준선·타점 세로선)를 받을 "지금 조사 중인 하나" — 호버 우선, 없으면 단일 선택.
    const inspectKey = hovered ?? (effSelected.size === 1 ? [...effSelected][0] : null);

    // ── 구간 거래대금(분봉 전용) — 선분마다 분당 평균을 색에 싣는다.
    //
    // **대상이 inspectKey 가 아니라 단일 선택인 이유**: 이 값의 재료는 그날 복기 파생 한 벌(압축 해제 ~15MB)이라
    // 날짜가 바뀔 때마다 왕복이 생긴다. 호버는 라벨 위를 훑기만 해도 날짜가 계속 갈리는 손짓이라 그걸 방아쇠로
    // 삼으면 스치는 것마다 15MB 를 당긴다. 선택은 **누른** 것이라 왕복이 클릭 수만큼으로 묶인다.
    // (피벗 값·기준선 같은 공짜 상세는 지금처럼 호버가 이긴다 — 비용이 다르면 규칙도 갈려야 한다.)
    const [showAmount, setShowAmount] = usePersistedState<boolean>(`wb.skeletonOverlayAmount.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);
    const [showAmountLabels, setShowAmountLabels] = usePersistedState<boolean>(`wb.skeletonOverlayAmountLabels.${grain}`, (o) => (typeof o === "boolean" ? o : null), false);
    // 테마 펼치기(절대 뷰 전용) — 짚은 골격이 그린 구간의 테마 종목 경로를 분당 종가로 같이 세운다.
    const [showTheme, setShowTheme] = usePersistedState<boolean>("wb.skeletonOverlayTheme", (o) => (typeof o === "boolean" ? o : null), false);

    /** 거래대금·테마가 같이 보는 "지금 조사 중인 선 하나" — 단일 선택일 때만(위 이유). */
    const singleTarget = useMemo(
        () => (isDaily || effSelected.size !== 1 ? null : byKey.get([...effSelected][0]) ?? null),
        [isDaily, effSelected, byKey],
    );
    const amountTarget = showAmount ? singleTarget : null;
    // 한 벌만 받는다 — 거래대금과 테마가 같은 날짜의 같은 응답을 쓴다(LRU 도 한 자리만 쓴다).
    const snapQ = useDaySnapshot(showAmount || showTheme ? singleTarget?.date ?? null : null);
    /** 종목코드 → 분당 거래대금 조회기. 골격 선과 테마 선이 같은 자를 쓴다. */
    const amountLookup = useMemo(() => {
        const cache = new Map<string, ((m: number) => number | null) | null>();
        return (code: string): ((m: number) => number | null) | null => {
            const hit = cache.get(code);
            if (hit !== undefined) return hit;
            const st = snapQ.data?.stocks.find((x) => x.code === code);
            // 그날 유니버스 밖(거래대금·등락률 조건 미달) — 없는 값을 0으로 지어내지 않는다.
            const fn = st ? minuteAmountOf(minuteIndexOf(st.times, minuteOfDayOf), st.cumAmount) : null;
            cache.set(code, fn);
            return fn;
        };
    }, [snapQ.data]);
    const amounts = useMemo(() => {
        if (!amountTarget) return null;
        const at = amountLookup(amountTarget.stockCode);
        if (!at) return null;
        return { key: amountTarget.key, runs: amountRuns(amountTarget.points, amountTarget.baseT, at, amountLevelOf) };
    }, [amountTarget, amountLookup]);

    // ── 테마 선 — 절대 뷰에서만(좌표계가 같아야 환산 없이 얹힌다). 짚은 선이 하나일 때만 펼친다:
    // 여러 날의 테마를 한 벽시계에 겹치면 "이 종목이 혼자 튄 건가"라는 그 질문 자체가 흐려진다.
    const replaySettings = useWorkbench((s) => s.replaySettings);
    const themeOverlay = useMemo(() => {
        if (!isAbs || !showTheme || !singleTarget || !snapQ.data) return null;
        const src = snapQ.data.stocks;
        const mins = singleTarget.points.map((p) => p.x + singleTarget.baseT);
        const from = Math.min(...mins);
        const to = Math.max(...mins);
        const hot = hotCodesInRange(src, from, to, minuteOfDayOf, (snaps) => selectHotUniverse(snaps, replaySettings.amountN, replaySettings.rateN));
        return { key: singleTarget.key, lines: themeLines(singleTarget, src, hot, minuteOfDayOf) };
    }, [isAbs, showTheme, singleTarget, snapQ.data, replaySettings.amountN, replaySettings.rateN]);
    /** 손이 올라간 테마 선(들) — 뭉친 라벨이면 그 무리 전부. 이것만 선명해지고 나머지는 무채색으로 남는다. */
    const [hoveredTheme, setHoveredTheme] = useState<readonly string[] | null>(null);
    const hoveredThemeSet = useMemo(() => (hoveredTheme ? new Set(hoveredTheme) : null), [hoveredTheme]);
    useEffect(() => { setHoveredTheme(null); }, [themeOverlay?.key]);

    /** 테마 선들의 분당 색 런 — **전부** 미리 굽는다(호버 하나만이 아니라, 사용자 확정).
     *  절대 구간 색이라 흐리게 깔아도 단계가 살아남는다 → 테마 전체의 자금 유입 타이밍이 한 화면에 깔린다.
     *  테마 선의 x 는 이미 벽시계 분이라 baseT = 0(앵커 정규화를 안 거친다). */
    const themeRuns = useMemo(() => {
        if (!themeOverlay) return null;
        const m = new Map<string, AmountRun[]>();
        for (const l of themeOverlay.lines) {
            const at = amountLookup(l.code);
            if (at) m.set(l.code, amountRuns(l.points, 0, at, amountLevelOf));
        }
        return m;
    }, [themeOverlay, amountLookup]);
    /** 테마 선마다 고정 색 — **선이 아니라 라벨의 점에만** 쓴다(선을 칠하면 30선이 무지개가 된다).
     *  좌측 이름 라벨과 금액 라벨이 같은 색 점을 달아 "이 숫자가 저 종목 것"이 눈으로 이어진다. */
    const themeColorOf = useMemo(() => {
        const m = new Map<string, string>();
        themeOverlay?.lines.forEach((l, i) => m.set(l.code, seriesColor(i)));
        return (code: string): string => m.get(code) ?? "var(--text-secondary)";
    }, [themeOverlay]);

    // ── 피벗 좌표는 **짚은 점에만** 붙는다(사용자 확정).
    // 예전엔 조사 중인 골격의 점 **전부**에 값이 떴는데, 분봉 골격은 꺾인 점이 많아 화면이 숫자로 뒤덮였다.
    // 이제 두 단계다: 손을 올리면 그 하나를 **미리 보고**, 누르면 **붙잡는다**(다시 누르면 뗀다).
    // 붙잡은 건 선을 떠나도 남아서 여러 점의 값을 나란히 놓고 볼 수 있다 — 이 패널의 선택/호버 문법 그대로.
    const [hoveredPivot, setHoveredPivot] = useState<{ key: string; i: number } | null>(null);
    const [pinnedPivots, setPinnedPivots] = useState<ReadonlySet<string>>(() => new Set());
    const pivotId = (key: string, i: number): string => `${key}|${i}`;
    const togglePivot = useCallback((key: string, i: number): void => {
        setPinnedPivots((prev) => {
            const next = new Set(prev);
            const id = `${key}|${i}`;
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);
    /** 이 점의 값을 지금 그리나 — 붙잡았거나(핀) 손이 올라가 있거나. */
    const pivotShown = (key: string, i: number): boolean =>
        pinnedPivots.has(pivotId(key, i)) || (hoveredPivot?.key === key && hoveredPivot.i === i);
    /** 값을 그리는 점이 하나라도 있는 선 — 그 선은 손잡이(히트 원)를 계속 내줘야 핀을 뗄 수 있다. */
    const linesWithPins = useMemo(() => {
        const s = new Set<string>();
        for (const id of pinnedPivots) s.add(id.slice(0, id.lastIndexOf("|")));
        return s;
    }, [pinnedPivots]);

    /**
     * 붙잡은 피벗 시각의 테마 값 — 그 x 에서 모든 테마 선의 y 를 읽어 **y축 옆에 열로 쌓는다**(사용자 확정).
     * 핀마다 한 열 묶음이라 x₁·x₂ 의 값이 섞이지 않고, 열이 곧 "어느 시각 것이냐"를 말한다.
     * 핀은 앵커 골격의 것만 본다 — 테마 선엔 피벗이 없다(분당 경로라 모든 분이 점이다).
     */
    /** 앵커 골격의 피벗 시각(벽시계 분) — **테마 점이 설 수 있는 자리**의 전부다(사용자 확정). */
    const anchorPivotMinutes = useMemo(
        () => (singleTarget ? singleTarget.points.map((p) => p.x + singleTarget.baseT) : []),
        [singleTarget],
    );

    /** 앵커 골격에서 붙잡은 피벗의 벽시계 분(시각 순) — 테마 값을 펼치는 세로선이 서는 자리. */
    const pinnedMinutes = useMemo(() => {
        if (!singleTarget) return [];
        return [...pinnedPivots]
            .filter((id) => id.slice(0, id.lastIndexOf("|")) === singleTarget.key)
            .map((id) => Number(id.slice(id.lastIndexOf("|") + 1)))
            .filter((i) => Number.isInteger(i) && i >= 0 && i < singleTarget.points.length)
            .map((i) => singleTarget.points[i].x + singleTarget.baseT)
            .sort((a, b) => a - b);
    }, [singleTarget, pinnedPivots]);
    /**
     * 지금 테마 값을 펼쳐 보는 시각 — 상시가 아니라 **손을 올렸을 때만**(사용자 확정).
     * 두 손짓이 같은 자리로 들어온다: 앵커 골격의 **어느 피벗에든 호버**(붙잡은 것이 아니어도)와,
     * 붙잡은 핀의 세로선 호버. 값을 보려고 굳이 먼저 클릭해야 할 이유가 없다.
     */
    const [hoveredPinLine, setHoveredPinLine] = useState<number | null>(null);
    useEffect(() => { setHoveredPinLine(null); }, [themeOverlay?.key]);
    const openReadingMinute = useMemo(() => {
        if (hoveredPinLine !== null) return hoveredPinLine;
        if (!singleTarget || !hoveredPivot || hoveredPivot.key !== singleTarget.key) return null;
        const p = singleTarget.points[hoveredPivot.i];
        return p ? p.x + singleTarget.baseT : null;
    }, [hoveredPinLine, singleTarget, hoveredPivot]);

    const themeReadingSlots = useMemo(() => {
        if (!themeOverlay || !scales || openReadingMinute === null) return [];
        // 겹침 판정은 **화면 좌표**로 한다 — 값 공간으로 하면 확대해도 열이 안 풀린다(라벨 축약과 같은 성질).
        const g = readingsAt(themeOverlay.lines, openReadingMinute).map((r) => ({ item: { ...r, minute: openReadingMinute }, y: scales.y(r.y) }));
        return layoutAxisColumns<ThemeReading & { minute: number }>([g], THEME_READING_CELL.h);
    }, [themeOverlay, openReadingMinute, scales]);

    /**
     * 금액 라벨 — **전 선(앵커 + 테마)이 하나의 격자에서 겨룬다**(사용자 확정). 한 칸에 제일 큰 하나만
     * 남으므로 화면엔 "지금 보이는 범위에서 제일 크게 터진 사건들"이 남고, 확대하면 작은 것들이
     * 하나씩 드러난다. 축소하면 결국 0이 된다 — 그 상태의 "어디가 터졌나"는 굵기가 답한다.
     * 후보는 구간에 든 런만(≥ 최하 경계) — 조용한 분까지 넣으면 격자가 뜻 없는 숫자로 찬다.
     */
    const amountLabels = useMemo(() => {
        if (!scales || !showAmountLabels) return [];
        type Cand = { group: string; seg: number; x: number; y: number; value: number; code: string; own: boolean };
        const cands: Cand[] = [];
        const collect = (runs: readonly AmountRun[], code: string, own: boolean, baseT: number): void => {
            for (const r of runs) {
                if (r.level <= 0) continue;
                // 라벨은 **터진 그 분**에 붙인다(런 중점이 아니라) — 중점은 사건이 난 자리가 아니다.
                cands.push({
                    group: code, seg: segmentIndexOf(anchorPivotMinutes, r.maxAt.x + baseT),
                    x: scales.x(r.maxAt.x), y: scales.y(r.maxAt.y), value: r.maxAmount, code, own,
                });
            }
        };
        if (amounts && amountTarget) collect(amounts.runs, amountTarget.stockCode, true, amountTarget.baseT);
        if (themeRuns) for (const [code, runs] of themeRuns) collect(runs, code, false, 0);
        // 솎기는 종목 안에서만 → 남은 것들이 세로로 겹치면 **탈락이 아니라 이동**(지시선이 원 자리를 가리킨다).
        return spreadByY(pickAmountLabels(cands, AMOUNT_LABEL_CELL.w), AMOUNT_LABEL_CELL.w, AMOUNT_LABEL_CELL.gap);
    }, [scales, showAmountLabels, amounts, amountTarget, themeRuns, anchorPivotMinutes]);

    /** 테마 라벨 자리 — 경로 **왼쪽 끝**(사용자 확정). 골격 이름 라벨과 같은 쪽이지만 x 가 갈린다:
     *  테마 선은 앵커의 첫 피벗에서 시작하고, 골격 선은 자기 첫 피벗에서 시작한다. */
    const themeClusters = useMemo(() => {
        if (!themeOverlay || !scales) return [];
        const anchors = themeOverlay.lines.map((l) => ({ key: l.code, x: scales.x(l.points[0].x), y: scales.y(l.points[0].y) }));
        return clusterLabels(anchors, 56, 12);
    }, [themeOverlay, scales]);

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
        if (s.kind === "point") {
            goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "skeleton-overlay");
            return;
        }
        const pts = pointsByChart.get(s.chartKey);
        if (pts?.length) goToPoint({ code: s.stockCode, date: s.date, time: pts[0].time }, "skeleton-overlay");
        else setFocus({ code: s.stockCode, date: s.date, time: null }, "skeleton-overlay");
    }, [setActiveSelection, effSelected, pointsByChart, goToPoint, setFocus]);

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

    // ── Ctrl+드래그 사각 선택 — 사각형 역학은 useMarquee 가, **무엇을 담을지**는 여기가 정한다.
    const onMarqueeSelect = useCallback((rect: MarqueeRect): void => {
        if (!scales) return;
        // 라벨 지점 판정 — 이 뷰의 선택 채널로 담는다(차트 단위=차트키, 타점 단위=pk. 문법은 하나).
        const hit = keysInRect(lines, labelAnchorMode, scales.x, scales.y, rect);
        if (hit.length > 0) setActiveSelection((prev: ReadonlySet<string>) => new Set([...(prev.size > 0 ? prev : effSelected), ...hit])); // 합집합(누적)
        // 타점 마커도 같은 드래그로 담는다(절대 뷰) — 잡힌 종류가 곧 뜻이다(라벨=차트 선택, 마커=타점 선택).
        const [l, rr] = rect.x0 <= rect.x1 ? [rect.x0, rect.x1] : [rect.x1, rect.x0];
        const [t, b] = rect.y0 <= rect.y1 ? [rect.y0, rect.y1] : [rect.y1, rect.y0];
        const mhit = markers.filter((m) => { const mx = scales.x(m.x); const my = scales.y(m.y); return mx >= l && mx <= rr && my >= t && my <= b; }).map((m) => m.pk);
        if (mhit.length > 0) setSelectedPks((prev) => new Set([...prev, ...mhit]));
    }, [scales, lines, effSelected, labelAnchorMode, markers, setActiveSelection]);
    const { marquee, onMouseDown: onWrapMouseDown } = useMarquee(wrapRef, !!scales, onMarqueeSelect);

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
        if (s.kind === "point") {
            setTagMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points: [{ stockCode: s.stockCode, date: s.date, time: s.time }], label: `${nameOf(s.stockCode)} ${s.time.slice(0, 5)}` });
            return;
        }
        setTagMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts: [{ stockCode: s.stockCode, date: s.date }], label: `${nameOf(s.stockCode)} ${fmtDate(s.date)}` });
    }, [nameOf]);
    // 선택 중 **이 패널에 실제로 있는** 차트 — 다른 골격 패널(일봉↔분봉)에서 만든 선택엔 여기 없는
    // 차트가 섞일 수 있다. 헤더 버튼 숫자와 메뉴 대상이 같은 목록을 봐야 "차트 3 태그"가 2개만 여는 일이 없다.
    const selectedCharts = useMemo(
        () => (isPointUnit ? [] : [...effSelected].map((k) => byKey.get(k)).filter((s): s is Line => !!s)),
        [isPointUnit, effSelected, byKey],
    );
    const openTagMenuForSelection = useCallback((ev: { clientX: number; clientY: number }): void => {
        const charts = selectedCharts.map((s) => ({ stockCode: s.stockCode, date: s.date }));
        if (charts.length === 0) return;
        setTagMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts, label: charts.length === 1 ? `${nameOf(charts[0].stockCode)} ${fmtDate(charts[0].date)}` : `선택 ${charts.length}개` });
    }, [selectedCharts, nameOf]);
    const openPointTagMenu = useCallback((points: PointRef[], label: string, ev: { clientX: number; clientY: number; preventDefault?: () => void }): void => {
        ev.preventDefault?.();
        if (points.length > 0) setTagMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points, label });
    }, []);

    /** 마커 평클릭 = 그 타점으로 이동 + 단일 선택. Ctrl = 타점 선택 토글(차트 라벨과 같은 손짓). */
    const onMarkerClick = useCallback((m: OverlayMarker, ev: { ctrlKey: boolean; metaKey: boolean }): void => {
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
    // 붙잡아 둔 피벗 값은 **뷰가 바뀌면** 버린다 — 좌표계가 갈리면(정규화↔절대) 같은 인덱스가 다른 뜻이 된다.
    // 척도 변경(boundsKey)엔 안 건드린다: 확대·필터는 같은 그림을 다르게 볼 뿐이라 값이 남아야 한다.
    useEffect(() => { setPinnedPivots(new Set()); }, [anchor, minuteView]);

    // 마커 라벨 축약 — 차트 라벨과 **별개 격자**(마커는 경로 위에 몰려 있어 더 촘촘한 칸을 쓴다).
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
                {s.kind === "point" && <span style={{ color: "var(--text-tertiary)" }}> {s.time.slice(0, 5)}</span>}
            </span>
        );
        return dotFirst ? <>{dot}{text}</> : <>{text}{dot}</>;
    };

    /**
     * 라벨 칩 자리 — **점의 바깥쪽**(선이 뻗어 나가는 반대 방향)에 띄운다.
     * 예전엔 칩이 끝점에서 안쪽으로 깔려 **끝점 자체를 덮었다**: 선 위를 가려 그림을 읽기 나쁘고,
     * 무엇보다 그 점의 피벗 손잡이를 칩이 가로채 가장 바깥 점만 호버가 안 됐다(사용자 지적).
     * 간격 9px = 피벗 손잡이 반경(7) 밖 — 점과 칩이 서로의 히트 영역을 침범하지 않는 최소치.
     *
     * 바깥에 칩 폭만큼 자리가 없으면(창 가장자리에 붙은 끝점) **안쪽으로 넘긴다** — 잘려서 못 읽는 것보단
     * 선 위에 얹히는 게 낫다. 넘겨도 간격은 그대로라 점 호버는 살아 있다.
     * 색 점은 언제나 칩에서 **점을 마주 보는 끝**에 둔다(dotFirst) — 어느 선의 이름인지 가리키는 게 그 점의 일이다.
     */
    const labelPlacement = (leftPx: number): { style: CSSProperties; dotFirst: boolean } => {
        const outwardLeft = labelAtStart;
        const room = outwardLeft ? leftPx - LABEL_GAP : box.width - leftPx - LABEL_GAP;
        const atLeft = room < LABEL_CELL.w ? !outwardLeft : outwardLeft;
        return atLeft
            ? { style: { left: leftPx - LABEL_GAP, transform: "translate(-100%, -50%)" }, dotFirst: false }
            : { style: { left: leftPx + LABEL_GAP, transform: "translateY(-50%)" }, dotFirst: true };
    };

    /** 마커 칩 — ▾시각. 컴포넌트가 아니라 함수인 이유: 패널 상태를 잔뜩 닫아 갖는데 매 렌더 새 컴포넌트면
     *  리액트가 매번 언마운트/마운트를 반복한다(호버가 튄다). */
    const markerChip = (m: OverlayMarker, left: number, top: number): JSX.Element => {
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
                    {isPointUnit && (
                        <TextToggle active={showFuture} onClick={() => setShowFuture(!showFuture)}
                            title="타점 이후(점선 구간)까지 기본 창에 담는다 — 끄면 타점 이전이 화면을 차지한다">
                            미래
                        </TextToggle>
                    )}
                    <TextToggle active={showLevels} onClick={() => setShowLevels(!showLevels)} title="조사 중인 골격의 기준선·D선을 같은 % 공간에 얹는다" activeColor={PRICE_LINE}>선</TextToggle>
                    <TextToggle active={showLabels} onClick={() => setShowLabels(!showLabels)} title="앵커 반대쪽 끝에 종목·날짜 — 뭉치면 개수 뱃지, 눌러서 목록">라벨</TextToggle>
                    <TextToggle active={locked !== null} onClick={() => setLocked(locked ? null : autoBounds)} title="지금 척도를 붙든다 — 필터를 좁혀도 척도가 안 움직여 전후가 비교된다">척도 고정</TextToggle>
                </ControlBox>
                {/* 거래대금은 **하나를 선택했을 때만** — 재료가 그날치 한 벌이라 호버로 끌면 스칠 때마다 왕복이다. */}
                {!isDaily && (
                    <ControlBox label="거래대금">
                        <TextToggle active={showAmount} onClick={() => setShowAmount(!showAmount)}
                            title="선을 분 단위로 잘라 그 분의 거래대금을 **굵기**로 싣는다 — 굵은 자리가 터진 자리(전 종목·전 시각 상시)">
                            굵기
                        </TextToggle>
                        <TextToggle active={showAmountLabels} onClick={() => setShowAmountLabels(!showAmountLabels)}
                            title="터진 자리에 분당 거래대금 수치. 전 선이 한 격자에서 겨뤄 한 칸에 제일 큰 하나만 남는다 — 확대하면 작은 것들이 드러나고 축소하면 사라진다">
                            값
                        </TextToggle>
                    </ControlBox>
                )}
                {isAbs && (
                    <ControlBox>
                        <TextToggle active={showTheme} onClick={() => setShowTheme(!showTheme)}
                            title="선택한 골격이 그린 구간 동안 같은 테마 종목들의 분당 종가 경로를 같이 세운다(그 구간에 보드에 떴던 것만) — 굵기가 각 종목의 분당 거래대금이다">
                            테마
                        </TextToggle>
                        {showTheme && themeOverlay && (
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", marginLeft: 2 }}>
                                {themeOverlay.lines.length}
                            </span>
                        )}
                        {showTheme && !singleTarget && (
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 2 }} title="테마는 짚은 하나에만 펼친다 — 여러 날을 겹치면 '이 종목이 혼자 튄 건가'가 흐려진다">
                                선 하나 선택
                            </span>
                        )}
                        {showTheme && singleTarget && themeOverlay?.lines.length === 0 && (
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 2 }} title="그 구간에 보드에 뜬 같은 테마 종목이 없거나, 이 종목이 그날 유니버스 밖입니다">
                                없음
                            </span>
                        )}
                    </ControlBox>
                )}
                <span style={count}>
                    {lines.length}개
                    {population > lines.length && <span style={{ color: "var(--text-tertiary)" }}> / {population}</span>}
                    {/* 결손은 필터와 별도 표기 — "N/M 차이 = 필터"라는 읽기가 거짓이 되지 않게. */}
                    {missingPrevClose > 0 && (
                        <span style={{ color: "var(--text-tertiary)" }} title="전일 종가 미수집 — 절대 배치로 그릴 수 없는 차트(필터로 빠진 게 아님)"> · 결손 {missingPrevClose}</span>
                    )}
                </span>
                {/* 차트 선택 손잡이는 차트 단위 뷰에서만 — 타점 단위 뷰의 문법은 아래 타점 버튼이다. */}
                {selectedCharts.length > 0 && (
                    <button onClick={(e) => openTagMenuForSelection(e)} title="선택된 차트들에 태그 붙이기/떼기 — 그룹은 태그다" style={miniBtn}>
                        차트 {selectedCharts.length} 태그
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
                {pinnedPivots.size > 0 && (
                    <button onClick={() => setPinnedPivots(new Set())} title="붙잡아 둔 피벗 값 전부 떼기" style={miniBtn}>
                        값 {pinnedPivots.size} ✕
                    </button>
                )}
                {zoomed && <button onClick={reset} title="원위치(더블클릭도 같음)" style={miniBtn}>원위치 ⤺</button>}
            </div>

            <div ref={wrapRef} onMouseDown={onWrapMouseDown} style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {feedLoading && <div style={muted}>불러오는 중…</div>}
                {!feedLoading && lines.length === 0 && (
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

                            <g clipPath={`url(#${clipId})`}>
                                {/* 원점 좌표축 — **실선 + 끝 화살표**(사용자 확정, xy 좌표계 그대로). 흐린 점선은 그림에
                                    묻혀 안 읽혔다. 이 두 선이 피벗 좌표를 읽는 자(尺)다: 값은 여기로 내린 수직·수평
                                    점선의 발치에서 읽는다. 가로축 = 0%(정규화면 앵커 높이, 절대면 전일 종가),
                                    세로축 = t=0 — 세로축은 정규화 배치에서만 뜻이 있다(절대는 벽시계라 0시가 무의미). */}
                                <line x1={box.left} x2={box.left + box.width} y1={scales.y(0)} y2={scales.y(0)} stroke={AXIS_LINE} strokeWidth={1} />
                                <polygon points={`${box.left + box.width},${scales.y(0)} ${box.left + box.width - 7},${scales.y(0) - 3.5} ${box.left + box.width - 7},${scales.y(0) + 3.5}`} fill={AXIS_LINE} />
                                {!isAbs && (
                                    <>
                                        <line x1={scales.x(0)} x2={scales.x(0)} y1={box.top} y2={box.top + box.height} stroke={AXIS_LINE} strokeWidth={1} />
                                        <polygon points={`${scales.x(0)},${box.top} ${scales.x(0) - 3.5},${box.top + 7} ${scales.x(0) + 3.5},${box.top + 7}`} fill={AXIS_LINE} />
                                    </>
                                )}

                                {/* ── 테마 선 — 짚은 골격의 **피벗 시각에 세운 동시각 표본**(그 사이는 오차 기반 세분).
                                    골격보다 **먼저** 그린다: 이건 배경이고 주인공은 내 골격이다.
                                    기본은 무채색 흐림 — 흐린 채색은 색이 아니다(알파가 낮으면 hue 차이가 안 읽힌다).
                                    짚은 하나만 거래대금 램프로 살아난다(상세 밀도 규칙 그대로). */}
                                {themeOverlay?.lines.map((l) => {
                                    const lit = hoveredThemeSet?.has(l.code) ?? false;
                                    const runs = themeRuns?.get(l.code);
                                    if (!runs) {
                                        const pts = l.points.map((p) => `${scales.x(p.x).toFixed(2)},${scales.y(p.y).toFixed(2)}`).join(" ");
                                        return (
                                            <polyline key={`th-${l.code}`} points={pts} fill="none" stroke="var(--text-tertiary)"
                                                strokeWidth={lit ? 2 : 1} strokeLinejoin="round" opacity={lit ? 0.9 : hoveredThemeSet ? 0.2 : 0.45} style={{ pointerEvents: "none" }} />
                                        );
                                    }
                                    // 선은 무채색, **굵기가 거래대금**이다. 짚은 것만 또렷해지고 굵기 배수도 커진다.
                                    // 테마 배수를 앵커보다 낮게 잡아(0.75) 30선이 굵어져도 주인공이 안 묻힌다.
                                    return (
                                        <g key={`th-${l.code}`} style={{ pointerEvents: "none" }}
                                            opacity={lit ? 1 : hoveredThemeSet ? 0.25 : 0.55}>
                                            {runs.map((r, i) => (
                                                <polyline key={i} points={runPoints(r, scales)} fill="none"
                                                    stroke="var(--text-tertiary)" strokeWidth={runWidth(r.level, lit ? 0.9 : 0.7)}
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            ))}
                                        </g>
                                    );
                                })}

                                {lines.map((s) => {
                                    const { v, color } = visualOf(s.key);
                                    const pts = polylinePoints(s, scales.x, scales.y);
                                    const lit = v.role !== "base";
                                    const inspecting = s.key === inspectKey;
                                    return (
                                        // 선은 순수 그림 — 포인터를 안 받는다(손잡이는 라벨). 캔버스로 옮겨도 조작이 안 바뀐다.
                                        // 진하기 = 역할이 정한다: 흐림(무리 밖) < 물러남(무리 안이지만 안 짚은 것) < 앞(짚은 것).
                                        <g key={s.key} opacity={v.dim ? dimmed : v.recede ? RECEDE_OPACITY : lit ? 1 : baseOpacity} style={{ pointerEvents: "none" }}>
                                            {/* 선택에만 넓은 반투명 밑선 — 색만으로는 "붙잡혔다"가 잘 안 읽힌다. */}
                                            {/* 선택 글로우(넓은 반투명 밑선)는 **폐기**(사용자 확정) — 굵기가 세 번째 차원을
                                                지는 지금은 글로우가 그 굵기를 가려버린다. 역할은 색이 진다: 선택 = 하늘(ACTIVE),
                                                호버 = 앰버, 테마 = 무채색. 색이 다른 일(거래대금)을 안 하게 됐으니 그걸로 충분하다. */}
                                            {/* 미래는 점선 — 타점 단위 선은 원점(자기 시각) 이후 전부, 절대 뷰는 선택 타점 이후.
                                                타점까지가 판단, 이후는 결과라는 같은 문장이다. */}
                                            {(() => {
                                                const splitX = isPointUnit ? 0 : splitXByChart.get(s.key);
                                                // 거래대금이 붙은 선은 **선분마다 색이 달라** 한 폴리라인으로 못 그린다.
                                                // 역할색(선택 하늘)을 잃지 않는 건 글로우(위의 넓은 밑선)가 이미 "붙잡혔다"를
                                                // 말하기 때문 — 그래서 선 색을 통째로 값에 내줄 수 있다(사용자 확정).
                                                if (amounts && amounts.key === s.key) {
                                                    // 색은 선 본연의 역할색(선택 파랑) 그대로 — 굵기만 거래대금이 정한다.
                                                    // 미래 구간은 점선 대신 **옅게**(조각이 분 단위라 점선이 굵기와 싸워 둘 다 못 읽힌다).
                                                    return amounts.runs.map((r, i) => (
                                                        <polyline key={`rn${i}`} points={runPoints(r, scales)} fill="none"
                                                            stroke={color} strokeWidth={runWidth(r.level, 1)} strokeLinecap="round" strokeLinejoin="round"
                                                            opacity={splitX != null && r.points[0].x >= splitX ? 0.4 : 1} />
                                                    ));
                                                }
                                                if (splitX == null) return <polyline points={pts} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" />;
                                                const { past, future } = splitAtX(s.points, splitX);
                                                return (
                                                    <>
                                                        {past.length >= 2 && <polyline points={polylinePoints({ ...s, points: past }, scales.x, scales.y)} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" />}
                                                        {future.length >= 2 && <polyline points={polylinePoints({ ...s, points: future }, scales.x, scales.y)} fill="none" stroke={color} strokeWidth={v.width} strokeLinejoin="round" strokeDasharray="4 4" />}
                                                    </>
                                                );
                                            })()}
                                            {/* 합성점(타점 종가)은 속 빈 원 — 손으로 찍은 점과 구분된다. 손이 올라간 점은 커진다. */}
                                            {(lit || dotsForAll) && s.points.map((p, i) => {
                                                const r = pivotShown(s.key, i) ? 5 : lit ? 3 : 2;
                                                return p.synthetic
                                                    ? <circle key={i} cx={scales.x(p.x)} cy={scales.y(p.y)} r={r} fill="var(--bg-primary)" stroke={color} strokeWidth={1.2} />
                                                    : <circle key={i} cx={scales.x(p.x)} cy={scales.y(p.y)} r={r} fill={color} />;
                                            })}
                                            {/* 피벗 좌표 — **짚은 점에만**(호버 미리보기 또는 클릭으로 붙잡은 것). 예전엔 조사 중인
                                                골격의 점 전부에 떴는데 분봉은 꺾인 점이 많아 화면이 숫자로 뒤덮였다(사용자 지적).
                                                **원점 좌표축에 내려 읽는다**(사용자 확정): 점 → 가로축으로 수직 점선, 점 → 세로축으로
                                                수평 점선, 값은 각 축의 발치에(기간은 x축 아래, %는 y축 옆). 점 옆에 두 값을 붙이면
                                                라벨끼리 겹치고 "이 점이 축의 어디냐"가 눈으로 안 잡힌다.
                                                축이 화면 밖으로 밀려나면(팬) 발치를 화면 가장자리로 잡는다 — 값을 못 읽는 것보단 낫다. */}
                                            {s.points.map((p, i) => {
                                                if (!pivotShown(s.key, i) || (p.x === 0 && p.y === 0)) return null;
                                                const px = scales.x(p.x);
                                                const py = scales.y(p.y);
                                                const ax = clamp(isAbs ? box.left : scales.x(0), box.left, box.left + box.width); // 세로축(%를 읽는 자리)
                                                const ay = clamp(scales.y(0), box.top, box.top + box.height); // 가로축(기간을 읽는 자리)
                                                const below = ay + 12 <= box.top + box.height; // x축 아래에 자리가 없으면 위로
                                                const leftSide = ax - box.left > 44; // y축 왼쪽에 자리가 없으면 오른쪽으로
                                                // 붙잡은 값은 계속 또렷하게, 스치는 미리보기는 한 단계 물러난다(붙잡았다는 게 보이게).
                                                const pin = pinnedPivots.has(pivotId(s.key, i));
                                                const val: CSSProperties = { fontSize: pin ? 11 : 10, fontWeight: pin ? 700 : 400, fill: color, fontVariantNumeric: "tabular-nums" };
                                                return (
                                                    <g key={`pv${i}`} opacity={pin ? 1 : 0.75}>
                                                        <line x1={px} x2={px} y1={py} y2={ay} stroke={color} strokeWidth={pin ? 1.2 : 0.8} strokeDasharray="2 3" opacity={pin ? 0.9 : 0.55} />
                                                        <line x1={px} x2={ax} y1={py} y2={py} stroke={color} strokeWidth={pin ? 1.2 : 0.8} strokeDasharray="2 3" opacity={pin ? 0.9 : 0.55} />
                                                        <text x={px} y={ay + (below ? 12 : -5)} textAnchor="middle"
                                                            stroke="var(--bg-primary)" strokeWidth={3.5} paintOrder="stroke" style={val}>
                                                            {fmtX(p.x, xUnit)}
                                                        </text>
                                                        <text x={ax + (leftSide ? -4 : 4)} y={py - 3} textAnchor={leftSide ? "end" : "start"}
                                                            stroke="var(--bg-primary)" strokeWidth={3.5} paintOrder="stroke" style={val}>
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

                                {/* 붙잡은 피벗의 세로선 — 테마 값을 펼치는 **손잡이**다. 올리면 그 시각의 테마 값이
                                    선 오른쪽에 펴진다(상시가 아니라 호버 중에만 — 30줄이 늘 떠 있으면 화면이 찬다).
                                    보이는 선은 얇지만 히트 영역은 넓은 투명 선이 따로 받는다(1px 을 겨냥할 수는 없다).
                                    ⚠ **피벗 손잡이보다 먼저** 그린다: SVG 는 나중에 그린 게 위라, 이 10px 투명 선이 뒤에
                                    오면 자기 x 에 있는 피벗 점의 클릭을 통째로 삼킨다(핀을 찍고 나면 못 떼던 버그). */}
                                {themeOverlay && pinnedMinutes.map((m) => {
                                    const x = scales.x(m);
                                    const open = openReadingMinute === m;
                                    return (
                                        <g key={`pinv-${m}`}>
                                            <line x1={x} x2={x} y1={box.top} y2={box.top + box.height}
                                                stroke={open ? ACTIVE : "var(--text-tertiary)"} strokeWidth={open ? 1.2 : 0.8} strokeDasharray="2 3"
                                                opacity={open ? 0.9 : 0.5} style={{ pointerEvents: "none" }} />
                                            <line x1={x} x2={x} y1={box.top} y2={box.top + box.height} stroke="transparent" strokeWidth={10}
                                                style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                                                onMouseEnter={() => setHoveredPinLine(m)} onMouseLeave={() => setHoveredPinLine(null)}>
                                                <title>{`${hmOf(m)} — 올리면 이 시각의 테마 값`}</title>
                                            </line>
                                        </g>
                                    );
                                })}

                                {/* 피벗 손잡이 — 포인터를 받는 건 **조사 중인 골격 + 값을 붙잡아 둔 골격**의 점들뿐이다
                                    (선은 여전히 순수 그림). 한두 벌뿐이라 뭉쳐서 못 겨냥하는 문제가 없다.
                                    핀이 걸린 선까지 넣는 이유: 그 선을 떠난 뒤에도 값이 남는데 손잡이가 사라지면 **뗄 수가 없다**.
                                    들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
                                    클릭 = 그 점의 값 붙잡기/떼기(사용자 확정) — 여럿을 나란히 놓고 볼 수 있다.
                                    **맨 위에 그린다** — 위 세로선·아래 선들 어느 것도 이 손잡이를 가리면 안 된다. */}
                                {[...new Set([...(inspectKey ? [inspectKey] : []), ...linesWithPins])].map((key) => {
                                    const s = byKey.get(key);
                                    if (!s) return null;
                                    return s.points.map((p, i) => (p.x === 0 && p.y === 0 ? null : (
                                        <circle key={`hit-${key}-${i}`} cx={scales.x(p.x)} cy={scales.y(p.y)} r={7} fill="transparent"
                                            style={{ pointerEvents: "auto", cursor: "pointer" }}
                                            onClick={() => togglePivot(s.key, i)}
                                            onMouseEnter={() => { setHovered(s.key); setHoveredPivot({ key: s.key, i }); }}
                                            onMouseLeave={() => { setHovered(null); setHoveredPivot(null); }}>
                                            <title>{`${fmtX(p.x, xUnit)} · ${fmtPct(p.y)} — 클릭해 값 ${pinnedPivots.has(pivotId(s.key, i)) ? "떼기" : "붙잡기"}`}</title>
                                        </circle>
                                    )));
                                })}

                                {/* 거래대금 숫자 — **선×세그먼트당 하나 → 화면 x 격자**로 솎아 살아남은 것들.
                                    점은 **터진 그 분의 자리**에 정확히 얹히고(표식), 숫자는 그 오른쪽에 선다.
                                    점 색이 어느 선 것인지 말한다(좌측 이름 라벨의 점과 같은 색). */}
                                {amountLabels.map((a) => {
                                    const c = a.own ? ACTIVE : themeColorOf(a.code);
                                    const moved = Math.abs(a.labelY - a.y) > 1.5;
                                    return (
                                        <g key={`al-${a.code}-${a.x}-${a.y}`} style={{ pointerEvents: "none" }}
                                            opacity={hoveredThemeSet && !a.own && !hoveredThemeSet.has(a.code) ? 0.25 : 1}>
                                            {/* 자리를 옮긴 라벨은 **지시선**이 원래 자리를 가리킨다 — 안 그으면 그 숫자가
                                                어느 선 것인지 알 수 없다(점 색만으론 비슷한 색끼리 헷갈린다). */}
                                            {moved && <line x1={a.x} y1={a.y} x2={a.x + 4} y2={a.labelY} stroke={c} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />}
                                            <circle cx={a.x} cy={a.y} r={2.2} fill={c} />
                                            <text x={a.x + 6} y={a.labelY + 3} textAnchor="start"
                                                stroke="var(--bg-primary)" strokeWidth={3.5} paintOrder="stroke"
                                                style={{ fontSize: 9.5, fill: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                                                {fmtEok(a.value)}
                                            </text>
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
                                    색은 **그 골격선과 똑같이**(visualOf) — 그룹 목록을 훑을 때 골격선은 무리 색인데
                                    가로선만 앰버로 뜨면 "이게 어느 골격의 선이냐"를 다시 찾아야 했다(사용자 지적).
                                    선이 이미 색으로 정해져 있으니 가로선은 그 색을 따라가면 그만이다.
                                    둘이 동시에 떠도(단일 선택 + 호버) 라벨 위치로 갈린다: 선택 = 오른쪽, 호버 = 왼쪽.
                                    **둘 다 실선** — 점선은 가격 수준선을 읽기 어렵게만 했다(사용자 확정).
                                    다중 선택이면 호버 것만(수십 벌이 겹치므로).
                                    기준선 여부는 선 모양이 아니라 라벨의 "기준" 접두어 — 어차피 최저가 규칙이라 아래가 기준선. */}
                                {showLevels && scales && (() => {
                                    const single = effSelected.size === 1 ? [...effSelected][0] : null;
                                    const owners: { s: NormalizedSkeleton; color: string; right: boolean }[] = [];
                                    const sel = single ? byKey.get(single) : null;
                                    if (sel) owners.push({ s: sel, color: visualOf(sel.key).color, right: true });
                                    const hov = hovered && hovered !== single ? byKey.get(hovered) : null;
                                    if (hov) owners.push({ s: hov, color: visualOf(hov.key).color, right: false });
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

                {/* 핀 시각의 테마 값 — **그 세로선 바로 오른쪽**에 편다(사용자 확정). 예전엔 y축까지 수평선을
                    값 개수만큼 그었는데 화면을 가로지르는 선이 30개라 난잡했다. 값을 데이터가 있는 자리에 둔다.
                    세로로 겹치면 옆 열로 밀되(layoutAxisColumns), 호버 중에만 뜨니 잠깐 벌어지는 건 괜찮다. */}
                {scales && themeReadingSlots.length > 0 && openReadingMinute !== null && (
                    <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
                        {themeReadingSlots.map((s) => {
                            const lit = hoveredThemeSet?.has(s.item.code) ?? false;
                            return (
                                <div key={`trl-${s.item.minute}-${s.item.code}`}
                                    title={`${s.item.name} · ${hmOf(s.item.minute)} · ${fmtPct(s.item.y)}`}
                                    style={{
                                        ...chip, cursor: "default",
                                        left: scales.x(openReadingMinute) - box.left + 5 + s.col * THEME_READING_CELL.w,
                                        top: s.y - box.top, transform: "translateY(-50%)",
                                        color: lit ? "var(--text-primary)" : "var(--text-secondary)",
                                        fontWeight: lit ? 700 : 400,
                                    }}>
                                    <span style={labelDot(themeColorOf(s.item.code))} />
                                    <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{fmtPct(s.item.y)}</span>
                                    {s.item.name}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 테마 라벨 층 — 손잡이는 여기다(선은 여전히 순수 그림). 경로 **왼쪽 끝**에 붙이고
                    라벨은 그 왼쪽으로 뻗는다. 뭉치면 개수 뱃지 — 올리면 그 무리가 다 켜진다. */}
                {scales && themeOverlay && (
                    <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
                        {themeClusters.map((c) => {
                            const left = c.x - box.left - 4;
                            const top = c.y - box.top;
                            const lit = c.members.some((m) => hoveredThemeSet?.has(m));
                            const multi = c.members.length > 1;
                            const label = themeOverlay.lines.find((l) => l.code === c.members[0])?.name ?? c.members[0];
                            return (
                                <button key={`tl${c.x}|${c.y}`}
                                    onMouseEnter={() => setHoveredTheme(c.members)} onMouseLeave={() => setHoveredTheme(null)}
                                    title={multi ? `${c.members.length}개 뭉침 — ${label} 외` : `${label} — 올리면 그 선만 또렷해진다`}
                                    style={{
                                        ...chip, left, top, transform: "translate(-100%, -50%)",
                                        color: lit ? "var(--text-primary)" : "var(--text-tertiary)",
                                        fontWeight: lit ? 700 : 400,
                                    }}>
                                    {multi ? `${c.members.length}` : label}
                                    {/* 색 점 = 금액 라벨의 점과 같은 색 — 저 숫자가 이 종목 것이라는 유일한 표식.
                                        라벨이 왼쪽으로 뻗으므로 점은 **선에 닿는 쪽**(오른쪽 끝)에 둔다. */}
                                    <span style={labelDot(themeColorOf(c.members[0]))} />
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 라벨 층 — HTML(칩 폭 계산 공짜 + d3 가 SVG mousedown 을 삼키는 문제 회피). 컨테이너는 포인터 통과. */}
                {scales && showLabels && (
                    <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
                        {clusters.map((c) => {
                            const left = c.x - box.left;
                            const top = c.y - box.top;
                            if (c.members.length > 1) {
                                // 뱃지도 라벨과 같은 쪽(점의 바깥) — 손잡이의 자리 규칙은 하나여야 한다.
                                return (
                                    <button key={`c${c.x}|${c.y}`} onClick={(e) => setBadge({ x: e.clientX, y: e.clientY, members: c.members })}
                                        onMouseEnter={() => setBadgeHover(c.members)} onMouseLeave={() => setBadgeHover(null)}
                                        title={`${c.members.length}개 뭉침 — 올리면 무리가 켜지고, 누르면 목록`}
                                        style={{ ...chip, ...labelPlacement(left).style, top, ...badgeChip }}>
                                        {c.members.length}
                                    </button>
                                );
                            }
                            const s = byKey.get(c.members[0]);
                            if (!s) return null;
                            const pl = labelPlacement(left);
                            return (
                                <button key={`c${c.x}|${c.y}`} onClick={(e) => onLabelClick(s, e)} onContextMenu={(e) => openTagMenuFor(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — 클릭=선택·이동 · Ctrl+클릭=다중선택 · 우클릭=태그`}
                                    style={{ ...chip, ...pl.style, top }}>
                                    {labelOf(s, pl.dotFirst)}
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
                            const pl = labelPlacement(scales.x(p.x) - box.left);
                            return (
                                <button key={key} onClick={(e) => onLabelClick(s, e)} onContextMenu={(e) => openTagMenuFor(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — 클릭=선택·이동 · Ctrl+클릭=선택 해제 · 우클릭=태그`}
                                    style={{
                                        ...chip, ...pl.style, top: scales.y(p.y) - box.top,
                                        color, fontWeight: 700,
                                        // 선택된 것에만 상자 — 상태를 가진 컨트롤이라 그렇게 보여야 한다(눈으로 찾기도 쉽다).
                                        ...(v.role === "selected" ? selectedChip(color) : {}),
                                    }}>
                                    {labelOf(s, pl.dotFirst)}
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
                                        {s.kind === "point" && <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{s.time.slice(0, 5)}</span>}
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
                    const ids = s ? (s.kind === "point" ? tagsView.tagIdsOf({ stockCode: s.stockCode, date: s.date, time: s.time }) : tagsView.chartTagIdsOf(s)) : [];
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
                {isDaily ? "일봉" : isAbs ? "분봉·절대(전일 종가 대비)" : "분봉·타점 정규화(선 1 = 타점 1, 원점 이후 점선=미래)"} · 세로 = % · 휠 = 가로 확대 · 축 드래그 = 그 축 확대 · 드래그 이동 · Ctrl+클릭/드래그 = 다중선택 · 우클릭 = 태그 · 점 클릭 = 값 붙잡기 · 더블클릭 원위치
                {locked && <span style={{ color: "var(--text-secondary)" }}> · 척도 고정됨</span>}
                {themeOverlay && themeOverlay.lines.length > 0 && (
                    <span style={{ color: "var(--text-secondary)" }}> · 테마 {themeOverlay.lines.length}선(분당 종가)</span>
                )}
                {/* 굵기 범례 — 굵기는 "굵다=크다"가 자명해서 색처럼 대응표가 꼭 필요하진 않지만,
                    **단계 경계가 얼마인지**는 알아야 읽힌다(20 / 40 / 70 / 150억). 정확한 값은 숫자 라벨이 답한다. */}
                {!isDaily && showAmount && (
                    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, marginLeft: 8, height: 12, verticalAlign: "middle" }}
                        title={`분당 거래대금 굵기 단계 — 경계 ${AMOUNT_LEVEL_EDGES_EOK.join("/")}억`}>
                        {AMOUNT_LEVEL_WIDTH.map((w, i) => (
                            <span key={i} style={{ width: 8, height: w, background: "var(--text-secondary)", borderRadius: w / 2 }} />
                        ))}
                        <span style={{ marginLeft: 3, color: "var(--text-tertiary)" }}>~{AMOUNT_LEVEL_EDGES_EOK.join("~")}억+/분</span>
                    </span>
                )}
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
// 라벨 — 상자 없이 후광 글자 + 그 선 색의 점(F안). **색 점은 언제나 끝점을 마주 보는 쪽**에 서서
// 이 글자가 어느 선의 것인지 가리킨다(칩이 점 바깥에 서므로 칩의 안쪽 끝이 곧 점 쪽이다).
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
/** 마커 칩 자리 — 점 **위**(경로의 그 점을 안 가리게 손잡이 반경 밖으로 띄운다). */
const markerChipPos = (left: number, top: number): CSSProperties => ({ left, top: top - LABEL_GAP, transform: "translate(-50%, -100%)" });
/** 선택된 라벨만 상자를 되받는다 — 클릭이 실제로 먹었다는 신호가 색만으로는 약하다. */
const selectedChip = (color: string): CSSProperties => ({
    background: "var(--bg-secondary)", border: `1px solid ${color}`, borderRadius: 3,
    padding: "1px 4px", textShadow: "none",
});
