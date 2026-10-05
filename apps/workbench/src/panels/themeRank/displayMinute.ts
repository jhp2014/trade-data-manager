// 표시 분 한 벌 — "하루 재료 판들의 현재 분은 같은 자"의 집. 시장 단면(useThemePlane)과 존 추세
// (ZoneTrendPanel)가 이 훅 하나를 본다 — 복사본 두 벌이면 한쪽만 고쳐져 두 판이 다른 분을 본다(리뷰 지적).
//
// 규칙(decisions.md 「테마 순위 패널의 표시 시각」): 전역 focus.time 직결, 없으면 기본 사다리
// (그날 첫 타점 → 스냅샷 마지막 봉 — defaultMinuteOf), 장전 시각은 **표시만** 스냅샷 범위로 클램프
// (전역 되쓰기 금지 — 패널이 전역을 정정하면 루프 모양).
import { useMemo } from "react";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import type { Subject } from "../../lib/subject.js";
import { useChartPoints } from "../../lib/useChartPoints.js";
import { defaultMinuteOf } from "./scrubSection.js";

export interface DisplayMinute {
    /** 스냅샷의 실제 분 범위 — 타임라인·x 축의 도메인. 스냅샷 없음 = null. */
    minuteRange: { lo: number; hi: number } | null;
    /** 표시 분(클램프 끝) — 시선 없음·스냅샷 없음 = null. */
    minute: number | null;
    /** 그날 시선 차트의 타점 시각들 — ▼ 마커·기본 사다리의 재료(단면 pointMinutes 가 쓴다). */
    chartPoints: readonly string[];
}

export function useDisplayMinute(
    stocks: readonly ReplayStock[] | undefined,
    subject: Subject | null,
    focusTime: string | null,
): DisplayMinute {
    const minuteRange = useMemo(() => {
        if (!stocks || stocks.length === 0) return null;
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of stocks) {
            if (s.times.length === 0) continue;
            const a = minuteOfDayOf(s.times[0]);
            const b = minuteOfDayOf(s.times[s.times.length - 1]);
            if (a < lo) lo = a;
            if (b > hi) hi = b;
        }
        return Number.isFinite(lo) ? { lo, hi } : null;
    }, [stocks]);

    const chartPoints = useChartPoints(subject?.code ?? "", subject?.date ?? "");
    const minute = useMemo(() => {
        if (!subject) return null;
        const m = defaultMinuteOf(focusTime, chartPoints, minuteRange?.hi ?? null);
        if (m === null || !minuteRange) return m;
        return Math.min(Math.max(m, minuteRange.lo), minuteRange.hi);
    }, [subject, focusTime, chartPoints, minuteRange]);

    return { minuteRange, minute, chartPoints };
}
