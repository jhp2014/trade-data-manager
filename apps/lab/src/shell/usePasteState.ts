// 토큰 붙여넣기 — 입력칸 밖에서 Ctrl+V 하면 클립보드의 첫 토큰으로 활성 경로를 덮는다(DESIGN 9절 「토큰 붙여넣기」).
// 일봉 상태(`종목@날짜@선▲▼…`) · `종목@날짜` · `종목@날짜 HH:MM` 을 읽는다. 토큰이 없으면 아무것도 안 한다.
// 글 속 토큰은 전부 토큰 기록(store/tokenHistory)에 쌓인다 — 화면은 첫 토큰만 연다.
import { useEffect } from "react";
import { isEditable } from "../keymap/keys.js";
import { findStateTokens, parseStateToken, type ParsedState } from "../lib/stateToken.js";
import { usePaths } from "../store/paths.js";
import { useTokenHistory } from "../store/tokenHistory.js";

/** 읽은 상태 → 활성 경로(종목·날짜·선·구간, 시각은 토큰에 있으면 그 값). */
function openState(t: ParsedState): void {
    const st = usePaths.getState();
    st.write(st.active, { code: t.code, date: t.date, time: t.time ?? "", lines: t.lines, zone: t.lines.length ? t.zone : null });
}

/** 붙여넣은 글 → 토큰 기록 + 활성 경로(첫 토큰). 읽었으면 true. */
export function pasteState(text: string): boolean {
    const found = findStateTokens(text);
    if (found.length === 0) return false;
    useTokenHistory.getState().push(found.map((f) => f.token));
    openState(found[0].state);
    return true;
}

/** 토큰 기록의 한 줄을 다시 연다 — 붙여넣기와 같은 쓰기, 기록 순서는 그대로. 읽었으면 true. */
export function reopenToken(token: string): boolean {
    const t = parseStateToken(token);
    if (!t) return false;
    openState(t);
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
