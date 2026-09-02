import { describe, it, expect } from "vitest";
import type { KrxApiResponse, KrxByddTrdResponse, KrxByddTrdRow, KrxMarket } from "@trade-data-manager/krx";
import { KrxDailyStatsAdapter, type KrxByddTrdSource } from "../krxDailyStatsAdapter.js";

/** 실측 서식 그대로 — 콤마·패딩 없는 순수 숫자 문자열, SECT_TP_NM 은 KOSPI 면 빈 문자열. */
const row = (over: Partial<KrxByddTrdRow> = {}): KrxByddTrdRow => ({
    BAS_DD: "20260626",
    ISU_CD: "005930",
    ISU_NM: "삼성전자",
    MKT_NM: "KOSPI",
    SECT_TP_NM: "",
    TDD_CLSPRC: "4715",
    CMPPREVDD_PRC: "25",
    FLUC_RT: "0.53",
    TDD_OPNPRC: "4655",
    TDD_HGPRC: "4720",
    TDD_LWPRC: "4655",
    ACC_TRDVOL: "21363",
    ACC_TRDVAL: "100332885",
    MKTCAP: "87981900000",
    LIST_SHRS: "18660000",
    ...over,
});

function source(byMarket: Partial<Record<KrxMarket, KrxByddTrdRow[]>>, calls?: string[]): KrxByddTrdSource {
    return {
        getByddTrd: (market, basDd): Promise<KrxApiResponse<KrxByddTrdResponse>> => {
            calls?.push(`${market}:${basDd}`);
            return Promise.resolve({
                status: 200,
                data: { OutBlock_1: byMarket[market] ?? [] },
                headers: {},
            });
        },
    };
}

describe("KrxDailyStatsAdapter", () => {
    it("유가증권·코스닥 2콜을 합친다(코넥스는 안 부른다) + 날짜는 compact 로", async () => {
        const calls: string[] = [];
        const adapter = new KrxDailyStatsAdapter(
            source({ stk: [row()], ksq: [row({ ISU_CD: "042040", MKT_NM: "KOSDAQ" })] }, calls),
        );
        const out = await adapter.getDailyStats("2026-06-26");
        expect(calls.sort()).toEqual(["ksq:20260626", "stk:20260626"]);
        expect(out.map((s) => s.stockCode).sort()).toEqual(["005930", "042040"]);
    });

    it("응답 BAS_DD 가 아니라 **요청한 날짜**를 키로 쓴다(두 시장 응답을 합치므로)", async () => {
        const adapter = new KrxDailyStatsAdapter(source({ stk: [row({ BAS_DD: "19700101" })] }));
        const [s] = await adapter.getDailyStats("2026-06-26");
        expect(s.date).toBe("2026-06-26");
    });

    it("MKTCAP·LIST_SHRS 는 무손실 string 그대로", async () => {
        const adapter = new KrxDailyStatsAdapter(source({ stk: [row()] }));
        const [s] = await adapter.getDailyStats("2026-06-26");
        expect(s).toEqual({
            stockCode: "005930",
            date: "2026-06-26",
            marketCap: "87981900000",
            listShares: "18660000",
            sectTpNm: null, // KOSPI 빈값 → null
        });
    });

    it("SECT_TP_NM 은 원문 그대로 보존한다(파싱하지 않는다)", async () => {
        const adapter = new KrxDailyStatsAdapter(
            source({ ksq: [row({ SECT_TP_NM: "관리종목(소속부없음)" })] }),
        );
        const [s] = await adapter.getDailyStats("2026-06-26");
        expect(s.sectTpNm).toBe("관리종목(소속부없음)");
    });

    it("거래정지(거래량 0)여도 상장주식수는 그대로 실린다", async () => {
        const adapter = new KrxDailyStatsAdapter(
            source({ stk: [row({ ISU_CD: "012160", ACC_TRDVOL: "0", ACC_TRDVAL: "0", LIST_SHRS: "78103517" })] }),
        );
        const [s] = await adapter.getDailyStats("2026-06-26");
        expect(s.listShares).toBe("78103517");
    });

    it("0패딩·콤마는 표기 차이라 살린다(정규화해서 무손실 string 으로)", async () => {
        const adapter = new KrxDailyStatsAdapter(
            source({ stk: [row({ MKTCAP: "0087981900000", LIST_SHRS: "18,660,000" })] }),
        );
        const [s] = await adapter.getDailyStats("2026-06-26");
        expect(s.marketCap).toBe("87981900000");
        expect(s.listShares).toBe("18660000");
    });

    it("결손(빈값·'-'·0·비정수)인 행은 통째로 버린다 — 0 을 지어내지 않는다", async () => {
        const adapter = new KrxDailyStatsAdapter(
            source({
                stk: [
                    row({ ISU_CD: "AAA", MKTCAP: "" }),
                    row({ ISU_CD: "BBB", LIST_SHRS: "-" }),
                    row({ ISU_CD: "CCC", MKTCAP: "0" }),
                    row({ ISU_CD: "DDD", LIST_SHRS: "12.5" }),
                    row({ ISU_CD: "EEE" }), // 멀쩡한 행
                ],
            }),
        );
        const out = await adapter.getDailyStats("2026-06-26");
        expect(out.map((s) => s.stockCode)).toEqual(["EEE"]);
    });

    it("휴장일 — 두 시장 다 빈 배열이면 빈 결과(에러 아님)", async () => {
        const adapter = new KrxDailyStatsAdapter(source({}));
        expect(await adapter.getDailyStats("2026-08-30")).toEqual([]);
    });

    it("OutBlock_1 이 아예 없는 응답도 빈 결과로 흡수", async () => {
        const adapter: KrxByddTrdSource = {
            getByddTrd: () => Promise.resolve({ status: 200, data: {}, headers: {} }),
        };
        expect(await new KrxDailyStatsAdapter(adapter).getDailyStats("2026-06-26")).toEqual([]);
    });
});
