import { useEffect } from "react";

/**
 * Ctrl/Cmd + C 로 현재 선택된 Case 의 caseId 를 복사한다.
 * 단, input/textarea/contentEditable 에 포커스가 있거나 사용자가 텍스트를 선택한
 * 상태면 브라우저 기본 복사를 방해하지 않는다.
 */
export function useSelectedCaseCopyShortcut(caseId: string | null, onCopied?: () => void) {
    useEffect(() => {
        if (!caseId) return;
        function onKeyDown(e: KeyboardEvent) {
            if (!(e.ctrlKey || e.metaKey) || (e.key !== "c" && e.key !== "C")) return;

            const el = document.activeElement as HTMLElement | null;
            const tag = el?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
            if ((window.getSelection?.()?.toString().length ?? 0) > 0) return;

            void navigator.clipboard.writeText(caseId as string);
            onCopied?.();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [caseId, onCopied]);
}
