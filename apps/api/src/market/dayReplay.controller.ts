import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import { DAY_REPLAY_READER } from "./tokens.js";
import type { MinuteDerived } from "./dayReplay.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 복기보드 응답 종목 — 복기 전용 per-minute + 메타(self-contained, daySummary 불필요).
 * 파일 MinuteDerived 중 테마 전용(minuteOpen·minuteHigh·trailingHighs)은 빼서 복기 payload 를 얇게 유지.
 */
export interface ReplayStock extends Pick<MinuteDerived, "code" | "times" | "rate" | "high" | "low" | "open" | "cumAmount"> {
    name: string | null;
    market: string | null;
    marketCap: string | null; // 원, 무손실 string
    themes: string[]; // 테마명
}

export interface ReplayBoard {
    date: string;
    stocks: ReplayStock[];
}

/** 복기 리더 — DerivedStore.replayBoard(파일) + MetaStore(meta) 조합. apps/api 조합. */
export interface DayReplayReader {
    dayReplay(date: string): Promise<ReplayBoard>;
}

// GET /day-replay?date → 복기보드용 per-minute 파생 시계열 + 메타(self-contained).
@Controller("day-replay")
export class DayReplayController {
    constructor(@Inject(DAY_REPLAY_READER) private readonly reader: DayReplayReader) {}

    @Get()
    async dayReplay(@Query("date") date?: string): Promise<ReplayBoard> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.dayReplay(date);
    }
}
