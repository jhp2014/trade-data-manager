// core/market/domain/ipoPrice — 공모가 추출(상장정보일정 enrichment). 순수함수(외부 import 0).
//
// IPO = 공개모집 유상증자라 KIS 는 신규상장을 issue_type="유상증자" 로 찍는다(recon 실측: 더본코리아
//   475560 상장일 2024-11-06 행 = 유상증자·issue_price 34,000 = 실제 공모가). "신규상장" 타입은 없다.
// 공모가 = 상장일(listingDate)에 찍힌 유상증자 행의 issue_price. 상장일 앵커로 후속 유상증자(증자)와 구분.
import type { ListInfoEvent } from "./marketCap.js";

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
