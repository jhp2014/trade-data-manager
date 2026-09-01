// point 행 원천 — 시트·깔때기·작업셋·레일이 보는 **한 곳**. 행 = 자동 타점(격자 파생) 하나뿐이다.
//
// 손 타점(review_points)·출처 토글은 2026-09-01 폐지 — 부분만 손으로 찍는 건 뜻이 없고(전량은 양이 불가)
// 토글은 화면·모수·축을 두 벌로 만들었다. 이 훅이 남은 이유는 소비자가 "행이 어디서 오는지"를 안
// 묻게 하기 위해서다 — 정렬·복제 방지는 Provider(useAutoPointsValue.rows)가 진다.
import { useMemo } from "react";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import { useAutoPoints } from "./PointGridsContext.js";

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
    const auto = useAutoPoints();
    return useMemo<PointRowsView>(
        () => ({ points: auto.rows.length > 0 ? auto.rows : EMPTY, isLoading: auto.isLoading, error: auto.error }),
        [auto],
    );
}
