// 탐색 기록 — 어느 경로에서든 본 (종목, 날짜)를 최신순으로 모은다(최대 50). 경로 우클릭 판의 「기록」에서 눌러 그 상황으로 돌아간다.
// 경로 store 는 기록을 모른다 — 여기서 경로 변경을 구독해 기록한다(startHistoryRecording).
// 한 (종목, 날짜) = 한 줄. 다시 보면 맨 위로 올라가고, 시각만 바뀌면 자리는 그대로 두고 시각만 갱신한다
// (분봉을 눌러 시각을 옮길 때마다 목록이 출렁이지 않게 — 돌아갈 때는 마지막으로 본 시각으로 간다).
// 기록에서 줄을 눌러 돌아간 것도 순서를 바꾸지 않는다(returnTo) — 목록을 위에서부터 차례로 훑어볼 수 있게.
// 새로 기록되는 것은 경로에 직접 다른 종목·날짜를 넣었을 때뿐이다.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { usePaths, type Situation } from "./paths.js";

export interface Visit {
    code: string;
    date: string;
    /** 마지막으로 본 시각(HH:MM). 없으면 "". */
    time: string;
    /** 마지막 방문 epoch ms. */
    at: number;
}

export const MAX_VISITS = 50;
const keyOf = (v: { code: string; date: string }): string => `${v.code}@${v.date}`;

interface HistoryState {
    visits: Visit[];
    /** (종목, 날짜) 방문 — 맨 위로. */
    visit: (code: string, date: string, time: string) => void;
    /** 같은 (종목, 날짜)의 시각만 갱신 — 자리는 그대로. 기록에 없으면 아무것도 안 한다. */
    touchTime: (code: string, date: string, time: string) => void;
    remove: (code: string, date: string) => void;
}

export const useHistory = create<HistoryState>()(
    persist(
        (set) => ({
            visits: [],
            visit: (code, date, time) =>
                set((st) => {
                    const k = keyOf({ code, date });
                    const rest = st.visits.filter((v) => keyOf(v) !== k);
                    return { visits: [{ code, date, time, at: Date.now() }, ...rest].slice(0, MAX_VISITS) };
                }),
            touchTime: (code, date, time) =>
                set((st) => {
                    const k = keyOf({ code, date });
                    if (!st.visits.some((v) => keyOf(v) === k)) return st;
                    return { visits: st.visits.map((v) => (keyOf(v) === k ? { ...v, time } : v)) };
                }),
            remove: (code, date) => set((st) => ({ visits: st.visits.filter((v) => keyOf(v) !== keyOf({ code, date })) })),
        }),
        {
            name: "trade-lab.history",
            version: 2,
            // v1 → v2: 최대 200 → 50. 넘치는 옛 기록은 오래된 쪽부터 버린다.
            migrate: (persisted) => {
                const st = persisted as { visits?: Visit[] };
                return { visits: (st.visits ?? []).slice(0, MAX_VISITS) } as never;
            },
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ visits: st.visits }),
        },
    ),
);

/** 경로 id → 기록에서 눌러 돌아가는 중인 (종목@날짜). 그 경로가 멈춰 기록될 때 한 번 쓰고 지운다. */
const returning = new Map<string, string>();

/** 기록의 한 줄로 경로를 되돌린다 — 그 줄은 자리를 지킨다(시각만 갱신). */
export function returnTo(pathId: string, v: Pick<Visit, "code" | "date" | "time">): void {
    returning.set(pathId, keyOf(v));
    usePaths.getState().write(pathId, { code: v.code, date: v.date, time: v.time });
}

/** 경로 하나의 바뀜 → 기록. 종목·날짜가 다 있을 때만. back = 기록에서 눌러 돌아온 것(순서 유지). */
export function recordChange(prev: Situation | undefined, next: Situation, back = false): void {
    if (!next.code || !next.date) return;
    const h = useHistory.getState();
    const moved = !prev || prev.code !== next.code || prev.date !== next.date;
    if (moved && !back) h.visit(next.code, next.date, next.time);
    else if (moved || prev.time !== next.time) h.touchTime(next.code, next.date, next.time);
}

/** 경로가 이만큼 멈춰 있어야 기록한다 — a/d 를 연달아 누르거나 목록·차트를 빠르게 훑을 때 지나간 중간 상황(새 종목, 옛 날짜 같은)을 남기지 않게. */
export const SETTLE_MS = 800;

/** 경로 변경을 구독해 기록을 시작한다. 앱 시작 때 한 번 — 해제 함수를 돌려준다. */
export function startHistoryRecording(): () => void {
    // 경로마다 "마지막으로 기록한 상황"과 대기 중인 타이머. 시작 시점의 상황은 기록된 것으로 친다.
    const recorded = new Map(usePaths.getState().paths.map((p) => [p.id, p.s]));
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsub = usePaths.subscribe((st, prevSt) => {
        if (st.paths === prevSt.paths) return;
        for (const p of st.paths) {
            if (prevSt.paths.find((q) => q.id === p.id)?.s === p.s) continue;
            clearTimeout(timers.get(p.id));
            timers.set(
                p.id,
                setTimeout(() => {
                    timers.delete(p.id);
                    const now = usePaths.getState().paths.find((q) => q.id === p.id)?.s;
                    const back = returning.get(p.id);
                    returning.delete(p.id);
                    if (!now) return;
                    recordChange(recorded.get(p.id), now, back === keyOf(now));
                    recorded.set(p.id, now);
                }, SETTLE_MS),
            );
        }
    });
    return () => {
        unsub();
        timers.forEach(clearTimeout);
    };
}
