// 조건의 정밀 입력 팝오버들 — **1차원 조건의 유일한 편집면**(2026-09-19 레일 패널 철거).
// 날짜·시간·축 값·그룹이 전부 편성 보드에서 이 팝오버로 열린다. 쓰기는 한 줄(applyFilterRail)을 지난다.
//
// ⚠ 레일 패널을 지우면서 **분포는 같이 안 지웠다** — rail/Rail.tsx 머리가 적어 둔 이유가 여전히
// 참이기 때문이다: "숫자를 입력하려면 그 축의 분포를 이미 알아야 한다(5% 위가 상위 3건인지 300건인지)".
// 그래서 축 값 편집기 안에 **미니 분포 스트립**을 둔다(rail/railHistogram 재사용 — 판이 사라졌을 뿐
// 세는 규칙은 그대로다). 지운 것은 패널과 원격 배선이지 분포가 아니다.
import { useMemo } from "react";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { binOverlaps, histogramOf, logHeight } from "./rail/railHistogram.js";
import { FILTER } from "../../styles/palette.js";
import { parseDate, parseTime, shortDate } from "../../lib/date.js";
import type { GroupExpr } from "../rank/groupFilter.js";
import { GroupFilterEditor } from "./GroupFilterEditor.js";
import { RangeTextEditor } from "./RangeTextEditor.js";
import { predicateOfKind, type RailKey } from "./stageBinding.js";
import type { AxisValueRange, DateRange, FilterPredicate, FilterStage, Grain, TimeRange } from "./stage.js";

/** 레일 줄에서 여는 편집기 하나 — null 이면 아무 팝오버도 없다.
 *  날짜/시간을 한 멤버("date" | "time")로 접지 않는 이유: kind 가 합집합인 멤버는 판별 검사로
 *  갈래가 안 좁혀져, 마지막 갈래(axisValue)가 타입상 담판이 안 난다. */
/**
 * 1차원 조건 편집면의 앵커.
 *
 * ⚠ `stageId` 가 **이 판이 고치는 줄**이다(없으면 = 새로 만든다). 옛 레일 1:1 시절엔 "그 레일의 첫
 * 잎"으로 찾아도 잎이 레일당 하나뿐이라 같은 말이었지만, 트리에서는 `날짜A ∨ 날짜B` 가 정상이라
 * 그 규칙이 **B 를 열고 고쳤는데 A 가 바뀌는** 물건이 된다(2026-09-19 재설계가 1:1 을 폐기한 자리).
 */
export type RailEditor =
    | { kind: "date"; stageId?: string; x: number; y: number }
    | { kind: "time"; stageId?: string; x: number; y: number }
    | { kind: "axisValue"; axisId: string; stageId?: string; x: number; y: number };

/** 그룹 팔레트 — 편집(stageId 있음)과 생성(draft)이 같은 팝오버를 쓴다.
 *  scope 를 든다(2026-09-16): 술어 payload 와 같은 값 — 편집이면 그 술어의 scope, 생성이면 입구가
 *  정한 것. 팔레트의 목록(point = 타점 그룹만)과 커밋 시 보존이 이 값을 쓴다. */
export type GroupEditorAnchor = { stageId?: string; scope: Grain; x: number; y: number };

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
        ? <GroupFilterEditor anchor={editor} scope={editor.scope}
            expr={(editingStage.predicates.find((p) => p.kind === "group") as Extract<FilterPredicate, { kind: "group" }> | undefined)?.expr ?? { groups: [] }}
            onChange={(next) => {
                // 식을 다 비우면 조건이 없어진 것 — 빈 필터를 남기지 않는다(레일에서 구간을 다 지운 것과 같다).
                if (next.groups.length === 0) { removeStage(editor.stageId!); onClose(); return; }
                // scope 보존 — 빠뜨리면 편집 한 번에 point 조건이 day 로 되돌아간다(조용한 손실).
                setPredicates(editor.stageId!, [{ kind: "group", expr: next, scope: editor.scope }]);
            }}
            onClose={onClose} />
        : <GroupFilterEditor anchor={editor} scope={editor.scope} expr={draft} onChange={onDraftChange} onClose={onCloseCreate} />;
}

export function RailEditors({ editor, stages, write, onClose }: {
    editor: RailEditor | null;
    stages: readonly FilterStage[];
    /** 조건 쓰기 — 전부 이 한 줄을 지난다. 두 번째 인자의 `stageId` 가 고칠 줄(없으면 새로 만든다). */
    write: (key: RailKey, predicate: FilterPredicate | null, stageId?: string) => void;
    onClose: () => void;
}): JSX.Element | null {
    // 축 재료는 Provider 에서 직접 — 부모가 넘겨주지 않는다(어차피 같은 한 벌이라 넘길 이유가 없다).
    const ax = useRankAxes();

    if (editor === null) return null;

    /** 이 판이 읽는 값 — **짚은 줄의 것**이다. 새로 만드는 중이면 빈 값에서 시작한다. */
    const src = editor.stageId === undefined ? [] : stages.filter((s) => s.id === editor.stageId);

    if (editor.kind === "date") {
        return (
            <RangeTextEditor anchor={editor} title="날짜 구간" placeholders={["26.07.01", "26.07.31"]} parse={parseDate}
                rows={(predicateOfKind(src, { kind: "date" }, "date")?.ranges ?? [])
                    .map((r) => ({ from: shortDate(r.from), to: shortDate(r.to) }))}
                onCommit={(pairs) => {
                    const ranges: DateRange[] = pairs.filter((p) => p.from && p.to).map((p) => ({ from: p.from!, to: p.to! }));
                    write({ kind: "date" }, ranges.length > 0 ? { kind: "date", ranges } : null, editor.stageId);
                }}
                onClose={onClose} />
        );
    }

    if (editor.kind === "time") {
        return (
            <RangeTextEditor anchor={editor} title="시간 구간" placeholders={["09:00", "10:30"]} parse={parseTime}
                rows={(predicateOfKind(src, { kind: "time" }, "time")?.ranges ?? [])
                    .map((r) => ({ from: r.from, to: r.to }))}
                onCommit={(pairs) => {
                    const ranges: TimeRange[] = pairs.filter((p) => p.from && p.to).map((p) => ({ from: p.from!, to: p.to! }));
                    write({ kind: "time" }, ranges.length > 0 ? { kind: "time", ranges } : null, editor.stageId);
                }}
                onClose={onClose} />
        );
    }

    return (
        <ValueRangeEditor anchor={editor}
            ranges={predicateOfKind(src, { kind: "axis", axisId: editor.axisId }, "axisValue")?.ranges ?? []}
            values={ax.computedValues.get(editor.axisId)}
            onCommit={(ranges) => write({ kind: "axis", axisId: editor.axisId }, ranges ? { kind: "axisValue", axisId: editor.axisId, ranges } : null, editor.stageId)}
            onClose={onClose} />
    );
}

/** 미니 분포 스트립의 칸 수 — 팝오버 폭(≈300px)에서 칸당 ~5px. 레일(100칸)보다 성긴 건 폭이 좁아서다. */
const MINI_BINS = 60;

/**
 * 축 값 분포 — 이 축에 값이 있는 행들을 균등 칸으로 세고, 지금 컷에 걸리는 칸을 물들인다.
 * 레일의 펼침 분포를 팝오버 크기로 줄인 것이고, 세는 규칙(로그 높이·칸 겹침 판정)은 **같은 모듈**을
 * 쓴다 — 두 화면이 같은 분포를 다르게 그리면 "어느 쪽이 맞나"가 생긴다.
 *
 * 도메인은 값의 [최소, 최대] 다. 값이 둘 미만이거나 전부 같으면 안 그린다 — 폭 0 도메인에서 프랙션이
 * 정의되지 않고, 그림이 말할 것도 없다.
 */
function ValueDistribution({ values, ranges }: {
    values: Map<string, number> | undefined;
    ranges: readonly AxisValueRange[];
}): JSX.Element | null {
    const dist = useMemo(() => {
        if (!values || values.size < 2) return null;
        let min = Infinity;
        let max = -Infinity;
        for (const v of values.values()) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
        const span = max - min;
        const ticks: number[] = [];
        for (const v of values.values()) ticks.push((v - min) / span);
        // 컷 구간을 프랙션으로 — 비운 쪽은 끝까지(반열림)라 0/1 로 연다. 앵커 경계는 수치가 없어 못 그린다.
        const cuts: { lo: number; hi: number }[] = [];
        for (const r of ranges) {
            if (!r.from && !r.to) continue;
            const lo = r.from?.kind === "value" ? (r.from.value - min) / span : 0;
            const hi = r.to?.kind === "value" ? (r.to.value - min) / span : 1;
            cuts.push({ lo, hi });
        }
        return { hist: histogramOf(ticks, undefined, MINI_BINS), min, max, cuts, total: ticks.length };
    }, [values, ranges]);

    if (dist === null) return null;
    const { hist, min, max, cuts, total } = dist;
    return (
        <div style={{ padding: "2px 10px 6px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 30 }}>
                {hist.bins.map((b, i) => {
                    // 컷이 없으면 전부 "걸린다"(조건 없음 = 제한 없음) — 회색과 빨강이 뒤집혀 보이지 않게.
                    const inCut = cuts.length === 0 || cuts.some((c) => binOverlaps(i, c.lo, c.hi, MINI_BINS));
                    return (
                        <div key={i} title={`${b.count.toLocaleString("ko-KR")}건`}
                            style={{
                                flex: 1, minWidth: 0,
                                height: `${b.count > 0 ? Math.max(8, logHeight(b.count, hist.max) * 100) : 0}%`,
                                background: inCut ? FILTER : "var(--border-default)",
                                opacity: inCut ? 0.75 : 1,
                            }} />
                    );
                })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--text-tertiary)", paddingTop: 2 }}>
                <span>{min.toLocaleString("ko-KR")}</span>
                <span>값 있는 행 {total.toLocaleString("ko-KR")}</span>
                <span>{max.toLocaleString("ko-KR")}</span>
            </div>
        </div>
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
            above={<ValueDistribution values={values} ranges={ranges} />}
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
