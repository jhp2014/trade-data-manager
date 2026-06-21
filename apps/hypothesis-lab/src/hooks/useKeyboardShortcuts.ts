"use client";

import { useEffect, useRef } from "react";

/**
 * 전역 단축키 한 개의 선언.
 * 새 단축키는 이 타입의 객체를 목록에 추가하기만 하면 된다.
 */
export type Shortcut = {
    /** e.key(대소문자 무시). 스페이스는 " "/"space" 둘 다 허용. */
    key: string;
    /** Ctrl 또는 Cmd(Meta) 동시 누름이 필요한가. 기본 false. */
    ctrl?: boolean;
    /** Shift 동시 누름이 필요한가. 기본 false. */
    shift?: boolean;
    /** Alt 동시 누름이 필요한가. 기본 false. */
    alt?: boolean;
    /** 입력 필드(input/textarea/select/contentEditable) 포커스 중에도 동작. 기본 false. */
    allowInInput?: boolean;
    /** 동작. preventDefault 가 필요하면 핸들러에서 직접 호출. */
    handler: (e: KeyboardEvent) => void;
};

function isTypingTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function normKey(key: string): string {
    const k = key.toLowerCase();
    return k === " " || k === "spacebar" ? "space" : k;
}

/**
 * 선언형 전역 키보드 단축키. window 에 단일 keydown 리스너만 등록하고,
 * 목록은 ref 로 최신값을 참조해 매 렌더 새 배열이어도 재등록하지 않는다.
 * 입력 중 무시·수식키 매칭을 일괄 처리해, 호출부는 목록에 항목만 추가하면 된다.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true): void {
    const ref = useRef(shortcuts);
    ref.current = shortcuts;
    useEffect(() => {
        if (!enabled) return;
        function onKey(e: KeyboardEvent) {
            const key = normKey(e.key);
            const typing = isTypingTarget(e.target);
            const ctrl = e.ctrlKey || e.metaKey;
            for (const s of ref.current) {
                if (normKey(s.key) !== key) continue;
                if (!!s.ctrl !== ctrl) continue;
                if (!!s.shift !== e.shiftKey) continue;
                if (!!s.alt !== e.altKey) continue;
                if (typing && !s.allowInInput) continue;
                s.handler(e);
                return;
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [enabled]);
}
