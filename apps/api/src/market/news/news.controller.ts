import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { NewsHeadline, StockNewsReader } from "@trade-data-manager/market";
import type { HtsNewsItem } from "@trade-data-manager/wire";
import { STOCK_NEWS_REPO } from "../tokens.js";
import { assertYmd, assertStockCode } from "../validation.js";

const SRNO_RE = /^\d+$/;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// NewsHeadline → 표시용 wire(HtsNewsItem, contracts/wire). sourceCode·stockCodes 는 표시에 불필요, srno 는 페이징 커서.
function toWire(h: NewsHeadline): HtsNewsItem {
    return { srno: h.srno, date: h.date, time: h.time, title: h.title, sourceName: h.sourceName, categoryCode: h.categoryCode };
}

// GET /news/hts — HTS(시황) 헤드라인. 항상 최신순(내림차순).
//  · code: 그 종목 태깅 뉴스만. 생략 = 전체 시황(모든 종목, srno 단위 dedup).
//  · q: 제목 키워드(부분일치, 대소문자 무시).
//  · beforeDate+beforeSrno 없으면 초기 로드: 종목+무키워드 = 그 날 전체 / 그 외(전체·키워드) = date 이하 최신 limit 건.
//  · 있으면: 그 커서보다 과거 최대 limit 건("더 가져오기" 페이징). date 필수.
@Controller("news/hts")
export class NewsController {
    constructor(@Inject(STOCK_NEWS_REPO) private readonly repo: StockNewsReader) {}

    @Get()
    async hts(
        @Query("code") code?: string,
        @Query("q") q?: string,
        @Query("date") date?: string,
        @Query("beforeDate") beforeDate?: string,
        @Query("beforeSrno") beforeSrno?: string,
        @Query("limit") limit?: string,
    ): Promise<HtsNewsItem[]> {
        const validDate = assertYmd(date);
        if (code) assertStockCode(code); // code 미지정 = 전체 시황 모드
        const stockCode = code || undefined;
        const titleKeyword = q?.trim() || undefined;

        // 커서 페이징 — beforeDate/beforeSrno 둘 다 있어야 유효.
        if (beforeDate || beforeSrno) {
            const validBefore = assertYmd(beforeDate, "beforeDate");
            if (!beforeSrno || !SRNO_RE.test(beforeSrno)) throw new BadRequestException("beforeSrno 형식(숫자)");
            const items = await this.repo.feedHeadlines({
                stockCode,
                titleKeyword,
                before: { publishedDate: validBefore, srno: beforeSrno },
                limit: clampLimit(limit),
            });
            return items.map(toWire); // 이미 내림차순
        }

        // 초기 로드(종목+무키워드) — 그 날 전체(오름차순 반환을 내림차순으로 뒤집어 최신 먼저). 기존 UX 유지.
        if (stockCode && !titleKeyword) {
            const day = await this.repo.getHeadlines(stockCode, { from: validDate, to: validDate });
            return day.reverse().map(toWire);
        }

        // 초기 로드(전체 또는 키워드) — 그 날짜 이하 최신순 limit 건(전체 하루는 수천 건일 수 있어 페이지로).
        const items = await this.repo.feedHeadlines({ stockCode, titleKeyword, onOrBefore: validDate, limit: clampLimit(limit) });
        return items.map(toWire);
    }
}

function clampLimit(raw?: string): number {
    const n = raw ? Number(raw) : DEFAULT_LIMIT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
}
