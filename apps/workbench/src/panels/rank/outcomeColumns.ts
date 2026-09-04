// 결과 열 어휘(순수) — 시트에 서는 결과 열 6개의 id·메타·**정렬 접근자 한 벌**.
//
// 결과 값은 축 피드(useRankAxes)에 안 싣는다 — 과거/미래 경계(decisions.md 「시그널 결과」). 시트는
// 읽기 면이라 여기서만 합류한다: colKey 이름공간 `out:<id>`(축 `ax:` 와 갈려 유령 청소가 안 건드린다),
// point 행 모드 전용(day 행엔 시각이 없어 결과가 정의되지 않는다).
//
// 정렬값과 셀 표기가 두 벌이 되면 "정렬은 X 순인데 칸은 Y" 침묵 사고가 난다 — 그래서 접근자
// (outcomeSortValue)와 표기 재료가 **같은 파일**에 살고, 숫자 4종은 레일·술어와 같은 출처(eval)를 읽는다.
import type { OutcomeRecord } from "../../lib/useOutcomes.js";
import { OUTCOME_METRICS, type OutcomeMetric } from "../../lib/outcomeMetric.js";

/** 결과 열 id — 숫자 4(= OutcomeMetric) + 명목 2(회복·상태). colKey 는 `out:<id>`. */
export type OutcomeColId = OutcomeMetric | "recovered" | "status";

/** 시트에 서는 순서 그대로 — 고점@T1 · Δ · 낙폭 2종 · 회복 · 상태(@T2 열은 Δ로 충분해 기각). */
export const OUTCOME_COL_IDS: readonly OutcomeColId[] = ["extHigh", "deltaExt", "dropFromHigh", "dropFromClose", "recovered", "status"];

export const isOutcomeColId = (v: unknown): v is OutcomeColId =>
    OUTCOME_METRICS.includes(v as OutcomeMetric) || v === "recovered" || v === "status";

interface OutcomeColMeta {
    label: string;
    /** 옛 결과 시트 폭 + 헤더 여유(시트 헤더는 굵은 글꼴에 정렬 화살표·단 번호가 라벨 옆에 붙는다 — 잘리면 열의 정체가 사라진다). */
    width: number;
    justify: "center" | "flex-end";
    /** 헤더 툴팁 — 옛 결과 시트의 문장 승계. */
    help: string;
}

export const OUTCOME_COL_META: Record<OutcomeColId, OutcomeColMeta> = {
    extHigh: { label: "고점@T1", width: 76, justify: "flex-end", help: "기본 허용 T1 의 연장 고점 %(Point 종가 대비) — 술어·차트 표식과 같은 기준" },
    deltaExt: { label: "Δ연장", width: 70, justify: "flex-end", help: "Δ 연장폭(T1→T2) — T2 관찰 폭까지 허용을 넓히면 더 가는 만큼" },
    dropFromHigh: { label: "저가·고점比", width: 84, justify: "flex-end", help: "보고 저가의 직전 고점 대비 % — 무눌림이면 무사건(—)" },
    dropFromClose: { label: "저가·종가比", width: 84, justify: "flex-end", help: "보고 저가의 Point 종가 대비 % — 무눌림이면 무사건(—)" },
    recovered: { label: "회복", width: 46, justify: "center", help: "보고 저가 이후 직전 고가 재돌파 여부(세션 최고가 판정) — 무눌림은 대상 아님(—)" },
    status: { label: "상태", width: 56, justify: "center", help: "T1 기준 상태 — 초과(더 깊은 눌림 발생) / 이내(전부 T1 이내) / 무눌림(2% 이상 눌림 없음)" },
};

/**
 * 정렬값 — null = 값 없음(격자 미도착, 또는 무눌림의 무사건 낙폭·회복) → 방향 무관 바닥(sheetSort 규칙 2).
 * 숫자 4종은 셀 표기와 같은 출처(eval)를 읽는다. 상태 서수 = 초과 0 · 이내 1 · 무눌림 2(눌림이 얕아지는 방향).
 */
export function outcomeSortValue(rec: OutcomeRecord | undefined, id: OutcomeColId): number | null {
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
