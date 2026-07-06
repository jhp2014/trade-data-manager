import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { NewsHeadline, StockNewsReader } from "@trade-data-manager/market";
import { STOCK_NEWS_REPO } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SRNO_RE = /^\d+$/;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// 표시용 wire — NewsHeadline 부분집합(sourceCode·stockCodes 는 표시에 불필요). srno 는 페이징 커서로 필요.
interface HtsNewsWire {
    srno: string;
    date: string;
    time: string;
    title: string;
    sourceName: string;
    categoryCode: string;
}

function toWire(h: NewsHeadline): HtsNewsWire {
    return { srno: h.srno, date: h.date, time: h.time, title: h.title, sourceName: h.sourceName, categoryCode: h.categoryCode };
}

// GET /news/hts — 한 종목의 HTS(시황) 헤드라인. 항상 최신순(내림차순).
//  · beforeDate+beforeSrno 없으면: 그 날(date) 헤드라인 전체("당일" 초기 로드)
//  · 있으면: 그 커서보다 과거 최대 limit 건("더 가져오기" 페이징)
// code 없으면 빈 배열(패널이 종목 미선택 시 조회 안 함). date 필수.
@Controller("news/hts")
export class NewsController {
    constructor(@Inject(STOCK_NEWS_REPO) private readonly repo: StockNewsReader) {}

    @Get()
    async hts(
        @Query("code") code?: string,
        @Query("date") date?: string,
        @Query("beforeDate") beforeDate?: string,
        @Query("beforeSrno") beforeSrno?: string,
        @Query("limit") limit?: string,
    ): Promise<HtsNewsWire[]> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        if (!code) return [];

        // 커서 페이징 — beforeDate/beforeSrno 둘 다 있어야 유효.
        if (beforeDate || beforeSrno) {
            if (!beforeDate || !DATE_RE.test(beforeDate)) throw new BadRequestException("beforeDate 형식(YYYY-MM-DD)");
            if (!beforeSrno || !SRNO_RE.test(beforeSrno)) throw new BadRequestException("beforeSrno 형식(숫자)");
            const n = clampLimit(limit);
            const items = await this.repo.recentHeadlines(code, { before: { publishedDate: beforeDate, srno: beforeSrno }, limit: n });
            return items.map(toWire); // 이미 내림차순
        }

        // 초기 로드 — 그 날 전체(오름차순 반환을 내림차순으로 뒤집어 최신 먼저).
        const day = await this.repo.getHeadlines(code, { from: date, to: date });
        return day.reverse().map(toWire);
    }
}

function clampLimit(raw?: string): number {
    const n = raw ? Number(raw) : DEFAULT_LIMIT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
}
