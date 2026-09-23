// 분봉 수집 완료 판정 — 날짜 파일을 **굳힐지** 가르는 게이트. 스냅샷(DerivedCache)과 날짜 격자(DayGrids)가
// 같은 이 한 벌을 쓴다(두 벌이면 한쪽만 반쪽 날을 굳힌다).
// collect 파이프라인(MinuteCollector)의 모델: 완료 = 기대집합(일봉에서 결정적으로 재계산한 분봉 후보)
// ⊆ 저장집합(그 날 분봉 있는 종목 = universe).
import { selectDailyCandidates, type DailyScanRepository } from "@trade-data-manager/market";

// 분봉 수집 완료 판정 파라미터 — core minuteSweepService 의 확정값(사용자 2026-06-29) 사본.
// ⚠ 수집 저장 기준이 그쪽에서 바뀌면 여기도 동반 수정(값이 다르면 완료 판정이 영원히 안 떨어지거나 헐거워진다).
const STORE_AMOUNT_FLOOR_WON = "20000000000"; // 200억
const GAINER_RATE_PERCENT = 10;
const NO_RANK = 0; // 순위 keep 비활성(floor∪등락률만)

/** 완료 판정에 필요한 일봉 읽기 — DailyScanRepository 의 부분집합(ISP). */
export type CompletionScanReader = Pick<DailyScanRepository, "listDailyCandlesByDate" | "getPreviousTradingDate">;

/**
 * 일봉이 아예 없으면 **미완료**로 본다 — 후보 산정이 불가할 뿐 아니라 EOD 스칼라(등락·시총)도 비어,
 * 그 날 자체가 부분 상태다(collect 의 "후보 0 = skip"과 달리 여긴 굳히기 게이트라 보수적으로).
 * `label` 은 경고 로그의 머리(어느 캐시가 보류했나).
 */
export async function isMinuteCollectionComplete(
    scan: CompletionScanReader,
    date: string,
    stored: ReadonlySet<string>,
    label: string,
): Promise<boolean> {
    const candles = await scan.listDailyCandlesByDate(date);
    if (candles.length === 0) return false;
    // 고가등락률의 기준가(직전 거래일 UN 종가) 페어링 — core buildDailyRankInputs 와 동일.
    const prevDate = await scan.getPreviousTradingDate(date);
    const prev = prevDate ? await scan.listDailyCandlesByDate(prevDate) : [];
    const prevClose = new Map(prev.map((c) => [c.stockCode, c.un.close]));
    const expected = selectDailyCandidates(
        candles.map((c) => ({ stockCode: c.stockCode, amount: c.un.amount, high: c.un.high, prevClose: prevClose.get(c.stockCode) ?? null })),
        { amountRankN: NO_RANK, highRateCutPercent: GAINER_RATE_PERCENT, amountFloorWon: STORE_AMOUNT_FLOOR_WON },
    );
    const missing = expected.filter((code) => !stored.has(code));
    if (missing.length > 0) {
        // 침묵 금지 — 영영 안 통과하는 날짜(과거 백필 실패·상장폐지 잔재)는 요청마다 전체 재빌드가 되는데,
        // 로그가 없으면 그 비용이 비가시다. 어느 종목이 막는지까지 보여야 수동 치유(백필)로 이어진다.
        console.warn(`[${label}] ${date} 굳히기 보류 — 분봉 미수집 ${missing.length}종목: ${missing.slice(0, 5).join(" ")}`);
        return false;
    }
    return true;
}
