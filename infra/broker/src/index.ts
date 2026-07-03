// infra/broker — 포트를 아는 어댑터 계층(원시 SDK는 포트를 모른다).
// core/market 포트를 kiwoom/kis SDK로 구현:
//   KiwoomDailyAdapter                      implements DailyCandleProvider (일봉=키움 단독)
//   KiwoomMinuteAdapter / KisMinuteAdapter  implements MinuteCandleProvider (단일 벤더)
//   RoutingMinuteProvider                   implements MinuteCandleProvider ((종목,날) 분배 → 유량 2배)
// SDK 응답 → 도메인 모델 매핑(KRX·UN 머지, "+/-" prefix 제거, 거래대금 원화 환산)도 여기.
export { mergeDailyMarkets, type DateBar } from "./daily/merge.js";
export { KiwoomDailyAdapter, type KiwoomDailySource } from "./daily/kiwoomDailyAdapter.js";
export {
    KiwoomRawDailyCandleAdapter,
    type KiwoomRawDailyCandleSource,
} from "./daily/kiwoomRawDailyCandleAdapter.js";
export { mergeMarkets, type TimeBar } from "./minute/merge.js";
export { KiwoomMinuteAdapter, type KiwoomMinuteSource } from "./minute/kiwoomMinuteAdapter.js";
export { KisMinuteAdapter, type KisMinuteSource } from "./minute/kisMinuteAdapter.js";
export {
    RoutingMinuteProvider,
    type RoutingOptions,
} from "./minute/routingMinuteProvider.js";
export {
    KiwoomStockListAdapter,
    type KiwoomStockListSource,
} from "./stockMaster/kiwoomStockListAdapter.js";
export { KisListInfoAdapter, type KisListInfoSource } from "./marketCap/kisListInfoAdapter.js";
export {
    KiwoomRawDailyAdapter,
    type KiwoomRawDailySource,
} from "./marketCap/kiwoomRawDailyAdapter.js";
export {
    KiwoomCurrentSharesAdapter,
    type KiwoomBasicInfoSource,
} from "./marketCap/kiwoomCurrentSharesAdapter.js";
export {
    KiwoomMarketSnapshotAdapter,
    type KiwoomMarketListSource,
} from "./marketCap/kiwoomMarketSnapshotAdapter.js";
export { KisNewsAdapter, type KisNewsSource } from "./news/kisNewsAdapter.js";
export {
    TelegramNewsSearchAdapter,
    type TelegramSearchSource,
} from "./news/telegramNewsSearchAdapter.js";
export {
    SheetThemeMembershipAdapter,
    type ThemeSheetSource,
} from "./theme/sheetThemeMembershipAdapter.js";
export { type ThemeSheetConfig, DEFAULT_THEME_SHEET } from "./theme/sheetConfig.js";
export { toCanonical } from "./theme/codes.js";
