// 단축키 목록 — 정적(앱 전역 동작) + 동적(소유 훅이 얹는 것: 화면 번호·차트 시각 이동). workbench keymap/registry.ts 의 틀.
// 커맨드가 유일한 소스다: 디스패처(useKeymap)와 도움말(설정 창)이 모두 이 목록에서 파생한다.
// 커맨드는 전부 전역 — **같은 키를 두 곳에서 등록하지 않는다**(승자가 등록 순서에 매인다).
import type { Command } from "./types.js";
import { canonicalChord } from "./keys.js";
import { useKeymapDynamic } from "./dynamic.js";
import { useUi } from "../store/ui.js";

export const staticCommands: Command[] = (
    [
        { id: "app.settings", title: "설정 열기", category: "일반", keys: "ctrl+,", inDialog: true, run: () => useUi.getState().openSettings() },
        { id: "app.help", title: "단축키 도움말", category: "일반", keys: "?", inDialog: true, run: () => useUi.getState().openSettings("shortcuts") },
    ] satisfies Command[]
).map((c) => ({ ...c, keys: canonicalChord(c.keys) }));

export function allCommands(dynamic: Record<string, Command> = useKeymapDynamic.getState().commands): Command[] {
    return [...staticCommands, ...Object.values(dynamic)];
}

/** chord → 발동 커맨드 — 등록 순(정적 → 동적)의 첫 매치. */
export function resolveCommand(chord: string): Command | undefined {
    return allCommands().find((c) => c.keys === chord);
}

export interface CommandGroup {
    category: string;
    items: Command[];
}

/** 도움말용 — 카테고리별로 묶는다(등록 순서 유지). */
export function commandsByCategory(list: Command[]): CommandGroup[] {
    const groups = new Map<string, Command[]>();
    for (const c of list) {
        const arr = groups.get(c.category);
        if (arr) arr.push(c);
        else groups.set(c.category, [c]);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
}
