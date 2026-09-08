// 결과 열 어휘(순수) — 시트에 서는 결과 열 6개의 id·메타·**정렬 접근자 한 벌**.
//
// 결과 값은 축 피드(useRankAxes)에 안 싣는다 — 과거/미래 경계(decisions.md 「시그널 결과」). 시트는
// 읽기 면이라 여기서만 합류한다: colKey 이름공간 `out:<id>`(축 `ax:` 와 갈려 유령 청소가 안 건드린다),
// point 행 모드 전용(day 행엔 시각이 없어 결과가 정의되지 않는다).
//
// 정렬값과 셀 표기가 두 벌이 되면 "정렬은 X 순인데 칸은 Y" 침묵 사고가 난다 — 그래서 접근자
// (outcomeSortValue)와 표기 재료가 **같은 파일**에 살고, 숫자 4종은 레일·술어와 같은 출처(eval)를 읽는다.
import type { SimResult } from "@trade-data-manager/market/domain";
import type { OutcomeRecord } from "../../lib/useOutcomes.js";
import { OUTCOME_METRICS, type OutcomeMetric } from "../../lib/outcomeMetric.js";
import { SIM_STATUS_META } from "../sim/simStatusMeta.js";

/** 시뮬 열 id — 분류·요구 타점·최고/최저 도달(2026-09-06, decisions.md 트레이드 시뮬 항목).
 *  체결가 E 열은 기각(행마다 종가×(1−n)이라 비교 정보가 없다 — 요구 타점 % 하나가 정렬 척도, E 는 툴팁). */
export type SimColId = "simStatus" | "simRequired" | "simPeak" | "simTrough";
export const SIM_COL_IDS: readonly SimColId[] = ["simStatus", "simRequired", "simPeak", "simTrough"];
export const isSimColId = (v: unknown): v is SimColId => SIM_COL_IDS.includes(v as SimColId);

/** 결과 열 id — 결과 걷기 5(숫자 3 + 회복·상태) + 시뮬 4. colKey 는 `out:<id>`(같은 이름공간 —
 *  둘 다 "시그널 이후" 시트 전용 소스라 유령 청소(`ax:` 만)와 프리셋 규칙을 공유한다). */
export type OutcomeColId = OutcomeMetric | "recovered" | "status" | SimColId;

/** 결과 걷기 열 5 — 붙박이 "결과" 프리셋의 구성(시뮬 4는 별도 "시뮬" 프리셋 — 사용자 확정).
 *  옛 `deltaExt`(Δ 연장폭)는 2026-09-09 폐지 — T 비교는 결과 조건 인스턴스 둘 + 시트 차이 열이 진다. */
export const OUTCOME_BASE_COL_IDS: readonly OutcomeColId[] = ["extHigh", "dropFromHigh", "dropFromClose", "recovered", "status"];

/** 시트에 서는 순서 그대로 — 결과 걷기 5 뒤에 시뮬 4(과거→미래→시뮬 읽기 순서). */
export const OUTCOME_COL_IDS: readonly OutcomeColId[] = [...OUTCOME_BASE_COL_IDS, ...SIM_COL_IDS];

export const isOutcomeColId = (v: unknown): v is OutcomeColId =>
    OUTCOME_METRICS.includes(v as OutcomeMetric) || v === "recovered" || v === "status" || isSimColId(v);

interface OutcomeColMeta {
    label: string;
    /** 옛 결과 시트 폭 + 헤더 여유(시트 헤더는 굵은 글꼴에 정렬 화살표·단 번호가 라벨 옆에 붙는다 — 잘리면 열의 정체가 사라진다). */
    width: number;
    justify: "center" | "flex-end";
    /** 헤더 툴팁 — 옛 결과 시트의 문장 승계. */
    help: string;
}

export const OUTCOME_COL_META: Record<OutcomeColId, OutcomeColMeta> = {
    extHigh: { label: "고점", width: 76, justify: "flex-end", help: "허용 폭 T 의 연장 고점 %(Point 종가 대비) — 술어·차트 표식과 같은 기준" },
    dropFromHigh: { label: "저가·고점比", width: 84, justify: "flex-end", help: "보고 저가의 직전 고점 대비 % — 무눌림이면 무사건(—)" },
    dropFromClose: { label: "저가·종가比", width: 84, justify: "flex-end", help: "보고 저가의 Point 종가 대비 % — 무눌림이면 무사건(—)" },
    recovered: { label: "회복", width: 46, justify: "center", help: "보고 저가 이후 직전 고가 재돌파 여부(세션 최고가 판정) — 무눌림은 대상 아님(—)" },
    status: { label: "상태", width: 56, justify: "center", help: "허용 폭 T 기준 상태 — 초과(더 깊은 눌림 발생) / 이내(전부 T 이내) / 무눌림(2% 이상 눌림 없음)" },
    simStatus: { label: "시뮬", width: 66, justify: "center", help: "트레이드 시뮬 분류 — 체결 3(익절/손절/미결) + 미체결 3(눌림부족/이탈/시간). 노브는 시뮬 패널에서" },
    simRequired: { label: "요구 타점", width: 76, justify: "flex-end", help: "체결되려면 타점 n 이 얼마였어야 했나 — (종가 − 취소 전 최저 눌림가)/종가. 음수 = 종가 아래로 안 옴. 체결가 E 는 셀 툴팁" },
    simPeak: { label: "도달↑", width: 70, justify: "flex-end", help: "익절 브랜치 최고 도달 %(체결가 분모) — 트레일↑ 발동 전 최고가(미발동 = 잔여 최고가)" },
    simTrough: { label: "도달↓", width: 70, justify: "flex-end", help: "손절 브랜치 최저 도달 %(체결가 분모, 진단값) — 트레일↓ 반등 전 최저가" },
};

/**
 * 정렬값 — null = 값 없음(격자 미도착, 또는 무눌림의 무사건 낙폭·회복 / 시뮬 미정의 브랜치) →
 * 방향 무관 바닥(sheetSort 규칙 2). 숫자들은 셀 표기와 같은 출처(eval/SimResult)를 읽는다.
 * 상태 서수 = 초과 0 · 이내 1 · 무눌림 2, 시뮬 서수 = SIM_STATUS_META.ord(비관→낙관).
 */
export function outcomeSortValue(rec: OutcomeRecord | undefined, sim: SimResult | undefined, id: OutcomeColId): number | null {
    if (isSimColId(id)) {
        if (sim === undefined) return null;
        if (id === "simStatus") return SIM_STATUS_META[sim.status].ord;
        if (id === "simRequired") return sim.requiredPct;
        return id === "simPeak" ? sim.peakPct : sim.troughPct;
    }
    if (rec === undefined) return null;
    if (id === "recovered") return rec.slice.recovered === null ? null : rec.slice.recovered ? 1 : 0;
    if (id === "status") return rec.slice.status === "exceeded" ? 0 : rec.slice.status === "contained" ? 1 : 2;
    return rec.eval[id] ?? null;
}

/**
 * 부호 붙은 % 한 자리. **단위(%)를 글자에 싣는다**(2026-09-05 사용자 확정) — 축 열이 전부 단위를
 * 달고 서는 줄에서 결과 열만 맨 숫자면 그 넷이 무슨 단위인지 매번 헤더로 되돌아가 확인하게 된다.
 */
export const fmtOutcomePct = (v: number): string => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
