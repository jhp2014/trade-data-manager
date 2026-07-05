import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { DaySummary, DailySnapshot } from "@trade-data-manager/market";
import { DAY_SUMMARY_READER } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 이슈보드용 EOD 축약(bucketCounts·trailingHighs)을 스냅샷에 folding 한 형태.
// 분봉 없는 종목은 테마 파생이 없어 두 필드가 생략된다(옵셔널). DerivedStore.themeBoard(복기 파일에서 재계산) 산출.
export type EnrichedSnapshot = DailySnapshot & { bucketCounts?: number[]; trailingHighs?: number[] };
export type EnrichedDaySummary = Omit<DaySummary, "stocks"> & { stocks: EnrichedSnapshot[] };
export interface EnrichedDaySummaryReader {
    summaryByDate(date: string): Promise<EnrichedDaySummary>;
}

// GET /day-summary?date → 그날 universe 전체의 당일 요약(스냅샷 + byTheme/byIssue 인덱스) + 이슈 축약 folding. 읽기=GET.
// 리스트/필터(Scope)·순위는 클라 몫 — 여긴 read model 한 덩어리만 내려준다.
@Controller("day-summary")
export class DaySummaryController {
    constructor(@Inject(DAY_SUMMARY_READER) private readonly reader: EnrichedDaySummaryReader) {}

    @Get()
    summaryByDate(@Query("date") date?: string): Promise<EnrichedDaySummary> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.summaryByDate(date);
    }
}
