// 장중 복기 분류(/replay/day) → 보드 소속 — 그 시각에 보이는 이름표만 종목에 입힌다.
// 이름표 하나가 상위와 「상위/세부」 둘을 준다 — 보드의 포함관계(board/domain themeParents·relatedThemes)가
// 「상위/세부」 카드를 상위 카드 안의 것(포함됨)으로 잇게(계층은 등록하지 않고 멤버 겹침으로 파생한다는 규칙 그대로).
import type { LabReplayDay } from "../market/types.js";

/** 이름표가 보이기 시작하는 때 중 개장 때부터 = 장 전 지식(개장 전 시각에도 보인다). */
const OPEN = "open";

/**
 * time = 보드가 보는 시각(HH:MM) — from 이 "open" 이거나 time 이하인 이름표만. null = 사후 보기(시각 무관 전부 + 이유).
 * notes 는 사후 보기에서만 — 이유(why)는 장 마감까지 보고 쓴 것이라 사후정보다.
 */
export function replayMembership(day: LabReplayDay, time: string | null): { themes: Map<string, string[]>; notes: Map<string, string> | undefined } {
    const themes = new Map<string, string[]>();
    for (const row of day.rows) {
        const out: string[] = [];
        const add = (t: string) => {
            if (!out.includes(t)) out.push(t);
        };
        for (const l of row.labels) {
            if (time !== null && l.from !== OPEN && l.from > time) continue;
            add(l.theme);
            if (l.sub) add(`${l.theme}/${l.sub}`);
        }
        if (out.length) themes.set(row.code, out);
    }
    const notes = time === null ? new Map(day.rows.filter((r) => r.why).map((r) => [r.code, r.why])) : undefined;
    return { themes, notes };
}
