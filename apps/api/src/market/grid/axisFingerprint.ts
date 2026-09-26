// 앵커 좌표 직렬화 — 자동 타점 격자(pointGrids)가 기준선 무효화 지문으로 쓴다.
// (옛 계산 축의 fingerprintOf/fingerprintParams 는 2026-09-26 종단 폐기로 축과 함께 은퇴 —
//  남은 것은 이 순수 직렬화 하나다.)
import type { ChartAnchor } from "@trade-data-manager/market";

/**
 * ⚠ 정렬은 **직렬화한 문자열 전체**로 한다. param 만으로 정렬하면 한 param 에 앵커가 여럿일 때(무시 캔들·
 *   다중 기준선) 순서가 DB 행 순서에 좌우돼, 아무것도 안 바꿨는데 지문이 달라지고 전량 재계산이 된다.
 */
export const anchorsFingerprint = (anchors: readonly ChartAnchor[], params: readonly string[]): string =>
    anchors
        .filter((a) => params.includes(a.param))
        .map((a) => `${a.param}@${a.anchorDate}T${a.anchorTime ?? ""}|${a.field ?? ""}|${a.market ?? ""}`)
        .sort()
        .join(";");
