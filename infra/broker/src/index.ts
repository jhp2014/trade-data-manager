// infra/broker — 포트를 아는 어댑터 계층(원시 SDK는 포트를 모른다).
// market-data 포트를 kiwoom/kis SDK로 구현:
//   KiwoomPriceAdapter / KisPriceAdapter  implements PriceProviderPort
//   KisNewsAdapter                        implements NewsProviderPort
//   CompositePriceProvider                implements PriceProviderPort (분봉=KIS, 일봉=키움)
// SDK 응답 → 도메인 모델 매핑(priceCalculator 이식분 사용)도 여기.
// 인터페이스 설계 + 구현 방식 논의 후 채운다.
export {};
