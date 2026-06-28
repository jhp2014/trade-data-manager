// 정찰 6: 허봉(FID_FAKE_TICK_INCU_YN) 정체 규명 — Y vs N 비교.
// 가설: 체결 없는 분을 채움봉(직전가·거래량 0)으로 끼워넣는지(Y), 아예 빼는지(N).
// 사용: pnpm --filter @trade-data-manager/kis recon:fake-tick [종목코드] [날짜YYYYMMDD] [기준시간HHMMSS]
import { makeKis, saveExploration, argv, today, handleError } from "./_shared.js";

async function main() {
    const stockCode = argv(2, "005930");
    const date = argv(3, today());
    const time = argv(4, "100000"); // 오전 한산한 시간대가 허봉 차이 잘 드러남
    const k = makeKis();

    const out: Record<string, unknown> = {};
    for (const fakeTick of [false, true]) {
        const res = await k.rest.getDailyMinuteChart(stockCode, { date, time, fakeTick });
        const c = res.data.output2 ?? [];
        const zeroVol = c.filter((x) => Number(x.cntg_vol) === 0).length;
        out[fakeTick ? "fakeTick_Y" : "fakeTick_N"] = {
            candleCount: c.length,
            zeroVolCandles: zeroVol,
            sample: c.slice(0, 12).map((x) => ({ t: x.stck_cntg_hour, prpr: x.stck_prpr, vol: x.cntg_vol })),
        };
    }

    saveExploration({
        trId: "FHKST03010230",
        label: `fake-tick-${stockCode}-${date}-${time}`,
        request: { stockCode, date, time, compare: ["N", "Y"] },
        response: out,
    });
}

main().catch(handleError);
