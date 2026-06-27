// 정찰 2: 주식당일분봉조회(FHKST03010200) — 핵심은 acml_tr_pbmn(누적거래대금) 실재 확인.
// 사용: pnpm --filter @trade-data-manager/kis recon:minute [종목코드] [기준시간HHMMSS]
import { makeKis, saveExploration, argv, handleError } from "./_shared.js";

async function main() {
    const stockCode = argv(2, "005930");
    const time = argv(3, ""); // 빈값 = 최신
    const k = makeKis();

    const res = await k.rest.getMinuteChart(stockCode, { time });
    const candles = res.data.output2 ?? [];
    const first = candles[0] ?? null;
    const last = candles[candles.length - 1] ?? null;

    saveExploration({
        trId: "FHKST03010200",
        label: `${stockCode}-${time || "latest"}`,
        request: { stockCode, time, FID_COND_MRKT_DIV_CODE: "J", FID_PW_DATA_INCU_YN: "Y" },
        headers: { trCont: res.trCont, rt_cd: res.data.rt_cd, msg_cd: res.data.msg_cd, msg1: res.data.msg1 },
        response: {
            output1Keys: Object.keys(res.data.output1 ?? {}),
            candleCount: candles.length,
            firstCandle: first,
            lastCandle: last,
            // 핵심 검증: 누적거래대금이 분봉마다 실제로 채워지는가 + 단조증가하는가.
            acmlTrPbmnSample: candles.slice(0, 5).map((c) => ({ t: c.stck_cntg_hour, acml_tr_pbmn: c.acml_tr_pbmn })),
        },
        raw: res.data, // output1 전체 필드명·output2 전체 row 보존(사후 검수)
    });
}

main().catch(handleError);
