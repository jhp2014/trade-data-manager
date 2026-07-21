import type { Command, Scope } from "./types.js";
import { canonicalChord } from "./keys.js";
import { useUi } from "../store/ui.js";
import { useDock, PRESET_COUNT } from "../store/dock.js";
import { useWorkbench } from "../store/workbench.js";
import { useKeymapDynamic } from "./dynamic.js";

// 화면(프리셋)별 Tab 순환 링 — 링 출처 화면의 링에서 지금 배치에 살아있는 멤버만 골라 setActive 로 순환.
// 링/멤버가 부족하면 false 반환(호출부가 활성그룹 탭 순환으로 폴백). setActive 는 같은그룹 탭전환·타그룹 포커스이동 둘 다 커버.
function cycleTabRing(dir: 1 | -1): boolean {
    const { api, ringSource, rings } = useDock.getState();
    if (!api || ringSource == null) return false;
    const live = (rings[ringSource - 1] ?? []).filter((id) => api.getPanel(id));
    if (live.length < 2) return false;
    const active = api.activePanel?.id;
    const at = active ? live.indexOf(active) : -1;
    const nextIdx = at === -1 ? (dir === 1 ? 0 : live.length - 1) : (at + dir + live.length) % live.length;
    api.getPanel(live[nextIdx])?.api.setActive();
    return true;
}

// 활성 그룹의 탭 순환 — dock api 의 activeGroup.panels 를 dir 로 걷고 setActive. 탭 1개 이하면 무동작.
function cycleActiveGroupTab(dir: 1 | -1): void {
    const group = useDock.getState().api?.activeGroup;
    if (!group) return;
    const panels = group.panels;
    if (panels.length < 2) return;
    const cur = group.activePanel;
    const idx = cur ? panels.indexOf(cur) : 0;
    panels[(idx + dir + panels.length) % panels.length].api.setActive();
}

// Tab 순환 진입점 — 화면 링이 있으면 그걸로, 없으면(미설정·멤버부족) 활성 그룹 탭 순환으로 폴백.
function cycleWindow(dir: 1 | -1): void {
    if (!cycleTabRing(dir)) cycleActiveGroupTab(dir);
}

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
// 창 순환 — Tab/Shift+Tab. 화면별 순환 링(설정 → 레이아웃)이 있으면 그 창들만, 없으면 활성 그룹 탭.
// 입력창 포커스 중엔 디스패처가 양보(수식키 없음).
const dockCommands: Command[] = [
    { id: "dock.tab.next", title: "다음 창(순환 링)", category: "레이아웃", keys: "tab", run: () => cycleWindow(1) },
    { id: "dock.tab.prev", title: "이전 창(순환 링)", category: "레이아웃", keys: "shift+tab", run: () => cycleWindow(-1) },
];
// 최근 탐색 순환 — back/forward 커서 모델(stepHistory). 워크셋 w/s 와 대칭이되 Alt(예약 아님)로.
const historyCommands: Command[] = [
    { id: "history.nav.newer", title: "위로·더 최근(최근 탐색)", category: "탐색", keys: "alt+w", run: () => useWorkbench.getState().stepHistory(-1) },
    { id: "history.nav.older", title: "아래로·더 과거(최근 탐색)", category: "탐색", keys: "alt+s", run: () => useWorkbench.getState().stepHistory(1) },
];
const staticRaw: Command[] = [...appCommands, ...presetCommands, ...dockCommands, ...historyCommands];

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
