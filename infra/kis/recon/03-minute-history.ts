// 정찰 3: 과거 분봉 깊이 탐침 — KIS 가 "며칠 전" 분봉을 주는지, 얼마나 멀리 가는지 실측.
// 메모리 [[kis-api-addition]] 의 "1년 분봉 회의적 — recon 필수" 를 닫기 위한 정찰.
//
// 후보 TR: FHKST03010230 (주식일별분봉조회, inquire-time-dailychartprice).
// ⚠️ tr_id/엔드포인트/파라미터는 best-guess(미확정) — 이 recon 의 목적이 곧 그 확정이다.
//    실패하면 응답의 msg_cd/msg1 을 보고 파라미터를 교정한다(문서≠실응답 원칙).
//
// 사용: pnpm --filter @trade-data-manager/kis recon:minute-history [종목코드] [날짜YYYYMMDD] [기준시간HHMMSS]
import { makeKis, saveExploration, argv, today, handleError } from "./_shared.js";
import type { KisResponseBase } from "../src/index.js";

interface KisDailyMinuteResponse extends KisResponseBase {
    output1?: Record<string, string>;
    output2?: Array<Record<string, string>>;
}

async function main() {
    const stockCode = argv(2, "005930");
    const date = argv(3, today());
    const time = argv(4, "153000");
    const k = makeKis();

    const res = await k.rest.get<KisDailyMinuteResponse>(
        "FHKST03010230",
        "/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice",
        {
            FID_COND_MRKT_DIV_CODE: "J",
            FID_INPUT_ISCD: stockCode,
            FID_INPUT_HOUR_1: time,
            FID_INPUT_DATE_1: date,
            FID_PW_DATA_INCU_YN: "Y",
            FID_FAKE_TICK_INCU_YN: "",
        },
    );
    const candles = res.data.output2 ?? [];

    saveExploration({
        trId: "FHKST03010230",
        label: `${stockCode}-${date}-${time}`,
        request: { stockCode, date, time },
        headers: { trCont: res.trCont, rt_cd: res.data.rt_cd, msg_cd: res.data.msg_cd, msg1: res.data.msg1 },
        response: {
            output2Keys: Object.keys(candles[0] ?? {}),
            candleCount: candles.length,
            firstCandle: candles[0] ?? null,
            lastCandle: candles[candles.length - 1] ?? null,
        },
        raw: res.data,
    });
}

main().catch(handleError);
