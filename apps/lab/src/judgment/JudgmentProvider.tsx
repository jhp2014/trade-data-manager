// 판단 저장소 주입 — 시장 데이터(MarketProvider)와 같은 결. 구현(지금은 임시 서버)은 App 이 넣는다.
import { createContext, useContext, type ReactNode } from "react";
import type { JudgmentStore } from "./ports.js";

const Ctx = createContext<JudgmentStore | null>(null);

export function JudgmentProvider({ store, children }: { store: JudgmentStore; children: ReactNode }): JSX.Element {
    return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useJudgment(): JudgmentStore {
    const s = useContext(Ctx);
    if (!s) throw new Error("JudgmentProvider 밖에서 판단 저장소를 썼다");
    return s;
}
