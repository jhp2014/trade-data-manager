// point 행 원천 — 시트·깔때기·작업셋·레일이 보는 **한 곳**. 행 = **라벨 좌표**(그룹 배정 캔들 좌표) 하나뿐이다.
//
// 2026-09-18 「구조 개편」 B: 격자 파생(자동 타점)은 행 원천 지위를 잃었다 — 라벨이 타점의 진실이고,
// 종단이 필요한 건 분류된 것뿐이다(격자 파생은 탐색 후보 ①·차트 ◇ 로 존치). 이 훅이 남은 이유는
// 소비자가 "행이 어디서 오는지"를 안 묻게 하기 위해서다 — 정렬·복제 방지는 Provider(useLabelRowsValue)가 진다.
import { useMemo } from "react";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import { useLabelRows } from "./PointGridsContext.js";

export interface PointRowsView {
    /** 날짜 내림차순, 같은 날 시각 오름차순. **readonly** — 파생 한 벌의 원본이라, 소비자가 제자리
     *  정렬하면 참조는 그대로인 채 내용만 바뀌어 하류 memo(useThemeStrengthStats 모듈 캐시)가 조용히 틀어진다. */
    points: readonly ReviewPointKey[];
    isLoading: boolean;
    /** 첫 로드 실패 — 빈 목록을 "타점 없음"으로 오독하지 않게 겉으로 낸다. */
    error: Error | null;
}

const EMPTY: readonly ReviewPointKey[] = [];

export function usePointRows(): PointRowsView {
    const labels = useLabelRows();
    return useMemo<PointRowsView>(
        () => ({ points: labels.rows.length > 0 ? labels.rows : EMPTY, isLoading: labels.isLoading, error: labels.error }),
        [labels],
    );
}
