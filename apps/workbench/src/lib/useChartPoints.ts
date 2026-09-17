// 이 차트(종목,날짜)의 타점 시각 — **읽기 포트**. 타점의 진실 = 라벨 좌표(그룹 배정 캔들 좌표,
// 2026-09-18 「구조 개편」 B — 격자 파생은 탐색 보조로 물러났다). 재료는 그룹 복제본(GroupsProvider)이라
// 서버 왕복이 없다(종목 이동에도 즉시). 소비자(차트 a/d 순회·타점정보·정규화 시선·테마 순위 사다리)가
// 묻는 것은 여전히 "이 차트의 타점 시각들"이다 — 이 훅이 남은 이유.
import { useMemo } from "react";
import { useGroups } from "./GroupsContext.js";

/** 그 (종목,날짜)의 타점(라벨) 시각(HH:MM:SS, 오름차순). */
export function useChartPoints(code: string, date: string): string[] {
    const { pointLabelsOf } = useGroups();
    const labels = pointLabelsOf({ stockCode: code, date });
    return useMemo(() => labels.map((l) => l.time), [labels]);
}
