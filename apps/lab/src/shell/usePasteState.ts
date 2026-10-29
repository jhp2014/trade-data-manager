// 토큰 붙여넣기 — 입력칸 밖에서 Ctrl+V 하면 클립보드의 첫 토큰으로 활성 경로를 덮는다(DESIGN 9절 「토큰 붙여넣기」).
// 일봉 상태(`종목@날짜@선▲▼…`) · `종목@날짜` · `종목@날짜 HH:MM` 을 읽는다. 토큰이 없으면 아무것도 안 한다.
import { useEffect } from "react";
import { isEditable } from "../keymap/keys.js";
import { parseStateToken } from "../lib/stateToken.js";
import { usePaths } from "../store/paths.js";

/** 붙여넣은 글 → 활성 경로. 읽었으면 true. */
export function pasteState(text: string): boolean {
    const t = parseStateToken(text);
    if (!t) return false;
    const st = usePaths.getState();
    st.write(st.active, { code: t.code, date: t.date, time: t.time ?? "", lines: t.lines, zone: t.lines.length ? t.zone : null });
    return true;
}

export function usePasteState(): void {
    useEffect(() => {
        const onPaste = (e: ClipboardEvent): void => {
            if (isEditable(e.target)) return;
            if (pasteState(e.clipboardData?.getData("text") ?? "")) e.preventDefault();
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, []);
}
