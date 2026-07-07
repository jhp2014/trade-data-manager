// ChartPanel 편집 유스케이스 훅 — 가격선/타점의 조회·앵커해소·mutation·단축키를 컴포넌트에서 분리.
// 패널은 뷰 파생(deriveMinute/DailyView)+렌더만 남긴다.
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addPriceLine, removePriceLine, type RenderLine } from "../api/priceLines.js";
import { upsertReviewPoint, removeReviewPoint, type ReviewPoint } from "../api/reviewPoints.js";
import { priceLinesQuery, priceLinedStocksQuery, reviewPointsQuery, allPointsQuery } from "../api/queries.js";
import { kstToUnix, type DailyPoint, type MinuteView } from "./derive.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
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
