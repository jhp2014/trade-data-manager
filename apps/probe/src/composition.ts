// probe 컴포지션 루트 — 실 어댑터를 inbound 서비스에 조립한다(=e2e 의 실측 대상 wiring).
// UI(나중)가 그대로 재사용할 조립. 여긴 read/검수 트랙만(수집은 apps/ingest, kiwoom/kis 불필요).
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyUniverseProvider,
    DrizzleStockMasterRepository,
    DrizzleDailyMarketCapRepository,
    DrizzleDailyIssueRepository,
} from "@trade-data-manager/persistence";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { DailyReviewService, IssueEditService } from "@trade-data-manager/market";

export interface ProbeRuntime {
    reviewer: DailyReviewService;
    editor: IssueEditService;
    close(): Promise<void>;
}

export function createProbeRuntime(): ProbeRuntime {
    const pool = createPoolFromEnv();
    const db = createDb(pool);

    const universe = new DrizzleDailyUniverseProvider(db);
    const stockMaster = new DrizzleStockMasterRepository(db);
    const marketCap = new DrizzleDailyMarketCapRepository(db);
    const dailyIssue = new DrizzleDailyIssueRepository(db);
    // 시트 멤버십 — OAuth SheetsClient + 디폴트 시트(앱 생기면 선택 UI 가 config 갈아끼움).
    const membership = new SheetThemeMembershipAdapter(createSheetsClient(), DEFAULT_THEME_SHEET);

    const reviewer = new DailyReviewService({ universe, membership, stockMaster, marketCap, dailyIssue });
    const editor = new IssueEditService({ dailyIssue });

    return { reviewer, editor, close: () => pool.end() };
}
