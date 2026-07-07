import type { Command, Scope } from "./types.js";
import { canonicalChord } from "./keys.js";
import { useUi } from "../store/ui.js";
import { useDock, PRESET_COUNT } from "../store/dock.js";
import { useKeymapDynamic } from "./dynamic.js";

// 정적 단축키(전역, 데이터 비결합). 새 전역 단축키는 여기 한 줄 추가하면 디스패치·도움말에 동시 반영.
// 데이터 결합형(차트 타점 등)은 소유 훅이 useKeymapDynamic 로 동적 등록한다.
const appCommands: Command[] = [
    { id: "app.settings", title: "설정 열기", category: "일반", keys: "ctrl+,", run: () => useUi.getState().openSettings() },
    { id: "app.shortcuts", title: "단축키 도움말", category: "일반", keys: "?", run: () => useUi.getState().openSettings("shortcuts") },
];
// 레이아웃 프리셋 전환 — Ctrl+1..N. 저장은 설정 → 레이아웃 화면.
const presetCommands: Command[] = Array.from({ length: PRESET_COUNT }, (_, i) => ({
    id: `layout.preset.${i + 1}`,
    title: `화면 ${i + 1}로 전환`,
    category: "레이아웃",
    keys: `ctrl+${i + 1}`,
    run: () => useDock.getState().loadPreset(i + 1),
}));
const staticRaw: Command[] = [...appCommands, ...presetCommands];

export const staticCommands: Command[] = staticRaw.map((c) => ({ ...c, keys: canonicalChord(c.keys) }));

// 정적 + 동적(런타임 등록) 합본 — 도움말·디스패치 공용.
export function allCommands(): Command[] {
    return [...staticCommands, ...Object.values(useKeymapDynamic.getState().commands)];
}

// chord → 발동 커맨드. 전역이 기본. 같은 키에 scope 커맨드가 있고 그 scope 가 활성이면 전역보다 우선(덧씌우기).
export function resolveCommand(chord: string, activeScope: Scope): Command | undefined {
    const matches = allCommands().filter((c) => c.run && c.keys === chord);
    return (
        matches.find((c) => (c.scope ?? "global") !== "global" && c.scope === activeScope) ??
        matches.find((c) => (c.scope ?? "global") === "global")
    );
}

export interface CommandGroup {
    category: string;
    items: Command[];
}

// 도움말용 — 주어진 목록을 카테고리별로 그룹(등록 순서 유지).
export function commandsByCategory(list: Command[]): CommandGroup[] {
    const groups = new Map<string, Command[]>();
    for (const c of list) {
        const arr = groups.get(c.category);
        if (arr) arr.push(c);
        else groups.set(c.category, [c]);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
}
