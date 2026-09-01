// 계산 축 레지스트리 — 축을 하나 늘리는 비용을 "파일 하나 + 여기 한 줄"로 묶어두는 곳.
// 목록에 없는 축은 존재하지 않는다(런타임 등록 없음): 정의가 코드라 버전 관리가 git 이고 타입이 강제된다.
//
// ⚠ 파라미터 팩토리(prevDayHighAxis("krx") 같은 것)로 축을 무한정 뽑을 수 있지만, **실제로 볼 축만** 올린다.
//   축이 늘면 시트 열이 늘고 배치 노동이 아니라 화면이 먼저 무너진다.
//
// **여긴 day 축만 산다**(2026-09-01) — point 축은 서버에서 사라졌다. 타점이 읽기 층 파생물이 되면서
// 그 값은 클라가 격자에서 낸다(workbench lib/gridFeatures, 키 `baseline-position`·`daily-change-un` 승계).
// point 축을 여기 되살리려면 먼저 "서버가 어떤 정의의 타점을 아는가"를 풀어야 한다 — decisions.md 축 절.
//
// ⚠ **키 `baseline-position`·`daily-change-un` 은 클라 소유다**(승계 — 사용자 열 설정이 그 주소를 든다).
//   여기서 같은 키로 축을 등록하면 클라 merge 가 같은 키를 둘로 만들어 시트 열이 겹친다(dev 콘솔이 짖는다).
import type { ComputedAxisDef } from "./axis.js";
import { supplyGapAxis } from "./supplyGapAxis.js";
import { baselineDistanceAxis } from "./baselineDistanceAxis.js";
import { prevDayHighAxis } from "./prevDayHighAxis.js";

export const COMPUTED_AXES: readonly ComputedAxisDef[] = [
    supplyGapAxis(), // baseline 을 문턱으로 왼쪽 스캔 — 같은 앵커를 다른 뜻으로 읽는 두 번째 축
    baselineDistanceAxis(), // 같은 앵커의 **좌표만**(후보 다중일 때만 가격 개입) — 공백과 반대쪽(오른쪽)을 잰다
    // 전일 고가 %는 **KRX 판도 만든다** — 재는 것이 분봉 한 점이 아니라 **종일 바**라 세션 결손이 없고,
    // UN ⊇ KRX 라 NXT 단독 시간대(프리마켓·시간외)에 더 간 날은 두 고가가 실제로 갈린다
    // — "정규장에서만 얼마나 갔나"와 "하루 전체로 얼마나 갔나"는 다른 질문이고, 그 차이 자체가 정보다.
    prevDayHighAxis("un"),
    prevDayHighAxis("krx"),
    // 앵커 소비 축 둘(supplyGap·baselineDistance)은 같은 기준선을 본다 — 선택 규칙은
    // shared/baselineResolver 한 곳(후보 다중이면 가격 최저).
    // (옛 골격 축 6개 — skeletonAxes — 는 2026-08-23 골격 은퇴와 함께 삭제. 필요해지면 그때 새로 정의한다.)
];

/** key → 정의. 캐시·컨트롤러가 이름으로 지목할 때. */
export const computedAxisByKey = new Map(COMPUTED_AXES.map((a) => [a.key, a]));
