// 실시간 뉴스 엔드포인트 — GET /news (워크벤치는 /live 프록시 경유 → /live/news).
// apps/api 의 /news/hts(DB, 복기)와 같은 표시 계약(HtsNewsItem)이지만 소스가 KIS 라이브 REST.
import { Controller, Get, Query, Inject, BadRequestException } from "@nestjs/common";
import type { NewsHeadline } from "@trade-data-manager/market";
import type { HtsNewsItem } from "@trade-data-manager/wire";
import { LIVE_NEWS } from "../tokens.js";
import type { LiveNewsService } from "./liveNews.js";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HMS_RE = /^\d{2}:\d{2}:\d{2}$/;
const CODE_RE = /^\d{6}$/;

// NewsHeadline → 표시용 wire — 패널이 소스(라이브/DB) 무관하게 같은 모양을 렌더.
function toWire(h: NewsHeadline): HtsNewsItem {
    return { srno: h.srno, date: h.date, time: h.time, title: h.title, sourceName: h.sourceName, categoryCode: h.categoryCode };
}

// GET /news?code&q&beforeDate&beforeTime → HtsNewsItem[] (최신순 한 페이지 ≤40).
//  · code: 그 종목 태깅 뉴스만(KIS 서버사이드 필터). 없으면 전체 시황.
//  · q: 제목 키워드 부분일치(KIS 서버사이드).
//  · beforeDate+beforeTime: 이 시각 이하(포함)부터 과거로 — "더보기"는 받은 페이지의 가장 오래된
//    (date,time)을 다음 앵커로 재호출(경계 중복은 클라가 srno 로 dedup). 둘 다 없으면 최신부터.
@Controller("news")
export class NewsController {
    constructor(@Inject(LIVE_NEWS) private readonly news: LiveNewsService) {}

    @Get()
    async list(
        @Query("code") code?: string,
        @Query("q") q?: string,
        @Query("beforeDate") beforeDate?: string,
        @Query("beforeTime") beforeTime?: string,
    ): Promise<HtsNewsItem[]> {
        if (code && !CODE_RE.test(code)) throw new BadRequestException("code 형식(6자리 숫자)");
        let anchor: { date: string; time: string } | undefined;
        if (beforeDate || beforeTime) {
            if (!beforeDate || !YMD_RE.test(beforeDate)) throw new BadRequestException("beforeDate 형식(YYYY-MM-DD)");
            if (!beforeTime || !HMS_RE.test(beforeTime)) throw new BadRequestException("beforeTime 형식(HH:MM:SS)");
            anchor = { date: beforeDate, time: beforeTime };
        }
        const page = await this.news.fetchBefore(anchor, { stockCode: code || undefined, titleKeyword: q?.trim() || undefined });
        return page.map(toWire);
    }
}
