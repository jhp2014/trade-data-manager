// 정찰 2: 일봉차트(ka10081) 단일 페이지 응답 확인
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:daily [종목코드] [기준일자YYYYMMDD]
import { makeKiwoom, saveExploration, argv, today, handleError } from "./_shared.js";

async function main() {
    const stockCode = argv(2, "005930");
    // 일봉(ka10081)은 base_dt 가 필수 — 빈값이면 0봉이라 기본값을 오늘로 잡는다.
    const baseDate = argv(3, today());
    const k = makeKiwoom();

    const res = await k.rest.getDailyChart(stockCode, { baseDate });
    const candles = res.data.stk_dt_pole_chart_qry ?? [];
    saveExploration({
        apiId: "ka10081",
        label: `${stockCode}-${baseDate || "latest"}`,
        request: { stk_cd: stockCode, base_dt: baseDate },
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
