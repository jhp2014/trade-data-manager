import { useEffect } from "react";
import { isValidCaseId } from "@/domain/caseId";

/**
 * Ctrl/Cmd + V 로 클립보드의 caseId 를 탐색한다.
 *  - 입력 요소(input/textarea/contentEditable)에 포커스가 있으면 기본 붙여넣기를 방해하지 않는다.
 *  - 클립보드가 well-formed caseId 가 아니면 무시한다.
 *  - 유효하면 History 에 적재(`onPaste`) 후, 현재 레일에 있으면 그 자리에서, 없으면
 *    History 로 전환해 선택하도록 호출 측(`onPaste`)이 처리한다.
 */
export function usePasteCaseShortcut(onPaste: (caseId: string) => void) {
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (!(e.ctrlKey || e.metaKey) || (e.key !== "v" && e.key !== "V")) return;

            const el = document.activeElement as HTMLElement | null;
            const tag = el?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;

            void navigator.clipboard
                .readText()
                .then((text) => {
                    const caseId = text.trim();
                    if (isValidCaseId(caseId)) onPaste(caseId);
                })
                .catch(() => {
                    /* 클립보드 접근 거부 등은 무시 */
                });
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onPaste]);
}
