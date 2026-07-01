// DailyMarketCapRecordService — 당일 시총 입력(상시 운영 Command) 구현.
// 협력: MarketSnapshotProvider(ka10099 전종목 스냅샷) · DailyMarketCapRepository.
// 흐름: ① ka10099 한 스윕(전일종가·현재주식수)  ② 순수 computeDailyMarketCaps  ③ upsert.
// 백필과 완전히 분리된 로직 — 역산·원주가 per-stock 없이 곱셈 한 번.
import { computeDailyMarketCaps } from "#domain";
import type { DailyMarketCapRepository, MarketSnapshotProvider } from "#port/outbound";
import type {
    DailyMarketCapRecorder,
    DailyMarketCapRecordResult,
} from "#port/inbound";

export interface DailyMarketCapRecordDeps {
    snapshot: MarketSnapshotProvider;
    repo: DailyMarketCapRepository;
}

export class DailyMarketCapRecordService implements DailyMarketCapRecorder {
    constructor(private readonly deps: DailyMarketCapRecordDeps) {}

    async record(date: string): Promise<DailyMarketCapRecordResult> {
        const snapshot = await this.deps.snapshot.getMarketSnapshot();
        const rows = computeDailyMarketCaps(snapshot, date);
        await this.deps.repo.saveMarketCaps(rows);
        return { date, universe: snapshot.length, stored: rows.length };
    }
}
