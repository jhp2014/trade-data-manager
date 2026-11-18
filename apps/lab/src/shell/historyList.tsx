// 기록 판 두 화면(토큰 기록 · 탐색 기록)이 같이 쓰는 조각 — 판 안 키(w/s · Space)와 흐린 글.
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { chordOf, isEditable } from "../keymap/keys.js";
import { useLatest } from "../lib/useLatest.js";

export const MUTED: CSSProperties = { color: "var(--text-3)" };

/**
 * 판 안 키 — w/s = 고르기(끝에서 멈춤), Space = 열기. 창 캡처 단계에서 먹는다(전역 커맨드보다 먼저). 입력칸·수식키면 쉰다.
 * 판을 연 버튼에 포커스가 남으면 Space 가 그 버튼을 다시 눌러 판을 닫으므로 놓아 준다. 두 화면이 같이 쓴다.
 */
export function useListKeys(count: number, cur: number, move: (i: number) => void, open: (i: number) => void): void {
    const latest = useLatest({ count, cur, move, open });
    useEffect(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && !isEditable(focused)) focused.blur();
        const onKey = (e: KeyboardEvent): void => {
            if (isEditable(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
            const chord = chordOf(e);
            const { count, cur, move, open } = latest.current;
            if (chord === "w" || chord === "s") {
                if (count > 0) move(Math.max(0, Math.min(count - 1, cur + (chord === "w" ? -1 : 1))));
            } else if (chord === "space") {
                if (!e.repeat && count > 0) open(cur);
            } else return;
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [latest]);
}

export function Note({ children, style }: { children: ReactNode; style: CSSProperties }): JSX.Element {
    return <div style={{ ...MUTED, fontSize: 11.5, ...style }}>{children}</div>;
}
