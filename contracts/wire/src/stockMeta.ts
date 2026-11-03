// `/stocks/master` 계약 — 종목 마스터 **전량**(코드·이름·시장). 클라가 부팅에 한 번 받아 들고
// "이 코드의 이름이 뭐냐"를 그 자리에서 답한다(왕복 없음·동기 조회).
//
// 옛 `/stocks/meta?codes=…`(코드 목록을 보내 필요한 것만 받던 것)의 후계다. 그 방식은 화면마다
// "필요한 코드를 옳게 모으기"를 시켰고, 모으는 자리가 자기 피드만 아는 탓에 **정작 그 피드에 없는
// 종목**(지금 조건 밖·타점 없음)에서 이름이 비어 코드가 그대로 떴다. 종목 수가 수천이라 전량이
// 압축 후 수십 KB밖에 안 되므로, 조율 문제를 계속 푸는 대신 통째로 들고 있는 쪽을 택했다.
export interface StockMeta {
    stockCode: string;
    name: string;
    market: string; // "거래소"(코스피) | "코스닥"
}

/** GET /stocks/:code 의 시총 한 줄 — 그 행의 거래일과 시총(원, 무손실 정수 문자열). */
export interface StockMarketCapPoint {
    date: string;
    /**
     * **그 날** 종가 × **그 날** 상장주식수(KRX MKTCAP 그대로, 당일 기준).
     * 차트 날짜 D 의 아침 시총(그날 등락이 안 섞인 값)은 date < D 인 마지막 줄이다 — 결정 로그 「시가총액·상장주식수 소스 (KRX)」.
     */
    cap: string;
}

/**
 * lab-api `GET /stocks/:code?from=&to=` — 종목 이름표 + 상장일 + 일별 시총 시계열(날짜 오름차순).
 * from/to 는 선택(빠진 쪽 = 전 기간). 마스터에 없는 코드는 404(빈 꼴을 지어내지 않는다 — /theme/stocks/:code 와 같은 결).
 */
export interface LabStockInfo extends StockMeta {
    /** 상장일 YYYY-MM-DD, 미상이면 null. */
    listedAt: string | null;
    marketCap: StockMarketCapPoint[];
}
