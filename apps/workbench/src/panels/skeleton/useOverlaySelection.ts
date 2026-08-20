// 골격 겹쳐 그리기의 **선택·그룹핑 손짓** — 라벨 클릭·Ctrl+드래그 사각 선택·그룹 메뉴 열기까지.
//
// ## 이 훅의 계약 — 선택 채널은 **둘**이고 문법은 하나다
//  · 차트 선택(selectedKeys) = **store 공유**(skeletonSlice): 일봉 패널에서 만든 무리를 분봉 패널이
//    "선택만 보기"로 받는다. 키가 차트키라 두 패널이 같은 집합을 그대로 쓴다.
//  · 타점 선택(selectedPks) = **패널 로컬**: 분봉 뷰는 선=타점이라 선 자체의 선택 집합이다.
//  둘을 하나로 합치지 않는 이유는 **그룹핑 대상이 다르기 때문**이다(차트 그룹 vs 타점 그룹) — 정션이
//  갈리는데 집합을 합치면 어느 사전에 붙일지 되물어야 한다. 이 뷰의 선이 실제로 쓰는 채널은
//  activeSelection 하나로 골라(타점 단위면 pk 집합, 차트 단위면 차트키 집합) 손짓 문법을 통일한다.
import { useCallback, useMemo, useState, type RefObject } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { keysInRect, type OverlayLine, type SkeletonAnchor } from "./skeletonOverlay.js";
import { useMarquee, type MarqueeRect } from "./useMarquee.js";
import { shortDate } from "../../lib/date.js";
import type { PointRef } from "../../lib/pointKey.js";
import type { OverlayData } from "./useOverlayData.js";
import type { Scales } from "./useOverlayViewport.js";

// ── 그룹 메뉴 — 라벨/마커 우클릭(단일) / 헤더 그룹 버튼(선택 일괄). 그룹핑의 입력 지점.
// 어느 정션에 쓰느냐는 여기 규약이다: 차트 라벨 → 차트 그룹 / 타점 마커 → 타점 그룹. DB 사전은 하나.
export type GroupMenuState =
    | { kind: "chart"; x: number; y: number; charts: { stockCode: string; date: string }[]; label: string }
    | { kind: "point"; x: number; y: number; points: PointRef[]; label: string };

export interface OverlaySelection {
    /** 차트 선택(store 공유) — 작업줄의 원 개수·비우기가 쓴다. */
    selectedKeys: ReadonlySet<string>;
    clearCharts: () => void;
    /** 타점 선택(패널 로컬) — 작업줄의 원 개수·비우기가 쓴다. */
    selectedPks: ReadonlySet<string>;
    clearPoints: () => void;
    /** 선택 중 이 패널에 실제로 있는 타점 — 개수·그룹 대상은 이걸 본다(selectedCharts 와 같은 규칙). */
    presentPks: ReadonlySet<string>;
    /** 이 뷰의 유효 선택 — 로컬 선택이 없으면 subject 폴백(아래 주석). */
    effSelected: ReadonlySet<string>;
    onLabelClick: (s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    marquee: MarqueeRect | null;
    onWrapMouseDown: (e: React.MouseEvent) => void;
    groupMenu: GroupMenuState | null;
    closeGroupMenu: () => void;
    openGroupMenuFor: (s: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    openGroupMenuForSelection: (ev: { clientX: number; clientY: number }) => void;
    openPointGroupMenu: (points: PointRef[], label: string, ev: { clientX: number; clientY: number; preventDefault?: () => void }) => void;
    /** 선택 중 **이 패널에 실제로 있는** 차트 선들. */
    selectedCharts: OverlayLine[];
}

export function useOverlaySelection(args: {
    isDaily: boolean;
    isPointUnit: boolean;
    lines: readonly OverlayLine[];
    byKey: ReadonlyMap<string, OverlayLine>;
    subjectKeys: OverlayData["subjectKeys"];
    nameOf: (code: string) => string;
    labelAnchorMode: SkeletonAnchor;
    scales: Scales | null;
    wrapRef: RefObject<HTMLDivElement | null>;
    /**
     * 캔들 토글 — 이 훅의 **유일한 역방향 의존**: useCandles 는 조사 대상(단일 선택 → 스냅샷)에서
     * 파생되므로 이 훅보다 뒤에 태어난다. 클릭 시점에만 부르는 값이라 패널이 최신 참조로 잇는다.
     */
    toggleCandle: (code: string) => void;
}): OverlaySelection {
    const { isDaily, isPointUnit, lines, byKey, subjectKeys, nameOf, labelAnchorMode, scales, wrapRef, toggleCandle } = args;

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);
    // ── 선택(집합) — 차트 선택은 **store 공유**(skeletonSlice), 타점 선택은 로컬(위 계약 주석).
    const selectedKeys = useWorkbench((s) => s.skeletonSelection);
    const setSelectedKeys = useWorkbench((s) => s.setSkeletonSelection);
    const [selectedPks, setSelectedPks] = useState<ReadonlySet<string>>(() => new Set());
    // 이 뷰의 선이 쓰는 선택 채널 — 타점 단위면 pk 집합, 차트 단위면 차트키 집합. 문법은 하나다.
    const activeSelection = isPointUnit ? selectedPks : selectedKeys;
    const setActiveSelection = isPointUnit ? setSelectedPks : setSelectedKeys;
    // 로컬 선택이 없으면 지금 선택(subject)이 가리키는 선들을 선택으로 — 다른 패널과의 링크가 이걸로
    // 이어진다. 분봉에서 하루 선택이면 그날 **전 타점**이 무리로 선다(subjectKeys 가 그렇게 온다).
    const effSelected = useMemo<ReadonlySet<string>>(() => {
        if (activeSelection.size > 0) return activeSelection;
        const hit = [...subjectKeys].filter((k) => byKey.has(k));
        return hit.length > 0 ? new Set(hit) : new Set();
    }, [activeSelection, subjectKeys, byKey]);

    /** 평클릭 = 이동 + 단일 선택(교체). Ctrl+클릭 = 선택 토글만(이동 없음 — 무리를 만드는 중이다).
     *  타점 단위 선(time 있음)은 자기 타점으로 바로 이동하고 선택은 pk 채널을 쓴다 — 문법은 같다.
     *
     *  **이미 선택된 선의 라벨을 다시 클릭하면 캔들 토글**(사용자 확정) — 테마 라벨과 같은 손짓을
     *  관찰 종목에도 주되, 첫 클릭의 일(선택·이동)은 안 뺏는다. 이미 선택된 걸 또 누르는 건 원래
     *  아무 일도 안 했으므로(같은 곳으로 다시 이동할 뿐) 빈자리에 얹은 셈이다. */
    const onLabelClick = useCallback((s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }): void => {
        // 캔들을 켜는 건 **타점 단위 선(분봉)** 과 **일봉 차트 선** 둘 다(사용자 확정).
        // 분봉 절대 뷰는 빠진다 — 거기 선은 하루 경로 전체라 캔들의 주인공이 정해지지 않는다.
        const candleable = s.kind === "point" || isDaily;
        if (!ev.ctrlKey && !ev.metaKey && candleable && effSelected.size === 1 && effSelected.has(s.key)) {
            toggleCandle(s.stockCode);
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
        // 차트 라벨 = **day 선택**(사용자 확정 규칙: "골격 선택 = day scope"). 옛 "첫 타점으로 점프"는
        // point 선택을 발행해 의미론이 갈렸다 — 타점 순회는 w/s 가 있으니 편의 손실은 작다.
        goToDay({ code: s.stockCode, date: s.date }, "skeleton-overlay");
    }, [setActiveSelection, effSelected, goToPoint, goToDay, toggleCandle, isDaily]);

    // ── Ctrl+드래그 사각 선택 — 사각형 역학은 useMarquee 가, **무엇을 담을지**는 여기가 정한다.
    const onMarqueeSelect = useCallback((rect: MarqueeRect): void => {
        if (!scales) return;
        // 라벨 지점 판정 — 이 뷰의 선택 채널로 담는다(차트 단위=차트키, 타점 단위=pk. 문법은 하나).
        // ⚠ showLabels 와 무관하게 **라벨이 설 자리**(앵커 반대쪽 끝점)로 판정한다(일부러) — 라벨을 꺼도
        //   손잡이 좌표 규약은 유지돼야 같은 사각이 같은 무리를 담는다(선 기하 판정은 얽힌 곳에서 이미 기각됨).
        const hit = keysInRect(lines, labelAnchorMode, scales.x, scales.y, rect);
        if (hit.length > 0) setActiveSelection((prev: ReadonlySet<string>) => new Set([...(prev.size > 0 ? prev : effSelected), ...hit])); // 합집합(누적)
    }, [scales, lines, effSelected, labelAnchorMode, setActiveSelection]);
    const { marquee, onMouseDown: onWrapMouseDown } = useMarquee(wrapRef, !!scales, onMarqueeSelect);

    const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
    const closeGroupMenu = useCallback(() => setGroupMenu(null), []);
    /** 선 라벨 우클릭 — 이 선의 정션으로 간다: 타점 단위 선은 타점 그룹, 차트 단위 선은 차트 그룹. */
    const openGroupMenuFor = useCallback((s: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }): void => {
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
        () => (isPointUnit ? [] : [...effSelected].map((k) => byKey.get(k)).filter((s): s is OverlayLine => !!s)),
        [isPointUnit, effSelected, byKey],
    );
    // 선택 중 이 패널에 실제로 있는 **타점** — selectedCharts 와 같은 규칙. 저장된 선택은 안 지운다
    // (필터를 풀면 정당하게 되살아난다) — 작업줄의 개수·그룹 대상만 현재 목록(byKey)으로 거른다.
    const presentPks = useMemo(
        () => new Set([...selectedPks].filter((k) => byKey.has(k))),
        [selectedPks, byKey],
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

    const clearCharts = useCallback(() => setSelectedKeys(new Set()), [setSelectedKeys]);
    const clearPoints = useCallback(() => setSelectedPks(new Set()), []);

    return {
        selectedKeys, clearCharts, selectedPks, clearPoints, presentPks, effSelected,
        onLabelClick, marquee, onWrapMouseDown,
        groupMenu, closeGroupMenu, openGroupMenuFor, openGroupMenuForSelection, openPointGroupMenu,
        selectedCharts,
    };
}
