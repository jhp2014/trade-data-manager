import { create } from "zustand";
import type { Command } from "./types.js";
import { canonicalChord } from "./keys.js";

// 런타임 등록 커맨드 — react-query 뮤테이션·컴포넌트 상태에 묶인 핸들러(차트 타점 등)를
// 소유 훅이 mount 동안 중앙 레지스트리에 얹는다(정적 배열엔 로직을 끌어올릴 수 없으므로).
// 정적 커맨드와 합쳐 디스패치·도움말에 함께 쓰인다. 스토어라 도움말 뷰가 등록 변화에 반응한다.
interface KeymapDynamic {
    commands: Record<string, Command>; // id → command
    register: (cmd: Command) => void;
    unregister: (id: string) => void;
}

export const useKeymapDynamic = create<KeymapDynamic>((set) => ({
    commands: {},
    register: (cmd) =>
        set((s) => ({ commands: { ...s.commands, [cmd.id]: { ...cmd, keys: canonicalChord(cmd.keys) } } })),
    unregister: (id) =>
        set((s) => {
            if (!(id in s.commands)) return s;
            const next = { ...s.commands };
            delete next[id];
            return { commands: next };
        }),
}));
