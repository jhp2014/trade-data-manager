import { useMemo, useRef, useState, useEffect, useCallback, type CSSProperties } from "react";
import {
    lineOpacity, dimOpacity, labelPointOf, labelHandles, lineVisual,
    type LineVisual, type OverlayLine, type SkeletonAnchor,
} from "./skeleton/skeletonOverlay.js";
import { useOverlayData } from "./skeleton/useOverlayData.js";
import { useDaySnapshot } from "./skeleton/useDaySnapshot.js";
import { useCandles } from "./skeleton/useCandles.js";
import { useOverlayToggles } from "./skeleton/useOverlayToggles.js";
import { useOverlayViewport } from "./skeleton/useOverlayViewport.js";
import { useOverlaySelection } from "./skeleton/useOverlaySelection.js";
import { useInspection, candleFocusOf } from "./skeleton/useInspection.js";
import { useAmountReadout } from "./skeleton/useAmountReadout.js";
import { OverlayPlot, fmtX, type XUnit } from "./skeleton/OverlayPlot.js";
import { OverlayMenus } from "./skeleton/OverlayMenus.js";
import { OverlayHeader } from "./skeleton/OverlayHeader.js";
import { OverlayFooter } from "./skeleton/OverlayFooter.js";
import { LABEL_CELL } from "./skeleton/LabelLayer.js";
import { amountLookupOf } from "./skeleton/amountLayer.js";
import { useThemeLabels, useThemeOverlay } from "./skeleton/useThemeOverlay.js";
import { usePivotPins } from "./skeleton/usePivotPins.js";
import { type LevelOwner } from "./skeleton/LevelsLayer.js";
import { skeletonLinesLayer } from "./skeleton/skeletonLinesLayer.js";
import { candleLayer } from "./skeleton/candleLayer.js";
import { themeLinesLayer } from "./skeleton/themeLinesLayer.js";
import { flatten, orderPaint, type DrawLayer } from "./skeleton/drawList.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import { inPick, pickKeys, PICK_SOURCE_LABEL } from "../lib/pick.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { useSetBinding } from "./filter/useSetBinding.js";
import { SetBindingLabel, setBindingControl } from "./filter/SetBindingLabel.js";
import { SetSidebar } from "./filter/SetSidebar.js";
import { setMembersOf } from "./filter/setMembers.js";
import { useGroups } from "../lib/GroupsContext.js";
import { chartKey, pointKey } from "../lib/pointKey.js";
import { SubjectBadge } from "../components/SubjectBadge.js";
import { ACTIVE, HOVER, seriesColor } from "../styles/palette.js";

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
//
// ## 이 파일은 **배선**이다
// 상태 채널은 훅들이 나눠 소유한다 — 뷰포트(useOverlayViewport)·선택(useOverlaySelection)·
// 조사 대상(useInspection)·복기 스냅샷 파생(useAmountReadout)·표시 토글(useOverlayToggles)·
// 테마(useThemeOverlay)·캔들(useCandles)·핀(usePivotPins). 여기 남는 건 그 사이 배선과
// 표시목록(paintLayers) 조립, 그리고 훅 하나로 못 접는 자잘한 채널(호버·뱃지 무리·짚음 렌즈)이다.

/** 피벗 점 예산 — **원 개수**로 센다(골격당 피벗 수가 3~6으로 제각각이라 골격 수로 세면 임계가 두 배 흔들린다). */
const DOT_BUDGET = 1200;

/** 꺼져 있어도 **층의 자리는 남긴다** — 순서 규약을 켜고 끔과 무관하게 재려면 빈 층이 서 있어야 한다. */
const EMPTY_CANDLES: DrawLayer = { name: "candles", groups: [] };
const EMPTY_THEME_LINES: DrawLayer = { name: "theme-lines", groups: [] };
/**
 * 무리(선택·그룹) 안에서 안 짚은 선의 진하기. 색은 그대로 두고 이만큼만 물러난다 —
 * 목록 행을 훑을 때 짚은 하나가 무리 안에서도 또렷이 서게(굵기 차이만으론 약했다, 사용자 지적).
 * 무리 밖(dim)보다는 진하다: 무리에 속한다는 사실 자체는 계속 보여야 한다.
 */
const RECEDE_OPACITY = 0.3;

/** 화면의 선 하나 — kind 판별 유니온(차트 단위 ChartSkeleton / 타점 단위 PointSkeleton). */
type Line = OverlayLine;

/** 일봉/분봉이 **별도 패널**(카탈로그 2항목)이다 — 시나리오가 "일봉에서 무리 → 분봉으로 확인"의 동시 사용이라
 *  토글 하나로는 두 그림을 오가며 볼 수 없다. grain 은 패널 정체성이라 마운트 후 안 바뀐다. */
export function SkeletonOverlayPanel({ grain }: { grain: "daily" | "minute" }): JSX.Element {
    // 표시 토글 한 벌 — 영속 키 규칙(전부 grain 접미사)까지 useOverlayToggles 가 소유한다.
    const toggles = useOverlayToggles(grain);
    const { anchor, showFuture, showLevels, showLabels, showAmount, showAmountLabels, showTheme, setShowTheme } = toggles;

    const goToPoint = useWorkbench((s) => s.goToPoint);

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

    // 그룹 한 벌 — 발끝 표기(여기) + 그룹 메뉴(OverlayMenus) + 차트 그룹 필터 판정(데이터 훅)이
    // 같은 컨텍스트 인스턴스를 본다.
    const groupsView = useGroups();
    // 바인딩 — 이 패널이 보는 집합(디폴트 연동 = 필터 패널을 따라감). 일봉·분봉이 별도 패널이라 키에 grain 이 붙는다.
    const binding = useSetBinding(`wb.setBinding.skeleton.${grain}`);
    const [sideOpen, setSideOpen] = usePersistedState<boolean>(
        `wb.setSidebar.skeleton.${grain}`, (o) => (typeof o === "boolean" ? o : null), false);
    const goToDay = useWorkbench((s) => s.goToDay);
    // 데이터 절반 — 조립·필터 판정은 전부 useOverlayData. 이 컴포넌트엔 렌더 상태의 배선만 남는다.
    const { feedLoading, lines: allLines, drawableKeys, population, missingPrevClose, levelsByChart, pointsByChart, nameOf, subject, subjectKeys, subjectState } =
        useOverlayData(isDaily, anchor, onlyCharts, binding.ref);

    /**
     * ── 짚음(pick) — **다른 패널이 좁혀 놓은 렌즈**(그룹 체인 등). 보는 집합은 그대로 두고 그 안을 가리킨다.
     *
     * 이 패널은 표시 방법만 고른다(전 패널 공통 어휘): `흐리게` = 분모가 보인다(41 / 128 — 형태 비교가
     * 본론이라 기본값), `좁히기` = 짚은 것만(척도가 그만큼 커진다). 시트가 밴드에 쓰던 그 택1이다.
     *
     * ⚠ 선택(손으로 고른 무리)과 **다른 채널**이다. 짚어 놓고 그 안에서 골라 그룹에 붙이는 게 본론이라
     * 하나로 합치면 두 번째 걸음이 첫 걸음을 덮어쓴다.
     */
    const pick = useWorkbench((s) => s.pick);
    const clearPick = useWorkbench((s) => s.setPick);
    // 영속 키에 grain 이 붙는다 — 일봉·분봉이 별도 패널이라(useOverlayToggles 와 같은 규칙).
    const [pickMode, setPickMode] = usePersistedState<"dim" | "narrow">(
        `wb.skeletonPickMode.${grain}`, (o) => (o === "dim" || o === "narrow" ? o : null), "dim");
    // 채널에는 참조만 실려 있다 — 읽는 순간 리졸버로 푼다(라이브).
    // ⚠ 깨진 참조·로딩 중엔 렌즈를 **정지**한다(picked=null — 강조도 좁히기도 없음). 빈 집합으로
    // 화면을 지우면 "조건에 안 맞았다"로 읽힌다 — 깨졌다는 사실은 머리글 칩(⚠)이 말한다.
    const funnelView = useFunnel();
    const resolvedPick = pick === null ? null : funnelView.resolveSet(pick.ref);
    const pickBroken = resolvedPick?.broken === true;
    const picked = useMemo(
        () => (resolvedPick && !resolvedPick.broken && !funnelView.isLoading ? pickKeys(resolvedPick.items) : null),
        [resolvedPick, funnelView.isLoading],
    );
    /** 이 선이 렌즈 안에 드나 — 차트 단위 선은 (종목·날짜)로, 타점 단위 선은 시각까지 본다. */
    const linePicked = useCallback(
        (s2: Line): boolean =>
            picked === null || inPick(picked, s2.kind === "point"
                ? { stockCode: s2.stockCode, date: s2.date, time: s2.time }
                : { stockCode: s2.stockCode, date: s2.date }),
        [picked],
    );
    const lines = useMemo(
        () => (picked !== null && pickMode === "narrow" ? allLines.filter(linePicked) : allLines),
        [allLines, picked, pickMode, linePicked],
    );
    /** 흐리게일 때 렌즈 **밖**인 선들 — visualOf 가 dim 을 강제한다(그림 층은 그대로 둔다). */
    const outOfPick = useMemo(() => {
        if (picked === null || pickMode === "narrow") return null;
        return new Set(allLines.filter((l) => !linePicked(l)).map((l) => l.key));
    }, [allLines, picked, pickMode, linePicked]);

    /**
     * ── 집합 멤버(사이드바·칩 n/N 의 재료) — 표현가능 술어 = "그릴 수 있는 선의 키에 있나".
     * ⚠ drawableKeys 는 **시야 무관**이다(데이터 훅이 "선택만 보기" 적용 전에 계산) — 짚음(narrow)도
     * "선택만 보기"도 시야지 재료가 아니라, 그것 때문에 안 됨으로 세면 결손 목록이 렌즈 상태에 따라
     * 출렁여 "채우러 갈 목록"이라는 뜻을 잃는다(allLines 로 셌다가 실제로 그렇게 깨졌던 자리).
     */
    const setMembers = useMemo(
        () => setMembersOf(binding.view, isDaily ? "day" : "point", (it) =>
            drawableKeys.has(it.time === undefined ? chartKey(it) : pointKey({ stockCode: it.stockCode, date: it.date, time: it.time }))),
        [binding.view, isDaily, drawableKeys],
    );

    // ── 뭉친 라벨의 멤버 목록. 그래프를 만지면(팬·확대) 닫는다 — d3 가 SVG mousedown 을 삼켜
    //    팝오버의 바깥클릭 감지가 그래프 위에서 안 뜨기 때문(제스처 콜백이 그 자리를 대신한다).
    const [badge, setBadge] = useState<{ x: number; y: number; members: string[] } | null>(null);
    const closeBadge = useCallback(() => setBadge(null), []);

    // 거터 판정은 **토글**로 한다(themeOverlay 가 아니라) — 상자가 테마 데이터보다 먼저 정해져야 하고,
    // 데이터 도착 여부로 여백이 출렁이면 화면이 툭 튄다.
    const gutter = !isDaily && showTheme;
    // 뷰포트 절반 — 경계·상자·스케일·확대·솎기는 전부 useOverlayViewport(svgRef·wrapRef 의 주인).
    const viewport = useOverlayViewport({ isDaily, anchor, showFuture, lines, gutter, onGestureStart: closeBadge });
    const { box, bounds, boundsKey, scales, viewX, lineStep } = viewport;

    // ── 호버 — 훅 여럿(선택 폴백·조사 대상·테마·핀)이 나눠 읽는 채널이라 배선 층(여기)이 소유한다.
    const [hovered, setHovered] = useState<string | null>(null);
    const byKey = useMemo(() => new Map(lines.map((s) => [s.key, s])), [lines]);
    // 호버 유령 가드 — 짚고 있던 선이 목록에서 사라지면(필터 변경·singleTarget 교체로 히트라인·손잡이가
    // 언마운트) mouseleave 가 영영 안 와 anyLit 이 참으로 남고 **화면 전체가 흐려진 채** 굳는다.
    // 라벨 층은 노드를 안 부수는 걸로 풀었지만(labelHandles 주석), 언마운트가 정당한 이 자리들은 상태를 손으로 되돌린다.
    useEffect(() => {
        if (hovered !== null && !byKey.has(hovered)) setHovered(null);
    }, [hovered, byKey]);

    // 라벨이 붙는 끝 — 골격 종목 이름은 **언제나 경로의 왼쪽 끝**(사용자 확정).
    // 테마 라벨은 왼쪽 거터에 살아 자리 싸움이 없고, 미래 점선 쪽(오른쪽)은 결과라 손잡이를 안 둔다.
    const labelAnchorMode: SkeletonAnchor = isPointUnit ? "last" : anchor;
    const labelAtStart = isPointUnit || anchor === "last";

    // 캔들 토글의 최신 참조 — 선택 훅의 **유일한 역방향 의존**(useCandles 가 조사 대상에서 파생되어
    // 선택 훅보다 뒤에 태어난다). 클릭 시점에만 부르는 값이라 최신 참조로 잇는다(useMarquee 의 onSelectRef 와 같은 수).
    const toggleCandleRef = useRef<(code: string) => void>(() => {});
    const toggleCandle = useCallback((code: string) => { toggleCandleRef.current(code); }, []);

    // 선택·그룹핑 손짓 절반 — 두 선택 채널(차트/타점)의 계약은 useOverlaySelection 머리 주석.
    const selection = useOverlaySelection({
        isDaily, isPointUnit, lines, byKey, subjectKeys, pointsByChart, nameOf,
        labelAnchorMode, scales, wrapRef: viewport.wrapRef, toggleCandle,
    });
    const { effSelected } = selection;

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

    const dotsForAll = useMemo(() => lines.reduce((n, s) => n + s.points.length, 0) <= DOT_BUDGET, [lines]);
    const baseOpacity = lineOpacity(lines.length);
    const dimmed = dimOpacity(lines.length);

    // "지금 조사 중인 하나" — 호버/선택 규칙(비용이 다르면 방아쇠도 다르다)은 전부 useInspection.
    const inspection = useInspection({ isDaily, byKey, effSelected, hovered });
    const { inspectKey, singleTarget, pointTarget, dailyTarget, candleAnchor } = inspection;

    /**
     * 굵기는 **캔들과 공존한다**(사용자 확정 — 실사용에서 굵기가 제일 잘 듣는 채널로 판명).
     * 한때 캔들을 켜면 굵기를 자동으로 껐는데(획 충돌 우려), 굵기는 30선을 한눈에 훑는 유일한 수단이라
     * 끄면 그 화면이 통째로 죽는다. 세 층위가 각자 다른 질문에 답한다:
     *   훑어보기 = 굵기 / 한 점 정밀 = 캔들 위 마커(구간 하한) / 정확한 값 = 호버 툴팁.
     */
    const amountWidthOn = showAmount;
    const amountLabelsOn = showAmountLabels;
    // 한 벌만 받는다 — 거래대금과 테마가 같은 날짜의 같은 응답을 쓴다(LRU 도 한 자리만 쓴다).
    // ⚠ 스냅샷·조회기는 패널 소유다 — 테마 훅이 같은 재료를 먼저 받아야 해서 useAmountReadout 에
    //   못 들어간다(그 파일 머리 주석). 조회기 두 벌의 쓰임새는 amountLayer 머리 주석.
    const snapQ = useDaySnapshot(showAmount || showAmountLabels || showTheme ? singleTarget?.date ?? null : null);
    const lookup = useMemo(() => amountLookupOf(snapQ.data), [snapQ.data]);

    // ── 테마 오버레이 — 상태·계산·모드 규칙 전부 useThemeOverlay 가 소유한다.
    //    짚은 선이 하나일 때만 펼친다: 여러 날의 테마를 한 화면에 겹치면 "이 종목이 혼자 튄 건가"가 흐려진다.
    const replaySettings = useWorkbench((s) => s.replaySettings);
    const theme = useThemeOverlay({
        enabled: !isDaily && showTheme,
        target: pointTarget,
        snapshot: snapQ.data,
        hot: replaySettings,
        lookup,
        amountWidthOn,
        amountLabelsOn,
        hoveredLine: hovered,
        singleKey: singleTarget?.key ?? null,
        groupSet,
    });
    const themeOverlay = theme.overlay;
    const themeLabels = useThemeLabels(themeOverlay, scales, viewX, box);

    // 지금 짚고 있는 대상(캔들 감추기의 유일한 기준) — 규칙은 candleFocusOf(테마 호버가 이 뒤에 태어나 순수 함수다).
    const candleFocus = useMemo(() => candleFocusOf(theme.hovered, hovered), [theme.hovered, hovered]);

    // ── 캔들 오버레이 — **참고용 배경**(흐리게). 주인공은 여전히 골격 선이다.
    // 상태(켠 종목)·재료(차트 번들·스냅샷)·감추기 규칙은 전부 useCandles 가 안다. 이 패널은 짚고 있는
    // 대상(candleFocus)과 주인공만 넘기고, 켜고 끄는 손짓(candles.toggle)을 선·라벨·목록에 나눠 준다.
    const candles = useCandles({
        anchor: candleAnchor, pointTarget, dailyTarget, snapshot: snapQ.data, focus: candleFocus, nameOf, grain,
    });
    toggleCandleRef.current = candles.toggle;

    // ── 피벗 값 붙잡기 — 상태·판정 전부 usePivotPins 가 소유한다(골격선 층이 `shown` 을 물어본다).
    const pins = usePivotPins({ target: singleTarget, resetKey: themeOverlay?.key, anchorKey: anchor });

    // 복기 스냅샷을 재료로 쓰는 파생 한 벌 — 런·세로선 판독·핀 판독·금액 라벨(useAmountReadout).
    const amount = useAmountReadout({
        isDaily, singleTarget, pointTarget, amountWidthOn, amountLabelsOn, lookup,
        themeOverlay, themeRuns: theme.runs, themeHovered: theme.hovered, hovered,
        nameOf, scales, box, openReadingX: pins.openReadingX, anchorMinutes: pins.anchorMinutes,
    });

    // 역할 판정은 순수 함수(lineVisual)가, 색 배정은 여기가 한다 — 팔레트는 화면의 몫이라 규칙 층에 안 들인다.
    const visualOf = useCallback((key: string): { v: LineVisual; color: string } => {
        const base = lineVisual(key, { selected: effSelected, hovered, group: groupSet });
        // 렌즈 밖은 흐리게 — 짚은 것이 앞으로 서고 분모는 배경으로 남는다(전체가 안 사라진다).
        const v = outOfPick?.has(key) ? { ...base, dim: true } : base;
        const color = v.role === "selected" ? ACTIVE
            : v.role === "group" ? groupColorOf(key)
                : v.role === "hovered" ? HOVER
                    : "var(--text-secondary)";
        return { v, color };
    }, [effSelected, hovered, groupSet, groupColorOf, outOfPick]);

    useEffect(() => { setBadge(null); setBadgeHover(null); }, [boundsKey, anchor, grain]);
    /** 지금 조사 중인 선의 그룹 이름들 — 타점 단위 선은 타점 그룹(차트 그룹 상속 포함), 차트 단위 선은 차트 그룹. */
    const inspectGroupNames = useMemo(() => {
        const s = inspectKey ? byKey.get(inspectKey) : null;
        if (!s) return [];
        const ids = s.kind === "point"
            ? groupsView.groupNamesOf({ stockCode: s.stockCode, date: s.date, time: s.time })
            : groupsView.chartGroupNamesOf(s);
        return ids.map((id) => groupsView.groupByName.get(id)?.name).filter((n): n is string => !!n);
    }, [inspectKey, byKey, groupsView]);

    // 수준선(기준선·D선)을 받을 골격 — 단일 선택 + (다르면) 호버 하나. 다중 선택이면 호버 것만.
    const levelOwners = useMemo<LevelOwner[]>(() => {
        if (!showLevels) return [];
        const single = effSelected.size === 1 ? [...effSelected][0] : null;
        const out: LevelOwner[] = [];
        const sel = single ? byKey.get(single) : null;
        if (sel) out.push({ s: sel, color: visualOf(sel.key).color, right: true });
        const hov = hovered && hovered !== single ? byKey.get(hovered) : null;
        if (hov) out.push({ s: hov, color: visualOf(hov.key).color, right: false });
        return out;
    }, [showLevels, effSelected, byKey, hovered, visualOf]);

    /**
     * ── 머리글 프롭 안정화 — OverlayHeader 는 React.memo 다. 이 패널은 호버·팬마다 통째로 다시
     * 렌더되는데 머리글은 그때 바뀌는 게 없으니, 인라인으로 만들던 객체·엘리먼트를 전부 memo 로 눌러
     * 프롭 동일성을 지킨다(하나라도 매 렌더 새 것이면 memo 가 통째로 헛돈다).
     */
    const headerCandles = useMemo(
        () => ({ alpha: candles.alpha, setAlpha: candles.setAlpha }),
        [candles.alpha, candles.setAlpha],
    );
    const headerCounts = useMemo(
        () => ({ shown: lines.length, population, missing: missingPrevClose }),
        [lines.length, population, missingPrevClose],
    );
    const headerTheme = useMemo(
        () => ({ lineCount: themeOverlay?.lines.length ?? null, hasTarget: singleTarget !== null }),
        [themeOverlay, singleTarget],
    );
    // O(n) 필터도 memo 안으로 — 렌더마다 전 선을 세던 것이 짚음·목록이 바뀔 때만 돈다.
    const pickShown = useMemo(
        () => (pick === null ? 0 : allLines.filter(linePicked).length),
        [pick, allLines, linePicked],
    );
    const headerPick = useMemo(
        () => (pick === null ? null : {
            label: `${PICK_SOURCE_LABEL[pick.source]} · ${pick.label}`,
            shown: pickShown,
            total: allLines.length,
            broken: pickBroken,
            mode: pickMode,
            setMode: setPickMode,
            clear: () => clearPick(null),
        }),
        [pick, pickShown, allLines.length, pickBroken, pickMode, setPickMode, clearPick],
    );
    // binding 통짜는 매 렌더 새 객체(useSetBinding) — 라벨·컨트롤이 실제로 읽는 값만 의존성으로 잡는다.
    const { label: bindingText, broken: bindingBroken } = binding;
    const bindingLabel = useMemo(
        () => <SetBindingLabel binding={binding} members={setMembers} />,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bindingText, bindingBroken, setMembers],
    );
    const setControl = useMemo(
        () => setBindingControl({ binding, open: sideOpen, setOpen: setSideOpen }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bindingBroken, sideOpen, setSideOpen],
    );
    const subjectBadge = useMemo(
        () => <SubjectBadge subject={subject} status={subjectState}
            name={subject ? nameOf(subject.code) : undefined}
            absentLabel={isDaily ? "골격 없음" : "골격·타점 없음"} />,
        [subject, subjectState, nameOf, isDaily],
    );

    /**
     * 그림 세 층의 표시목록 — **매 렌더 새로 만든다**(memo 하지 않는다).
     *
     * 재료가 열 몇 가지라 memo 의존성 목록이 곧 버그의 온상이 된다(하나 빠지면 화면이 조용히 멈춘다).
     * 그리고 어차피 팬 프레임마다 좌표가 전부 바뀌므로 memo 가 맞는 상황도 아니다 — 비싼 건 목록을
     * 만드는 게 아니라 그걸 **DOM 으로 펴는** 일이었고(panCost 벤치), 그 일이 캔버스로 가면서 사라졌다.
     */
    const paintLayers: DrawLayer[] = scales && bounds
        ? orderPaint({
            candles: candles.set
                ? candleLayer({
                    set: candles.set, scales, box,
                    anchorShown: candles.anchorShown, memberShown: candles.memberShown, opacityOf: candles.opacityOf,
                })
                : EMPTY_CANDLES,
            // 테마 선은 골격보다 아래(배경이고 주인공은 내 골격). 다른 골격선을 보는 동안엔 접는다(swapped).
            "theme-lines": themeOverlay && !theme.swapped
                ? themeLinesLayer({
                    // 런은 값 라벨과 공용 재료라 훅이 (굵기 ∨ 값)으로 굽는다 — **굵기 채널**엔 굵기가 켜졌을 때만 싣는다
                    // (골격선 층의 `amounts: amountWidthOn ? … : null` 과 같은 분리).
                    overlay: themeOverlay, runs: amountWidthOn ? theme.runs : null, hovered: theme.hovered,
                    project: (pts, step) => flatten(viewport.themePath(pts, step), scales.x, scales.y),
                    clip: viewX, lineStep,
                })
                : EMPTY_THEME_LINES,
            "skeleton-lines": skeletonLinesLayer({
                lines, scales, box,
                lineShown: theme.lineShown,
                visualOf,
                opacity: { dimmed, recede: RECEDE_OPACITY, base: baseOpacity },
                isPointUnit,
                amounts: amountWidthOn ? amount.amounts : null,
                project: (pts, step) => flatten(viewport.themePath(pts, step), scales.x, scales.y),
                lineStep,
                dotsForAll,
                pins,
                fmtX: (x) => fmtX(x, xUnit),
            }),
        })
        : [];
    return (
        <div style={wrap}>
            <OverlayHeader
                grain={grain}
                toggles={toggles}
                candles={headerCandles}
                counts={headerCounts}
                theme={headerTheme}
                bindingLabel={bindingLabel}
                setControl={setControl}
                pick={headerPick}
                subjectBadge={subjectBadge}
                onlySelected={onlySelected}
                setOnlySelected={setOnlySelected}
                locked={viewport.locked}
                onToggleLock={viewport.onToggleLock}
            />

            {/* 그림판과 집합 사이드바가 한 줄 — 사이드바는 오른쪽(여닫는 칩이 왼쪽이라도, 목록이 그림을
                밀어내는 방향이 오른쪽이어야 척도가 왼쪽 끝에서 안 흔들린다). */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <OverlayPlot
                isDaily={isDaily}
                xUnit={xUnit}
                feedLoading={feedLoading}
                linesEmpty={lines.length === 0}
                showLabels={showLabels}
                labelAtStart={labelAtStart}
                viewport={viewport}
                paintLayers={paintLayers}
                theme={theme}
                themeLabels={themeLabels}
                candles={candles}
                pins={pins}
                inspection={inspection}
                byKey={byKey}
                setHovered={setHovered}
                handles={handles}
                visualOf={visualOf}
                nameOf={nameOf}
                effSelected={effSelected}
                onLabelClick={selection.onLabelClick}
                onLabelContext={selection.openGroupMenuFor}
                onBadgeOpen={(at, members) => setBadge({ ...at, members })}
                onBadgeHover={setBadgeHover}
                marquee={selection.marquee}
                onWrapMouseDown={selection.onWrapMouseDown}
                onHoverPanel={setHoveringPanel}
                readoutAt={amount.readoutAt}
                themeReadingSlots={amount.themeReadingSlots}
                amountLabels={amount.amountLabels}
                levelOwners={levelOwners}
                levelsOf={(ck) => levelsByChart.get(ck) ?? []}
                selection={{
                    chartCount: selection.selectedCharts.length,
                    chartChannelShown: !isPointUnit,
                    rawChartCount: selection.selectedKeys.size,
                    onGroupCharts: selection.openGroupMenuForSelection,
                    onClearCharts: selection.clearCharts,
                    pointKeys: selection.presentPks,
                    rawPointCount: selection.selectedPks.size,
                    onGroupPoints: selection.openPointGroupMenu,
                    onClearPoints: selection.clearPoints,
                    // 핀도 같은 규칙 — 개수는 화면에 있는 선의 것만, 비우기는 유령까지 전부(usePivotPins.countIn).
                    pinnedCount: pins.countIn((k) => byKey.has(k)),
                    onClearPins: pins.clear,
                }}
            />
            {sideOpen && (
                <SetSidebar binding={binding} members={setMembers} showTime={!isDaily}
                    onPick={(it) => (it.time !== undefined
                        ? goToPoint({ code: it.stockCode, date: it.date, time: it.time })
                        : goToDay({ code: it.stockCode, date: it.date }))} />
            )}
            </div>

            <OverlayMenus
                badge={badge}
                onCloseBadge={closeBadge}
                byKey={byKey}
                labelAnchorMode={labelAnchorMode}
                groupColorOf={groupColorOf}
                nameOf={nameOf}
                onLabelClick={selection.onLabelClick}
                setHovered={setHovered}
                groupMenu={selection.groupMenu}
                onCloseGroupMenu={selection.closeGroupMenu}
            />

            <OverlayFooter
                grain={grain}
                groupNames={inspectGroupNames}
                locked={viewport.locked}
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

const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
