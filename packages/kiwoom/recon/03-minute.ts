// 정찰 3: 분봉차트(ka10080) 단일 페이지 응답 확인
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:minute [종목코드] [기준일자YYYYMMDD]
import { makeKiwoom, saveExploration, argv, today, handleError } from "./_shared.js";

async function main() {
    const stockCode = argv(2, "005930");
    const baseDate = argv(3, today());
    const k = makeKiwoom();

    const res = await k.rest.getMinuteChart(stockCode, { baseDate });
    const candles = res.data.stk_min_pole_chart_qry ?? [];
    saveExploration({
        apiId: "ka10080",
        label: `${stockCode}-${baseDate || "latest"}`,
        request: { stk_cd: stockCode, tic_scope: "1", base_dt: baseDate },
        headers: { contYn: res.contYn, nextKey: res.nextKey },
        response: {
            stk_cd: res.data.stk_cd,
            candleCount: candles.length,
            firstCandle: candles[0] ?? null,
            lastCandle: candles[candles.length - 1] ?? null,
        },
    });
}

main().catch(handleError);
