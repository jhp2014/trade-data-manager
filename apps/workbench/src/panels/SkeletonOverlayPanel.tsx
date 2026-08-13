import { useMemo, useRef, useState, useEffect, useCallback, type CSSProperties, type RefObject } from "react";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { minuteOfDayOf, selectHotUniverse } from "@trade-data-manager/market/domain";
import { AMOUNT_LEVEL_WIDTH, AMOUNT_LEVEL_EDGES_EOK, RISE_COLOR, FALL_COLOR } from "../chart/chartUtils.js";
import {
    dailyFrame, pointUnitFrame, POINT_FRAME, splitAtX, polylinePoints, pct,
    lineOpacity, dimOpacity, labelPointOf, clusterLabels, lineVisual, keysInRect, yAtX, decimate, decimateStep, clipToX,
    amountRuns, type AmountRun,
    type LineVisual, type NormalizedSkeleton, type OverlayLine, type OverlayBounds, type SkeletonAnchor, type PointSkeleton,
} from "./skeleton/skeletonOverlay.js";
import { useOverlayData } from "./skeleton/useOverlayData.js";
import { useDaySnapshot } from "./skeleton/useDaySnapshot.js";
import { useCandles, type CandleFocus } from "./skeleton/useCandles.js";
import { amountLevelOf, amountLookupOf, runWidth } from "./skeleton/amountLayer.js";
import { AmountLabels, useAmountLabels, type AmountSource } from "./skeleton/AmountLabels.js";
import { CandleLayer } from "./skeleton/CandleLayer.js";
import { themeLines, hotCodesInRange } from "./skeleton/themeSkeleton.js";
import { pickReadouts, layoutReadoutRows, type ReadoutCandidate } from "./skeleton/readout.js";
import { useOverlayZoom, type ZoomRegion } from "./skeleton/useOverlayZoom.js";
import { useMarquee, type MarqueeRect } from "./skeleton/useMarquee.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { useGroups } from "../lib/GroupsContext.js";
import { pointKeyOf, parsePointKey, chartKeyOf, type PointRef } from "../lib/pointKey.js";
import { BulkGroupMenu } from "./skeleton/ChartGroupMenu.js";
import { TextToggle, Dot, ControlBox, miniBtn, mutedNote } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { ACTIVE, HOVER, PRICE_LINE, seriesColor, groupColor } from "../styles/palette.js";
import { fmtEok, fmtPct } from "../lib/format.js";
import { shortDate, timeOfMinutes } from "../lib/date.js";
import { clamp, median } from "../lib/num.js";

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

/**
 * 그림 상자 바깥 여백. **테마를 켜면 왼쪽이 거터(100px)로 넓어진다**(사용자 확정) — 테마 이름 라벨을
 * 그 안에서 세로로 벌려 전부 읽히게 하려고. 평소엔 y축 눈금만 들어가면 되니 46px 이면 족하다.
 */
const PAD = { right: 14, top: 12, bottom: 24 };
const PAD_LEFT = { plain: 46, gutter: 122 };
/**
 * 거터 안 두 칸의 경계 — 축에서 이만큼은 **눈금 숫자**의 자리이고, 테마 이름은 그 **왼쪽**에 선다
 * (사용자 확정). 예전엔 둘 다 축에 붙어 오른쪽 정렬이라 `0%` 와 종목명이 같은 자리에서 겹쳤다.
 * 46 = 눈금 없는 평소 여백(`−20%` 폭 ~33px + 여유)이라 숫자 칸의 폭과 정확히 같다.
 */
const THEME_LABEL_INSET = PAD_LEFT.plain;
/** 피벗 점 예산 — **원 개수**로 센다(골격당 피벗 수가 3~6으로 제각각이라 골격 수로 세면 임계가 두 배 흔들린다). */
const DOT_BUDGET = 1200;
/** 라벨 격자 한 칸(화면 px) — 라벨 하나가 차지하는 자리. 이보다 촘촘하면 뭉쳐서 개수 뱃지가 된다. */
const LABEL_CELL = { w: 72, h: 14 };
/** 라벨 칩과 끝점 사이 간격 — 배경 패딩(3px)을 더해도 피벗 손잡이(r=7) 밖에 서야 점 호버를 안 가로챈다. */
const LABEL_GAP = 12;
/** 거터에 이름을 둘 테마 선의 최대 수(사용자 확정) — 넘치면 나머지는 개수 뱃지 하나로 묶인다. */
const THEME_LABEL_CAP = 8;
/** 거터 라벨의 세로 최소 간격(화면 px). */
const THEME_LABEL_GAP = 14;
/**
 * 무리(선택·그룹) 안에서 안 짚은 선의 진하기. 색은 그대로 두고 이만큼만 물러난다 —
 * 목록 행을 훑을 때 짚은 하나가 무리 안에서도 또렷이 서게(굵기 차이만으론 약했다, 사용자 지적).
 * 무리 밖(dim)보다는 진하다: 무리에 속한다는 사실 자체는 계속 보여야 한다.
 */
const RECEDE_OPACITY = 0.3;

// 표기·수 헬퍼는 전부 lib 의 것을 쓴다(`shortDate`=26.07.08 · `timeOfMinutes`=HH:MM · `fmtPct` · clamp·median).
// 여기 있던 다섯 벌은 lib 의 것과 글자까지 같은 규칙이었다 — 연도 두 자리도, 반올림 순서도.

// 거래대금 척도(구간→굵기 단계·라벨 격자)와 조회기는 skeleton/amountLayer 로 옮겼다 —
// 셋(골격선 굵기·테마선 굵기·판독 칩)이 나눠 쓰는 **공용 재료**라 층 하나에 매이지 않는다.

/** 화면 좌표 폴리라인 문자열 — 배율에 맞춰 점을 솎는다(step=1이면 원본 그대로). */
const pathOf = (points: readonly { x: number; y: number }[], scales: Scales, step = 1): string =>
    decimate(points, step).map((p) => `${scales.x(p.x).toFixed(2)},${scales.y(p.y).toFixed(2)}`).join(" ");

/** 원점 좌표축의 색 — 눈금 격자(border-subtle)보다 진하고 골격 색과는 겹치지 않는 중성색. */
const AXIS_LINE = "var(--text-secondary)";

/** 화면의 선 하나 — kind 판별 유니온(차트 단위 ChartSkeleton / 타점 단위 PointSkeleton). */
type Line = OverlayLine;


/** 세로선 판독의 재료 한 벌 — 선 하나를 x 로 조회하는 함수 묶음(값은 크로스헤어 층이 읽는다). */
interface ReadoutSource {
    code: string;
    name: string;
    /** 이 뷰의 원점 시각(벽시계 분) — x → 분 환산. */
    t0: number;
    /** 뷰 y → 전일比 % 로 되돌리는 상수. */
    baseRate: number;
    own?: boolean;
    yAt: (x: number) => number | null;
    amountAt: ((minute: number) => number | null) | null;
    cumAt: ((minute: number) => number | null) | null;
}

/** 판독 칩 상한 — 등락률 상위 N ∪ 누적 거래대금 상위 N(사용자 확정). 합집합이라 최대 2N, 보통 그보다 적다. */
const READOUT_TOP = 5;
/** 판독 칩의 세로 최소 간격(화면 px). */
const READOUT_GAP = 15;
/**
 * 세로선과 칩 사이 거리(화면 px). 바짝 붙이면 칩이 세로선 근처의 그림을 덮고, 지시선이 짧아
 * 어느 점의 값인지도 덜 읽힌다(사용자 요구로 10 → 30). 떨어질수록 지시선이 대응을 더 잘 진다.
 */
const READOUT_OFFSET = 30;

type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };
type XUnit = "day" | "min";
const fmtX = (x: number, unit: XUnit): string => `${Math.round(x)}${unit === "day" ? "일" : "분"}`;

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — 시나리오가 "일봉에서 무리 → 분봉으로 확인"의 동시 사용이라
 *  토글 하나로는 두 그림을 오가며 볼 수 없다. grain 은 패널 정체성이라 마운트 후 안 바뀐다. */
export function SkeletonOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    const [anchor, setAnchor] = usePersistedState<SkeletonAnchor>(ANCHOR_KEY, (o) => (o === "first" || o === "last" ? o : null), "last");
    // ⚠ 패널 설정 키에는 **전부 grain 이 붙는다.** 일봉·분봉이 별도 패널이라 둘이 동시에 떠 있고,
    // 키를 공유하면 한쪽이 쓴 값이 다른 쪽 몫까지 덮는다(같은 저장소를 두 인스턴스가 각자 들고 있어
    // 서로의 변경을 못 본다). showFuture·showTheme 만 접미사가 빠져 있었다 — 지금은 분봉만 읽어서
    // 겉으로 조용하지만, 일봉 쪽에 손잡이가 하나 붙는 순간 조용히 서로를 지운다.
    // (기준 앵커 ANCHOR_KEY 는 일봉 전용 개념이고 주인이 하나라 일부러 공유한다.)
    //
    // 미래 포함(분봉 전용) — 기본 창은 타점 이전이 주인공이라 미래를 마진만 남기고 자른다.
    // "타점 뒤로 어디까지 갔나"를 볼 땐 이 토글이 창을 데이터까지 넓힌다(축소로도 닿지만 한 번에 보게).
    const [showFuture, setShowFuture] = usePersistedState<boolean>(`wb.skeletonOverlayFuture.${grain}`, (o) => (typeof o === "boolean" ? o : null), false);
    const [showLevels, setShowLevels] = usePersistedState<boolean>(`wb.skeletonOverlayLevels.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);
    const [showLabels, setShowLabels] = usePersistedState<boolean>(`wb.skeletonOverlayLabels.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);
    // 거래대금·테마 토글은 **여기 위에** 산다 — 테마를 켜면 왼쪽 여백(거터)이 넓어지고, 그 여백이
    // 그림 상자(box) → 스케일 → 나머지 전부의 재료라서 상자보다 먼저 정해져야 한다.
    const [showAmount, setShowAmount] = usePersistedState<boolean>(`wb.skeletonOverlayAmount.${grain}`, (o) => (typeof o === "boolean" ? o : null), true);
    const [showAmountLabels, setShowAmountLabels] = usePersistedState<boolean>(`wb.skeletonOverlayAmountLabels.${grain}`, (o) => (typeof o === "boolean" ? o : null), false);
    const [showTheme, setShowTheme] = usePersistedState<boolean>(`wb.skeletonOverlayTheme.${grain}`, (o) => (typeof o === "boolean" ? o : null), false);

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const activePoint = useWorkbench((s) => s.activePoint);

    const isDaily = grain === "daily";
    /** 분봉 = **타점 단위**(사용자 확정): 선 하나 = 타점 하나(자기 시각 피벗이 원점). 절대 뷰는 폐기 —
     *  %p 공간(전일 종가 대비 %p 차이)이 절대값을 상수 하나로 품게 되면서 배치 토글이 소멸했다. */
    const isPointUnit = !isDaily;
    const xUnit: XUnit = isDaily ? "day" : "min";

    /**
     * 패널 안 단축키 — **t**(테마). 전역 커맨드 레지스트리에 올리지 않는 이유: 한 글자 키라 다른 패널
     * (검색 입력 등)과 충돌하고, "지금 보고 있는 이 패널의 토글"이라는 뜻이 전역에선 성립하지 않는다.
     * 그래서 **포인터가 이 패널 안에 있을 때만** 듣는다. 입력 요소에 포커스가 있으면 글자 입력이 이긴다.
     * (캔들 토글·단축키는 폐기 — 캔들은 이제 **선을 클릭**해 켠다. 켤 대상을 고르는 손짓이 곧 켜는 손짓이라
     *  따로 켜 두는 상태가 필요 없어졌다.)
     */
    const [hoveringPanel, setHoveringPanel] = useState(false);
    useEffect(() => {
        if (isDaily || !hoveringPanel) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            if (e.key.toLowerCase() !== "t") return;
            setShowTheme((v) => !v);
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isDaily, hoveringPanel, setShowTheme]);

    // "선택만 보기"(분봉 전용) — 일봉 패널에서 만든 선택 무리만 남긴다. 선택이 비면 제한 없음(빈 화면 함정 방지).
    const [onlySelected, setOnlySelected] = useState(false);
    const skeletonSelection = useWorkbench((s) => s.skeletonSelection);
    const onlyCharts = !isDaily && onlySelected && skeletonSelection.size > 0 ? skeletonSelection : null;

    // 그룹 한 벌 — 그룹 메뉴·발끝 표기(여기) + 차트 그룹 필터 판정(데이터 훅)이 같은 인스턴스를 쓴다.
    const groupsView = useGroups();
    // 데이터 절반 — 조립·필터 판정은 전부 useOverlayData. 이 컴포넌트엔 렌더 상태(선택·호버·확대·메뉴)만 남는다.
    const { feedLoading, lines, population, missingPrevClose, levelsByChart, pointsByChart, nameOf } =
        useOverlayData(isDaily, anchor, onlyCharts);

    // ── 척도: 기본 창(뷰마다 다른 규칙) vs 고정(그 순간의 범위를 붙든다 — 필터 좁히기 전후 비교용).
    //  · 일봉 정규화 = 상수 창(−60~+10일 · −60~+40%) — 필터가 바뀌어도 같은 되돌림이 같은 크기로 선다.
    //  · 분봉 타점 %p = 상수 창(−60~+10분 · ±20%p), 미래 토글이면 양의 쪽만 데이터까지.
    const [locked, setLocked] = useState<OverlayBounds | null>(null);
    const autoBounds = useMemo(
        () => (lines.length === 0 ? null : isDaily ? dailyFrame(anchor) : pointUnitFrame(lines, 0.01, showFuture)),
        [isDaily, anchor, showFuture, lines],
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

    // 거터 판정은 **토글**로 한다(themeOverlay 가 아니라) — 상자가 테마 데이터보다 먼저 정해져야 하고,
    // 데이터 도착 여부로 여백이 출렁이면 화면이 툭 튄다.
    const gutter = !isDaily && showTheme;
    const padLeft = gutter ? PAD_LEFT.gutter : PAD_LEFT.plain;
    const box = { left: padLeft, top: PAD.top, width: Math.max(0, size.w - padLeft - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };
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
    const { tx, ty, reset, resetAxis, zoomed, dragging } = useOverlayZoom(svgRef, drawable, regionOf, closeBadge);
    /**
     * 더블클릭 — **축 스트립에서만, 그 축만** 원위치(사용자 확정). 본문 더블클릭 전체 리셋은 폐기했다:
     * 선·점을 짚다 보면 더블클릭이 섞여 들어가 애써 맞춘 배율이 통째로 날아갔다.
     */
    const onDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>): void => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return;
        const region = regionOf(e.clientX - r.left, e.clientY - r.top);
        if (region !== "body") resetAxis(region);
    }, [regionOf, resetAxis]);

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
    // 타점 선택 — 차트 선택과 **별개 집합**(그룹핑 대상이 다르다: 차트 그룹 vs 타점 그룹).
    // 분봉 뷰는 선=타점이라 선 자체의 선택 집합이다.
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

    /**
     * 배율 기반 점 솎기 — 이동이 뻑뻑해진 원인이 **테마 선을 하루 전체로 넓힌 것**이라(선당 ~720점,
     * 30선 + 히트라인 한 벌 더 = 4만여 점의 좌표 문자열을 이동마다 다시 만든다) 배율에 맞춰 줄인다.
     * 보이는 선은 1px 간격, 히트라인은 굵기가 8px 라 4px 간격이면 판정에 지장이 없다.
     */
    const pxPerMinute = scales ? Math.abs(scales.x(1) - scales.x(0)) : 0;
    const lineStep = decimateStep(pxPerMinute, 1);
    const hitStep = decimateStep(pxPerMinute, 4);
    /**
     * 보이는 x 구간 — 솎기의 **나머지 절반**. 솎기는 축소 쪽만 답한다(확대하면 step 이 1로 돌아와
     * 점이 다시 720개가 되는데 그중 화면에 있는 건 수십 개뿐이다). 잘라내면 확대할수록 오히려 가벼워진다.
     */
    const viewX = useMemo(
        () => (scales ? { from: scales.x.invert(box.left), to: scales.x.invert(box.left + box.width) } : null),
        [scales, box.left, box.width],
    );
    /** 테마 선 한 벌을 화면 구간으로 자르고 배율에 맞춰 솎는다(보이는 선·히트라인이 같은 재료를 쓴다). */
    const themePath = useCallback(
        (points: readonly { x: number; y: number }[], step: number): readonly { x: number; y: number }[] =>
            decimate(viewX ? clipToX(points, viewX.from, viewX.to) : points, step),
        [viewX],
    );

    const clipId = "skeleton-overlay-clip";
    const dotsForAll = useMemo(() => lines.reduce((n, s) => n + s.points.length, 0) <= DOT_BUDGET, [lines]);
    const baseOpacity = lineOpacity(lines.length);
    const dimmed = dimOpacity(lines.length);
    // 라벨이 붙는 끝 — 골격 종목 이름은 **언제나 경로의 왼쪽 끝**(사용자 확정).
    // 테마 라벨은 왼쪽 거터에 살아 자리 싸움이 없고, 미래 점선 쪽(오른쪽)은 결과라 손잡이를 안 둔다.
    const labelAnchorMode: SkeletonAnchor = isPointUnit ? "last" : anchor;
    const labelAtStart = isPointUnit || anchor === "last";

    // 상세(피벗 값·기준선·타점 세로선)를 받을 "지금 조사 중인 하나" — 호버 우선, 없으면 단일 선택.
    const inspectKey = hovered ?? (effSelected.size === 1 ? [...effSelected][0] : null);

    // ── 구간 거래대금(분봉 전용) — 선분마다 분당 평균을 색에 싣는다.
    //
    // **대상이 inspectKey 가 아니라 단일 선택인 이유**: 이 값의 재료는 그날 복기 파생 한 벌(압축 해제 ~15MB)이라
    // 날짜가 바뀔 때마다 왕복이 생긴다. 호버는 라벨 위를 훑기만 해도 날짜가 계속 갈리는 손짓이라 그걸 방아쇠로
    // 삼으면 스치는 것마다 15MB 를 당긴다. 선택은 **누른** 것이라 왕복이 클릭 수만큼으로 묶인다.
    // (피벗 값·기준선 같은 공짜 상세는 지금처럼 호버가 이긴다 — 비용이 다르면 규칙도 갈려야 한다.)
    /** 거래대금·테마가 같이 보는 "지금 조사 중인 선 하나" — 단일 선택일 때만(위 이유). */
    const singleTarget = useMemo(
        () => (isDaily || effSelected.size !== 1 ? null : byKey.get([...effSelected][0]) ?? null),
        [isDaily, effSelected, byKey],
    );
    /**
     * 축이 절대값을 같이 읽는 기준 — **타점 하나를 선택했을 때만**(사용자 확정).
     * 뷰 좌표는 그 타점 기준 상대값이라, 축 눈금·크로스헤어에 (벽시계 · 전일比 %)를 나란히 세우면
     * 화면을 옮겨 다니며 값을 환산할 필요가 없어진다. 호버가 아니라 선택을 방아쇠로 삼는 이유:
     * 라벨 위를 스치기만 해도 축 전체가 다시 쓰이면 눈이 붙잡을 기준이 사라진다.
     */
    const axisAbs = useMemo(
        () => (singleTarget?.kind === "point" ? { baseT: singleTarget.baseT, baseRate: singleTarget.baseRate } : null),
        [singleTarget],
    );
    /**
     * 굵기는 **캔들과 공존한다**(사용자 확정 — 실사용에서 굵기가 제일 잘 듣는 채널로 판명).
     * 한때 캔들을 켜면 굵기를 자동으로 껐는데(획 충돌 우려), 굵기는 30선을 한눈에 훑는 유일한 수단이라
     * 끄면 그 화면이 통째로 죽는다. 세 층위가 각자 다른 질문에 답한다:
     *   훑어보기 = 굵기 / 한 점 정밀 = 캔들 위 마커(구간 하한) / 정확한 값 = 호버 툴팁.
     */
    const amountWidthOn = showAmount;
    const amountLabelsOn = showAmountLabels;
    // 런 계산은 굵기가 꺼져도 필요하다 — 값 라벨의 재료가 같은 런이다.
    const amountTarget = amountWidthOn || amountLabelsOn ? singleTarget : null;
    // 한 벌만 받는다 — 거래대금과 테마가 같은 날짜의 같은 응답을 쓴다(LRU 도 한 자리만 쓴다).
    const snapQ = useDaySnapshot(showAmount || showAmountLabels || showTheme ? singleTarget?.date ?? null : null);
    // 두 조회기는 **셋이 나눠 쓴다**(골격선 굵기·테마선 굵기·판독 칩) — 그래서 층이 아니라 공용 재료다.
    const lookup = useMemo(() => amountLookupOf(snapQ.data), [snapQ.data]);
    const amountLookup = lookup.amountAt;
    const cumLookup = lookup.cumAt;

    const amounts = useMemo(() => {
        if (!amountTarget) return null;
        const at = amountLookup(amountTarget.stockCode);
        if (!at) return null;
        return { key: amountTarget.key, runs: amountRuns(amountTarget.points, amountTarget.baseT, at, amountLevelOf) };
    }, [amountTarget, amountLookup]);

    // ── 테마 선(분봉 %p 뷰) — 짚은 선이 하나일 때만 펼친다: 여러 날의 테마를 한 화면에 겹치면
    // "이 종목이 혼자 튄 건가"라는 그 질문 자체가 흐려진다.
    //
    // ## 좌표 이사 — 절대 공간을 **통째로 평행이동**한다(사용자 확정)
    // themeLines 는 절대 공간(x=벽시계 분, y=전일 종가 대비 %)을 내고, 여기서 앵커 타점의 (t₀, r_앵커(t₀))를
    // 빼서 뷰 공간에 놓는다. 멤버를 각자 자기 값으로 재기저하지 **않는다** — 타점 시각의 앵커 대비 %p 간격이
    // 그대로 보존돼야 "내 종목 기준 테마가 어디에 있나"가 읽힌다. 절대값 복원도 상수 하나(+t₀ / +baseRate)다.
    //
    // ## 멤버 자격과 그리는 범위는 **다른 창**이다(사용자 확정)
    //  · 자격(누가 그려지나) = **타점 앞뒤 기본 창** — 14시 타점인데 09시에 떴던 종목까지 들면
    //    "그때 같이 움직인 무리"라는 뜻이 흐려진다.
    //  · 그리는 범위 = **하루 전체(장 마감까지)** — 뽑힌 멤버는 끝까지 보여야 미래 동조가 읽힌다.
    //    (초기 창으로 자르면 확대·이동해도 그 밖은 영영 빈 선이다 — 캔들과 같은 이유.)
    const replaySettings = useWorkbench((s) => s.replaySettings);
    const pointTarget: PointSkeleton | null = singleTarget?.kind === "point" ? singleTarget : null;
    /**
     * 일봉 패널에서 짚은 차트 하나 — **캔들 오버레이 전용**(사용자 확정). `singleTarget` 은 분봉 전용이라
     * (거래대금·테마의 재료가 그날 복기 스냅샷이다) 여기서 따로 뽑는다. 일봉 캔들은 그 재료를 안 쓴다 —
     * `/chart` 번들의 일봉을 그대로 깔면 되고, 그건 이미 차트 패널들과 캐시를 공유한다.
     */
    const dailyTarget = useMemo(
        () => (!isDaily || effSelected.size !== 1 ? null : byKey.get([...effSelected][0]) ?? null),
        [isDaily, effSelected, byKey],
    );
    /** 캔들의 주인공 — 분봉이면 짚은 타점 선, 일봉이면 짚은 차트 선. 재료(차트 번들)는 한 벌이다. */
    const candleAnchor: Line | null = pointTarget ?? dailyTarget;
    const themeOverlay = useMemo(() => {
        if (isDaily || !showTheme || !pointTarget || !snapQ.data) return null;
        const src = snapQ.data.stocks;
        const t0 = pointTarget.baseT;
        const baseRate = pointTarget.baseRate;
        const hotFrom = Math.max(0, t0 - POINT_FRAME.back);
        const hotTo = t0 + POINT_FRAME.forward;
        const hot = hotCodesInRange(src, hotFrom, hotTo, minuteOfDayOf, (snaps) => selectHotUniverse(snaps, replaySettings.amountN, replaySettings.rateN));
        const lines = themeLines(pointTarget, src, hot, minuteOfDayOf, { from: 0, to: 1439 })
            .map((l) => ({ ...l, points: l.points.map((p) => ({ x: p.x - t0, y: p.y - baseRate })) }));
        return { key: pointTarget.key, t0, baseRate, lines };
    }, [isDaily, showTheme, pointTarget, snapQ.data, replaySettings.amountN, replaySettings.rateN]);
    /** 손이 올라간 테마 선(들) — 뭉친 라벨이면 그 무리 전부. 이것만 선명해지고 나머지는 무채색으로 남는다. */
    const [hoveredTheme, setHoveredTheme] = useState<readonly string[] | null>(null);
    /** 이름을 못 단 테마 종목 목록(뱃지 클릭) — 거터 상한을 넘은 것들이 여기로 온다. */
    const [themeBadge, setThemeBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
    const hoveredThemeSet = useMemo(() => (hoveredTheme ? new Set(hoveredTheme) : null), [hoveredTheme]);
    useEffect(() => { setHoveredTheme(null); }, [themeOverlay?.key]);

    /**
     * 지금 짚고 있는 대상 — 캔들을 그릴지 정하는 유일한 기준. null 이면 아무것도 안 짚은 상태(전부 그린다).
     * 골격선 호버는 **선 하나**(키), 테마 라벨·뱃지 호버는 종목 무리.
     */
    const candleFocus = useMemo<CandleFocus>(() => {
        if (hoveredThemeSet) return { kind: "theme", codes: hoveredThemeSet };
        if (hovered) return { kind: "line", key: hovered };
        return null;
    }, [hoveredThemeSet, hovered]);

    // ── 캔들 오버레이 — **참고용 배경**(흐리게). 주인공은 여전히 골격 선이다.
    // 상태(켠 종목)·재료(차트 번들·스냅샷)·감추기 규칙은 전부 useCandles 가 안다. 이 패널은 짚고 있는
    // 대상(candleFocus)과 주인공만 넘기고, 켜고 끄는 손짓(candles.toggle)을 선·라벨·목록에 나눠 준다.
    const candles = useCandles({
        anchor: candleAnchor, pointTarget, dailyTarget, snapshot: snapQ.data, focus: candleFocus, nameOf, grain,
    });

    /** 테마 선들의 분당 색 런 — **전부** 미리 굽는다(호버 하나만이 아니라, 사용자 확정).
     *  절대 구간 색이라 흐리게 깔아도 단계가 살아남는다 → 테마 전체의 자금 유입 타이밍이 한 화면에 깔린다.
     *  테마 선의 x 는 뷰 공간(벽시계 − t₀)이라 baseT = t₀ 가 벽시계를 되찾는다. */
    const themeRuns = useMemo(() => {
        if (!themeOverlay) return null;
        const m = new Map<string, AmountRun[]>();
        for (const l of themeOverlay.lines) {
            const at = amountLookup(l.code);
            if (at) m.set(l.code, amountRuns(l.points, themeOverlay.t0, at, amountLevelOf));
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


    /**
     * ── 세로선 판독 — **선 하나에 손이 올라가면** 교차선의 세로선이 그 시각의 판독 자가 된다(사용자 확정).
     * 그 x 에서 보이는 선들의 값을 읽어 세로선 **오른쪽**에 칩으로 세운다(왼쪽 = 지나온 궤적이라 안 가린다).
     *
     * 여기서는 **재료(조회기)만** 만든다 — 값은 커서를 따라 매 픽셀 바뀌므로 실제 판독·배치·그리기는
     * 크로스헤어 층이 자기 안에서 한다(부모가 mousemove 를 타면 선 수백 개가 이동마다 재조정된다).
     * 조회는 O(1) 이어야 한다: 테마 멤버는 1분에 점 하나라 **x → y 색인**을 선당 한 번 만들어 둔다
     * (yAtX 로 매번 훑으면 30선 × 720점을 마우스 이동마다 반복한다).
     */
    const readoutSources = useMemo<ReadoutSource[] | null>(() => {
        if (isDaily || !pointTarget) return null;
        const t0 = pointTarget.baseT;
        const out: ReadoutSource[] = [];
        const anchorAt = amountLookup(pointTarget.stockCode);
        const anchorCum = cumLookup(pointTarget.stockCode);
        out.push({
            code: pointTarget.stockCode, name: nameOf(pointTarget.stockCode), own: true, t0,
            baseRate: pointTarget.baseRate,
            // 골격선은 피벗 몇 개뿐이라 보간이 싸다 — 그리고 피벗 사이 임의 지점도 읽혀야 한다.
            yAt: (x) => yAtX(pointTarget.points, x),
            amountAt: anchorAt, cumAt: anchorCum,
        });
        for (const l of themeOverlay?.lines ?? []) {
            const byX = new Map(l.points.map((p) => [p.x, p.y] as const));
            out.push({
                code: l.code, name: l.name, t0, baseRate: themeOverlay!.baseRate,
                yAt: (x) => byX.get(Math.round(x)) ?? null,
                amountAt: amountLookup(l.code), cumAt: cumLookup(l.code),
            });
        }
        return out;
    }, [isDaily, pointTarget, themeOverlay, amountLookup, cumLookup, nameOf]);

    /** 판독을 지금 펼치나 — **테마 선이든 골격선이든 하나에 손이 올라갔을 때만**(사용자 확정). */
    const readoutOn = !!readoutSources && ((hoveredTheme?.length === 1) || (hovered !== null && hovered === singleTarget?.key));
    const readoutAt = useMemo<((x: number) => ReadoutCandidate[]) | null>(() => {
        if (!readoutOn || !readoutSources) return null;
        const lit = hoveredTheme?.length === 1 ? hoveredTheme[0] : singleTarget?.stockCode ?? null;
        return (x) => {
            const minute = Math.round(x) + (readoutSources[0]?.t0 ?? 0);
            const cands: ReadoutCandidate[] = [];
            for (const s of readoutSources) {
                const y = s.yAt(x);
                if (y === null) continue;
                cands.push({
                    code: s.code, name: s.name, y, pct: y + s.baseRate,
                    amount: s.amountAt?.(minute) ?? null,
                    cumAmount: s.cumAt?.(minute) ?? 0,
                    ...(s.own || s.code === lit ? { own: true } : {}),
                });
            }
            return pickReadouts(cands, READOUT_TOP, READOUT_TOP);
        };
    }, [readoutOn, readoutSources, hoveredTheme, singleTarget]);

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

    /** 앵커 골격에서 붙잡은 피벗의 x(뷰 공간 — 타점 대비 분, 시각 순) — 테마 값을 펼치는 세로선이 서는 자리.
     *  테마 선도 뷰 공간이라 이 x 로 바로 값을 찾는다(벽시계는 표시할 때만 + t₀). */
    const pinnedXs = useMemo(() => {
        if (!singleTarget) return [];
        return [...pinnedPivots]
            .filter((id) => id.slice(0, id.lastIndexOf("|")) === singleTarget.key)
            .map((id) => Number(id.slice(id.lastIndexOf("|") + 1)))
            .filter((i) => Number.isInteger(i) && i >= 0 && i < singleTarget.points.length)
            .map((i) => singleTarget.points[i].x)
            .sort((a, b) => a - b);
    }, [singleTarget, pinnedPivots]);
    /**
     * 지금 테마 값을 펼쳐 보는 시각 — 상시가 아니라 **손을 올렸을 때만**(사용자 확정).
     * 두 손짓이 같은 자리로 들어온다: 앵커 골격의 **어느 피벗에든 호버**(붙잡은 것이 아니어도)와,
     * 붙잡은 핀의 세로선 호버. 값을 보려고 굳이 먼저 클릭해야 할 이유가 없다.
     */
    const [hoveredPinLine, setHoveredPinLine] = useState<number | null>(null);
    useEffect(() => { setHoveredPinLine(null); setThemeBadge(null); }, [themeOverlay?.key]);
    /** 지금 테마 값을 펼쳐 보는 x(뷰 공간) — 핀 세로선과 같은 통화라 그대로 값 조회에 쓴다. */
    const openReadingX = useMemo(() => {
        if (hoveredPinLine !== null) return hoveredPinLine;
        if (!singleTarget || !hoveredPivot || hoveredPivot.key !== singleTarget.key) return null;
        const p = singleTarget.points[hoveredPivot.i];
        return p ? p.x : null;
    }, [hoveredPinLine, singleTarget, hoveredPivot]);

    /**
     * 붙잡은 핀 시각의 판독 — **크로스헤어 판독과 같은 규칙**으로 통일했다(사용자 확정):
     * 옛 열 쌓기(layoutAxisColumns)는 겹칠수록 오른쪽으로 번져 화면을 넘었고, "어느 시각 것이냐"를
     * 열로 읽는 규칙을 따로 배워야 했다. 지시선이 이미 대응을 지므로 **한 열에서 위아래로** 벌리면 그만이다.
     * 뽑기도 같은 기준(등락률·누적 대금 상위) — 두 판독이 다른 무리를 보여주면 그게 더 헷갈린다.
     */
    const themeReadingSlots = useMemo(() => {
        if (!scales || !readoutSources || openReadingX === null) return [];
        const minute = Math.round(openReadingX) + (readoutSources[0]?.t0 ?? 0);
        const cands: ReadoutCandidate[] = [];
        for (const s of readoutSources) {
            const y = s.yAt(openReadingX);
            if (y === null) continue;
            cands.push({
                code: s.code, name: s.name, y, pct: y + s.baseRate,
                amount: s.amountAt?.(minute) ?? null, cumAmount: s.cumAt?.(minute) ?? 0,
                ...(s.own ? { own: true } : {}),
            });
        }
        return layoutReadoutRows(
            pickReadouts(cands, READOUT_TOP, READOUT_TOP).map((r) => ({ item: r, y: scales.y(r.y) })),
            { min: box.top + 8, max: box.top + box.height - 8 },
            READOUT_GAP,
        );
    }, [scales, readoutSources, openReadingX, box.top, box.height]);

    /** 라벨 후보를 내는 선들 — 앵커 골격 + 테마 전부. 모양이 같아 한 격자에서 겨룬다(AmountLabels). */
    const amountSources = useMemo<AmountSource[]>(() => {
        const out: AmountSource[] = [];
        if (amounts && amountTarget) out.push({ code: amountTarget.stockCode, runs: amounts.runs, baseT: amountTarget.baseT, own: true });
        if (themeRuns && themeOverlay) for (const [code, runs] of themeRuns) out.push({ code, runs, baseT: themeOverlay.t0, own: false });
        return out;
    }, [amounts, amountTarget, themeRuns, themeOverlay]);
    const amountLabels = useAmountLabels(amountSources, scales, anchorPivotMinutes, amountLabelsOn);

    /**
     * 테마 이름 라벨 — **왼쪽 거터에 세로로 벌려** 놓는다(사용자 확정 B안). 선 시작점에 그대로 붙이면
     * 등락률이 비슷한 종목끼리 글자가 겹쳐 뭉개지고, 관찰 종목 라벨이 그 위를 덮었다.
     *
     * 다만 거터도 무한하지 않다 — 30종목을 다 벌리면 화면 높이를 넘는다. 그래서 **상한 8개**(사용자 확정,
     * D안 결합): 위(등락률 큰 쪽)에서 여덟만 이름을 두고 나머지는 **개수 뱃지 하나**로 묶어 누르면 목록이
     * 열린다. 위쪽이 살아남는 건 아래쪽이 0% 언저리에 뭉쳐 있어 어차피 이름을 못 읽기 때문이다.
     */
    const themeLabels = useMemo(() => {
        if (!themeOverlay || !scales || !viewX) return { named: [], hidden: [] as { code: string; name: string; y: number }[] };
        // 앵커 = **화면 좌단에서 선이 잘리는 값**(사용자 확정). 하루 전체를 그리게 되면서 "첫 점"은 대개
        // 08:00 = 화면 밖이 됐고, 그러면 라벨이 죄다 그 시각의 값(≈0%)에 뭉쳐 지금 보는 그림과 무관해진다.
        // 좌단 기준이면 팬·줌 할 때마다 다시 계산돼 라벨이 선을 따라다닌다.
        // 좌단에 선이 아직/이미 없으면 가까운 끝점으로 물러난다 — 목록에서 종목이 사라지지 않게.
        const items = themeOverlay.lines
            .map((l) => {
                const edge = yAtX(l.points, viewX.from);
                const at = edge !== null ? { x: viewX.from, y: edge }
                    : l.points[0].x > viewX.from ? l.points[0]
                        : l.points[l.points.length - 1];
                return { code: l.code, name: l.name, at };
            })
            .sort((a, b) => b.at.y - a.at.y);
        const head = items.slice(0, THEME_LABEL_CAP);
        const hidden = items.slice(THEME_LABEL_CAP).map((i) => ({ code: i.code, name: i.name, y: scales.y(i.at.y) }));
        // 라벨은 **제 높이를 고집하지 않는다**(사용자 확정) — 값이 붙은 종목끼리도 편히 벌어져 서고,
        // 어느 선의 이름인지는 지시선이 답한다. 그래서 최소 간격만 지키면 자리는 자유다.
        // 상자 밖(확대로 y 범위를 벗어난 선)은 가장자리로 당기고 ▲▼ 로 남긴다 — 예전엔 overflow 에
        // 잘려 **그 종목이 목록에서 조용히 사라졌다**(판독 칩과 같은 규칙, layoutReadoutRows).
        const named = layoutReadoutRows(
            head.map((i) => ({ item: i, y: scales.y(i.at.y) })),
            { min: box.top + 6, max: box.top + box.height - 6 },
            THEME_LABEL_GAP,
        ).map((r) => ({ ...r.item, labelY: r.labelY, anchorY: r.anchorY, off: r.off }));
        return { named, hidden };
    }, [themeOverlay, scales, viewX, box.top, box.height]);

    /**
     * ── 테마 모드: **한 화면에 두 질문을 겹치지 않는다**(사용자 확정).
     *
     * 테마 선(무채색 얇은 선 30개)과 다른 타점의 골격선(역시 무채색 얇은 선 수십~수백)이 같이 깔리면
     * 어느 게 어느 쪽인지 눈으로 안 갈린다 — 색을 더 벌려도 겹치는 순간 같은 문제라 **구조로 푼다**.
     *   · 평소(테마 켜짐) : 선택선 + 테마 무리만 그린다. 나머지 골격선은 **라벨만** 흐리게 남는다
     *     → "이 타점에서 테마가 어땠나"
     *   · 흐린 라벨 호버  : **테마가 접히고** 그 골격선이 나온다(짚은 것 + 선택한 것, 둘만)
     *     → "이 타점 vs 저 타점"
     * 손을 떼면 즉시 되돌아온다. 테마 토글을 끄면 원래의 전체 비교 화면.
     * 덤: 안 그리는 선이 수백이라 이동도 그만큼 가벼워진다.
     */
    const themeMode = themeOverlay !== null;
    /** 지금 "다른 골격선"을 보고 있나 — 그러면 테마를 접는다(뱃지 무리를 켠 것도 같은 뜻). */
    const themeSwapped = themeMode && ((hovered !== null && hovered !== singleTarget?.key) || (groupSet?.size ?? 0) > 0);
    /** 테마 모드에서 이 선을 그리나 — 선택선·짚은 것·뱃지 무리만. */
    const lineShown = useCallback(
        (key: string): boolean => !themeMode || key === singleTarget?.key || key === hovered || (groupSet?.has(key) ?? false),
        [themeMode, singleTarget?.key, hovered, groupSet],
    );

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
     *  타점 단위 선(time 있음)은 자기 타점으로 바로 이동하고 선택은 pk 채널을 쓴다 — 문법은 같다.
     *
     *  **이미 선택된 선의 라벨을 다시 클릭하면 캔들 토글**(사용자 확정) — 테마 라벨과 같은 손짓을
     *  관찰 종목에도 주되, 첫 클릭의 일(선택·이동)은 안 뺏는다. 이미 선택된 걸 또 누르는 건 원래
     *  아무 일도 안 했으므로(같은 곳으로 다시 이동할 뿐) 빈자리에 얹은 셈이다. */
    const onLabelClick = useCallback((s: Line, ev: { ctrlKey: boolean; metaKey: boolean }): void => {
        // 캔들을 켜는 건 **타점 단위 선(분봉)** 과 **일봉 차트 선** 둘 다(사용자 확정).
        // 분봉 절대 뷰는 빠진다 — 거기 선은 하루 경로 전체라 캔들의 주인공이 정해지지 않는다.
        const candleable = s.kind === "point" || isDaily;
        if (!ev.ctrlKey && !ev.metaKey && candleable && effSelected.size === 1 && effSelected.has(s.key)) {
            candles.toggle(s.stockCode);
            return;
        }
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
    }, [setActiveSelection, effSelected, pointsByChart, goToPoint, setFocus, candles.toggle, isDaily]);

    // ── Ctrl+드래그 사각 선택 — 사각형 역학은 useMarquee 가, **무엇을 담을지**는 여기가 정한다.
    const onMarqueeSelect = useCallback((rect: MarqueeRect): void => {
        if (!scales) return;
        // 라벨 지점 판정 — 이 뷰의 선택 채널로 담는다(차트 단위=차트키, 타점 단위=pk. 문법은 하나).
        const hit = keysInRect(lines, labelAnchorMode, scales.x, scales.y, rect);
        if (hit.length > 0) setActiveSelection((prev: ReadonlySet<string>) => new Set([...(prev.size > 0 ? prev : effSelected), ...hit])); // 합집합(누적)
    }, [scales, lines, effSelected, labelAnchorMode, setActiveSelection]);
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

    // ── 그룹 메뉴 — 라벨/마커 우클릭(단일) / 헤더 그룹 버튼(선택 일괄). 그룹핑의 입력 지점.
    // 어느 정션에 쓰느냐는 여기 규약이다: 차트 라벨 → 차트 그룹 / 타점 마커 → 타점 그룹. DB 사전은 하나.
    type GroupMenuState =
        | { kind: "chart"; x: number; y: number; charts: { stockCode: string; date: string }[]; label: string }
        | { kind: "point"; x: number; y: number; points: PointRef[]; label: string };
    const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
    /** 선 라벨 우클릭 — 이 선의 정션으로 간다: 타점 단위 선은 타점 그룹, 차트 단위 선은 차트 그룹. */
    const openGroupMenuFor = useCallback((s: Line, ev: { clientX: number; clientY: number; preventDefault: () => void }): void => {
        ev.preventDefault();
        if (s.kind === "point") {
            setGroupMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points: [{ stockCode: s.stockCode, date: s.date, time: s.time }], label: `${nameOf(s.stockCode)} ${s.time.slice(0, 5)}` });
            return;
        }
        setGroupMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts: [{ stockCode: s.stockCode, date: s.date }], label: `${nameOf(s.stockCode)} ${shortDate(s.date)}` });
    }, [nameOf]);
    // 선택 중 **이 패널에 실제로 있는** 차트 — 다른 골격 패널(일봉↔분봉)에서 만든 선택엔 여기 없는
    // 차트가 섞일 수 있다. 헤더 버튼 숫자와 메뉴 대상이 같은 목록을 봐야 "차트 3 그룹"가 2개만 여는 일이 없다.
    const selectedCharts = useMemo(
        () => (isPointUnit ? [] : [...effSelected].map((k) => byKey.get(k)).filter((s): s is Line => !!s)),
        [isPointUnit, effSelected, byKey],
    );
    const openGroupMenuForSelection = useCallback((ev: { clientX: number; clientY: number }): void => {
        const charts = selectedCharts.map((s) => ({ stockCode: s.stockCode, date: s.date }));
        if (charts.length === 0) return;
        setGroupMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts, label: charts.length === 1 ? `${nameOf(charts[0].stockCode)} ${shortDate(charts[0].date)}` : `선택 ${charts.length}개` });
    }, [selectedCharts, nameOf]);
    const openPointGroupMenu = useCallback((points: PointRef[], label: string, ev: { clientX: number; clientY: number; preventDefault?: () => void }): void => {
        ev.preventDefault?.();
        if (points.length > 0) setGroupMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points, label });
    }, []);

    // 목록 순서 = 라벨 지점의 % 내림차순 — 그림에서 위에 있는 선이 목록에서도 위라 눈이 안 헤맨다.
    const badgeRows = useMemo(() => {
        if (!badge) return [];
        return badge.members
            .map((k) => byKey.get(k))
            .filter((s): s is Line => !!s)
            .sort((a, b) => labelPointOf(b, labelAnchorMode).y - labelPointOf(a, labelAnchorMode).y);
    }, [badge, byKey, labelAnchorMode]);
    useEffect(() => { setBadge(null); setBadgeHover(null); }, [boundsKey, anchor, grain]);
    // 붙잡아 둔 피벗 값은 **기준(앵커)이 바뀌면** 버린다 — 좌표계가 갈리면 같은 인덱스가 다른 뜻이 된다.
    // 척도 변경(boundsKey)엔 안 건드린다: 확대·필터는 같은 그림을 다르게 볼 뿐이라 값이 남아야 한다.
    useEffect(() => { setPinnedPivots(new Set()); }, [anchor]);

    // 타점 단위 선은 시각까지 — `26.07.08 삼성전자 09:30`(같은 차트의 타점 여러 개가 선 여러 개로 선다).
    // 시각이 tertiary 면 같은 종목의 타점끼리 구분이 안 잡혔다(사용자 지적) — 타점의 정체가 시각이라 굵게 세운다.
    const labelOf = (s: Line, dotFirst: boolean): JSX.Element => {
        const dot = <span style={labelDot(visualOf(s.key).color)} />;
        const text = (
            <span>
                <span style={{ color: "var(--text-tertiary)" }}>{shortDate(s.date)}</span> {nameOf(s.stockCode)}
                {s.kind === "point" && <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}> {s.time.slice(0, 5)}</span>}
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

    return (
        <div style={wrap}>
            <div style={header}>
                {/* 기준 토글은 일봉 전용 — 분봉은 타점 단위(원점=자기 시각 피벗)라 앵커 선택이 소멸했다. */}
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
                {/* 캔들 선명도 — **늘 떠 있다**(사용자 확정). 켜져 있을 때만 띄웠더니 캔들을 켜고 끌 때마다
                    헤더 폭이 튀었다. 조절할 게 없는 순간이 있어도 자리가 안 움직이는 편이 낫다.
                    다른 라벨을 짚는 동안 캔들이 사라지는 건 규칙이라 손잡이를 안 준다. */}
                <ControlBox label="캔들">
                    {(["low", "mid", "high"] as const).map((a, i) => (
                        <span key={a} style={{ display: "inline-flex", alignItems: "center" }}>
                            {i > 0 && <Dot />}
                            <TextToggle active={candles.alpha === a} onClick={() => candles.setAlpha(a)}
                                title={a === "low" ? "배경으로만 — 형태 비교가 주인공일 때"
                                    : a === "mid" ? "기본"
                                        : "골격선과 같이 읽을 만큼 진하게 — 봉 하나하나를 짚어 볼 때"}>
                                {a === "low" ? "흐리게" : a === "mid" ? "보통" : "진하게"}
                            </TextToggle>
                        </span>
                    ))}
                </ControlBox>
                {/* 거래대금은 **하나를 선택했을 때만** — 재료가 그날치 한 벌이라 호버로 끌면 스칠 때마다 왕복이다. */}
                {!isDaily && (
                    <ControlBox label="거래대금">
                        <TextToggle active={amountWidthOn} onClick={() => setShowAmount(!showAmount)}
                            title="선을 분 단위로 잘라 그 분의 거래대금을 **굵기**로 싣는다 — 굵은 자리가 터진 자리(전 종목·전 시각 상시)">
                            굵기
                        </TextToggle>
                        <TextToggle active={amountLabelsOn} onClick={() => setShowAmountLabels(!showAmountLabels)}
                            title="터진 자리에 분당 거래대금 수치. 전 선이 한 격자에서 겨뤄 한 칸에 제일 큰 하나만 남는다 — 확대하면 작은 것들이 드러나고 축소하면 사라진다">
                            값
                        </TextToggle>
                    </ControlBox>
                )}
                {!isDaily && (
                    <ControlBox>
                        {/* 캔들은 토글도 표시도 여기 없다 — **선/라벨 클릭**으로 켜고, 상태는 푸터가 말한다.
                            헤더에 두면 켤 때마다 칩이 늘었다 줄었다 하며 flexWrap 이 줄을 바꿔 **그림 상자 높이가
                            변하고 화면이 튀었다**(사용자 지적). 푸터는 nowrap+ellipsis 라 높이가 안 변한다. */}
                        <TextToggle active={showTheme} onClick={() => setShowTheme(!showTheme)}
                            title="선택한 타점의 앞뒤 창 동안 같은 테마 종목들의 분당 종가 경로를 같이 세운다(그 구간에 보드에 떴던 것만, 세로 간격 = 등락률 %p 차이 그대로) — 굵기가 각 종목의 분당 거래대금이다 · 단축키 T">
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
                        <span style={{ color: "var(--text-tertiary)" }} title="전일 종가 미수집 — %p 공간의 분모가 없어 그릴 수 없는 타점(필터로 빠진 게 아님)"> · 결손 {missingPrevClose}</span>
                    )}
                </span>
                {/* 차트 선택 손잡이는 차트 단위 뷰에서만 — 타점 단위 뷰의 문법은 아래 타점 버튼이다. */}
                {selectedCharts.length > 0 && (
                    <button onClick={(e) => openGroupMenuForSelection(e)} title="선택된 차트들에 그룹 붙이기/떼기 — 그룹은 그룹다" style={miniBtn}>
                        차트 {selectedCharts.length} 그룹
                    </button>
                )}
                {!isPointUnit && selectedKeys.size > 0 && (
                    <button onClick={() => setSelectedKeys(new Set())} title="차트 선택 해제" style={miniBtn}>✕</button>
                )}
                {selectedPks.size > 0 && (
                    <button onClick={(e) => openPointGroupMenu(
                        [...selectedPks].map((pk) => parsePointKey(pk)).filter((p): p is PointRef => p !== null),
                        `타점 ${selectedPks.size}개`, e)}
                        title="선택된 타점들에 그룹 붙이기/떼기(타점 그룹)" style={miniBtn}>
                        타점 {selectedPks.size} 그룹
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

            <div ref={wrapRef} onMouseDown={onWrapMouseDown}
                onMouseEnter={() => setHoveringPanel(true)} onMouseLeave={() => setHoveringPanel(false)}
                style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {feedLoading && <div style={muted}>불러오는 중…</div>}
                {!feedLoading && lines.length === 0 && (
                    <div style={muted}>
                        {isDaily ? "일봉 골격이 그려진 차트가 없습니다." : "분봉 골격 위 타점이 없습니다(필터·선택만 보기·전일 종가 결손에 걸렸을 수도)."}
                    </div>
                )}
                <svg ref={svgRef} width={size.w} height={size.h} onDoubleClick={onDoubleClick}
                    style={{ display: "block", cursor: dragging ? "grabbing" : "default", touchAction: "none" }}>
                    <defs>
                        <clipPath id={clipId}><rect x={box.left} y={box.top} width={box.width} height={box.height} /></clipPath>
                    </defs>
                    {scales && bounds && (
                        <>
                            {/* 테마 라벨의 지시선 — **클립 밖**(거터는 그림 상자 바깥이라 클립하면 사라진다).
                                라벨(눈금 숫자 왼쪽)에서 출발해 **선이 좌단에서 잘리는 그 점**까지 긋는다.
                                라벨이 제 높이를 안 지키므로 이 선이 유일한 대응 표시다.
                                ⚠ 눈금 숫자 칸을 가로지르므로 **눈금보다 먼저** 그린다(숫자가 위에 얹히게).
                                끝점 x 는 상자 안으로 클램프 — 폴백(좌단 밖 끝점)일 때 지시선이 화면 밖으로 뻗지 않게. */}
                            {!themeSwapped && themeLabels.named.map((l) => {
                                const tx = clamp(scales.x(l.at.x), box.left, box.left + box.width);
                                const ty = l.anchorY; // 상자 밖 값은 가장자리로 당겨진 자리(칩의 ▲▼ 가 밖이라고 말한다)
                                const lit = hoveredThemeSet?.has(l.code) ?? false;
                                return (
                                    <g key={`tld-${l.code}`} style={{ pointerEvents: "none" }} opacity={lit ? 0.9 : 0.4}>
                                        <line x1={box.left - THEME_LABEL_INSET + 2} y1={l.labelY} x2={tx} y2={ty}
                                            stroke={themeColorOf(l.code)} strokeWidth={0.8} strokeDasharray="2 2" />
                                        {/* 잘리는 지점 표식 — 점선이 가리키는 곳이 눈에 딱 집히게. */}
                                        <circle cx={tx} cy={ty} r={2.2} fill={themeColorOf(l.code)} />
                                    </g>
                                );
                            })}

                            {/* 눈금 — 확대하면 d3 가 새 구간에 맞춰 다시 뽑는다(축이 곧 정보라 라벨이 따라와야 한다).
                                타점을 하나 선택했으면 **절대값을 아랫줄에** 같이 세운다(사용자 확정): 세로축은 전일比 %,
                                가로축은 벽시계. 한 줄에 붙이면 좁은 왼쪽 여백(46px)을 넘어 잘린다 — 그래서 두 줄이다. */}
                            {scales.y.ticks(5).map((v) => (
                                <g key={`y${v}`}>
                                    <line x1={box.left} x2={box.left + box.width} y1={scales.y(v)} y2={scales.y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
                                    <text x={box.left - 5} y={scales.y(v) + (axisAbs ? -1 : 3)} textAnchor="end" style={axisText}>{v.toFixed(0)}%</text>
                                    {axisAbs && (
                                        <text x={box.left - 5} y={scales.y(v) + 9} textAnchor="end" style={axisAbsText}>{fmtPct(v + axisAbs.baseRate)}</text>
                                    )}
                                </g>
                            ))}
                            {scales.x.ticks(6).map((v) => (
                                <g key={`x${v}`}>
                                    <text x={scales.x(v)} y={size.h - (axisAbs ? 14 : 8)} textAnchor="middle" style={axisText}>{fmtX(v, xUnit)}</text>
                                    {axisAbs && <text x={scales.x(v)} y={size.h - 4} textAnchor="middle" style={axisAbsText}>{timeOfMinutes(v + axisAbs.baseT)}</text>}
                                </g>
                            ))}

                            {/* 거터 라벨의 지시선 — **클립 밖**에 그린다(거터는 그림 상자 바깥이라 클립하면 사라진다).
                                라벨이 제자리를 벗어난 만큼 이 선이 원래 선 시작점을 가리킨다. */}

                            <g clipPath={`url(#${clipId})`}>
                                {/* 원점 좌표축 — **실선 + 끝 화살표**(사용자 확정, xy 좌표계 그대로). 흐린 점선은 그림에
                                    묻혀 안 읽혔다. 이 두 선이 피벗 좌표를 읽는 자(尺)다: 값은 여기로 내린 수직·수평
                                    점선의 발치에서 읽는다. 가로축 = 0(일봉이면 앵커 높이, 분봉이면 타점의 등락률 높이),
                                    세로축 = t=0(분봉이면 타점 시각). */}
                                <line x1={box.left} x2={box.left + box.width} y1={scales.y(0)} y2={scales.y(0)} stroke={AXIS_LINE} strokeWidth={1} />
                                <polygon points={`${box.left + box.width},${scales.y(0)} ${box.left + box.width - 7},${scales.y(0) - 3.5} ${box.left + box.width - 7},${scales.y(0) + 3.5}`} fill={AXIS_LINE} />
                                <line x1={scales.x(0)} x2={scales.x(0)} y1={box.top} y2={box.top + box.height} stroke={AXIS_LINE} strokeWidth={1} />
                                <polygon points={`${scales.x(0)},${box.top} ${scales.x(0) - 3.5},${box.top + 7} ${scales.x(0) + 3.5},${box.top + 7}`} fill={AXIS_LINE} />

                                {/* ── 캔들 오버레이 — **맨 아래**(테마 선보다도 아래). 골격이 그 위를 지나야
                                    "축약이 원본의 어디를 밟았나"가 읽힌다. 참고용이라 흐리다(사용자 확정).
                                    봉이 좁아지면(축소) 통째로 접힌다 — 400봉이 붙으면 잉크 덩어리일 뿐이다. */}
                                {/* 다른 라벨을 짚는 동안엔 캔들이 **잠시 사라진다**(사용자 확정) — 같은 종목의 형제 선을
                                    짚을 때도 마찬가지다. 그 순간의 질문은 "이 선 vs 저 선"이라 봉이 비교를 방해한다.
                                    진하기 자체는 헤더의 선명도 단계가 정한다 — 배경으로 깔지, 같이 읽을지가 상황마다 다르다. */}
                                {candles.set && (
                                    <CandleLayer set={candles.set} scales={scales} box={box}
                                        anchorShown={candles.anchorShown} memberShown={candles.memberShown} opacityOf={candles.opacityOf} />
                                )}

                                {/* ── 테마 선 — 짚은 타점의 앞뒤 창에 세운 **분당 종가 경로**(%p 평행이동, 세로 간격 보존).
                                    골격보다 **먼저** 그린다: 이건 배경이고 주인공은 내 골격이다.
                                    기본은 무채색 흐림 — 흐린 채색은 색이 아니다(알파가 낮으면 hue 차이가 안 읽힌다).
                                    짚은 하나만 거래대금 램프로 살아난다(상세 밀도 규칙 그대로).
                                    **타점 이후(x ≥ 0)는 앵커 선과 같은 문장** — 폴리라인은 점선, 런은 옅게(굵기와 안 싸우게). */}
                                {/* 다른 골격선을 보는 동안엔 테마를 접는다(themeSwapped) — 두 무리가 겹치면 안 갈린다. */}
                                {!themeSwapped && themeOverlay?.lines.map((l) => {
                                    const lit = hoveredThemeSet?.has(l.code) ?? false;
                                    const runs = amountWidthOn ? themeRuns?.get(l.code) : null;
                                    if (!runs) {
                                        const { past, future } = splitAtX(themePath(l.points, lineStep), 0);
                                        return (
                                            <g key={`th-${l.code}`} style={{ pointerEvents: "none" }} opacity={lit ? 0.9 : hoveredThemeSet ? 0.2 : 0.45}>
                                                {past.length >= 2 && <polyline points={pathOf(past, scales)} fill="none" stroke="var(--text-tertiary)" strokeWidth={lit ? 2 : 1} strokeLinejoin="round" />}
                                                {future.length >= 2 && <polyline points={pathOf(future, scales)} fill="none" stroke="var(--text-tertiary)" strokeWidth={lit ? 2 : 1} strokeLinejoin="round" strokeDasharray="4 4" />}
                                            </g>
                                        );
                                    }
                                    // 선은 무채색, **굵기가 거래대금**이다. 짚은 것만 또렷해지고 굵기 배수도 커진다.
                                    // 테마 배수를 앵커보다 낮게 잡아(0.75) 30선이 굵어져도 주인공이 안 묻힌다.
                                    return (
                                        <g key={`th-${l.code}`} style={{ pointerEvents: "none" }}
                                            opacity={lit ? 1 : hoveredThemeSet ? 0.25 : 0.55}>
                                            {/* 화면 밖 런은 아예 안 그린다 — 하루치 런은 대부분 창 밖이다. */}
                                            {runs.filter((r) => !viewX || (r.points[r.points.length - 1].x >= viewX.from && r.points[0].x <= viewX.to)).map((r, i) => (
                                                <polyline key={i} points={pathOf(themePath(r.points, lineStep), scales)} fill="none"
                                                    stroke="var(--text-tertiary)" strokeWidth={runWidth(r.level, lit ? 0.9 : 0.7)}
                                                    strokeLinecap="round" strokeLinejoin="round"
                                                    opacity={r.points[0].x >= 0 ? 0.4 : 1} />
                                            ))}
                                        </g>
                                    );
                                })}

                                {/* 테마 선의 **투명 히트라인** — 선 위에 손을 올리면 거터 라벨과 똑같이 반응한다(사용자 확정).
                                    "선은 순수 그림, 손잡이는 라벨"은 **수백 선**이 얽힐 때 DOM 히트가 겨냥한 걸 안 주기
                                    때문이었다. 여기 대상은 30선이라 8px 히트 폭이면 충분히 겨냥된다(겹치는 8px 안에선
                                    어차피 눈으로도 구분이 안 된다). 캔버스로 내려도 이 부류만 SVG 로 남기면 조작이 그대로다.
                                    enter/leave 는 **선이 바뀔 때만** 발생하므로 부모 재렌더도 그때뿐이다(mousemove 아님). */}
                                {/* ⚠ **드래그 중이라고 언마운트하면 안 된다**(겪은 버그): d3-zoom 은 움직임이 없어도
                                    **mousedown 에서** 제스처를 시작해 dragging=true 가 된다 → 히트라인이 사라지고 →
                                    mouseup 이 다른 요소에서 나 **click 이 아예 안 뜬다**(선 클릭 캔들 토글이 죽었다).
                                    이동 비용은 언마운트가 아니라 **화면 구간 자르기 + 솎기**로 줄인다(themePath). */}
                                {!themeSwapped && themeOverlay?.lines.map((l) => (
                                    <polyline key={`thh-${l.code}`}
                                        points={pathOf(themePath(l.points, hitStep), scales)}
                                        fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                        onClick={() => candles.toggle(l.code)}
                                        onMouseEnter={() => setHoveredTheme([l.code])}
                                        onMouseLeave={() => setHoveredTheme(null)} />
                                ))}

                                {lines.map((s) => {
                                    // 테마 모드에선 선택선·짚은 것·뱃지 무리만 그린다(나머지는 라벨만 남는다).
                                    if (!lineShown(s.key)) return null;
                                    const { v, color } = visualOf(s.key);
                                    const pts = polylinePoints(s, scales.x, scales.y);
                                    const lit = v.role !== "base";
                                    return (
                                        // 선은 순수 그림 — 포인터를 안 받는다(손잡이는 라벨). 캔버스로 옮겨도 조작이 안 바뀐다.
                                        // 진하기 = 역할이 정한다: 흐림(무리 밖) < 물러남(무리 안이지만 안 짚은 것) < 앞(짚은 것).
                                        <g key={s.key} opacity={v.dim ? dimmed : v.recede ? RECEDE_OPACITY : lit ? 1 : baseOpacity} style={{ pointerEvents: "none" }}>
                                            {/* 선택에만 넓은 반투명 밑선 — 색만으로는 "붙잡혔다"가 잘 안 읽힌다. */}
                                            {/* 선택 글로우(넓은 반투명 밑선)는 **폐기**(사용자 확정) — 굵기가 세 번째 차원을
                                                지는 지금은 글로우가 그 굵기를 가려버린다. 역할은 색이 진다: 선택 = 하늘(ACTIVE),
                                                호버 = 앰버, 테마 = 무채색. 색이 다른 일(거래대금)을 안 하게 됐으니 그걸로 충분하다. */}
                                            {/* 미래는 점선 — 타점 단위 선은 원점(자기 시각) 이후 전부.
                                                타점까지가 판단, 이후는 결과라는 문장이다. */}
                                            {(() => {
                                                const splitX = isPointUnit ? 0 : undefined;
                                                // 거래대금이 붙은 선은 **선분마다 색이 달라** 한 폴리라인으로 못 그린다.
                                                // 역할색(선택 하늘)을 잃지 않는 건 글로우(위의 넓은 밑선)가 이미 "붙잡혔다"를
                                                // 말하기 때문 — 그래서 선 색을 통째로 값에 내줄 수 있다(사용자 확정).
                                                if (amountWidthOn && amounts && amounts.key === s.key) {
                                                    // 색은 선 본연의 역할색(선택 파랑) 그대로 — 굵기만 거래대금이 정한다.
                                                    // 미래 구간은 점선 대신 **옅게**(조각이 분 단위라 점선이 굵기와 싸워 둘 다 못 읽힌다).
                                                    return amounts.runs.map((r, i) => (
                                                        <polyline key={`rn${i}`} points={pathOf(themePath(r.points, lineStep), scales)} fill="none"
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
                                            {/* 값은 뷰 공간 + **괄호에 절대값**(사용자 확정 — 분봉만): 평행이동량이 상수라
                                                벽시계 = x + t₀, 전일 종가 대비 % = y + baseRate 로 복원된다. 일봉엔 괄호가 없다
                                                (baseT 가 거래일 인덱스라 벽시계가 아니고, 앵커 대비 %가 그 자체로 값이다). */}
                                            {s.points.map((p, i) => {
                                                // 원점 제외는 **일봉만** — 앵커 대비 (0,0)은 무의미하지만, 분봉의 원점은
                                                // 괄호(타점 시각·절대 등락률)가 실값이고 테마 값을 펴는 호버 자리다(사용자 확정).
                                                if (!pivotShown(s.key, i) || (s.kind !== "point" && p.x === 0 && p.y === 0)) return null;
                                                const px = scales.x(p.x);
                                                const py = scales.y(p.y);
                                                const ax = clamp(scales.x(0), box.left, box.left + box.width); // 세로축(%를 읽는 자리)
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
                                                            {fmtX(p.x, xUnit)}{s.kind === "point" ? ` (${timeOfMinutes(p.x + s.baseT)})` : ""}
                                                        </text>
                                                        <text x={ax + (leftSide ? -4 : 4)} y={py - 3} textAnchor={leftSide ? "end" : "start"}
                                                            stroke="var(--bg-primary)" strokeWidth={3.5} paintOrder="stroke" style={val}>
                                                            {fmtPct(p.y)}{s.kind === "point" ? ` (${fmtPct(p.y + s.baseRate)})` : ""}
                                                        </text>
                                                    </g>
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
                                {themeOverlay && pinnedXs.map((m) => {
                                    const x = scales.x(m);
                                    const open = openReadingX === m;
                                    return (
                                        <g key={`pinv-${m}`}>
                                            <line x1={x} x2={x} y1={box.top} y2={box.top + box.height}
                                                stroke={open ? ACTIVE : "var(--text-tertiary)"} strokeWidth={open ? 1.2 : 0.8} strokeDasharray="2 3"
                                                opacity={open ? 0.9 : 0.5} style={{ pointerEvents: "none" }} />
                                            <line x1={x} x2={x} y1={box.top} y2={box.top + box.height} stroke="transparent" strokeWidth={10}
                                                style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                                                onMouseEnter={() => setHoveredPinLine(m)} onMouseLeave={() => setHoveredPinLine(null)} />
                                        </g>
                                    );
                                })}

                                {/* 짚은 골격선의 히트라인 — 테마 선과 같은 손짓(선 위에서 값을 읽는다).
                                    **선택된 것 하나만** 포인터를 받는다: 전체 골격선을 열면 많아질수록 손이 걸리고,
                                    그때는 라벨만 손잡이로 남긴다는 게 이 패널의 규약이다(사용자 확정). */}
                                {singleTarget && (
                                    <polyline points={pathOf(singleTarget.points, scales)}
                                        fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                        onClick={() => candles.toggle(singleTarget.stockCode)}
                                        onMouseEnter={() => setHovered(singleTarget.key)}
                                        onMouseLeave={() => setHovered(null)} />
                                )}

                                {/* ⚠ 그림 위에서 포인터를 받는 것들(히트라인·피벗 손잡이·핀 세로선)엔 **`<title>` 을 두지 않는다**
                                    (사용자 요구): 값을 읽으려고 손을 올린 그 자리에 브라우저 툴팁이 떠서 판독을 가린다.
                                    조작 안내는 푸터가 한 줄로 답하고, 값은 판독 칩이 답한다.

                                    피벗 손잡이 — 포인터를 받는 건 **조사 중인 골격 + 값을 붙잡아 둔 골격**의 점들뿐이다
                                    (선은 여전히 순수 그림). 한두 벌뿐이라 뭉쳐서 못 겨냥하는 문제가 없다.
                                    핀이 걸린 선까지 넣는 이유: 그 선을 떠난 뒤에도 값이 남는데 손잡이가 사라지면 **뗄 수가 없다**.
                                    들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
                                    클릭 = 그 점의 값 붙잡기/떼기(사용자 확정) — 여럿을 나란히 놓고 볼 수 있다.
                                    **맨 위에 그린다** — 위 세로선·아래 선들 어느 것도 이 손잡이를 가리면 안 된다. */}
                                {[...new Set([...(inspectKey ? [inspectKey] : []), ...linesWithPins])].map((key) => {
                                    const s = byKey.get(key);
                                    if (!s) return null;
                                    // 원점도 분봉에선 손잡이를 받는다(사용자 확정) — 호버 = t₀의 테마 값, 클릭 = 핀 세로선.
                                    return s.points.map((p, i) => (s.kind !== "point" && p.x === 0 && p.y === 0 ? null : (
                                        <circle key={`hit-${key}-${i}`} cx={scales.x(p.x)} cy={scales.y(p.y)} r={7} fill="transparent"
                                            style={{ pointerEvents: "auto", cursor: "pointer" }}
                                            onClick={() => togglePivot(s.key, i)}
                                            onMouseEnter={() => { setHovered(s.key); setHoveredPivot({ key: s.key, i }); }}
                                            onMouseLeave={() => { setHovered(null); setHoveredPivot(null); }} />
                                    )));
                                })}

                                {/* 거래대금 숫자 — **선×세그먼트당 하나 → 화면 x 격자**로 솎아 살아남은 것들.
                                    점은 **터진 그 분의 자리**에 정확히 얹히고(표식), 숫자는 그 오른쪽에 선다.
                                    점 색이 어느 선 것인지 말한다(좌측 이름 라벨의 점과 같은 색). */}
                                {/* 스왑 중(다른 골격선을 짚는 중)엔 거래대금 숫자도 접는다 — 테마·캔들을 접어 놓고
                                    그 숫자들만 남으면 어느 선의 것인지 가리킬 대상이 없어 화면에 뜬 잡음이 된다. */}
                                {/* 거래대금 숫자 — 스왑 중(다른 골격선을 짚는 중)엔 접는다: 테마·캔들을 접어 놓고
                                    그 숫자들만 남으면 어느 선의 것인지 가리킬 대상이 없어 화면에 뜬 잡음이 된다. */}
                                {!themeSwapped && (
                                    <AmountLabels labels={amountLabels} colorOf={themeColorOf} dimmedExcept={hoveredThemeSet} />
                                )}

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
                                                // 가격 → y 는 언제나 pct(price, basePrice) − baseRate — 골격 피벗과 같은 환산이어야 한 공간이다.
                                                const yPct = pct(lv.price, s.basePrice) - s.baseRate;
                                                const y = scales.y(yPct);
                                                return (
                                                    <g key={i}>
                                                        {/* 기준선은 **두껍게**(2.6px) — 1.4px 였을 땐 같은 굵기의 x축(0선)과 헷갈렸다(사용자 지적).
                                                            축은 중성색 1px, 기준선은 선 색 2.6px 라 색과 굵기 둘 다로 갈린다. */}
                                                        <line x1={box.left} x2={box.left + box.width} y1={y} y2={y}
                                                            stroke={color} strokeWidth={lv.baseline ? 2.6 : 1.2} opacity={lv.baseline ? 0.95 : 0.8} />
                                                        <text x={right ? box.left + box.width - 4 : box.left + 4} y={y - 4} textAnchor={right ? "end" : "start"}
                                                            stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                                            style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                                            {lv.baseline ? "기준 " : ""}{fmtPct(yPct)}{s.baseRate !== 0 ? ` (${fmtPct(yPct + s.baseRate)})` : ""}
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

                {/* 핀 시각의 판독 — 그 세로선 오른쪽에 크로스헤어 판독과 **같은 모양**으로. */}
                {scales && themeReadingSlots.length > 0 && openReadingX !== null && (
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
                        {themeReadingSlots.map((s) => (
                            <div key={`trl-${s.item.code}`} style={{
                                ...readoutBox, left: scales.x(openReadingX) + READOUT_OFFSET, top: s.labelY,
                                transform: "translateY(-50%)",
                                borderColor: s.item.own ? ACTIVE : "var(--border-default)",
                                fontWeight: s.item.own ? 500 : 400,
                            }}>
                                <span style={labelDot(themeColorOf(s.item.code))} />
                                <span>{s.item.name}</span>
                                {s.off && <span style={{ color: "var(--text-tertiary)" }}>{s.off === "up" ? "▲" : "▼"}</span>}
                                <span style={{ color: s.item.pct >= 0 ? RISE_COLOR : FALL_COLOR }}>{fmtPct(s.item.pct)}</span>
                                {s.item.amount !== null && <span style={{ color: "var(--text-secondary)" }}>{fmtEok(s.item.amount)}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {/* 테마 이름 층 — **왼쪽 거터**(그림 상자 바깥)라 컨테이너가 0..box.left 를 덮는다.
                    라벨은 오른쪽 정렬로 거터 끝에 붙고, 점이 선에 닿는 쪽(오른쪽 끝)에 온다.
                    상한을 넘은 나머지는 뱃지 하나 — 누르면 목록(이 패널의 뭉친 라벨 문법 그대로).
                    ⚠ 컨테이너는 포인터를 통과시킨다 — 거터는 **y축 스트립**이기도 해서(세로 확대 손짓의 자리)
                    여기가 이벤트를 먹으면 그 손짓이 죽는다. 칩만 pointerEvents:auto 로 받는다. */}
                {scales && themeOverlay && (
                    // 다른 골격선을 보는 동안엔 이름도 물러난다 — 선이 없는데 이름만 진하면 뭘 가리키는지 모른다.
                    <div style={{ position: "absolute", left: 0, top: box.top, width: box.left, height: box.height, overflow: "hidden", pointerEvents: "none", opacity: themeSwapped ? 0.25 : 1 }}>
                        {themeLabels.named.map((l) => {
                            const lit = hoveredThemeSet?.has(l.code) ?? false;
                            return (
                                // 이름 라벨 클릭 = 그 멤버 캔들 토글(선 클릭과 같은 손짓 — 라벨은 선의 손잡이니까).
                                <button key={`tl-${l.code}`}
                                    onClick={() => candles.toggle(l.code)}
                                    onMouseEnter={() => setHoveredTheme([l.code])}
                                    onMouseLeave={() => setHoveredTheme(null)}
                                    title={`${l.name} 전일比 ${fmtPct(l.at.y + (themeOverlay?.baseRate ?? 0))} — 올리면 그 선만 또렷해진다 · 클릭해 캔들 ${candles.codes.has(l.code) ? "끄기" : "켜기"}`}
                                    style={{
                                        // 눈금 숫자 칸(THEME_LABEL_INSET) **왼쪽**에 오른쪽 정렬로 선다.
                                        ...chip, left: box.left - THEME_LABEL_INSET, top: l.labelY - box.top, transform: "translate(-100%, -50%)",
                                        maxWidth: box.left - THEME_LABEL_INSET - 4, overflow: "hidden",
                                        color: lit || candles.codes.has(l.code) ? "var(--text-primary)" : "var(--text-tertiary)",
                                        fontWeight: lit || candles.codes.has(l.code) ? 700 : 400,
                                        // 캔들이 켜진 종목은 밑줄 — 어느 선의 캔들을 보고 있는지가 목록에서 읽힌다.
                                        ...(candles.codes.has(l.code) ? { textDecoration: "underline" } : {}),
                                    }}>
                                    {l.off && <span style={{ color: "var(--text-tertiary)" }}>{l.off === "up" ? "▲" : "▼"}</span>}
                                    {l.name}
                                    <span style={labelDot(themeColorOf(l.code))} />
                                </button>
                            );
                        })}
                        {themeLabels.hidden.length > 0 && (
                            <button
                                onClick={(e) => setThemeBadge({ x: e.clientX, y: e.clientY, members: themeLabels.hidden.map((h) => h.code) })}
                                onMouseEnter={() => setHoveredTheme(themeLabels.hidden.map((h) => h.code))} onMouseLeave={() => setHoveredTheme(null)}
                                title={`이름을 못 단 ${themeLabels.hidden.length}종목 — 올리면 그 선들이 켜지고, 누르면 목록`}
                                style={{
                                    ...chip, ...badgeChip,
                                    left: box.left - THEME_LABEL_INSET, top: median(themeLabels.hidden.map((h) => h.y)) - box.top,
                                    transform: "translate(-100%, -50%)",
                                }}>
                                +{themeLabels.hidden.length}
                            </button>
                        )}
                    </div>
                )}

                {/* 라벨 층 — HTML(칩 폭 계산 공짜 + d3 가 SVG mousedown 을 삼키는 문제 회피). 컨테이너는 포인터 통과. */}
                {scales && showLabels && (
                    <div style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
                        {/* 테마 모드에선 선이 숨은 라벨들 — **흐리게 남겨 손잡이 노릇만** 한다(사용자 확정).
                            지우면 그 타점들이 화면에서 영영 사라져 이동·선택·사각선택이 다 죽는다. */}
                        {clusters.map((c) => {
                            const left = c.x - box.left;
                            const top = c.y - box.top;
                            const faded = themeMode ? { opacity: 0.45 } : null;
                            if (c.members.length > 1) {
                                // 뱃지도 라벨과 같은 쪽(점의 바깥) — 손잡이의 자리 규칙은 하나여야 한다.
                                return (
                                    <button key={`c${c.x}|${c.y}`} onClick={(e) => setBadge({ x: e.clientX, y: e.clientY, members: c.members })}
                                        onMouseEnter={() => setBadgeHover(c.members)} onMouseLeave={() => setBadgeHover(null)}
                                        title={`${c.members.length}개 뭉침 — 올리면 무리가 ${themeMode ? "나타나고(테마는 잠시 접힌다)" : "켜지고"}, 누르면 목록`}
                                        style={{ ...chip, ...labelPlacement(left).style, top, ...badgeChip, ...faded }}>
                                        {c.members.length}
                                    </button>
                                );
                            }
                            const s = byKey.get(c.members[0]);
                            if (!s) return null;
                            const pl = labelPlacement(left);
                            return (
                                <button key={`c${c.x}|${c.y}`} onClick={(e) => onLabelClick(s, e)} onContextMenu={(e) => openGroupMenuFor(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — ${themeMode ? "올리면 이 골격선(테마는 잠시 접힌다) · " : ""}클릭=선택·이동 · Ctrl+클릭=다중선택 · 우클릭=그룹`}
                                    style={{ ...chip, ...labelBg, ...pl.style, top, ...faded }}>
                                    {labelOf(s, pl.dotFirst)}
                                </button>
                            );
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
                                <button key={key} onClick={(e) => onLabelClick(s, e)} onContextMenu={(e) => openGroupMenuFor(s, e)}
                                    onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}
                                    title={`${nameOf(s.stockCode)} ${s.date} — ${(s.kind === "point" || isDaily) && effSelected.has(s.key) && effSelected.size === 1
                                        ? `다시 클릭=${candles.codes.has(s.stockCode) ? "캔들 끄기" : "캔들 켜기"} · `
                                        : "클릭=선택·이동 · "}Ctrl+클릭=선택 해제 · 우클릭=그룹`}
                                    style={{
                                        ...chip, ...labelBg, ...pl.style, top: scales.y(p.y) - box.top,
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
                {scales && !dragging && (
                    <CrosshairLayer wrapRef={wrapRef} scales={scales} box={box} xUnit={xUnit} abs={axisAbs}
                        readoutAt={readoutAt} colorOf={themeColorOf} />
                )}
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
                                        <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{shortDate(s.date)}</span>
                                        <span>{nameOf(s.stockCode)}</span>
                                        {s.kind === "point" && <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{s.time.slice(0, 5)}</span>}
                                    </span>
                                </MenuItem>
                            </div>
                        ))}
                    </div>
                </AnchoredPopover>
            )}

            {/* 거터에 이름을 못 단 테마 종목들 — 등락률 순 목록. 행에 손을 올리면 그 선이 켜진다. */}
            {themeBadge && themeOverlay && (
                <AnchoredPopover anchor={themeBadge} onClose={() => setThemeBadge(null)} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>이름 생략 {themeBadge.members.length}종목</MenuLabel>
                    <div style={{ maxHeight: 300, overflowY: "auto" }}>
                        {themeBadge.members.map((code) => {
                            const l = themeOverlay.lines.find((x) => x.code === code);
                            if (!l) return null;
                            return (
                                // 목록 행도 거터 라벨과 같은 손짓 — 누르면 그 종목 캔들 토글.
                                <div key={code}
                                    onMouseEnter={() => setHoveredTheme([code])}
                                    onMouseLeave={() => setHoveredTheme(null)}>
                                    <MenuItem onClick={() => candles.toggle(code)}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 3, background: themeColorOf(code), flexShrink: 0 }} />
                                            <span>{l.name}</span>
                                            <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{fmtPct(l.points[0].y + themeOverlay.baseRate)}</span>
                                        </span>
                                    </MenuItem>
                                </div>
                            );
                        })}
                    </div>
                </AnchoredPopover>
            )}

            {/* 그룹 메뉴 — 같은 창, 다른 정션: 차트 라벨은 chart_tags, 타점 마커는 review_point_tags. */}
            {groupMenu?.kind === "chart" && (
                <BulkGroupMenu anchor={groupMenu} targets={groupMenu.charts} label={groupMenu.label} onClose={() => setGroupMenu(null)}
                    hasGroup={(c, id) => groupsView.chartGroupIdsOf(c).includes(id)}
                    toggle={(c, id, on) => groupsView.toggleChart(c, id, on)} />
            )}
            {groupMenu?.kind === "point" && (
                <BulkGroupMenu anchor={groupMenu} targets={groupMenu.points} label={groupMenu.label} onClose={() => setGroupMenu(null)}
                    hasGroup={(p, id) => groupsView.has(p, id)}
                    toggle={(p, id, on) => groupsView.toggle(p, id, on)} />
            )}

            <div style={footer}>
                {/* 조사 중인 선의 그룹 — 그룹 소속이 발끝에서 바로 읽힌다(따로 열어보지 않게).
                    타점 단위 선은 타점 그룹(차트 그룹 상속 포함), 차트 단위 선은 차트 그룹. */}
                {(() => {
                    const s = inspectKey ? byKey.get(inspectKey) : null;
                    const ids = s ? (s.kind === "point" ? groupsView.groupIdsOf({ stockCode: s.stockCode, date: s.date, time: s.time }) : groupsView.chartGroupIdsOf(s)) : [];
                    if (!s || ids.length === 0) return null;
                    return (
                        <span style={{ marginRight: 8 }}>
                            {ids.map((id) => {
                                const name = groupsView.groupById.get(id)?.name;
                                return name ? <span key={id} style={{ color: groupColor(name), fontWeight: 600, marginRight: 5 }}>{name}</span> : null;
                            })}
                            ·
                        </span>
                    );
                })()}
                {isDaily ? "일봉 · 세로 = 앵커 대비 %" : "분봉·타점 정규화(선 1 = 타점 1 · 원점 이후 점선=미래) · 세로 = 전일 종가 대비 %p 차이 · 괄호 = 절대값(시각·전일比)"} · 휠 = 가로 확대 · 축 드래그 = 그 축 확대 · 드래그 이동 · Ctrl+클릭/드래그 = 다중선택 · 우클릭 = 그룹 · 점 클릭 = 값 붙잡기
                {locked && <span style={{ color: "var(--text-secondary)" }}> · 척도 고정됨</span>}
                <span style={{ color: "var(--text-tertiary)" }}>
                    {isDaily ? " · 선택된 라벨 재클릭 = 캔들 · 축 더블클릭 = 그 축 원위치" : " · 선 클릭 = 캔들 · T = 테마 · 축 더블클릭 = 그 축 원위치"}
                </span>
                {themeMode && <span style={{ color: "var(--text-secondary)" }}> · 테마 모드(흐린 라벨 호버 = 그 골격선)</span>}
                {/* 캔들 상태 — 헤더가 아니라 여기(높이가 안 변하는 줄). 이름을 다 적어 어느 종목을 보고 있는지 남긴다. */}
                {candles.codes.size > 0 && (
                    <span style={{ color: "var(--text-secondary)" }}>
                        {" · 캔들 "}
                        {/* ⚠ 앵커는 `candleAnchor` 다 — 예전엔 `pointTarget!` 이었는데, 일봉 패널엔 그게 null 이라
                            일봉 캔들을 켜는 순간 여기서 터져 **패널이 흰 화면**이 됐다. 단언은 그 자리에서 깨진다. */}
                        {[candles.anchorOn && candleAnchor ? nameOf(candleAnchor.stockCode) : null, ...(candles.set?.members.map((m) => m.name) ?? [])].filter(Boolean).join("·")}
                        {candles.anchorOn && candles.anchorLoading ? " …" : ""}
                        <button onClick={candles.clear} title="켜 둔 캔들 전부 끄기" style={footerBtn}>✕</button>
                    </span>
                )}
                {themeOverlay && themeOverlay.lines.length > 0 && (
                    <span style={{ color: "var(--text-secondary)" }}> · 테마 {themeOverlay.lines.length}선(분당 종가)</span>
                )}
                {/* 굵기 범례 — 굵기는 "굵다=크다"가 자명해서 색처럼 대응표가 꼭 필요하진 않지만,
                    **단계 경계가 얼마인지**는 알아야 읽힌다(20 / 40 / 70 / 150억). 정확한 값은 숫자 라벨이 답한다. */}
                {!isDaily && amountWidthOn && (
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
function CrosshairLayer({ wrapRef, scales, box, xUnit, abs, readoutAt, colorOf }: {
    wrapRef: RefObject<HTMLDivElement | null>;
    scales: Scales;
    box: { left: number; top: number; width: number; height: number };
    xUnit: XUnit;
    /** 선택된 타점의 원점 — 있으면 뱃지가 절대값(벽시계·전일比 %)을 괄호로 같이 읽는다. */
    abs: { baseT: number; baseRate: number } | null;
    /** 세로선 판독기(부모가 만든다) — 커서 x 를 넣으면 그 시각에 보여줄 선들의 값. null 이면 안 펼친다. */
    readoutAt: ((x: number) => ReadoutCandidate[]) | null;
    colorOf: (code: string) => string;
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
    // 판독은 **선 위의 값**이라 커서 y 와 무관하다 — 세로선이 곧 자(尺)다.
    const rows = readoutAt ? layoutReadoutRows(
        readoutAt(xv).map((r) => ({ item: r, y: scales.y(r.y) })),
        { min: box.top + 8, max: box.top + box.height - 8 },
        READOUT_GAP,
    ) : [];
    // 오른쪽 끝에 닿으면 왼쪽으로 넘긴다 — 잘려서 못 읽는 것보단 잠깐 궤적을 가리는 게 낫다.
    const flip = pos.x > box.left + box.width - (READOUT_OFFSET + 140);
    const chipX = pos.x + (flip ? -READOUT_OFFSET : READOUT_OFFSET);
    // 읽기값은 커서 옆이 아니라 **축 가장자리 뱃지**(사용자 확정) — 차트 보던 습관 그대로 축에서 읽는다.
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* 점선 헤어라인 — 배경 없는 0폭 div 에 dashed border(1px div 배경으로는 점선이 안 된다). */}
            <div style={{ position: "absolute", left: pos.x, top: box.top, width: 0, height: box.height, borderLeft: "1px dashed var(--border-strong)", opacity: 0.8 }} />
            <div style={{ position: "absolute", left: box.left, top: pos.y, height: 0, width: box.width, borderTop: "1px dashed var(--border-strong)", opacity: 0.8 }} />
            {/* y 뱃지 — 왼쪽 % 축 위(눈금 숫자가 서는 자리, 오른끝을 축에 맞춘다). */}
            <div style={{ ...axisBadge, left: box.left - 2, top: pos.y - 7, transform: "translateX(-100%)" }}>
                {fmtPct(yv)}{abs && <span style={axisBadgeAbs}> {fmtPct(yv + abs.baseRate)}</span>}
            </div>
            {/* x 뱃지 — 아래 시간축 위. */}
            <div style={{ ...axisBadge, left: pos.x, bottom: 2, transform: "translateX(-50%)" }}>
                {fmtX(xv, xUnit)}{abs && <span style={axisBadgeAbs}> {timeOfMinutes(xv + abs.baseT)}</span>}
            </div>
            {/* 세로선 판독 — 지시선(SVG)이 먼저, 칩(HTML)이 그 위에. 칩은 **포인터를 안 받는다**:
                커서 밑에 칩이 깔리면 그게 선의 호버를 가로채 판독이 깜빡인다(떴다 사라졌다 반복). */}
            {rows.length > 0 && (
                <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    {rows.map((r) => (
                        <g key={r.item.code} opacity={r.item.own ? 0.95 : 0.5}>
                            <line x1={pos.x} y1={r.anchorY} x2={chipX} y2={r.labelY}
                                stroke={colorOf(r.item.code)} strokeWidth={0.8} strokeDasharray="2 2" />
                            <circle cx={pos.x} cy={r.anchorY} r={2.2} fill={colorOf(r.item.code)} />
                        </g>
                    ))}
                </svg>
            )}
            {rows.map((r) => (
                <div key={r.item.code} style={{
                    ...readoutBox, left: chipX, top: r.labelY,
                    transform: flip ? "translate(-100%, -50%)" : "translateY(-50%)",
                    borderColor: r.item.own ? ACTIVE : "var(--border-default)",
                    fontWeight: r.item.own ? 500 : 400,
                }}>
                    <span style={labelDot(colorOf(r.item.code))} />
                    <span>{r.item.name}</span>
                    {/* 진짜 값이 화면 밖이라 가장자리로 당겨진 칩 — 어느 쪽에 있는지 남긴다. */}
                    {r.off && <span style={{ color: "var(--text-tertiary)" }}>{r.off === "up" ? "▲" : "▼"}</span>}
                    <span style={{ color: r.item.pct >= 0 ? RISE_COLOR : FALL_COLOR }}>{fmtPct(r.item.pct)}</span>
                    {/* 거래대금은 없을 수 있다(그날 유니버스 밖) — 0으로 지어내지 않고 자리를 비운다. */}
                    {r.item.amount !== null && <span style={{ color: "var(--text-secondary)" }}>{fmtEok(r.item.amount)}</span>}
                </div>
            ))}
        </div>
    );
}

/** 선 판독 상자 — 얽힌 선 위에 뜨므로 불투명 배경(반투명이면 뒤 선이 글자를 뚫고 올라온다). */
const readoutBox: CSSProperties = {
    position: "absolute", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
    fontSize: 10, lineHeight: "15px", fontVariantNumeric: "tabular-nums",
    color: "var(--text-primary)", background: "var(--bg-secondary)", border: "1px solid var(--border-default)",
    borderRadius: 4, padding: "1px 6px", boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
};

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
/** 안내 문구 — 공용 문구 위에 **덮개**만 얹는다(그림 위에 떠서 포인터를 안 먹게). */
const muted: CSSProperties = { ...mutedNote, position: "absolute", inset: 0, pointerEvents: "none" };
const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
/** 눈금 아랫줄의 절대값 — 상대값(주)보다 한 단계 작고 흐리다. 둘이 같은 무게면 어느 쪽이 축인지 안 잡힌다. */
const axisAbsText: CSSProperties = { fontSize: 8.5, fill: "var(--text-quaternary, var(--text-tertiary))", opacity: 0.75, fontVariantNumeric: "tabular-nums" };
/** 크로스헤어 뱃지 안의 절대값 — 같은 뱃지에 이어 붙되 색으로 갈린다(뱃지를 둘로 나누면 축이 복잡해진다). */
const axisBadgeAbs: CSSProperties = { color: "var(--text-tertiary)" };
/** 푸터 안 인라인 버튼 — 상자·여백 없이 글자만(푸터 높이가 절대 안 변해야 그림이 안 튄다). */
const footerBtn: CSSProperties = { marginLeft: 4, padding: 0, border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", font: "inherit", lineHeight: "inherit" };
// 라벨 — 상자 없이 후광 글자 + 그 선 색의 점(F안). **색 점은 언제나 끝점을 마주 보는 쪽**에 서서
// 이 글자가 어느 선의 것인지 가리킨다(칩이 점 바깥에 서므로 칩의 안쪽 끝이 곧 점 쪽이다).
const chip: CSSProperties = {
    position: "absolute", pointerEvents: "auto", cursor: "pointer", whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 3,
    fontFamily: "var(--font-sans)", fontSize: 9, lineHeight: "11px", fontVariantNumeric: "tabular-nums",
    padding: 0, border: "none", background: "none", color: "var(--text-primary)",
    textShadow: "0 0 3px var(--bg-primary), 0 0 3px var(--bg-primary), 0 0 2px var(--bg-primary)",
};
/**
 * 얽힌 선 **위에 얹히는** 라벨의 판독 배경 — 후광 글자(F안)만으로는 선이 밀집한 자리에서 글자가 묻힌다
 * (사용자 지적: 테마 값·타점 라벨이 골격 선에 가려 안 읽힘). 반투명 배경이 뒤 선을 죽이지 않으면서
 * 글자 자리만 비워 준다. 거터처럼 빈 자리에 서는 라벨은 후광만으로 충분해 이걸 안 얹는다.
 */
const labelBg: CSSProperties = {
    background: "color-mix(in srgb, var(--bg-primary) 85%, transparent)",
    borderRadius: 3, padding: "0 3px", textShadow: "none",
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
