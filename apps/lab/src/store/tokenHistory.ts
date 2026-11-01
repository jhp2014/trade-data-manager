// 토큰 기록 — 붙여넣은 상태 토큰을 최신순으로 모은다(최대 50). Tab 판(shell/TokenHistory)에서 골라 그 토큰을 다시 연다.
// 탐색 기록(store/history — 종목·날짜 한 줄, 선 없음)과 따로 둔다: 같은 차트라도 선이 다르면 다른 줄이어야
// (AI 초안 토큰과 사용자가 고친 토큰이 둘 다 남게) 한 줄의 열쇠가 **토큰 글자 그대로**다.
// 쌓이는 때는 붙여넣기뿐 — 「토큰 복사」로 만든 것은 안 쌓는다. 다시 연 것은 순서를 바꾸지 않는다(차례로 훑게).
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface TokenEntry {
    /** 붙여넣은 글에 적힌 토큰 글자 그대로. */
    token: string;
    /** 마지막으로 붙여넣은 epoch ms. */
    at: number;
}

export const MAX_TOKENS = 50;

interface TokenHistoryState {
    entries: TokenEntry[];
    /** 붙여넣은 토큰들 — 글 속 순서대로 맨 위부터. 이미 있던 글자는 그 줄이 맨 위로 온다. */
    push: (tokens: readonly string[]) => void;
    remove: (token: string) => void;
    /** 전부 지운다(판의 「전체 지우기」 — 확인 줄을 거친다). */
    clear: () => void;
}

export const useTokenHistory = create<TokenHistoryState>()(
    persist(
        (set) => ({
            entries: [],
            push: (tokens) =>
                set((st) => {
                    if (tokens.length === 0) return st;
                    const fresh = [...new Set(tokens)];
                    const at = Date.now();
                    const rest = st.entries.filter((e) => !fresh.includes(e.token));
                    return { entries: [...fresh.map((token) => ({ token, at })), ...rest].slice(0, MAX_TOKENS) };
                }),
            remove: (token) => set((st) => ({ entries: st.entries.filter((e) => e.token !== token) })),
            clear: () => set({ entries: [] }),
        }),
        {
            name: "trade-lab.token-history",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ entries: st.entries }),
        },
    ),
);
