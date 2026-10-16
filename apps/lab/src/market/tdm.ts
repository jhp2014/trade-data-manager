// 시장 데이터 창구의 tdm api 구현 — 엔드포인트는 전부 읽기(GET).
import { apiGet } from "./http.js";
import type { Market } from "./ports.js";
import type { ChartBundle, DayFlow, HtsNewsItem, StockMeta, TelegramArchivePage } from "./types.js";

export const tdmMarket: Market = {
    chart: (code, date, signal) => apiGet<ChartBundle>("chart", { code, date }, signal),
    stockMaster: (signal) => apiGet<StockMeta[]>("stocks/master", undefined, signal),
    tradingDays: (signal) => apiGet<string[]>("dates", undefined, signal),
    // lab 전용 계약(/day-flow, lab-api) — 쓰는 필드만 와서 slimming 이 필요 없다(옛 /day-replay 는 받자마자 깎았다).
    dayFlow: (date, signal) => apiGet<DayFlow>("day-flow", { date }, signal),
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
