// 정찰 4: 시장구분(KRX/NXT/통합) 비교 — NXT 통합 누적거래대금·전일종가 기준 실측.
// FID_COND_MRKT_DIV_CODE: J=KRX, NX=NXT, UN=통합(KRX+NXT) 추정 → 실측으로 확정.
// 질문: ①통합 누적대금이 시작부터 누적되는가 ②NXT종목은 NXT누적 위에 정규장 통합이 얹히는가
//       ③전일종가(stck_prdy_clpr)가 KRX기준인가 NXT기준인가 ④KRX% vs NXT% 차이
// 사용: pnpm --filter @trade-data-manager/kis recon:market [종목코드] [날짜YYYYMMDD]
import { makeKis, saveExploration, argv, today, handleError } from "./_shared.js";

const CODES = ["J", "NX", "UN"] as const;

async function main() {
    const stockCode = argv(2, "005930");
    const date = argv(3, today()); // 일별분봉이라 과거일도 가능
    const k = makeKis();

    const rows: Record<string, unknown> = {};
    for (const code of CODES) {
        try {
            const res = await k.rest.getDailyMinuteChart(stockCode, { date, marketDiv: code, time: "153000" });
            const o1 = res.data.output1 ?? {};
            const c = res.data.output2 ?? [];
            const newest = c[0] ?? null; // 15:30 근처(최신)
            const oldest = c[c.length - 1] ?? null;
            rows[code] = {
                rt_cd: res.data.rt_cd,
                msg1: res.data.msg1,
                o1_prdy_clpr: o1.stck_prdy_clpr,
                o1_prdy_ctrt: o1.prdy_ctrt,
                o1_prpr: o1.stck_prpr,
                o1_acml_vol: o1.acml_vol,
                o1_acml_tr_pbmn: o1.acml_tr_pbmn,
                candleCount: c.length,
                newestCandle: newest && { t: newest.stck_cntg_hour, prpr: newest.stck_prpr, acml_tr_pbmn: newest.acml_tr_pbmn },
                oldestCandle: oldest && { t: oldest.stck_cntg_hour, prpr: oldest.stck_prpr, acml_tr_pbmn: oldest.acml_tr_pbmn },
            };
        } catch (e) {
            rows[code] = { error: (e as Error).message };
        }
    }

    saveExploration({
        trId: "FHKST03010230",
        label: `market-compare-${stockCode}-${date}`,
        request: { stockCode, date, codes: CODES },
        response: rows,
    });
}

main().catch(handleError);
