// 판단 저장소 어댑터 — 임시 판단 서버(trade-lab/server/judgment, Vite dev 서버의 /judgment/*)에 붙는다.
// tdm 이 이력을 내려 주게 되면 이 파일만 바꾼다(패널은 ports.ts 만 안다).
import type { JudgmentStore } from "./ports.js";
import type { Coverage, StockHistory } from "./types.js";

const q = (date: string): string => `?date=${encodeURIComponent(date)}`;

/** 서버의 { error } 를 메시지로(없으면 상태 코드). */
async function failure(res: Response, what: string): Promise<Error> {
    let msg = "";
    try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body?.error === "string") msg = body.error;
    } catch {
        // 본문이 JSON 이 아니다 — 상태 코드로.
    }
    return new Error(msg || `${what} 실패 (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`);
}

export const judgmentServer: JudgmentStore = {
    async historyThemes(date, signal) {
        const res = await fetch(`/judgment/history/themes${q(date)}`, { signal });
        if (!res.ok) throw await failure(res, "이력 테마 읽기");
        const body = (await res.json()) as { stocks?: unknown; coverage?: Coverage | null };
        if (!body?.stocks || typeof body.stocks !== "object") throw new Error("판단 서버 응답에 stocks 가 없다");
        return { themes: new Map(Object.entries(body.stocks as Record<string, string[]>)), coverage: body.coverage ?? null };
    },

    async stockHistory(code, date, signal) {
        const res = await fetch(`/judgment/history/stocks/${encodeURIComponent(code)}${q(date)}`, { signal });
        if (res.status === 404) return null;
        if (!res.ok) throw await failure(res, "종목 이력 읽기");
        return (await res.json()) as StockHistory;
    },
};
