// 정찰 7: NXT 프리마켓(08:00~08:50) 누적 확인 — UN 누적거래대금이 장전부터 쌓이는가.
// 가설: 통합(UN)은 NXT 프리마켓 거래대금이 09:00 이전부터 누적 → 09:00 봉의 acml_tr_pbmn은 이미 >0.
// 사용: pnpm --filter @trade-data-manager/kis recon:premarket [종목코드] [날짜YYYYMMDD]
import { makeKis, saveExploration, argv, today, handleError } from "./_shared.js";

async function main() {
    const stockCode = argv(2, "005930");
    const date = argv(3, today());
    const k = makeKis();
    const out: Record<string, unknown> = {};

    for (const code of ["J", "UN"] as const) {
        const res = await k.rest.getDailyMinuteChart(stockCode, { date, time: "091000", marketDiv: code });
        const c = (res.data.output2 ?? []).slice().sort((a, b) => a.stck_cntg_hour.localeCompare(b.stck_cntg_hour));
        const before9 = c.filter((x) => x.stck_cntg_hour < "090000");
        const at9 = c.find((x) => x.stck_cntg_hour >= "090000") ?? null;
        out[code] = {
            earliest: c[0] ? { t: c[0].stck_cntg_hour, acml_tr_pbmn: c[0].acml_tr_pbmn, vol: c[0].cntg_vol } : null,
            preMarketCandles: before9.length,
            preMarketSample: before9.slice(0, 4).map((x) => ({ t: x.stck_cntg_hour, acml_tr_pbmn: x.acml_tr_pbmn, vol: x.cntg_vol })),
            firstAt0900plus: at9 && { t: at9.stck_cntg_hour, acml_tr_pbmn: at9.acml_tr_pbmn, vol: at9.cntg_vol },
        };
    }

    saveExploration({
        trId: "FHKST03010230",
        label: `premarket-${stockCode}-${date}`,
        request: { stockCode, date, time: "091000", codes: ["J", "UN"] },
        response: out,
    });
}

main().catch(handleError);
