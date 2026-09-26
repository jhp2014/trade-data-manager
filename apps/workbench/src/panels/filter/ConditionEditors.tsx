// 조건의 정밀 입력 팝오버 — 2026-09-26 종단 폐기로 **시각 하나** 남았다(날짜·축 값·그룹 편집기 은퇴).
// 쓰기는 한 줄(applyFilterRail)을 지난다.
import { parseTime } from "../../lib/date.js";
import { RangeTextEditor } from "./RangeTextEditor.js";
import { predicateOfKind, type RailKey } from "./stageBinding.js";
import type { FilterPredicate, FilterStage, TimeRange } from "./stage.js";

/**
 * 시각 편집면의 앵커 — `stageId` 가 **이 판이 고치는 줄**이다(없으면 = 새로 만든다).
 * 트리에서는 `시각A ∨ 시각B` 가 정상이라 "그 종류의 첫 잎" 규칙은 B 를 열고 고쳤는데 A 가 바뀌는
 * 물건이 된다(2026-09-19 재설계가 1:1 을 폐기한 자리).
 */
export type RailEditor = { kind: "time"; stageId?: string; x: number; y: number };

export function RailEditors({ editor, stages, write, onClose }: {
    editor: RailEditor | null;
    stages: readonly FilterStage[];
    /** 조건 쓰기 — 전부 이 한 줄을 지난다. 두 번째 인자의 `stageId` 가 고칠 줄(없으면 새로 만든다). */
    write: (key: RailKey, predicate: FilterPredicate | null, stageId?: string) => void;
    onClose: () => void;
}): JSX.Element | null {
    if (editor === null) return null;

    /** 이 판이 읽는 값 — **짚은 줄의 것**이다. 새로 만드는 중이면 빈 값에서 시작한다. */
    const src = editor.stageId === undefined ? [] : stages.filter((s) => s.id === editor.stageId);

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
