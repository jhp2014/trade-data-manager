// 가설 패널·그래프가 공유하는 데이터 조회·파생(중복 제거). 선택·조립·뮤테이션은 각 패널 몫.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { hypothesesForPoint } from "@trade-data-manager/market/domain";
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
    // (A) 연결 판정 = 선택된 타점(activePoint), focus.time(드리프트) 아님. 다른 타점으로 이동해야만 바뀐다.
    const activePoint = useWorkbench((s) => s.activePoint);

    const hypQ = useQuery(hypothesesQuery());
    const linkQ = useQuery(hypothesisLinksQuery());
    const hypotheses = useMemo(() => hypQ.data ?? [], [hypQ.data]);
    const links = useMemo(() => linkQ.data ?? [], [linkQ.data]);

    const point = useMemo<HypothesisPoint | null>(
        () => (activePoint ? { stockCode: activePoint.code, date: activePoint.date, time: activePoint.time } : null),
        [activePoint],
    );
    const linkedToPoint = useMemo(() => (point ? hypothesesForPoint(links, point) : new Set<string>()), [links, point]);
    const countByHyp = useMemo(() => {
        const m = new Map<string, number>();
        for (const l of links) m.set(l.hypothesisId, (m.get(l.hypothesisId) ?? 0) + 1);
        return m;
    }, [links]);

    return { hypotheses, links, isLoading: hypQ.isLoading, point, linkedToPoint, countByHyp };
}
