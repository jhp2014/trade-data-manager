// 조건의 정밀 입력 팝오버들 — **두 화면이 나눠 갖는다**: 레일 갈래 셋(날짜·시간·축 값)은 필터 레일
// 패널의 onType 입구가, 그룹 팔레트는 편성 보드가 연다. 한 컴포넌트로 두면 그룹 생성 draft 배선을
// 레일 패널까지 끌고 가야 해서 갈랐다 — 쓰기는 여전히 각 화면의 write(레일 하나 = 필터 하나)를 지난다.
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { parseDate, parseTime, shortDate } from "../../lib/date.js";
import type { GroupExpr } from "../rank/groupFilter.js";
import { GroupFilterEditor } from "./GroupFilterEditor.js";
import { RangeTextEditor } from "./RangeTextEditor.js";
import { predicateOfKind, type RailKey } from "./stageBinding.js";
import type { AxisValueRange, DateRange, FilterPredicate, FilterStage, TimeRange } from "./stage.js";

/** 레일 줄에서 여는 편집기 하나 — null 이면 아무 팝오버도 없다.
 *  날짜/시간을 한 멤버("date" | "time")로 접지 않는 이유: kind 가 합집합인 멤버는 판별 검사로
 *  갈래가 안 좁혀져, 마지막 갈래(axisValue)가 타입상 담판이 안 난다. */
export type RailEditor =
    | { kind: "date"; x: number; y: number }
    | { kind: "time"; x: number; y: number }
    | { kind: "axisValue"; axisId: string; x: number; y: number };

/** 그룹 팔레트 — 편집(stageId 있음)과 생성(draft)이 같은 팝오버를 쓴다.
 *  층위를 안 든다: 그룹은 하루(차트) 하나뿐이라 팝오버가 칸의 층위를 볼 이유가 없다(2026-09-01). */
export type GroupEditorAnchor = { stageId?: string; x: number; y: number };

export function GroupEditors({ editor, stages, draft, onDraftChange, onCloseCreate, removeStage, setPredicates, onClose }: {
    editor: GroupEditorAnchor | null;
    stages: readonly FilterStage[];
    /** 그룹 **생성** 흐름의 임시 식(useGroupCreateFlow). */
    draft: GroupExpr;
    onDraftChange: (e: GroupExpr) => void;
    /** 생성 팝오버 닫기 — draft 커밋 규칙(이중 커밋 가드)이 이 안에 있다. */
    onCloseCreate: () => void;
    removeStage: (id: string) => void;
    setPredicates: (id: string, predicates: FilterPredicate[]) => void;
    onClose: () => void;
}): JSX.Element | null {
    const editingStage = editor?.stageId ? stages.find((s) => s.id === editor.stageId) : undefined;
    if (editor === null) return null;
    return editor.stageId && editingStage
        ? <GroupFilterEditor anchor={editor}
            expr={(editingStage.predicates.find((p) => p.kind === "group") as Extract<FilterPredicate, { kind: "group" }> | undefined)?.expr ?? { groups: [] }}
            onChange={(next) => {
                // 식을 다 비우면 조건이 없어진 것 — 빈 필터를 남기지 않는다(레일에서 구간을 다 지운 것과 같다).
                if (next.groups.length === 0) { removeStage(editor.stageId!); onClose(); return; }
                setPredicates(editor.stageId!, [{ kind: "group", expr: next }]);
            }}
            onClose={onClose} />
        : <GroupFilterEditor anchor={editor} expr={draft} onChange={onDraftChange} onClose={onCloseCreate} />;
}

export function RailEditors({ editor, stages, write, onClose }: {
    editor: RailEditor | null;
    stages: readonly FilterStage[];
    /** 조건 쓰기 — 전부 이 한 줄을 지난다(레일 하나 = 필터 하나). */
    write: (key: RailKey, predicate: FilterPredicate | null) => void;
    onClose: () => void;
}): JSX.Element | null {
    // 축 재료는 Provider 에서 직접 — 부모가 넘겨주지 않는다(어차피 같은 한 벌이라 넘길 이유가 없다).
    const ax = useRankAxes();

    if (editor === null) return null;

    if (editor.kind === "date") {
        return (
            <RangeTextEditor anchor={editor} title="날짜 구간" placeholders={["26.07.01", "26.07.31"]} parse={parseDate}
                rows={(predicateOfKind(stages, { kind: "date" }, "date")?.ranges ?? [])
                    .map((r) => ({ from: shortDate(r.from), to: shortDate(r.to) }))}
                onCommit={(pairs) => {
                    const ranges: DateRange[] = pairs.filter((p) => p.from && p.to).map((p) => ({ from: p.from!, to: p.to! }));
                    write({ kind: "date" }, ranges.length > 0 ? { kind: "date", ranges } : null);
                }}
                onClose={onClose} />
        );
    }

    if (editor.kind === "time") {
        return (
            <RangeTextEditor anchor={editor} title="시간 구간" placeholders={["09:00", "10:30"]} parse={parseTime}
                rows={(predicateOfKind(stages, { kind: "time" }, "time")?.ranges ?? [])
                    .map((r) => ({ from: r.from, to: r.to }))}
                onCommit={(pairs) => {
                    const ranges: TimeRange[] = pairs.filter((p) => p.from && p.to).map((p) => ({ from: p.from!, to: p.to! }));
                    write({ kind: "time" }, ranges.length > 0 ? { kind: "time", ranges } : null);
                }}
                onClose={onClose} />
        );
    }

    return (
        <ValueRangeEditor anchor={editor}
            ranges={predicateOfKind(stages, { kind: "axis", axisId: editor.axisId }, "axisValue")?.ranges ?? []}
            values={ax.computedValues.get(editor.axisId)}
            onCommit={(ranges) => write({ kind: "axis", axisId: editor.axisId }, ranges ? { kind: "axisValue", axisId: editor.axisId, ranges } : null)}
            onClose={onClose} />
    );
}

/** 계산 축 값 구간의 정밀 입력 — 비운 쪽은 끝까지(반열림). 앵커가 아니라 **수치**로 굳는다. */
function ValueRangeEditor({ anchor, ranges, values, onCommit, onClose }: {
    anchor: { x: number; y: number };
    ranges: readonly AxisValueRange[];
    values: Map<string, number> | undefined;
    onCommit: (ranges: AxisValueRange[] | null) => void;
    onClose: () => void;
}): JSX.Element {
    const text = (b: AxisValueRange["from"]): string => {
        if (!b) return "";
        return b.kind === "value" ? String(b.value) : String(values?.get(b.point) ?? "");
    };
    return (
        <RangeTextEditor
            anchor={anchor} title="값 구간" hint="비운 쪽 = 끝까지 · 앵커 대신 수치로 굳습니다"
            placeholders={["이상", "이하"]} allowOpen
            parse={(raw) => (Number.isFinite(Number(raw.trim())) && raw.trim() !== "" ? String(Number(raw.trim())) : null)}
            rows={ranges.map((r) => ({ from: text(r.from), to: text(r.to) }))}
            onCommit={(pairs) => {
                const out: AxisValueRange[] = [];
                for (const p of pairs) {
                    const from = p.from === null ? undefined : ({ kind: "value", value: Number(p.from) } as const);
                    const to = p.to === null ? undefined : ({ kind: "value", value: Number(p.to) } as const);
                    if (from || to) out.push({ from, to });
                }
                onCommit(out.length > 0 ? out : null);
            }}
            onClose={onClose}
        />
    );
}
