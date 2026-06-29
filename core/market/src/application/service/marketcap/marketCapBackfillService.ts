// MarketCapBackfillService — 날짜별 시총 백필(일회성 Command) 구현.
// 협력: ListInfoProvider(예탁원 발행주식수 이벤트) · RawDailyCloseProvider(원주가 종가) · DailyMarketCapRepository.
// 흐름:
//   ① 발행주식수 이벤트 조회 [from, 오늘]. 0건이면(기간 내 변동 없음) 상장이력까지 넓혀 현재총수 확보 시도.
//      그래도 0건(예탁원 커버리지 밖 오래된 안정주)이면 키움 현재주식수를 상수 shares 로 폴백.
//   ② 원주가 KRX 종가 조회 [from−margin, to] — 첫날의 직전 거래일(D-1) 확보용 margin.
//   ③ 순수 computeMarketCapBackfill 로 행 계산.  ④ upsert.
import {
    computeMarketCapBackfill,
    currentTotalShares,
    type DateRange,
} from "../../../domain/index.js";
import type {
    CurrentSharesProvider,
    DailyMarketCapRepository,
    ListInfoProvider,
    RawDailyCloseProvider,
} from "../../port/outbound/index.js";
import type {
    MarketCapBackfiller,
    MarketCapBackfillResult,
} from "../../port/inbound/index.js";
import { seoulToday } from "../shared/dailyRange.js";

export interface MarketCapBackfillDeps {
    listInfo: ListInfoProvider;
    rawDaily: RawDailyCloseProvider;
    /** 역산 폴백 — 예탁원 이벤트 0건 종목의 상수 shares(현재 상장주식수). */
    currentShares: CurrentSharesProvider;
    repo: DailyMarketCapRepository;
}

/** 첫 거래일의 직전 거래일(D-1)을 확실히 포함시키기 위한 원주가 조회 여유(달력일). 장기연휴+주말 커버. */
const RAW_MARGIN_DAYS = 15;

/** YYYY-MM-DD 에서 days 만큼 뺀 날짜(UTC 기준 — 날짜 산술이라 TZ 무관). */
function minusDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

export class MarketCapBackfillService implements MarketCapBackfiller {
    constructor(private readonly deps: MarketCapBackfillDeps) {}

    async backfill(stockCode: string, range: DateRange): Promise<MarketCapBackfillResult> {
        const { listInfo, rawDaily, currentShares, repo } = this.deps;
        const today = seoulToday();

        // ① 발행주식수 이벤트 — 우선 [from, 오늘](13개월 수준이라 고정버퍼 100슬롯 안전).
        let events = await listInfo.getEvents(stockCode, range.from, today);
        let totalCurrent = currentTotalShares(events);
        if (totalCurrent === null) {
            // 기간 내 변동 0 → 현재총수를 못 읽음. 상장이력까지 넓혀 한 번 더(변동 없는 종목이라 슬롯 포화 가능성 낮음).
            events = await listInfo.getEvents(stockCode, "1990-01-01", today);
            totalCurrent = currentTotalShares(events);
        }
        if (totalCurrent === null) {
            // 예탁원 커버리지 밖(이벤트 0건) → 발행주식수 불변이므로 키움 현재주식수를 상수 shares 로.
            // events 는 빈 채로 둔다 → sharesAt 이 모든 날 totalCurrent(상수) 반환.
            totalCurrent = await currentShares.getCurrentShares(stockCode);
        }
        if (totalCurrent === null) {
            throw new Error(`발행주식수를 어디서도 구할 수 없음: ${stockCode}`);
        }

        // ② 원주가 KRX 종가 — from 이전 거래일까지 받도록 margin.
        const rawCloses = await rawDaily.getRawCloses(stockCode, {
            from: minusDays(range.from, RAW_MARGIN_DAYS),
            to: range.to,
        });

        // ③ 순수 계산 → ④ 저장.
        const rows = computeMarketCapBackfill({ stockCode, rawCloses, events, totalCurrent, range });
        await repo.saveMarketCaps(rows);

        return {
            stockCode,
            range,
            eventCount: events.length,
            totalShares: totalCurrent,
            rawDays: rawCloses.length,
            stored: rows.length,
        };
    }
}
