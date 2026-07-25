import { Controller, Post, Inject, Body, BadRequestException } from "@nestjs/common";
import type { RankDayMinutes } from "@trade-data-manager/wire";
import { RANK_MINUTES } from "../tokens.js";
import { assertYmd, assertStockCode } from "../validation.js";
import type { RankMinutes } from "./rankMinutes.js";

// 순위 필터 분석 → (종목,날) raw UN 분봉. 클라가 캐시에 없는 날만 배치로 요청한다(부분집합=재조회 없음).
// 저장분 아닌 임시 질의라 POST 바디(days[]). 응답은 wire 계약(RankDayMinutes[]).
const MAX_DAYS = 1200; // 한 배치 상한(payload/풀 보호). 20종목/일 기준 ~2달치 여유.

interface DaysBody {
    days?: Array<{ stockCode?: string; date?: string }>;
}

@Controller("rank-minutes")
export class RankMinutesController {
    constructor(@Inject(RANK_MINUTES) private readonly svc: RankMinutes) {}

    @Post()
    async byDays(@Body() body: DaysBody): Promise<RankDayMinutes[]> {
        const raw = body?.days;
        if (!Array.isArray(raw)) throw new BadRequestException("days 필수(배열)");
        if (raw.length > MAX_DAYS) throw new BadRequestException(`days 최대 ${MAX_DAYS}건`);
        const days = raw.map((d) => ({
            stockCode: assertStockCode(d?.stockCode, "stockCode"),
            date: assertYmd(d?.date),
        }));
        return this.svc.minutes(days);
    }
}
