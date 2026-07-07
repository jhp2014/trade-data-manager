import { Controller, Get, Inject } from "@nestjs/common";
import type { DataDate } from "@trade-data-manager/wire";
import type { DataDateReader } from "@trade-data-manager/market";
import { DATA_DATE_READER } from "../tokens.js";

// GET /dates → 데이터(일봉) 있는 거래일 목록(오름차순, 전역·종목무관).
// data-aware 날짜피커가 실제 데이터 있는 날로 년>월>일 트리를 채운다.
@Controller("dates")
export class DatesController {
    constructor(@Inject(DATA_DATE_READER) private readonly reader: DataDateReader) {}

    @Get()
    list(): Promise<DataDate[]> {
        return this.reader.listDataDates();
    }
}
