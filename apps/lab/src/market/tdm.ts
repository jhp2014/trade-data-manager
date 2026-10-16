// 시장 데이터 창구의 tdm api 구현 — 엔드포인트는 전부 읽기(GET).
import { apiGet } from "./http.js";
import type { Market } from "./ports.js";
import type { ChartBundle, DayReplay, HtsNewsItem, ReplayStock, StockMeta, TelegramArchivePage } from "./types.js";

/** /day-replay 응답에서 테마 보드가 쓰는 필드만 남긴다 — 나머지(분봉 OHLC·120일 고가)는 메모리만 먹는다. */
function slimReplay(raw: DayReplay): DayReplay {
    return {
        date: raw.date,
        stocks: raw.stocks.map(
            (s): ReplayStock => ({
                code: s.code,
                times: s.times,
                rate: s.rate,
                high: s.high,
                low: s.low,
                open: s.open,
                cumAmount: s.cumAmount,
                basePrice: s.basePrice,
                name: s.name,
                market: s.market,
                marketCap: s.marketCap,
                themes: s.themes,
            }),
        ),
    };
}

export const tdmMarket: Market = {
    chart: (code, date, signal) => apiGet<ChartBundle>("chart", { code, date }, signal),
    stockMaster: (signal) => apiGet<StockMeta[]>("stocks/master", undefined, signal),
    tradingDays: (signal) => apiGet<string[]>("dates", undefined, signal),
    dayReplay: async (date, signal) => slimReplay(await apiGet<DayReplay>("day-replay", { date }, signal)),
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
