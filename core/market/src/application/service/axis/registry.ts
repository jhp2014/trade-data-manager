// 계산 축 레지스트리 — 축을 하나 늘리는 비용을 "파일 하나 + 여기 한 줄"로 묶어두는 곳.
// 목록에 없는 축은 존재하지 않는다(런타임 등록 없음): 정의가 코드라 버전 관리가 git 이고 타입이 강제된다.
//
// ⚠ 파라미터 팩토리(dailyChangeAxis("krx") 같은 것)로 축을 무한정 뽑을 수 있지만, **실제로 볼 축만** 올린다.
//   축이 늘면 시트 열이 늘고 배치 노동이 아니라 화면이 먼저 무너진다.
import type { ComputedAxisDef } from "./axis.js";
import { dailyChangeAxis } from "./dailyChangeAxis.js";
import { baselinePositionAxis } from "./baselinePositionAxis.js";
import { supplyGapAxis } from "./supplyGapAxis.js";
import { baselineDistanceAxis } from "./baselineDistanceAxis.js";
import { prevDayHighAxis } from "./prevDayHighAxis.js";

// KRX 판(dailyChangeAxis("krx"))은 **일부러 안 만든다.** 그 축 자체는 자기완결적이고(분자·분모 둘 다 KRX =
// HTS 공식 등락률) 틀린 축이 아니다. 안 만드는 이유는 둘:
//   · 프리마켓·시간외 타점이 통째로 결손(그 시간대엔 KRX 세션이 없다)
//   · UN 판과 상관이 매우 높아 시트 열만 늘고 정보는 안 는다
// 분모(전일 종가)만 KRX 로 보고 싶어지면 그때 dailyChangeAxis 를 {price:"un", base} 로 쪼갠다 —
// 지금은 UN/KRX 기준가 차이가 작아 역시 상관 높은 축이 될 뿐이라 미룬다.
export const COMPUTED_AXES: readonly ComputedAxisDef[] = [
    dailyChangeAxis("un"),
    baselinePositionAxis(), // baseline 앵커 소비 — 분모는 앵커 가격이라 전일종가·시장 개념이 없다
    supplyGapAxis(), // baseline 을 문턱으로 왼쪽 스캔 — 같은 앵커를 다른 뜻으로 읽는 두 번째 축
    baselineDistanceAxis(), // 같은 앵커의 **좌표만**(후보 다중일 때만 가격 개입) — 공백과 반대쪽(오른쪽)을 잰다
    // 전일 고가 %는 **KRX 판도 만든다** — 위에서 dailyChangeAxis("krx")를 안 만든 두 이유가 여기선 둘 다 없다:
    //   · 세션 결손 없음: 재는 것이 분봉 한 점이 아니라 **종일 바**라, KRX 세션이 없는 시간대라는 게 성립 안 한다.
    //   · 상관이 낮음: UN ⊇ KRX 라 NXT 단독 시간대(프리마켓·시간외)에 더 간 날은 두 고가가 실제로 갈린다
    //     — "정규장에서만 얼마나 갔나"와 "하루 전체로 얼마나 갔나"는 다른 질문이고, 그 차이 자체가 정보다.
    prevDayHighAxis("un"),
    prevDayHighAxis("krx"),
    // 셋 다 같은 기준선을 본다 — 선택 규칙은 shared/baselineResolver 한 곳(후보 다중이면 가격 최저).
    // (옛 골격 축 6개 — skeletonAxes — 는 2026-08-23 골격 은퇴와 함께 삭제. 필요해지면 그때 새로 정의한다.)
];

/** key → 정의. 캐시·컨트롤러가 이름으로 지목할 때. */
export const computedAxisByKey = new Map(COMPUTED_AXES.map((a) => [a.key, a]));
