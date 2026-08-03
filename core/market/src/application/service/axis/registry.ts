// 계산 축 레지스트리 — 축을 하나 늘리는 비용을 "파일 하나 + 여기 한 줄"로 묶어두는 곳.
// 목록에 없는 축은 존재하지 않는다(런타임 등록 없음): 정의가 코드라 버전 관리가 git 이고 타입이 강제된다.
//
// ⚠ 파라미터 팩토리(dailyChangeAxis("krx") 같은 것)로 축을 무한정 뽑을 수 있지만, **실제로 볼 축만** 올린다.
//   축이 늘면 시트 열이 늘고 배치 노동이 아니라 화면이 먼저 무너진다.
import type { ComputedAxisDef } from "./axis.js";
import { dailyChangeAxis } from "./dailyChangeAxis.js";
import { baselinePositionAxis } from "./baselinePositionAxis.js";

export const COMPUTED_AXES: readonly ComputedAxisDef[] = [
    dailyChangeAxis("un"),
    // dailyChangeAxis("krx"),  // KRX 도 볼 때 주석 해제 — 시장별 별개 축(축 안 토글 금지).
    baselinePositionAxis(), // baseline 앵커 소비 — 시장은 앵커가 정한다(축 시장 파라미터 없음)
];

/** key → 정의. 캐시·컨트롤러가 이름으로 지목할 때. */
export const computedAxisByKey = new Map(COMPUTED_AXES.map((a) => [a.key, a]));
