// core/market/domain/ipoPrice — 공모가 추출(상장정보일정 enrichment). 순수함수(외부 import 0).
//
// IPO = 공개모집 유상증자라 KIS 는 신규상장을 issue_type="유상증자" 로 찍는다(recon 실측: 더본코리아
//   475560 상장일 2024-11-06 행 = 유상증자·issue_price 34,000 = 실제 공모가). "신규상장" 타입은 없다.
// 공모가 = 상장일(listingDate)에 찍힌 유상증자 행의 issue_price. 상장일 앵커로 후속 유상증자(증자)와 구분.
/** 예탁원 상장정보일정 1건 — 발행주식수 변동 이벤트. 가격/수량은 무손실 string.
 *
 * ⚠ 이 이벤트로 **과거 시점 주식수를 역산하지 않는다** — `issue_stk_qty` 는 증자·CB행사에선 delta 지만
 *   재상장류(액면분할·병합·감자)에선 재상장 전량이고, `tot_issue_stk_qty` 는 모든 행에 동일한 현재
 *   스냅샷이라 복원 수단이 없다. 상장주식수는 KRX 일별매매정보에서 받는다([[DailyStockStat]]).
 *   지금 이 타입의 쓰임은 **공모가 추출 하나**다. decisions.md 「시가총액·상장주식수 소스 (KRX)」 절. */
export interface ListInfoEvent {
    /** 변동(상장)일 YYYY-MM-DD. */
    listDate: string;
    /** 이 이벤트의 증감 주식수. **delta 로 믿지 말 것**(위 주의). */
    issueQty: string;
    /** 이벤트 후 누적 총발행주식수 = 현재총수 스냅샷(행마다 동일 — 시점 정보가 아니다). */
    totalShares: string;
    /** 발행가(신규상장이면 공모가) — 이 파일이 쓰는 유일한 수치. */
    issuePrice: string;
    /** 사유(신규상장/유상증자/무상증자/감자/액면분할/…). */
    issueType: string;
}

/** IPO 공모를 나타내는 issue_type(공개모집 유상증자). */
const IPO_ISSUE_TYPE = "유상증자";

/**
 * 상장일에 찍힌 유상증자 행의 issue_price = 공모가. 없으면 null(그 기간 상장이 아니거나 데이터 부재).
 * 같은 날 여러 유상증자 행이면 최대 issue_price(공모가 > 액면·기타). 보통 1건.
 */
export function extractIpoPrice(events: ListInfoEvent[], listingDate: string): string | null {
    const candidates = events.filter(
        (e) => e.listDate === listingDate && e.issueType === IPO_ISSUE_TYPE,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce(
        (max, e) => (BigInt(e.issuePrice) > BigInt(max) ? e.issuePrice : max),
        candidates[0].issuePrice,
    );
}
