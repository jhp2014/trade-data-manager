// ChartPanel 편집 유스케이스 훅 — 가격선/타점의 조회·앵커해소·mutation·단축키를 컴포넌트에서 분리.
// 패널은 뷰 파생(deriveMinute/DailyView)+렌더만 남긴다.
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addPriceLine, removePriceLine, type RenderLine } from "../api/priceLines.js";
import { upsertReviewPoint, removeReviewPoint, type ReviewPoint } from "../api/reviewPoints.js";
import { priceLinesQuery, priceLinedStocksQuery, reviewPointsQuery, allPointsQuery, chartQuery, hypothesesQuery, hypothesisLinksQuery } from "../api/queries.js";
import { hypothesesForPoint } from "@trade-data-manager/market/domain";
import { kstToUnix, deriveMinuteView, type DailyPoint, type MinuteView } from "./derive.js";
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
            await Promise.all(lines.map((l) => removePriceLine(l.id)));
        },
        onSuccess: invalidate,
    });

    // 봉 우클릭 = 그 봉 앵커에 선 토글. 같은 앵커(anchorDate+anchorTime)가 이미 있으면 삭제, 없으면 추가.
    const toggleLine = (anchorDate: string, anchorTime: string | undefined): void => {
        if (!code || !date) return;
        const existing = lines.find((l) => l.anchorDate === anchorDate && (l.anchorTime ?? undefined) === anchorTime);
        if (existing) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, anchorDate, anchorTime, field: "high" });
    };
    const removeLine = (line: RenderLine): void => removeMut.mutate(line.id);
    const clear = (): void => clearMut.mutate();

    return { resolvedLines, dLines, hasLines: lines.length > 0, toggleLine, removeLine, clear };
}

export interface SavedPoint {
    time: number; // 저장 타점 시각(unix초) — 분봉 세로선/아이콘
    hypotheses: string[]; // 이 타점에 연결된 가설 텍스트(hover 카드용). 없으면 빈 배열.
}

export interface ChartReviewPoints {
    savedPoints: SavedPoint[];
    focusedPoint: ReviewPoint | undefined; // 현재 Focus.time 에 저장된 타점(헤더 배지)
}

/**
 * 복기 타점 조회 데이터(차트 렌더용) — 저장타점 세로선·hover 카드·현재타점 배지. 단축키 등록은 전역 useChartHotkeys 로 이관.
 * 가설↔타점 링크는 이미 전량 로드(staleTime ∞)라 추가 fetch 없이 타점별 가설 텍스트를 인메모리로 조립.
 */
export function useReviewPointData(code: string, date: string, time: string | null): ChartReviewPoints {
    const reviewQ = useQuery(reviewPointsQuery(code, date));
    const hypQ = useQuery(hypothesesQuery());
    const linkQ = useQuery(hypothesisLinksQuery());
    const reviewPoints = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);
    const links = useMemo(() => linkQ.data ?? [], [linkQ.data]);
    const hypText = useMemo(() => new Map((hypQ.data ?? []).map((h) => [h.id, h.text] as const)), [hypQ.data]);

    const savedPoints = useMemo<SavedPoint[]>(() => {
        if (!date) return [];
        return reviewPoints.map((rp) => {
            const ids = hypothesesForPoint(links, { stockCode: rp.stockCode, date: rp.date, time: rp.time });
            const hypotheses: string[] = [];
            for (const id of ids) {
                const t = hypText.get(id);
                if (t) hypotheses.push(t);
            }
            return { time: kstToUnix(date, rp.time), hypotheses };
        });
    }, [reviewPoints, date, links, hypText]);

    const focusedPoint = useMemo(() => reviewPoints.find((rp) => rp.time === time), [reviewPoints, time]);
    return { savedPoints, focusedPoint };
}

/**
 * 차트 단축키 — **전역 1회 등록**(App). 패널별 등록이 아니라 focus 를 따라간다 → 차트 여러 개여도 커맨드 충돌 없고,
 * 패널 마운트/포커스 상태에 안 흔들린다(옛 패널별 등록의 "가끔 안 먹음" 버그 해결). 입력창 포커스 중 mod-less 는 디스패처가 가드.
 *   space=타점 저장/삭제 · 1~9=유형 프리셋 · a/d=±1분봉 · shift+a/d=±jumpBars(setTime, activePoint 유지)
 *   ctrl+a/d=타점 순회 wrap(goToPoint) · f=일봉+분봉 확대/축소(store chartZoom, 두 차트 동시).
 * 핸들러는 매 렌더 최신 클로저로 h.current 갱신(안정 ref), 등록 effect 는 프리셋 변화에만 재실행.
 */
export function useChartHotkeys(): void {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.search?.date ?? s.focus.date); // 검색날짜(드리프트) 우선 — 차트 분봉이 보는 날짜와 일치(타점/이동봉이 그 날짜에 작동)
    const time = useWorkbench((s) => s.focus.time);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const jumpBars = useWorkbench((s) => s.chartSettings.jumpBars);
    const typePresets = useWorkbench((s) => s.reviewTypePresets);
    const qc = useQueryClient();

    const chartQ = useQuery(chartQuery(code, date)); // ChartPanel 과 같은 키 → RQ 캐시 공유(중복 페치 0)
    const minutePoints = useMemo(() => (chartQ.data ? deriveMinuteView(chartQ.data, mode).points : []), [chartQ.data, mode]);
    const reviewQ = useQuery(reviewPointsQuery(code, date));
    const reviewPoints = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);
    const reviewTimes = useMemo(() => [...reviewPoints.map((rp) => rp.time)].sort(), [reviewPoints]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: reviewPointsQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: allPointsQuery().queryKey });
    };
    const upsertMut = useMutation({ mutationFn: upsertReviewPoint, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: (v: { code: string; date: string; time: string }) => removeReviewPoint(v.code, v.date, v.time), onSuccess: invalidate });

    // 매 렌더 최신 클로저로 핸들러 갱신(안정 ref 유지) → 등록된 run 은 항상 최신 상태를 본다.
    const h = useRef({ toggle: () => {}, applyType: (_: number) => {}, moveBar: (_: number) => {}, jump: (_: number) => {}, navPoint: (_: number) => {} });
    h.current.toggle = () => {
        if (!code || !date || !time) return;
        const existing = reviewPoints.find((rp) => rp.time === time);
        if (existing) removeMut.mutate({ code, date, time });
        else upsertMut.mutate({ stockCode: code, date, time });
    };
    h.current.applyType = (i) => {
        const type = typePresets[i];
        if (!type || !code || !date || !time) return;
        const existing = reviewPoints.find((rp) => rp.time === time);
        upsertMut.mutate({ stockCode: code, date, time, type, outcome: existing?.outcome, memo: existing?.memo });
    };
    h.current.moveBar = (delta) => {
        if (minutePoints.length === 0) return;
        let idx = minutePoints.findIndex((p) => p.tradeTime === time);
        if (idx < 0) {
            idx = minutePoints.length - 1;
            if (time) for (let i = 0; i < minutePoints.length; i++) { if (minutePoints[i].tradeTime <= time) idx = i; else break; }
        }
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

    // 프리셋(1~9 라벨/등록) 변화에만 재등록. 나머지 키는 h.current 로 최신 클로저 접근.
    useEffect(() => {
        const { register, unregister } = useKeymapDynamic.getState();
        const ids: string[] = [];
        const put = (cmd: Command): void => { register(cmd); ids.push(cmd.id); };
        put({ id: "chart.review.toggle", title: "타점 저장/삭제(현재 시각)", category: "차트", keys: "space", run: () => h.current.toggle() });
        typePresets.forEach((preset, i) => {
            if (!preset) return;
            put({ id: `chart.review.type.${i + 1}`, title: `타점 유형: ${preset}`, category: "차트", keys: String(i + 1), run: () => h.current.applyType(i) });
        });
        put({ id: "chart.nav.prevBar", title: "1봉 이전", category: "차트", keys: "a", run: () => h.current.moveBar(-1) });
        put({ id: "chart.nav.nextBar", title: "1봉 다음", category: "차트", keys: "d", run: () => h.current.moveBar(1) });
        put({ id: "chart.nav.jumpPrev", title: "이동봉 이전", category: "차트", keys: "shift+a", run: () => h.current.jump(-1) });
        put({ id: "chart.nav.jumpNext", title: "이동봉 다음", category: "차트", keys: "shift+d", run: () => h.current.jump(1) });
        put({ id: "chart.nav.prevPoint", title: "이전 타점", category: "차트", keys: "ctrl+a", blockedInInput: true, run: () => h.current.navPoint(-1) });
        put({ id: "chart.nav.nextPoint", title: "다음 타점", category: "차트", keys: "ctrl+d", blockedInInput: true, run: () => h.current.navPoint(1) });
        put({ id: "chart.zoom.toggle", title: "확대/축소", category: "차트", keys: "f", run: () => useWorkbench.getState().toggleChartZoom() });
        return () => ids.forEach(unregister);
    }, [typePresets]);
}
