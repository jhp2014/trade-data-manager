import { useEffect } from "react";
import { chordOf } from "./keys.js";
import { dispatchMap } from "./registry.js";
import { useUi } from "../store/ui.js";

function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

// 전역 단축키 디스패처 — App 최상단에 1회만 마운트한다. keydown 리스너 하나로 레지스트리를 구동.
// 패널마다 useEffect(keydown) 를 흩뿌리지 않기 위한 단일 진입점.
export function useKeymap(): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const cmd = dispatchMap.get(chordOf(e));
            if (!cmd) return;
            // 입력창 포커스 중엔 수식키 없는 단축키(= 타이핑)를 가로채지 않는다.
            const hasMod = e.ctrlKey || e.metaKey || e.altKey;
            if (!hasMod && isEditable(e.target)) return;
            // scope: global 은 항상, 그 외는 현재 활성 scope 와 일치할 때만.
            const scope = cmd.scope ?? "global";
            if (scope !== "global" && scope !== useUi.getState().activeScope) return;
            e.preventDefault();
            cmd.run?.(e);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
