// ChartPanel 편집 유스케이스 훅 — 가격선/타점의 조회·앵커해소·mutation·단축키를 컴포넌트에서 분리.
// 패널은 뷰 파생(deriveMinute/DailyView)+렌더만 남긴다.
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addPriceLine, removePriceLine, type RenderLine } from "../api/priceLines.js";
import { upsertReviewPoint, removeReviewPoint, type ReviewPoint } from "../api/reviewPoints.js";
import { priceLinesQuery, priceLinedStocksQuery, reviewPointsQuery, allPointsQuery } from "../api/queries.js";
import { kstToUnix, type DailyPoint, type MinuteView, type MinutePoint } from "./derive.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { useWorkbench } from "../store/workbench.js";
import type { Command } from "../keymap/types.js";

export interface ChartPriceLines {
    resolvedLines: RenderLine[]; // D+M 해소된 선(분봉용)
    dLines: RenderLine[]; // 일봉용(D만)
    hasLines: boolean;
    toggleLine: (anchorDate: string, anchorTime: string | undefined) => void;
    removeLine: (line: RenderLine) => void;
    clear: () => void;
}

/** 가격선 주석 — 조회 + 앵커 해소(로드된 캔들 기준 RenderLine) + 우클릭 토글/삭제/clear. 앵커 캔들 없으면 그 선 생략. */
export function usePriceLinesForChart(
    code: string,
    date: string,
    dailyView: DailyPoint[] | null,
    minuteView: MinuteView | null,
): ChartPriceLines {
    const qc = useQueryClient();
    const linesQ = useQuery(priceLinesQuery(code, date));
    const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);

    // anchorTime 유무로 일봉(D)/분봉(M) 구분. field=고/저/시/종(현재 UI 는 high).
    const resolvedLines = useMemo<RenderLine[]>(() => {
        if (!dailyView || !minuteView) return [];
        const dailyByDate = new Map(dailyView.map((p) => [p.time, p] as const));
        const minuteByKey = new Map(minuteView.points.map((p) => [`${p.date}T${p.tradeTime}`, p] as const));
        const out: RenderLine[] = [];
        for (const l of lines) {
            if (!l.id) continue;
            if (l.anchorTime) {
                const mp = minuteByKey.get(`${l.anchorDate}T${l.anchorTime}`);
                if (mp) out.push({ id: l.id, price: mp.highPrice, kind: "M" });
            } else {
                const dp = dailyByDate.get(l.anchorDate);
                if (dp) out.push({ id: l.id, price: dp[l.field], kind: "D" });
            }
        }
        return out;
    }, [lines, dailyView, minuteView]);
    const dLines = useMemo(() => resolvedLines.filter((l) => l.kind === "D"), [resolvedLines]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: priceLinesQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: priceLinedStocksQuery().queryKey }); // 작업셋 패널 즉시 반영
    };
    const addMut = useMutation({ mutationFn: addPriceLine, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: removePriceLine, onSuccess: invalidate });
    // clear — 이 차트의 가격선 전체 삭제(우클릭이 잘 안 잡히는 경우 대비). 저장 타점은 건드리지 않음.
    const clearMut = useMutation({
        mutationFn: async () => {
            await Promise.all(lines.filter((l) => l.id).map((l) => removePriceLine(l.id!)));
        },
        onSuccess: invalidate,
    });

    // 봉 우클릭 = 그 봉 앵커에 선 토글. 같은 앵커(anchorDate+anchorTime)가 이미 있으면 삭제, 없으면 추가.
    const toggleLine = (anchorDate: string, anchorTime: string | undefined): void => {
        if (!code || !date) return;
        const existing = lines.find((l) => l.anchorDate === anchorDate && (l.anchorTime ?? undefined) === anchorTime);
        if (existing?.id) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, anchorDate, anchorTime, field: "high" });
    };
    const removeLine = (line: RenderLine): void => removeMut.mutate(line.id);
    const clear = (): void => clearMut.mutate();

    return { resolvedLines, dLines, hasLines: lines.length > 0, toggleLine, removeLine, clear };
}

export interface ChartReviewPoints {
    savedTimes: number[]; // 저장 타점 시각(unix초) — 분봉 세로선/아이콘
    focusedPoint: ReviewPoint | undefined; // 현재 Focus.time 에 저장된 타점(헤더 배지)
}

/** 복기 타점 — 조회 + 스페이스바 저장(토글) + 숫자키 1~9 유형 프리셋 입력. 입력창 포커스 중엔 단축키 무시. */
export function useReviewPointHotkeys(code: string, date: string, time: string | null, typePresets: string[]): ChartReviewPoints {
    const qc = useQueryClient();
    const reviewQ = useQuery(reviewPointsQuery(code, date));
    const reviewPoints = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: reviewPointsQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: allPointsQuery().queryKey }); // 작업셋 패널 즉시 반영
    };
    const upsertRpMut = useMutation({ mutationFn: upsertReviewPoint, onSuccess: invalidate });
    const removeRpMut = useMutation({
        mutationFn: (v: { code: string; date: string; time: string }) => removeReviewPoint(v.code, v.date, v.time),
        onSuccess: invalidate,
    });

    // 단축키 = 중앙 레지스트리에 동적 등록(디스패처가 발동·입력창 포커스 가드 처리). 전역 발동(차트 포커스 불요).
    // 핸들러는 최신 reviewPoints/뮤테이션을 써야 하므로 ref 로 안정화 → 등록은 프리셋 변경 시에만.
    const handlersRef = useRef<{ toggle: () => void; applyType: (i: number) => void }>({ toggle: () => {}, applyType: () => {} });
    handlersRef.current = {
        // 스페이스바 = 현재 Focus.time 타점 저장 토글(같은 시각 있으면 삭제).
        toggle: () => {
            if (!code || !date || !time) return;
            const existing = reviewPoints.find((rp) => rp.time === time);
            if (existing) removeRpMut.mutate({ code, date, time });
            else upsertRpMut.mutate({ stockCode: code, date, time });
        },
        // 숫자키 = 현재 Focus.time 타점에 셋업 유형 입력. 없으면 생성, 있으면 유형 교체(outcome/memo 보존).
        applyType: (i) => {
            const type = typePresets[i];
            if (!type || !code || !date || !time) return;
            const existing = reviewPoints.find((rp) => rp.time === time);
            upsertRpMut.mutate({ stockCode: code, date, time, type, outcome: existing?.outcome, memo: existing?.memo });
        },
    };

    useEffect(() => {
        const { register, unregister } = useKeymapDynamic.getState();
        const ids: string[] = [];
        const put = (cmd: Command): void => {
            register(cmd);
            ids.push(cmd.id);
        };
        put({ id: "chart.review.toggle", title: "타점 저장/삭제(현재 시각)", category: "차트", keys: "space", run: () => handlersRef.current.toggle() });
        // 설정된 프리셋 슬롯만 등록 → 도움말에 실제 유형 라벨로 표시.
        typePresets.forEach((preset, i) => {
            if (!preset) return;
            put({ id: `chart.review.type.${i + 1}`, title: `타점 유형: ${preset}`, category: "차트", keys: String(i + 1), run: () => handlersRef.current.applyType(i) });
        });
        return () => ids.forEach(unregister);
    }, [typePresets]);

    const savedTimes = useMemo(() => (date ? reviewPoints.map((rp) => kstToUnix(date, rp.time)) : []), [reviewPoints, date]);
    const focusedPoint = useMemo(() => reviewPoints.find((rp) => rp.time === time), [reviewPoints, time]);

    return { savedTimes, focusedPoint };
}

/**
 * 차트 이동 단축키 — a/d(±1봉)·shift+a/d(±jumpBars)·ctrl+a/d(타점 순회 wrap)·f(줌 토글). 전역 등록(입력창 가드).
 * a/d/shift = setTime(시간 드리프트, activePoint 유지). ctrl = goToPoint(타점=activePoint 갱신, 연결표시 반영).
 * 핸들러는 최신 상태를 ref 로 읽어 등록은 1회.
 */
export function useChartNavHotkeys(code: string, date: string, minutePoints: MinutePoint[], time: string | null, jumpBars: number, onZoomToggle: () => void): void {
    const reviewQ = useQuery(reviewPointsQuery(code, date)); // 위 훅과 같은 키 → RQ 캐시 공유(중복 페치 없음)
    const reviewTimes = useMemo(() => [...(reviewQ.data ?? []).map((rp) => rp.time)].sort(), [reviewQ.data]);

    const ref = useRef({ code, date, minutePoints, time, jumpBars, reviewTimes, onZoomToggle });
    ref.current = { code, date, minutePoints, time, jumpBars, reviewTimes, onZoomToggle };

    const handlers = useRef({
        // ±delta 봉 이동(실제 분봉 bar 기준, 갭 있어도 실데이터에 안착).
        moveBar: (delta: number): void => {
            const { minutePoints: pts, time: t } = ref.current;
            if (pts.length === 0) return;
            let idx = pts.findIndex((p) => p.tradeTime === t);
            if (idx < 0) {
                idx = pts.length - 1;
                if (t) for (let i = 0; i < pts.length; i++) { if (pts[i].tradeTime <= t) idx = i; else break; }
            }
            const ni = Math.max(0, Math.min(pts.length - 1, idx + delta));
            useWorkbench.getState().setTime(pts[ni].tradeTime);
        },
        // 타점 순회(dir −1 이전 / +1 다음), 끝↔처음 wrap. 현재 시각 기준 방향탐색.
        navPoint: (dir: number): void => {
            const { reviewTimes: rts, time: t, code: c, date: d } = ref.current;
            if (rts.length === 0) return;
            let target: string;
            if (dir > 0) {
                target = rts.find((x) => (t ? x > t : true)) ?? rts[0];
            } else {
                const prevs = rts.filter((x) => (t ? x < t : true));
                target = prevs.length ? prevs[prevs.length - 1] : rts[rts.length - 1];
            }
            useWorkbench.getState().goToPoint({ date: d, code: c, time: target });
        },
    });

    useEffect(() => {
        const { register, unregister } = useKeymapDynamic.getState();
        const ids: string[] = [];
        const put = (cmd: Command): void => { register(cmd); ids.push(cmd.id); };
        put({ id: "chart.nav.prevBar", title: "1봉 이전", category: "차트", keys: "a", run: () => handlers.current.moveBar(-1) });
        put({ id: "chart.nav.nextBar", title: "1봉 다음", category: "차트", keys: "d", run: () => handlers.current.moveBar(1) });
        put({ id: "chart.nav.jumpPrev", title: "이동봉 이전", category: "차트", keys: "shift+a", run: () => handlers.current.moveBar(-ref.current.jumpBars) });
        put({ id: "chart.nav.jumpNext", title: "이동봉 다음", category: "차트", keys: "shift+d", run: () => handlers.current.moveBar(ref.current.jumpBars) });
        put({ id: "chart.nav.prevPoint", title: "이전 타점", category: "차트", keys: "ctrl+a", blockedInInput: true, run: () => handlers.current.navPoint(-1) });
        put({ id: "chart.nav.nextPoint", title: "다음 타점", category: "차트", keys: "ctrl+d", blockedInInput: true, run: () => handlers.current.navPoint(1) });
        put({ id: "chart.zoom.toggle", title: "확대/축소", category: "차트", keys: "f", run: () => ref.current.onZoomToggle() });
        return () => ids.forEach(unregister);
    }, []);
}
