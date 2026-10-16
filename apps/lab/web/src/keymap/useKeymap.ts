import { useEffect } from "react";
import { chordOf, claimsActivation, isEditable } from "./keys.js";
import { resolveCommand } from "./registry.js";
import { useUi } from "../store/ui.js";

// 전역 단축키 디스패처 — App 최상단에 1회만 마운트한다. keydown 리스너 하나로 레지스트리(정적+동적)를 구동.
// 패널마다 useEffect(keydown) 를 흩뿌리지 않기 위한 단일 진입점. workbench keymap/useKeymap.ts.
export function useKeymap(): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const chord = chordOf(e);
            const cmd = resolveCommand(chord);
            if (!cmd) return;
            // 입력창 포커스 중엔 수식키 없는 단축키(= 타이핑)를 가로채지 않는다.
            const hasMod = e.ctrlKey || e.metaKey || e.altKey;
            if (isEditable(e.target) && !hasMod) return;
            if (claimsActivation(e.target, chord)) return;
            e.preventDefault();
            if (e.repeat && !cmd.repeat) return; // 누르고 있기 — 반복을 허용한 커맨드(a/d)만
            if (useUi.getState().settingsOpen && !cmd.inDialog) return; // 창이 열려 있으면 창의 것(설정·도움말)만
            cmd.run(e);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
