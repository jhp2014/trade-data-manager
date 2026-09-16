// 그룹 생성 흐름 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 필터가 된다.
// scope(질문의 층위)는 **입구가 정한다**(＋조건 "그룹 (하루)"/"그룹 (타점)") — 열 때 받아 커밋에 싣는다.
import { useRef, useState } from "react";
import type { GroupExpr } from "../rank/groupFilter.js";
import type { GroupEditorAnchor } from "./ConditionEditors.js";
import type { FilterPredicate, Grain } from "./stage.js";

/**
 * ⚠ ref 가드: Escape 한 번에 input 핸들러와 팝오버 dismiss 가 **둘 다** close 를 부른다 —
 * 같은 이벤트 안이라 state 는 아직 그대로여서, 가드 없이는 draft 가 두 번 커밋돼 필터가 복제된다.
 */
export function useGroupCreateFlow(
    addStage: (predicates?: FilterPredicate[]) => void,
    setEditor: (e: GroupEditorAnchor | null) => void,
): {
    draft: GroupExpr;
    setDraft: (e: GroupExpr) => void;
    open: (scope: Grain, x: number, y: number) => void;
    close: () => void;
} {
    const [draft, setDraft] = useState<GroupExpr>({ groups: [] }); // 그룹 생성 흐름의 임시 식
    const scopeRef = useRef<Grain>("day"); // 이번 생성의 층위 — open 이 정하고 close 의 커밋이 쓴다
    const draftCommitted = useRef(false);
    const close = (): void => {
        if (!draftCommitted.current && draft.groups.length > 0) {
            draftCommitted.current = true;
            addStage([{ kind: "group", expr: draft, scope: scopeRef.current }]);
        }
        setDraft({ groups: [] });
        setEditor(null);
    };
    const open = (scope: Grain, x: number, y: number): void => {
        scopeRef.current = scope;
        setDraft({ groups: [] });
        draftCommitted.current = false;
        setEditor({ scope, x, y });
    };
    return { draft, setDraft, open, close };
}
