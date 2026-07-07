// 가설 패널·그래프가 공유하는 데이터 조회·파생(중복 제거). 선택·조립·뮤테이션은 각 패널 몫.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { hypothesesForPoint } from "@trade-data-manager/market";
import { useWorkbench } from "../store/workbench.js";
import { hypothesesQuery, hypothesisLinksQuery } from "../api/queries.js";
import type { Hypothesis, HypothesisLink } from "../api/hypotheses.js";

/** 타점 식별 = (code·date·time) 삼중키. */
export interface HypothesisPoint {
    stockCode: string;
    date: string;
    time: string;
}

export interface HypothesisData {
    hypotheses: Hypothesis[];
    links: HypothesisLink[];
    isLoading: boolean;
    /** 현재 Focus 타점(code·date·time 모두 있을 때). 없으면 null. */
    point: HypothesisPoint | null;
    /** point 에 연결된 가설 id 집합(역방향). point 없으면 빈 집합. */
    linkedToPoint: Set<string>;
    /** 가설별 링크 수. */
    countByHyp: Map<string, number>;
}

export function useHypothesisData(): HypothesisData {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const time = useWorkbench((s) => s.focus.time);

    const hypQ = useQuery(hypothesesQuery());
    const linkQ = useQuery(hypothesisLinksQuery());
    const hypotheses = useMemo(() => hypQ.data ?? [], [hypQ.data]);
    const links = useMemo(() => linkQ.data ?? [], [linkQ.data]);

    const point = useMemo<HypothesisPoint | null>(
        () => (code && date && time ? { stockCode: code, date, time } : null),
        [code, date, time],
    );
    const linkedToPoint = useMemo(() => (point ? hypothesesForPoint(links, point) : new Set<string>()), [links, point]);
    const countByHyp = useMemo(() => {
        const m = new Map<string, number>();
        for (const l of links) m.set(l.hypothesisId, (m.get(l.hypothesisId) ?? 0) + 1);
        return m;
    }, [links]);

    return { hypotheses, links, isLoading: hypQ.isLoading, point, linkedToPoint, countByHyp };
}
