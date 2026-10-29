// 시장 데이터 창구의 api 구현 — 시장은 전부 읽기(GET), 쓰기는 lab 저장 선(/chart-lines POST·DELETE — lab-api 의 파일)뿐.
import { apiGet, apiSend } from "./http.js";
import type { Market } from "./ports.js";
import type { DayFlow, HtsNewsItem, LabChartLine, LabDailyCandle, LabMinuteDay, StockMeta, StockMoves, TelegramArchivePage } from "./types.js";

export const tdmMarket: Market = {
    daily: (code, from, to, signal) => apiGet<LabDailyCandle[]>("daily", { code, from, to }, signal),
    minutes: (code, date, signal) => apiGet<LabMinuteDay>("minutes", { code, date }, signal),
    chartLines: (code, date, signal) => apiGet<LabChartLine[]>("chart-lines", { code, date }, signal),
    saveChartLine: (code, line) => apiSend<LabChartLine[]>("POST", "chart-lines", { code, line }),
    deleteChartLine: (code, line) => apiSend<LabChartLine[]>("DELETE", "chart-lines", { code, line }),
    stockMaster: (signal) => apiGet<StockMeta[]>("stocks/master", undefined, signal),
    tradingDays: (signal) => apiGet<string[]>("dates", undefined, signal),
    // lab 전용 계약(/day-flow, lab-api) — 쓰는 필드만 와서 slimming 이 필요 없다(옛 /day-replay 는 받자마자 깎았다).
    dayFlow: (date, signal) => apiGet<DayFlow>("day-flow", { date }, signal),
    stockMoves: (code, asOf, signal) => apiGet<StockMoves>(`theme/stocks/${code}`, asOf ? { asOf } : undefined, signal),
    htsNews: ({ code, q, date, before, limit }, signal) => {
        const query: Record<string, string> = { date, limit: String(limit) };
        if (code) query.code = code;
        if (q) query.q = q;
        if (before) {
            query.beforeDate = before.date;
            query.beforeSrno = before.srno;
        }
        return apiGet<HtsNewsItem[]>("news/hts", query, signal);
    },
    telegramArchive: ({ from, to, q, before }, signal) => {
        const query: Record<string, string> = from === to ? { date: from } : { from, to };
        if (q?.trim()) query.q = q.trim();
        if (before) query.before = before;
        return apiGet<TelegramArchivePage>("news/telegram/archive", query, signal);
    },
};
