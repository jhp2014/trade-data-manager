// infra/broker — 포트를 아는 어댑터 계층(원시 SDK는 포트를 모른다).
// core/market 포트를 kiwoom/kis SDK로 구현:
//   KiwoomMinuteAdapter / KisMinuteAdapter  implements MinuteCandleProvider (단일 벤더)
//   RoutingMinuteProvider                   implements MinuteCandleProvider ((종목,날) 분배 → 유량 2배)
// SDK 응답 → 도메인 모델 매핑(KRX·UN 머지, "+/-" prefix 제거)도 여기.
export { mergeMarkets, type TimeBar } from "./minute/merge.js";
export { KiwoomMinuteAdapter, type KiwoomMinuteSource } from "./minute/kiwoomMinuteAdapter.js";
export { KisMinuteAdapter, type KisMinuteSource } from "./minute/kisMinuteAdapter.js";
export {
    RoutingMinuteProvider,
    type RoutingOptions,
} from "./minute/routingMinuteProvider.js";
