// ChartPanel 의 복기 타점 훅 — 조회 데이터(세로선·배지)와 전역 차트 단축키.
// 차트 앵커(선·무시 캔들·골격) 편집은 chartAnchorHooks.ts(param 하나 = 훅 하나) — 여기 두면 잡동사니가 된다.
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { upsertReviewPoint, removeReviewPoint, type ReviewPoint } from "../api/reviewPoints.js";
import { allPointsQuery, chartQuery, computedAxesQuery, skeletonsQuery } from "../api/queries.js";
import { kstToUnix, deriveMinuteView } from "./derive.js";
import { indexAtOrBefore } from "./chartFrame.js";
import { useChartPoints } from "./useChartPoints.js";
import { usePlacements } from "./usePlacements.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { useWorkbench } from "../store/workbench.js";
import type { Command } from "../keymap/types.js";

export interface SavedPoint {
    time: number; // 저장 타점 시각(unix초) — 분봉 세로선/아이콘
    placed: number; // 이 타점이 배치된 축 수(▼ 채움·배지). 축별 상세는 "타점 정보" 패널.
}

export interface ChartReviewPoints {
    savedPoints: SavedPoint[];
    focusedPoint: ReviewPoint | undefined; // 현재 Focus.time 에 저장된 타점(헤더 배지)
    axisTotal: number; // 순위 축 총수(배지 분모)
}

/**
 * 복기 타점 조회 데이터(차트 렌더용) — 저장타점 세로선·hover 카드·현재타점 배지. 단축키 등록은 전역 useChartHotkeys 로 이관.
 * 배치 개수는 여기서 함께 붙인다 — 차트는 스냅된 봉 시각만 들고 다녀서(원래 HH:MM:SS 를 잃는다) 나중에 못 붙인다.
 */
export function useReviewPointData(code: string, date: string, time: string | null): ChartReviewPoints {
    const reviewPoints = useChartPoints(code, date); // 복제본 셀렉터 — 서버 왕복 없음
    const placements = usePlacements();

    const savedPoints = useMemo<SavedPoint[]>(() => {
        if (!date) return [];
        return reviewPoints.map((rp) => {
            const ref = { stockCode: code, date, time: rp.time };
            return { time: kstToUnix(date, rp.time), placed: placements.countOf(ref) };
        });
    }, [reviewPoints, code, date, placements]);

    const focusedPoint = useMemo(() => reviewPoints.find((rp) => rp.time === time), [reviewPoints, time]);
    return { savedPoints, focusedPoint, axisTotal: placements.axisTotal };
}

/**
 * 차트 단축키 — **전역 1회 등록**(App). 패널별 등록이 아니라 focus 를 따라간다 → 차트 여러 개여도 커맨드 충돌 없고,
 * 패널 마운트/포커스 상태에 안 흔들린다(옛 패널별 등록의 "가끔 안 먹음" 버그 해결). 입력창 포커스 중 mod-less 는 디스패처가 가드.
 *   space=타점 저장/삭제 · a/d=±1분봉 · shift+a/d=±jumpBars(setTime, activePoint 유지)
 *   ctrl+a/d=타점 순회 wrap(goToPoint) · f=일봉+분봉 확대/축소(store chartZoom, 두 차트 동시).
 * 그룹 부착은 골격 패널/분석 시트의 BulkGroupMenu 가 유일한 입구다(숫자키 프리셋은 태그 시절 잔재라 제거).
 * 핸들러는 매 렌더 최신 클로저로 h.current 갱신(안정 ref), 등록 effect 는 1회.
 */
export function useChartHotkeys(): void {
    const code = useWorkbench((s) => s.focus.code);
    // 불변식: search 가 있으면 search.code === focus.code — setSearch 호출자는 usePlaneBus.setSearchDate 하나뿐(focus.code 로 조립)이고, 종목이 바뀌면 transitionFocus 가 search 를 해제한다.
    const date = useWorkbench((s) => s.search?.date ?? s.focus.date); // 검색날짜(드리프트) 우선 — 차트 분봉이 보는 날짜와 일치(타점/이동봉이 그 날짜에 작동)
    const time = useWorkbench((s) => s.focus.time);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const jumpBars = useWorkbench((s) => s.chartSettings.jumpBars);
    const qc = useQueryClient();

    const chartQ = useQuery(chartQuery(code, date)); // ChartPanel 과 같은 키 → RQ 캐시 공유(중복 페치 0)
    const minutePoints = useMemo(() => (chartQ.data ? deriveMinuteView(chartQ.data, mode).points : []), [chartQ.data, mode]);
    const reviewPoints = useChartPoints(code, date); // 저장/삭제 판정도 이 소스 — invalidate 는 all-points 하나
    const reviewTimes = useMemo(() => [...reviewPoints.map((rp) => rp.time)].sort(), [reviewPoints]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: allPointsQuery().queryKey });
        // 계산 축은 타점 집합에서 나온다 — 타점이 늘거나 줄면 다시 굽는다(서버가 증분이라 새 타점만 계산).
        void qc.invalidateQueries({ queryKey: computedAxesQuery().queryKey });
        // 골격 좌표도 — 타점 종가가 분봉 경로에 합성되므로 타점 추가/삭제가 경로를 바꾼다.
        void qc.invalidateQueries({ queryKey: skeletonsQuery().queryKey });
    };
    const upsertMut = useMutation({ mutationFn: upsertReviewPoint, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: (v: { code: string; date: string; time: string }) => removeReviewPoint(v.code, v.date, v.time), onSuccess: invalidate });

    // 매 렌더 최신 클로저로 핸들러 갱신(안정 ref 유지) → 등록된 run 은 항상 최신 상태를 본다.
    const h = useRef({ toggle: () => {}, moveBar: (_: number) => {}, jump: (_: number) => {}, navPoint: (_: number) => {} });
    h.current.toggle = () => {
        if (!code || !date || !time) return;
        const existing = reviewPoints.find((rp) => rp.time === time);
        if (existing) removeMut.mutate({ code, date, time });
        else upsertMut.mutate({ stockCode: code, date, time });
    };
    h.current.moveBar = (delta) => {
        if (minutePoints.length === 0) return;
        let idx = minutePoints.findIndex((p) => p.tradeTime === time);
        // 정확히 그 봉이 없으면 time 이하 마지막 봉으로 — time 이 첫 봉보다 이르면 첫 봉(indexAtOrBefore 가
        // 0 반환, 예전엔 기본값 length-1 이 남아 a/d 가 세션 끝으로 튀었다). time 자체가 없으면 마지막 봉.
        if (idx < 0) idx = time ? indexAtOrBefore(minutePoints, time, (p) => p.tradeTime) : minutePoints.length - 1;
        const ni = Math.max(0, Math.min(minutePoints.length - 1, idx + delta));
        useWorkbench.getState().setTime(minutePoints[ni].tradeTime);
    };
    h.current.jump = (dir) => h.current.moveBar(dir * jumpBars);
    h.current.navPoint = (dir) => {
        if (reviewTimes.length === 0) return;
        let target: string;
        if (dir > 0) target = reviewTimes.find((x) => (time ? x > time : true)) ?? reviewTimes[0];
        else {
            const prevs = reviewTimes.filter((x) => (time ? x < time : true));
            target = prevs.length ? prevs[prevs.length - 1] : reviewTimes[reviewTimes.length - 1];
        }
        useWorkbench.getState().goToPoint({ date, code, time: target });
    };

    // 커맨드는 정적이라 1회 등록 — 키 실행은 h.current 로 최신 클로저 접근.
    useEffect(() => {
        const { register, unregister } = useKeymapDynamic.getState();
        const ids: string[] = [];
        const put = (cmd: Command): void => { register(cmd); ids.push(cmd.id); };
        put({ id: "chart.review.toggle", title: "타점 저장/삭제(현재 시각)", category: "차트", keys: "space", run: () => h.current.toggle() });
        put({ id: "chart.nav.prevBar", title: "1봉 이전", category: "차트", keys: "a", run: () => h.current.moveBar(-1) });
        put({ id: "chart.nav.nextBar", title: "1봉 다음", category: "차트", keys: "d", run: () => h.current.moveBar(1) });
        put({ id: "chart.nav.jumpPrev", title: "이동봉 이전", category: "차트", keys: "shift+a", run: () => h.current.jump(-1) });
        put({ id: "chart.nav.jumpNext", title: "이동봉 다음", category: "차트", keys: "shift+d", run: () => h.current.jump(1) });
        put({ id: "chart.nav.prevPoint", title: "이전 타점", category: "차트", keys: "ctrl+a", blockedInInput: true, run: () => h.current.navPoint(-1) });
        put({ id: "chart.nav.nextPoint", title: "다음 타점", category: "차트", keys: "ctrl+d", blockedInInput: true, run: () => h.current.navPoint(1) });
        put({ id: "chart.zoom.toggle", title: "확대/축소", category: "차트", keys: "f", run: () => useWorkbench.getState().toggleChartZoom() });
        return () => ids.forEach(unregister);
    }, []);
}
