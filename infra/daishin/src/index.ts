// infra/daishin — 대신증권 CYBOS Plus 분봉의 원천 파일 계층. 소비자 = broker DaishinMinuteAdapter(옛 분봉 수리).
//
// CYBOS Plus 는 32비트 COM 이고 로그인·호출 프로세스가 둘 다 관리자여야 열린다 → Node 가 직접 부르지 않는다.
// 받는 일은 collector/collect.ps1(관리자 32비트 PowerShell 로 dump.ps1 을 띄운다)이 원천 파일로 하고, 여기는 그 파일만 읽는다.
//
// 실측 요약(2026-11-08, recon/ 머리말·메모리 daishin-minute-recon):
// · StockChart 입력 12 = 거래소('K' KRX · 'N' NXT · 'A' 통합). 'A' 는 **지금** NXT 여부로 걸러 옛 NXT 체결을 빼지만 'N' 은 그대로 준다
//   → 통합은 우리가 K+N 으로 합성한다(키움 2025-07 대조 하루 대금 +0.0016%).
// · 시각 = 봉 끝(901 = 09:00 봉). KRX 종가 동시호가 = 1530(늦게 체결된 날도). NXT 15:30~15:40 체결은 1541 봉에 합쳐 온다.
// · 입력 10(시간외 거래량): '1' 이면 KRX 장전 시간외를 901 에 더한다, '2'='3' = 키움 KRX 칸과 같다 → '3'.
//   KRX 장후 시간외 종가(키움 15:35 봉)는 어느 값으로도 안 준다.
// · 1분봉 바닥 2024-11-01 — 굴러가는 약 2년 창이라 원천 파일은 다시 못 받는 보관본이다.
// · 시세 한도 15초 60건. 사라진 종목코드는 '유효하지 않은 종목코드'.
export { rawDirFromEnv } from "./config.js";
export {
    createDaishinRaw,
    parseMinuteDayFile,
    RAW_HEADER,
    TARGETS_FILE,
    type DaishinBar,
    type DaishinMarket,
    type DaishinMinuteDay,
    type DaishinRaw,
    type StockDayRef,
} from "./rawFiles.js";
