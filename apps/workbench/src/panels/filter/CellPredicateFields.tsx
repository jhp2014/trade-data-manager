// 셀 술어의 **그 자리 편집** — 하루·셀 우주의 조건은 전용 편집 판이 없다(레일도 결과 판도 이 우주의
// 것이 아니다). 그룹 술어가 그 자리 팝오버로 편집되는 것과 같은 예외이고, 값이 스칼라 한둘이라
// 판을 여는 왕복이 오히려 손을 끊는다.
//
// payload **모양에서** 편집칸을 고른다 — 시드 전용 분기를 만들지 않는다(사용자가 만든 조건도 같은 손).
import {
    CELL_VALUE_FIELDS,
    type CellPredicate,
} from "@trade-data-manager/market/domain";
import { NumField, OptNumField } from "../../components/NumField.js";
import type { FilterPredicate, FilterStage } from "./stage.js";

/** 첫 구간의 한쪽 값 경계(타점 앵커 경계는 편집 밖). */
const valueBound = (p: Extract<CellPredicate, { kind: "cellValue" }>, side: "from" | "to"): number | null => {
    const b = p.ranges[0]?.[side];
    return b?.kind === "value" ? b.value : null;
};

/**
 * 편집한 경계만 갈아 끼운다 — **나머지는 보존**한다(반대쪽 경계·두 번째 이후 OR 구간).
 * 통째로 `[{from}]` 으로 갈아치우면 파서·엔진이 이미 지원하는 양끝/다중 구간이 편집 한 번에 증발한다.
 */
function withBound(p: Extract<CellPredicate, { kind: "cellValue" }>, side: "from" | "to", value: number | null): CellPredicate {
    const { [side]: _drop, ...rest } = p.ranges[0] ?? {};
    const first = value === null ? rest : { ...rest, [side]: { kind: "value" as const, value } };
    return { ...p, ranges: [first, ...p.ranges.slice(1)] };
}

/** 셀 술어 한 줄의 편집칸(없으면 null). 값 편집은 전면 From·To 두 칸(2026-09-27 — 빈 칸 = 그쪽 무제한). */
export function CellPredicateField({ p, onChange }: { p: CellPredicate; onChange: (next: CellPredicate) => void }): JSX.Element | null {
    if (p.kind === "cellValue") {
        const meta = CELL_VALUE_FIELDS[p.field];
        return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span>{meta.label}</span>
                <OptNumField label="" suffix="" placeholder="↓" value={valueBound(p, "from")}
                    title="하한(포함) — 비우면 아래 무제한" onCommit={(v) => onChange(withBound(p, "from", v))} />
                <span style={{ color: "var(--text-tertiary)" }}>~</span>
                <OptNumField label="" suffix={meta.suffix} placeholder="↑" value={valueBound(p, "to")}
                    title="상한(포함) — 비우면 위 무제한" onCommit={(v) => onChange(withBound(p, "to", v))} />
            </span>
        );
    }
    if (p.kind === "priorHighBreak") {
        // 창은 필수 값 — 빈 칸을 허용하는 OptNumField 를 쓰면 "무효를 되돌린다" 규약이 깨진다(리뷰 L4).
        return <NumField label="창" suffix="일" value={p.days} min={1} onCommit={(v) => onChange({ ...p, days: Math.round(v) })} />;
    }
    // 돌파·캔들의 값은 **줄의 팝오버 한 곳**에서 만진다 — 줄 이름 클릭이 곧 팝오버라 여기 안 온다.
    return null;
}

const CELL_KINDS: ReadonlySet<string> = new Set(["cellValue", "priorHighBreak", "breakout", "candle", "theme"]);
export const isCellPredicate = (p: FilterPredicate): p is CellPredicate => CELL_KINDS.has(p.kind) || p.kind === "time";

/** 칸 하나의 셀 술어 편집 줄. (전이 칩은 2026-09-27 전이 은퇴로 사라졌다 — 진입은 테마 팝오버의 노브.) */
export function CellStageFields({ stage, onPatch }: {
    stage: FilterStage;
    onPatch: (next: FilterStage) => void;
}): JSX.Element | null {
    const cells = stage.predicates.filter(isCellPredicate);
    if (cells.length === 0) return null;
    const setPredicate = (idx: number, next: CellPredicate): void =>
        onPatch({ ...stage, predicates: stage.predicates.map((q, qi) => (qi === idx ? (next as FilterPredicate) : q)) });
    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", padding: "1px 0 2px 26px" }}>
            {stage.predicates.map((p, i) =>
                isCellPredicate(p) ? <CellPredicateField key={`${p.kind}-${i}`} p={p} onChange={(n) => setPredicate(i, n)} /> : null,
            )}
        </div>
    );
}
