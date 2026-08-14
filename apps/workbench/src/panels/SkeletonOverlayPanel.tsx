import { useMemo, useRef, useState, useEffect, useCallback, type CSSProperties, type RefObject } from "react";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { RISE_COLOR, FALL_COLOR } from "../chart/chartUtils.js";
import {
    dailyFrame, pointUnitFrame, splitAtX, polylinePoints, pct,
    lineOpacity, dimOpacity, labelPointOf, labelHandles, lineVisual, keysInRect, yAtX, decimate, decimateStep, clipToX,
    amountRuns,
    type LineVisual, type NormalizedSkeleton, type OverlayLine, type OverlayBounds, type SkeletonAnchor, type PointSkeleton,
} from "./skeleton/skeletonOverlay.js";
import { useOverlayData } from "./skeleton/useOverlayData.js";
import { useDaySnapshot } from "./skeleton/useDaySnapshot.js";
import { useCandles, type CandleFocus } from "./skeleton/useCandles.js";
import { useOverlayToggles } from "./skeleton/useOverlayToggles.js";
import { OverlayHeader } from "./skeleton/OverlayHeader.js";
import { OverlayFooter } from "./skeleton/OverlayFooter.js";
import { LabelLayer, LABEL_CELL } from "./skeleton/LabelLayer.js";
import { labelDot } from "./skeleton/chips.js";
import { amountLevelOf, amountLookupOf, runWidth } from "./skeleton/amountLayer.js";
import { AmountLabels, useAmountLabels, type AmountSource } from "./skeleton/AmountLabels.js";
import { useThemeLabels, useThemeOverlay } from "./skeleton/useThemeOverlay.js";
import { usePivotPins } from "./skeleton/usePivotPins.js";
import { PinReadout, PinVerticals, PivotHandles, READOUT_OFFSET, readoutBox } from "./skeleton/PinLayer.js";
import { ThemeGutter, ThemeLeaders, ThemeLines } from "./skeleton/ThemeLayer.js";
import { CandleLayer } from "./skeleton/CandleLayer.js";
import { pickReadouts, layoutReadoutRows, type ReadoutCandidate } from "./skeleton/readout.js";
import { useOverlayZoom, type ZoomRegion } from "./skeleton/useOverlayZoom.js";
import { useMarquee, type MarqueeRect } from "./skeleton/useMarquee.js";
import { useWorkbench } from "../store/workbench.js";
import { useGroups } from "../lib/GroupsContext.js";
import { pointKeyOf, chartKeyOf, type PointRef } from "../lib/pointKey.js";
import { BulkGroupMenu } from "./skeleton/ChartGroupMenu.js";
import { mutedNote } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { ACTIVE, HOVER, seriesColor } from "../styles/palette.js";
import { fmtEok, fmtPct } from "../lib/format.js";
import { shortDate, timeOfMinutes } from "../lib/date.js";
import { clamp } from "../lib/num.js";

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

/**
 * 그림 상자 바깥 여백. **테마를 켜면 왼쪽이 거터(100px)로 넓어진다**(사용자 확정) — 테마 이름 라벨을
 * 그 안에서 세로로 벌려 전부 읽히게 하려고. 평소엔 y축 눈금만 들어가면 되니 46px 이면 족하다.
 */
const PAD = { right: 14, top: 12, bottom: 24 };
const PAD_LEFT = { plain: 46, gutter: 122 };
/** 피벗 점 예산 — **원 개수**로 센다(골격당 피벗 수가 3~6으로 제각각이라 골격 수로 세면 임계가 두 배 흔들린다). */
const DOT_BUDGET = 1200;
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

type Scales = { x: ScaleLinear<number, number>; y: ScaleLinear<number, number> };
type XUnit = "day" | "min";
const fmtX = (x: number, unit: XUnit): string => `${Math.round(x)}${unit === "day" ? "일" : "분"}`;

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — 시나리오가 "일봉에서 무리 → 분봉으로 확인"의 동시 사용이라
 *  토글 하나로는 두 그림을 오가며 볼 수 없다. grain 은 패널 정체성이라 마운트 후 안 바뀐다. */
export function SkeletonOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    // 표시 토글 한 벌 — 영속 키 규칙(전부 grain 접미사)까지 useOverlayToggles 가 소유한다.
    const toggles = useOverlayToggles(grain);
    const { anchor, showFuture, showLevels, showLabels, showAmount, showAmountLabels, showTheme, setShowTheme } = toggles;

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

    // 라벨이 붙는 끝 — 골격 종목 이름은 **언제나 경로의 왼쪽 끝**(사용자 확정).
    // 테마 라벨은 왼쪽 거터에 살아 자리 싸움이 없고, 미래 점선 쪽(오른쪽)은 결과라 손잡이를 안 둔다.
    const labelAnchorMode: SkeletonAnchor = isPointUnit ? "last" : anchor;
    const labelAtStart = isPointUnit || anchor === "last";

    // 라벨 축약 — 화면 좌표로 묶는다. 확대하면 칸이 쪼개지며 뱃지가 저절로 풀린다(숨김이 아니라 압축).
    // 선택·호버는 묶음에서 빼고 제 손잡이로 세운다. 그룹 멤버는 안 뺀다 — 이름은 목록이 대고 그림은 색으로 답한다.
    // **목록은 한 벌**이고 자리·정체는 labelHandles 가 정한다(호버가 노드를 부수면 leave 가 안 온다 — 그 주석 참고).
    // ⚠ 아래 뱃지 호버가 이 목록에서 무리를 되찾으므로 **여기서 먼저** 만든다.
    const pinnedKeys = useMemo(() => new Set([...effSelected, ...(hovered ? [hovered] : [])]), [effSelected, hovered]);
    const handles = useMemo(() => {
        if (!showLabels || !scales) return [];
        const anchors = lines
            .map((s) => { const p = labelPointOf(s, labelAnchorMode); return { key: s.key, x: scales.x(p.x), y: scales.y(p.y) }; });
        return labelHandles(anchors, pinnedKeys, LABEL_CELL.w, LABEL_CELL.h);
    }, [showLabels, scales, lines, labelAnchorMode, pinnedKeys]);

    // 그룹 = 뭉친 라벨 무리. 목록이 열려 있으면 계속 켜둔다(마우스를 목록으로 옮겨도 짝이 유지되게).
    //
    // ⚠ 상태로 드는 건 **뱃지 id 하나**고 멤버 목록은 매번 지금 손잡이 목록에서 되찾는다. 멤버 배열을
    //   그대로 상태에 앉히면 뱃지가 사라진 뒤에도 옛 무리가 살아남는다(겪은 버그: 뭉친 것 중 하나가
    //   다른 패널의 손짓으로 짚히면 뱃지가 손 밑에서 부서지는데, 언마운트된 노드는 leave 를 안 쏜다).
    //   id 로 들면 그 뱃지가 없어진 순간 조회가 비므로 **낡은 상태가 표현 불가능**해진다.
    const [badgeHover, setBadgeHover] = useState<string | null>(null);
    const hoveredBadgeMembers = useMemo<readonly string[] | null>(() => {
        if (!badgeHover) return null;
        const hit = handles.find((h) => h.kind === "badge" && h.id === badgeHover);
        return hit?.kind === "badge" ? hit.members : null;
    }, [badgeHover, handles]);
    const groupList = badge?.members ?? hoveredBadgeMembers;
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
    // 라벨이 붙는 끝(labelAnchorMode)·자리 배치(handles)는 뱃지 호버가 그 목록을 읽으므로 **위**로 올라갔다.

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

    // ── 테마 오버레이 — 상태·계산·모드 규칙 전부 useThemeOverlay 가 소유한다.
    //    짚은 선이 하나일 때만 펼친다: 여러 날의 테마를 한 화면에 겹치면 "이 종목이 혼자 튄 건가"가 흐려진다.
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

    const theme = useThemeOverlay({
        enabled: !isDaily && showTheme,
        target: pointTarget,
        snapshot: snapQ.data,
        hot: replaySettings,
        lookup,
        amountWidthOn,
        hoveredLine: hovered,
        singleKey: singleTarget?.key ?? null,
        groupSet,
    });
    const themeOverlay = theme.overlay;
    const themeLabels = useThemeLabels(themeOverlay, scales, viewX, box);

    /**
     * 지금 짚고 있는 대상 — 캔들을 그릴지 정하는 유일한 기준. null 이면 아무것도 안 짚은 상태(전부 그린다).
     * 골격선 호버는 **선 하나**(키), 테마 라벨·뱃지 호버는 종목 무리.
     */
    const candleFocus = useMemo<CandleFocus>(() => {
        if (theme.hovered) return { kind: "theme", codes: theme.hovered };
        if (hovered) return { kind: "line", key: hovered };
        return null;
    }, [theme.hovered, hovered]);

    // ── 캔들 오버레이 — **참고용 배경**(흐리게). 주인공은 여전히 골격 선이다.
    // 상태(켠 종목)·재료(차트 번들·스냅샷)·감추기 규칙은 전부 useCandles 가 안다. 이 패널은 짚고 있는
    // 대상(candleFocus)과 주인공만 넘기고, 켜고 끄는 손짓(candles.toggle)을 선·라벨·목록에 나눠 준다.
    const candles = useCandles({
        anchor: candleAnchor, pointTarget, dailyTarget, snapshot: snapQ.data, focus: candleFocus, nameOf, grain,
    });



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
    const readoutOn = !!readoutSources && (theme.hovered?.size === 1 || (hovered !== null && hovered === singleTarget?.key));
    const readoutAt = useMemo<((x: number) => ReadoutCandidate[]) | null>(() => {
        if (!readoutOn || !readoutSources) return null;
        const lit = theme.hovered?.size === 1 ? [...theme.hovered][0] : singleTarget?.stockCode ?? null;
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
    }, [readoutOn, readoutSources, theme.hovered, singleTarget]);

    // ── 피벗 값 붙잡기 — 상태·판정 전부 usePivotPins 가 소유한다(골격선 층이 `shown` 을 물어본다).
    const pins = usePivotPins({ target: singleTarget, resetKey: themeOverlay?.key, anchorKey: anchor });

    /**
     * 붙잡은 핀 시각의 판독 — **크로스헤어 판독과 같은 규칙**으로 통일했다(사용자 확정):
     * 옛 열 쌓기(layoutAxisColumns)는 겹칠수록 오른쪽으로 번져 화면을 넘었고, "어느 시각 것이냐"를
     * 열로 읽는 규칙을 따로 배워야 했다. 지시선이 이미 대응을 지므로 **한 열에서 위아래로** 벌리면 그만이다.
     * 뽑기도 같은 기준(등락률·누적 대금 상위) — 두 판독이 다른 무리를 보여주면 그게 더 헷갈린다.
     */
    const themeReadingSlots = useMemo(() => {
        if (!scales || !readoutSources || pins.openReadingX === null) return [];
        const minute = Math.round(pins.openReadingX) + (readoutSources[0]?.t0 ?? 0);
        const cands: ReadoutCandidate[] = [];
        for (const s of readoutSources) {
            const y = s.yAt(pins.openReadingX);
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
    }, [scales, readoutSources, pins.openReadingX, box.top, box.height]);

    /** 라벨 후보를 내는 선들 — 앵커 골격 + 테마 전부. 모양이 같아 한 격자에서 겨룬다(AmountLabels). */
    const amountSources = useMemo<AmountSource[]>(() => {
        const out: AmountSource[] = [];
        if (amounts && amountTarget) out.push({ code: amountTarget.stockCode, runs: amounts.runs, baseT: amountTarget.baseT, own: true });
        if (theme.runs && themeOverlay) for (const [code, runs] of theme.runs) out.push({ code, runs, baseT: themeOverlay.t0, own: false });
        return out;
    }, [amounts, amountTarget, theme.runs, themeOverlay]);
    const amountLabels = useAmountLabels(amountSources, scales, pins.anchorMinutes, amountLabelsOn);



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
    /** 지금 조사 중인 선의 그룹 이름들 — 타점 단위 선은 타점 그룹(차트 그룹 상속 포함), 차트 단위 선은 차트 그룹. */
    const inspectGroupNames = useMemo(() => {
        const s = inspectKey ? byKey.get(inspectKey) : null;
        if (!s) return [];
        const ids = s.kind === "point"
            ? groupsView.groupIdsOf({ stockCode: s.stockCode, date: s.date, time: s.time })
            : groupsView.chartGroupIdsOf(s);
        return ids.map((id) => groupsView.groupById.get(id)?.name).filter((n): n is string => !!n);
    }, [inspectKey, byKey, groupsView]);



    return (
        <div style={wrap}>
            <OverlayHeader
                grain={grain}
                toggles={toggles}
                candles={candles}
                counts={{ shown: lines.length, population, missing: missingPrevClose }}
                theme={{ lineCount: themeOverlay?.lines.length ?? null, hasTarget: singleTarget !== null }}
                selection={{
                    chartCount: selectedCharts.length,
                    chartChannelShown: !isPointUnit,
                    rawChartCount: selectedKeys.size,
                    onGroupCharts: openGroupMenuForSelection,
                    onClearCharts: () => setSelectedKeys(new Set()),
                    pointKeys: selectedPks,
                    onGroupPoints: openPointGroupMenu,
                    onClearPoints: () => setSelectedPks(new Set()),
                    pinnedCount: pins.count,
                    onClearPins: pins.clear,
                }}
                onlySelected={onlySelected}
                setOnlySelected={setOnlySelected}
                locked={locked !== null}
                onToggleLock={() => setLocked(locked ? null : autoBounds)}
                zoomed={zoomed}
                onResetZoom={reset}
            />

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
                            {/* 테마 라벨의 지시선 — 클립 밖(거터는 그림 상자 바깥이라 클립하면 사라진다).
                                ⚠ **눈금보다 먼저** 그린다 — 눈금 숫자 칸을 가로지르므로 나중에 그리면
                                점선이 숫자 위에 얹혀 둘 다 못 읽는다(층 순서 테스트가 잡는다). */}
                            {!theme.swapped && themeOverlay && (
                                <ThemeLeaders labels={themeLabels.named} scales={scales} box={box}
                                    colorOf={theme.colorOf} hovered={theme.hovered} />
                            )}

                            {/* 눈금 — 확대하면 d3 가 새 구간에 맞춰 다시 뽑는다(축이 곧 정보라 라벨이 따라와야 한다).
                                타점을 하나 선택했으면 **절대값을 아랫줄에** 같이 세운다(사용자 확정): 세로축은 전일比 %,
                                가로축은 벽시계. 한 줄에 붙이면 좁은 왼쪽 여백(46px)을 넘어 잘린다 — 그래서 두 줄이다. */}
                            <g data-layer="axis-ticks">
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
                            </g>

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
                                <g data-layer="candles">
                                    {candles.set && (
                                        <CandleLayer set={candles.set} scales={scales} box={box}
                                            anchorShown={candles.anchorShown} memberShown={candles.memberShown} opacityOf={candles.opacityOf} />
                                    )}
                                </g>

                                {/* ── 테마 선 + 히트라인 — 골격보다 **먼저** 그린다(배경이고 주인공은 내 골격).
                                    다른 골격선을 보는 동안엔 접는다(swapped) — 두 무리가 겹치면 안 갈린다. */}
                                {themeOverlay && !theme.swapped ? (
                                    <ThemeLines overlay={themeOverlay} runs={theme.runs} hovered={theme.hovered}
                                        pathOf={(pts, step) => pathOf(themePath(pts, step), scales)}
                                        clip={viewX} lineStep={lineStep} hitStep={hitStep}
                                        onHover={theme.setHovered} onToggleCandle={candles.toggle} />
                                ) : (
                                    // 접혀 있어도 층의 **자리는 남긴다** — 그리는 순서가 켜고 끔에 따라 달라지면
                                    // 순서 규약을 잴 수가 없다(층 순서 테스트가 이 빈 자리까지 확인한다).
                                    <>
                                        <g data-layer="theme-lines" />
                                        <g data-layer="theme-hit" />
                                    </>
                                )}

                                <g data-layer="skeleton-lines">
                                {lines.map((s) => {
                                    // 테마 모드에선 선택선·짚은 것·뱃지 무리만 그린다(나머지는 라벨만 남는다).
                                    if (!theme.lineShown(s.key)) return null;
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
                                                const r = pins.shown(s.key, i) ? 5 : lit ? 3 : 2;
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
                                                if (!pins.shown(s.key, i) || (s.kind !== "point" && p.x === 0 && p.y === 0)) return null;
                                                const px = scales.x(p.x);
                                                const py = scales.y(p.y);
                                                const ax = clamp(scales.x(0), box.left, box.left + box.width); // 세로축(%를 읽는 자리)
                                                const ay = clamp(scales.y(0), box.top, box.top + box.height); // 가로축(기간을 읽는 자리)
                                                const below = ay + 12 <= box.top + box.height; // x축 아래에 자리가 없으면 위로
                                                const leftSide = ax - box.left > 44; // y축 왼쪽에 자리가 없으면 오른쪽으로
                                                // 붙잡은 값은 계속 또렷하게, 스치는 미리보기는 한 단계 물러난다(붙잡았다는 게 보이게).
                                                const pin = pins.isPinned(s.key, i);
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
                                </g>

                                {/* 붙잡은 피벗의 세로선 — 테마 값을 펼치는 손잡이.
                                    ⚠ **피벗 손잡이보다 먼저** 그린다(PinLayer 머리 주석 — 겪은 버그). */}
                                <PinVerticals xs={themeOverlay ? pins.pinnedXs : []} openX={pins.openReadingX}
                                    scales={scales} box={box} onHover={pins.setHoveredPinLine} />

                                {/* 짚은 골격선의 히트라인 — 테마 선과 같은 손짓(선 위에서 값을 읽는다).
                                    **선택된 것 하나만** 포인터를 받는다: 전체 골격선을 열면 많아질수록 손이 걸리고,
                                    그때는 라벨만 손잡이로 남긴다는 게 이 패널의 규약이다(사용자 확정). */}
                                <g data-layer="line-hit">
                                {singleTarget && (
                                    <polyline points={pathOf(singleTarget.points, scales)}
                                        fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round"
                                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                        onClick={() => candles.toggle(singleTarget.stockCode)}
                                        onMouseEnter={() => setHovered(singleTarget.key)}
                                        onMouseLeave={() => setHovered(null)} />
                                )}
                                </g>

                                {/* ⚠ 그림 위에서 포인터를 받는 것들(히트라인·피벗 손잡이·핀 세로선)엔 **`<title>` 을 두지 않는다**
                                    (사용자 요구): 값을 읽으려고 손을 올린 그 자리에 브라우저 툴팁이 떠서 판독을 가린다.
                                    조작 안내는 푸터가 한 줄로 답하고, 값은 판독 칩이 답한다.

                                    피벗 손잡이 — 포인터를 받는 건 **조사 중인 골격 + 값을 붙잡아 둔 골격**의 점들뿐이다
                                    (선은 여전히 순수 그림). 한두 벌뿐이라 뭉쳐서 못 겨냥하는 문제가 없다.
                                    핀이 걸린 선까지 넣는 이유: 그 선을 떠난 뒤에도 값이 남는데 손잡이가 사라지면 **뗄 수가 없다**.
                                    들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
                                    클릭 = 그 점의 값 붙잡기/떼기(사용자 확정) — 여럿을 나란히 놓고 볼 수 있다.
                                    **맨 위에 그린다** — 위 세로선·아래 선들 어느 것도 이 손잡이를 가리면 안 된다. */}
                                <PivotHandles
                                    lines={[...new Set([...(inspectKey ? [inspectKey] : []), ...pins.linesWithPins])]
                                        .map((key) => byKey.get(key))
                                        .filter((s): s is Line => !!s)}
                                    scales={scales}
                                    onToggle={pins.toggle}
                                    // 들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
                                    onHover={(at) => { setHovered(at?.key ?? null); pins.setHoveredPivot(at); }}
                                />

                                {/* 거래대금 숫자 — **선×세그먼트당 하나 → 화면 x 격자**로 솎아 살아남은 것들.
                                    점은 **터진 그 분의 자리**에 정확히 얹히고(표식), 숫자는 그 오른쪽에 선다.
                                    점 색이 어느 선 것인지 말한다(좌측 이름 라벨의 점과 같은 색). */}
                                {/* 스왑 중(다른 골격선을 짚는 중)엔 거래대금 숫자도 접는다 — 테마·캔들을 접어 놓고
                                    그 숫자들만 남으면 어느 선의 것인지 가리킬 대상이 없어 화면에 뜬 잡음이 된다. */}
                                {/* 거래대금 숫자 — 스왑 중(다른 골격선을 짚는 중)엔 접는다: 테마·캔들을 접어 놓고
                                    그 숫자들만 남으면 어느 선의 것인지 가리킬 대상이 없어 화면에 뜬 잡음이 된다. */}
                                <g data-layer="amount-labels">
                                    {!theme.swapped && (
                                        <AmountLabels labels={amountLabels} colorOf={theme.colorOf} dimmedExcept={theme.hovered} />
                                    )}
                                </g>

                                {/* 얹는 선(기준선·D선) — 같은 pct 환산. **주인이 스타일을 정한다**(사용자 확정):
                                    색은 **그 골격선과 똑같이**(visualOf) — 그룹 목록을 훑을 때 골격선은 무리 색인데
                                    가로선만 앰버로 뜨면 "이게 어느 골격의 선이냐"를 다시 찾아야 했다(사용자 지적).
                                    선이 이미 색으로 정해져 있으니 가로선은 그 색을 따라가면 그만이다.
                                    둘이 동시에 떠도(단일 선택 + 호버) 라벨 위치로 갈린다: 선택 = 오른쪽, 호버 = 왼쪽.
                                    **둘 다 실선** — 점선은 가격 수준선을 읽기 어렵게만 했다(사용자 확정).
                                    다중 선택이면 호버 것만(수십 벌이 겹치므로).
                                    기준선 여부는 선 모양이 아니라 라벨의 "기준" 접두어 — 어차피 최저가 규칙이라 아래가 기준선. */}
                                <g data-layer="levels">
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
                            </g>
                        </>
                    )}
                </svg>

                {/* 핀 시각의 판독 — 그 세로선 오른쪽에 크로스헤어 판독과 **같은 모양**으로. */}
                {scales && themeReadingSlots.length > 0 && pins.openReadingX !== null && (
                    <PinReadout rows={themeReadingSlots} x={pins.openReadingX} scales={scales} colorOf={theme.colorOf} />
                )}

                {/* 테마 이름 층 + 넘침 뱃지 목록 — 그림 상자 왼쪽 거터(HTML). */}
                {scales && (
                    <ThemeGutter theme={theme} labels={themeLabels} box={box} swapped={theme.swapped}
                        isCandleOn={(code) => candles.codes.has(code)} onToggleCandle={candles.toggle} />
                )}

                {/* 라벨 층 — HTML(칩 폭 계산 공짜 + d3 가 SVG mousedown 을 삼키는 문제 회피). 컨테이너는 포인터 통과. */}
                {scales && showLabels && (
                    <LabelLayer
                        handles={handles} byKey={byKey} box={box}
                        labelAtStart={labelAtStart}
                        themeMode={theme.mode}
                        visualOf={(key) => { const { v, color } = visualOf(key); return { selected: v.role === "selected", color }; }}
                        nameOf={nameOf}
                        isCandleOn={(code) => candles.codes.has(code)}
                        canToggleCandle={(s) => (s.kind === "point" || isDaily) && effSelected.has(s.key) && effSelected.size === 1}
                        onLabelClick={onLabelClick}
                        onLabelContext={openGroupMenuFor}
                        onHover={setHovered}
                        onBadgeOpen={(at, members) => setBadge({ ...at, members })}
                        onBadgeHover={setBadgeHover}
                    />
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
                        readoutAt={readoutAt} colorOf={theme.colorOf} />
                )}
            </div>

            {/* 뭉친 라벨의 멤버 목록 — 행 점이 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */}
            {badge && (
                <AnchoredPopover anchor={badge} onClose={closeBadge} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>{badge.members.length}개 골격</MenuLabel>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {badgeRows.map((s) => (
                            <div key={s.key} onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}>
                                {/* ⚠ 닫기 전에 호버를 **손으로** 푼다 — 목록이 사라지면 이 행은 언마운트라
                                    mouseleave 가 영영 안 온다(라벨에서 겪은 것과 같은 부류의 누수).
                                    거기선 노드를 안 부수는 게 답이지만, 여기선 닫는 게 목적이라 풀어 주는 게 답이다. */}
                                <MenuItem onClick={() => { onLabelClick(s, { ctrlKey: false, metaKey: false }); setHovered(null); closeBadge(); }}>
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

            <OverlayFooter
                grain={grain}
                groupNames={inspectGroupNames}
                locked={locked !== null}
                themeMode={theme.mode}
                themeLineCount={themeOverlay?.lines.length ?? 0}
                candles={{
                    // ⚠ 앵커는 `candleAnchor` 다 — 예전엔 `pointTarget!` 이었는데 일봉 패널엔 그게 null 이라
                    //   일봉 캔들을 켜는 순간 여기서 터져 **패널이 흰 화면**이 됐다. 단언은 그 자리에서 깨진다.
                    names: candles.codes.size === 0 ? [] : [
                        candles.anchorOn && candleAnchor ? nameOf(candleAnchor.stockCode) : null,
                        ...(candles.set?.members.map((m) => m.name) ?? []),
                    ].filter((n): n is string => n !== null),
                    loading: candles.anchorOn && candles.anchorLoading,
                    onClear: candles.clear,
                }}
                amountWidthOn={amountWidthOn}
            />
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


/** 크로스헤어 축 뱃지 — 축 눈금 위에 얹히므로 불투명 배경으로 아래 숫자를 덮는다(겹쳐 보이면 둘 다 못 읽는다). */
const axisBadge: CSSProperties = {
    position: "absolute", fontSize: 9.5, lineHeight: "13px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-default)",
    borderRadius: 3, padding: "0 4px",
};

const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
/** 안내 문구 — 공용 문구 위에 **덮개**만 얹는다(그림 위에 떠서 포인터를 안 먹게). */
const muted: CSSProperties = { ...mutedNote, position: "absolute", inset: 0, pointerEvents: "none" };
const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
/** 눈금 아랫줄의 절대값 — 상대값(주)보다 한 단계 작고 흐리다. 둘이 같은 무게면 어느 쪽이 축인지 안 잡힌다. */
const axisAbsText: CSSProperties = { fontSize: 8.5, fill: "var(--text-quaternary, var(--text-tertiary))", opacity: 0.75, fontVariantNumeric: "tabular-nums" };
/** 크로스헤어 뱃지 안의 절대값 — 같은 뱃지에 이어 붙되 색으로 갈린다(뱃지를 둘로 나누면 축이 복잡해진다). */
const axisBadgeAbs: CSSProperties = { color: "var(--text-tertiary)" };
