import { useEffect } from "react";
import { chordOf } from "./keys.js";
import { resolveCommand } from "./registry.js";

// SELECT 도 편집 취급 — 셀렉트는 글자 타이핑(typeahead)으로 옵션을 고르므로, 수식키 없는 단축키
// (w/s/tab/? 등)가 가로채면 타이핑 선택이 죽는다. (export 는 테스트용)
export function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
}

// 활성화 키(Space/Enter)는 포커스된 컨트롤의 것 — 버튼은 클릭 뒤에도 포커스가 남으므로, 헤더 버튼을 누른 다음
// Space 가 전역 커맨드(타점 저장/삭제 = 쓰기)로 새어 나갔다. 버튼을 "편집"으로 치면 a/d/w/s 까지 죽으니
// 활성화 키 두 개만 양보한다. (export 는 테스트용)
const ACTIVATION_CHORDS = new Set(["space", "enter"]);
const ACTIVATABLE_ROLES = new Set(["button", "checkbox", "radio", "switch", "tab", "menuitem", "option", "link"]);
export function claimsActivation(target: EventTarget | null, chord: string): boolean {
    if (!ACTIVATION_CHORDS.has(chord)) return false;
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "SUMMARY") return true;
    const role = el.getAttribute?.("role");
    return !!role && ACTIVATABLE_ROLES.has(role);
}

// 전역 단축키 디스패처 — App 최상단에 1회만 마운트한다. keydown 리스너 하나로 레지스트리(정적+동적)를 구동.
// 패널마다 useEffect(keydown) 를 흩뿌리지 않기 위한 단일 진입점.
export function useKeymap(): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const chord = chordOf(e);
            const cmd = resolveCommand(chord);
            if (!cmd) return;
            // 입력창 포커스 중엔 수식키 없는 단축키(= 타이핑)를 가로채지 않는다.
            // blockedInInput 커맨드는 수식키가 있어도 입력창에선 양보(ctrl+a 전체선택 등 기본동작 보존).
            const hasMod = e.ctrlKey || e.metaKey || e.altKey;
            if (isEditable(e.target) && (cmd.blockedInInput || !hasMod)) return;
            if (claimsActivation(e.target, chord)) return;
            e.preventDefault();
            cmd.run?.(e);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
