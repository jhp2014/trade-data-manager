// 셀 술어의 **그 자리 편집** — 하루·셀 우주의 조건은 전용 편집 판이 없다(레일도 결과 판도 이 우주의
// 것이 아니다). 그룹 술어가 그 자리 팝오버로 편집되는 것과 같은 예외이고, 값이 스칼라 한둘이라
// 판을 여는 왕복이 오히려 손을 끊는다.
//
// payload **모양에서** 편집칸을 고른다 — 시드 전용 분기를 만들지 않는다(사용자가 만든 조건도 같은 손).
import {
    CELL_VALUE_FIELDS,
    TRANSITIONS,
    TRANSITION_LABEL,
    type CellPredicate,
    type Transition,
} from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import type { FilterPredicate, FilterStage } from "./stage.js";

/** 구간 한쪽의 값 — 편집칸이 붙는 자리(양쪽 다 있으면 from). 첫 구간만 본다. */
function boundOf(p: Extract<CellPredicate, { kind: "cellValue" }>): { side: "from" | "to"; value: number } | null {
    const r = p.ranges[0];
    if (!r) return null;
    if (r.from?.kind === "value") return { side: "from", value: r.from.value };
    if (r.to?.kind === "value") return { side: "to", value: r.to.value };
    return null;
}

/**
 * 편집한 경계만 갈아 끼운다 — **나머지는 보존**한다(반대쪽 경계·두 번째 이후 OR 구간).
 * 통째로 `[{from}]` 으로 갈아치우면 파서·엔진이 이미 지원하는 양끝/다중 구간이 편집 한 번에 증발한다.
 */
function withBound(p: Extract<CellPredicate, { kind: "cellValue" }>, side: "from" | "to", value: number): CellPredicate {
    const first = p.ranges[0] ?? {};
    return { ...p, ranges: [{ ...first, [side]: { kind: "value" as const, value } }, ...p.ranges.slice(1)] };
}

/** 셀 술어 한 줄의 편집칸(없으면 null — 격자 Point 는 편집할 payload 가 없다). */
export function CellPredicateField({ p, onChange }: { p: CellPredicate; onChange: (next: CellPredicate) => void }): JSX.Element | null {
    if (p.kind === "cellValue") {
        const b = boundOf(p);
        const meta = CELL_VALUE_FIELDS[p.field];
        if (!b) return <span style={{ color: "var(--text-tertiary)" }}>{meta.label}</span>;
        return (
            <NumField
                label={`${meta.label}${b.side === "from" ? "≥" : "≤"}`}
                suffix={meta.suffix}
                value={b.value}
                min={p.field === "zoneRank" ? 1 : undefined}
                onCommit={(v) => onChange(withBound(p, b.side, v))}
            />
        );
    }
    if (p.kind === "priorHighBreak") {
        return <NumField label="창" suffix="일" value={p.days} min={1} onCommit={(v) => onChange({ ...p, days: Math.round(v) })} />;
    }
    return null;
}

const CELL_KINDS: ReadonlySet<string> = new Set(["cellValue", "priorHighBreak", "gridPoint"]);
export const isCellPredicate = (p: FilterPredicate): p is CellPredicate => CELL_KINDS.has(p.kind) || p.kind === "time";

/**
 * 칸 하나의 셀 술어 편집 줄 + **전이 칩**.
 *
 * 전이는 **칸(블럭) 수준**이다(2026-09-18 확정): 줄 토글이면 `A(처음으로) ∧ B` 가 "A 가 처음 참이 된
 * 분 ∧ 그 분에 B" 가 되는데, 사람이 원하는 건 "A∧B 가 처음 성립한 분"이다(옛 probe ②가 정확히 후자).
 * 읽기는 줄·칸 **양쪽을 흡수**하고(옛 저장물이 줄에 들고 있다) 쓰기만 칸에 한다 — 그래서 나중에
 * 문법을 뒤집어도 저장물 손실이 0이다.
 */
export function CellStageFields({ stage, onPatch }: {
    stage: FilterStage;
    onPatch: (next: FilterStage) => void;
}): JSX.Element | null {
    const cells = stage.predicates.filter(isCellPredicate);
    if (cells.length === 0) return null;
    // 읽기 흡수 — 칸 필드가 없으면 줄에 실린 것을 그대로 보여준다.
    const onLine = stage.predicates.map((p) => ("transition" in p ? p.transition : undefined)).find((t) => t !== undefined);
    const trans: Transition | undefined = stage.transition ?? onLine;
    const setPredicate = (idx: number, next: CellPredicate): void =>
        onPatch({ ...stage, predicates: stage.predicates.map((q, qi) => (qi === idx ? (next as FilterPredicate) : q)) });
    const cycle = (): void => {
        // 없음 → 셋을 돌고 다시 없음. 칩 하나로 네 상태를 도는 게 목록 줄에 가장 적게 든다.
        const at = trans === undefined ? -1 : TRANSITIONS.indexOf(trans);
        const next = at + 1 >= TRANSITIONS.length ? undefined : TRANSITIONS[at + 1];
        // 쓰기는 **칸에만** — 줄에 남아 있던 옛 값도 같이 걷어 두 자리가 다른 말을 하지 않게 한다.
        onPatch({
            ...stage,
            ...(next ? { transition: next } : { transition: undefined }),
            predicates: stage.predicates.map((p) => ("transition" in p && p.transition !== undefined ? { ...p, transition: undefined } : p)),
        });
    };
    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", padding: "1px 0 2px 26px" }}>
            {stage.predicates.map((p, i) =>
                isCellPredicate(p) ? <CellPredicateField key={`${p.kind}-${i}`} p={p} onChange={(n) => setPredicate(i, n)} /> : null,
            )}
            <button
                onClick={cycle}
                title="전이 수식어 — 값이 참인 매 분이 아니라 그 순간에만 걸린다. 칸 전체(술어 AND)에 붙는다. 클릭으로 순환."
                style={{
                    fontSize: 9.5, padding: "0 5px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${trans ? "var(--accent-primary)" : "var(--border-default)"}`,
                    background: "transparent", color: trans ? "var(--accent-primary)" : "var(--text-tertiary)",
                }}
            >
                {trans ? TRANSITION_LABEL[trans] : "전이 없음"}
            </button>
        </div>
    );
}
