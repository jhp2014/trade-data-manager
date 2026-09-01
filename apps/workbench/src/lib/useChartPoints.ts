// 이 차트(종목,날짜)의 타점 시각 — **읽기 포트**. 재료는 자동 타점 격자 파생 한 벌(PointGridsProvider)이라
// 서버 왕복이 없다(종목 이동에도 즉시). 소비자는 재료가 격자인지 서버인지 모른다(usePresence 와 같은 결).
//
// 손 타점(curation review_points)은 2026-09-01 폐지 — 타점은 이제 읽기 시점 파생물 하나다. 이 훅이 남은
// 이유는 소비자(차트 순회·타점정보·정규화 시선·테마 순위 사다리)가 묻는 것이 여전히 "이 차트의 타점 시각들"
// 이기 때문이다. 정의(pointDef) 노브를 돌리면 그 자리에서 바뀐다.
import { useMemo } from "react";
import { autoPointsOfChart, useAutoPoints } from "./PointGridsContext.js";
import { minuteToHms } from "@trade-data-manager/market/domain";

/** 그 (종목,날짜)의 타점 시각(HH:MM:SS, 오름차순 — pointsOf 산출 순서 그대로). */
export function useChartPoints(code: string, date: string): string[] {
    const auto = useAutoPoints();
    const derived = autoPointsOfChart(auto, code, date);
    return useMemo(() => derived.map((p) => minuteToHms(p.min)), [derived]);
}
