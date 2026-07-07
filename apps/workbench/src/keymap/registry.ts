import type { Command } from "./types.js";
import { canonicalChord } from "./keys.js";
import { useUi } from "../store/ui.js";

// 단축키 단일 소스. 새 단축키는 여기에 커맨드 하나 추가하면 디스패처·도움말에 동시 반영된다.
//  - run 있는 항목만 디스패치. run 없는 항목은 문서 전용(실동작은 패널 훅이 소유).
//  - "1~9" 같이 표시용 키는 canonical 매칭이 아니라 도움말에만 나온다.
const raw: Command[] = [
    { id: "app.settings", title: "설정 열기", category: "일반", keys: "ctrl+,", run: () => useUi.getState().openSettings() },
    { id: "app.shortcuts", title: "단축키 도움말", category: "일반", keys: "?", run: () => useUi.getState().openSettings("shortcuts") },
    // 아래 둘은 chartHooks.useReviewPointHotkeys 가 소유(도움말 완전성 위해 등록만). 후속 벽돌에서 이관.
    { id: "chart.reviewToggle", title: "타점 저장/삭제(현재 시각)", category: "차트", keys: "space", scope: "chart" },
    { id: "chart.reviewType", title: "타점 셋업 유형 입력(프리셋)", category: "차트", keys: "1~9", scope: "chart" },
];

export const commands: Command[] = raw.map((c) => ({ ...c, keys: canonicalChord(c.keys) }));

// 디스패치용 chord → 커맨드 조회(run 있는 것만).
export const dispatchMap: ReadonlyMap<string, Command> = new Map(
    commands.filter((c) => c.run).map((c) => [c.keys, c] as const),
);

export interface CommandGroup {
    category: string;
    items: Command[];
}

// 도움말용 — 카테고리별 그룹(등록 순서 유지).
export function commandsByCategory(): CommandGroup[] {
    const groups = new Map<string, Command[]>();
    for (const c of commands) {
        const arr = groups.get(c.category);
        if (arr) arr.push(c);
        else groups.set(c.category, [c]);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
}
