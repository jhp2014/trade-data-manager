// 라벨 행 원천 — 종단 point 행의 진실(2026-09-18 「구조 개편」 B). 행 = 그룹 배정 좌표(group_members_point).
//
// 재료 둘의 조인: 멤버십 피드(GroupsProvider 와 같은 캐시 — 낙관적 토글 즉시 반영) × 좌표 봉 사실
// (/labeled-point-facts — 종가·고가). 결손 규칙 3갈래를 여기서 확정한다:
//   ① 봉 사실 미도착·미수집 = **pending**(행은 서되 결과·시뮬 값이 안 선다 — signals 에서 빠진다)
//   ② 격자 없음(굽기 전) = 결과 결손(걷기 층 byKey 미스 — 여기 몫 아님)
//   ③ 무눌림(none) = 사건 없음(기존 outcome 어휘)
//
// 격자 파생(useAutoPoints)은 행 원천 지위를 잃고 존치한다 — 탐색 후보 ①·차트 ◇ 의 재료.
// 라벨 규모(수백~수천)라 토글마다의 재파생(정렬·조인·재걷기)은 ms 급이다 — 내용 키 memo 는 규모가
// 1만을 넘어 실측으로 아프면 그때(조기 최적화 금지).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { hmsToMinute, type ReviewPointKey } from "@trade-data-manager/market/domain";
import { labeledPointFactsQuery } from "../api/queries.js";
import { useGroups } from "./GroupsContext.js";
import { chartKey, pointKey } from "./pointKey.js";

/** 걷기·시뮬의 시그널 한 줄 — 라벨 좌표 + 봉 사실(원주가 UN 원). walkOutcome({min,high})·simulate({min,close}) 재료. */
export interface LabelSignal {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    min: number; // 자정기준 분
    close: number;
    high: number;
}

export interface LabelRowsView {
    /** 날짜 내림차순, 같은 날 시각 오름차순 — 옛 AutoPointsView.rows 와 같은 계약(정렬은 여기 한 번만). */
    rows: readonly ReviewPointKey[];
    /** 봉 사실 조인 성공분만(= 걷기·시뮬 모수). rows − signals = pending. */
    signals: readonly LabelSignal[];
    /** chartKey → 그 차트의 라벨 시각들(오름차순) — 깔때기 전개·per-chart 소비자. */
    byChart: ReadonlyMap<string, readonly string[]>;
    /** 봉 사실 미도착 좌표(pointKey) — pending 3치의 재료. */
    pendingKeys: ReadonlySet<string>;
    isLoading: boolean;
    error: Error | null;
}

const EMPTY_VIEW: Omit<LabelRowsView, "isLoading" | "error"> = {
    rows: [],
    signals: [],
    byChart: new Map(),
    pendingKeys: new Set(),
};

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 useLabelRows). */
export function useLabelRowsValue(): LabelRowsView {
    const { pointMemberships, groupByName, isLoading: groupsLoading } = useGroups();
    const factsQ = useQuery(labeledPointFactsQuery());
    const facts = factsQ.data?.facts;

    return useMemo<LabelRowsView>(() => {
        const isLoading = groupsLoading || factsQ.isLoading;
        const error = (factsQ.error as Error | null) ?? null;
        if (pointMemberships.length === 0) return { ...EMPTY_VIEW, isLoading, error };

        // "지워진 그룹 떨구기" — 표식(pointLabelsOf: subject·차트 ◆)과 **같은 규칙**이어야 한다(리뷰 B-2:
        // 그룹 삭제 직후 사전 refetch 가 먼저 도착한 창에서 행과 표식이 타점의 존재를 다르게 말하면 안 된다).
        // 사전이 아직 안 왔으면(빈 사전 + 멤버십 존재) 거르지 않는다 — 모름은 없음이 아니다.
        const dictReady = groupByName.size > 0;
        const live = dictReady ? pointMemberships.filter((m) => m.groupNames.some((n) => groupByName.has(n))) : pointMemberships;
        if (live.length === 0) return { ...EMPTY_VIEW, isLoading, error };

        const factOf = new Map((facts ?? []).map((f) => [pointKey(f), f] as const));
        const rows: ReviewPointKey[] = live
            .map((m) => ({ stockCode: m.stockCode, date: m.date, time: m.time }))
            .sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : x.time < y.time ? -1 : x.time > y.time ? 1 : 0));

        const signals: LabelSignal[] = [];
        const pendingKeys = new Set<string>();
        const byChart = new Map<string, string[]>();
        for (const r of rows) {
            const ck = chartKey(r);
            const list = byChart.get(ck);
            if (list) list.push(r.time);
            else byChart.set(ck, [r.time]);
            const f = factOf.get(pointKey(r));
            if (f) signals.push({ ...r, min: hmsToMinute(r.time), close: f.close, high: f.high });
            else pendingKeys.add(pointKey(r));
        }
        for (const list of byChart.values()) list.sort();
        return { rows, signals, byChart, pendingKeys, isLoading, error };
    }, [pointMemberships, groupByName, groupsLoading, facts, factsQ.isLoading, factsQ.error]);
}
