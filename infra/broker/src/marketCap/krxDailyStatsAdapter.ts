// infra/broker/marketCap/krxDailyStatsAdapter — KRX 일별매매정보 → DailyStockStatsProvider.
// 유가증권(stk)·코스닥(ksq) 두 서비스를 각 1콜로 받아 합친다(시장 분리는 여기서 끝 — 도메인은 모른다).
// 코넥스(knx)는 유니버스 밖이라 안 부른다.
//
// 필터를 걸지 않는다: KRX 는 리츠·스팩·우선주를 섞어 주지만 낟알이 (종목, 날)이라 남는 행이 해가 없고,
// 걸러 두면 나중에 유니버스를 넓힐 때 그 날짜를 다시 받아야 한다(1,050콜을 또 쓴다).
import type { DailyStockStat, DailyStockStatsProvider } from "@trade-data-manager/market";
import type { KrxApiResponse, KrxByddTrdResponse, KrxByddTrdRow, KrxMarket } from "@trade-data-manager/krx";

/** 어댑터가 KRX 에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). 날짜는 compact "YYYYMMDD". */
export interface KrxByddTrdSource {
    getByddTrd(market: KrxMarket, basDd: string): Promise<KrxApiResponse<KrxByddTrdResponse>>;
}

/** 우리 유니버스에 해당하는 시장 둘. 코넥스는 제외. */
const MARKETS: readonly KrxMarket[] = ["stk", "ksq"];

/** "YYYY-MM-DD" → "YYYYMMDD". */
const compact = (date: string): string => date.replace(/-/g, "");

/**
 * 수치 문자열 → 무손실 string. 실측상 콤마·패딩이 없지만(전수 확인) 방어적으로 벗기고 정규화한다 —
 * 형제 소스인 키움 `lastPrice` 가 0패딩을 주므로 "패딩은 안 온다"를 가정으로 삼지 않는다.
 * **표기가 다를 뿐 멀쩡한 값**(`"0012345"`)과 **결손**(빈값·`"-"`·`"0"`·비정수)은 다른 사건이다:
 * 앞은 살리고, 뒤는 null 을 돌려 호출자가 그 행을 통째로 버리게 한다(결손은 결손).
 * 결손을 0 으로 바꾸지 않는 이유 — 0 시총 행이 보드까지 새어 "줄의 왼쪽 끝을 가짜가 차지"한다.
 */
const num = (s: string | undefined): string | null => {
    const t = String(s ?? "").trim().replace(/,/g, "");
    if (!/^\d+$/.test(t)) return null;
    const n = BigInt(t); // 0패딩 제거는 BigInt 왕복이 한다("0012345" → "12345")
    return n > 0n ? n.toString() : null;
};

export class KrxDailyStatsAdapter implements DailyStockStatsProvider {
    constructor(private readonly source: KrxByddTrdSource) {}

    async getDailyStats(date: string): Promise<DailyStockStat[]> {
        const basDd = compact(date);
        const perMarket = await Promise.all(
            MARKETS.map(async (m) => {
                const res = await this.source.getByddTrd(m, basDd);
                return res.data.OutBlock_1 ?? [];
            }),
        );
        // 휴장일이면 두 시장 다 빈 배열 → 빈 결과(에러 아님).
        // 값이 결손인 행은 버린다 → 그 (종목,날)은 "행 없음"이 되고 수집 결과의 gaps 가 세어 드러낸다.
        return perMarket.flat().flatMap((r) => toStat(r, date) ?? []);
    }
}

function toStat(r: KrxByddTrdRow, date: string): DailyStockStat | null {
    const stockCode = String(r.ISU_CD ?? "").trim();
    const marketCap = num(r.MKTCAP);
    const listShares = num(r.LIST_SHRS);
    if (stockCode === "" || marketCap === null || listShares === null) return null;
    const sect = String(r.SECT_TP_NM ?? "").trim();
    return {
        stockCode,
        // 응답의 BAS_DD 를 믿지 않고 요청한 date 를 쓴다 — 두 시장 응답을 합치므로 키가 흔들리면 안 된다.
        date,
        marketCap,
        listShares,
        // KOSPI 는 전부 빈값 → null. 값이 있으면 **원문 그대로**(파싱 금지 — KRX 가 값을 늘리면 조용히 유실된다).
        sectTpNm: sect === "" ? null : sect,
    };
}
