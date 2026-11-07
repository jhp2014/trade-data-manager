// 정찰 10: 정규장 일봉(ka11081)에 기준일 행이 있는가 — 어댑터의 머지는 KRX 행이 없는 날을 통째 건너뛰므로 저녁 수집 시각에 있어야 한다.
// 평일 수집 전후에 돌려 ka10081 과 나란히 본다. 저장하지 않고 콘솔에만 찍는다.
// 실측(2026-11-08, 12종목 × 일요일 마감 후): 평문 = KRX 09:00~15:30. 09-14 전은 ka10081 과 6칸 전부 일치, 뒤는 종가 = 공식 종가.
//   `_AL` = 통합 09:00~15:30 + 종가는 KRX 종가라 ka10081 `_AL`(UN)과 다르다. 평일 수집 시각의 당일 행은 이 정찰로 확인한다.
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:regular [종목,종목…] [기준일자YYYYMMDD]
import { makeKiwoom, argv, today, handleError } from "./_shared.js";

type Row = { dt: string; open_pric: string; high_pric: string; low_pric: string; cur_prc: string; trde_qty: string };
const show = (r: Row | undefined): string => (r ? `${r.dt} O${r.open_pric} H${r.high_pric} L${r.low_pric} C${r.cur_prc} V${r.trde_qty}` : "행 없음");

async function main() {
    const codes = argv(2, "005930,247540,088280").split(",");
    const baseDate = argv(3, today());
    const k = makeKiwoom();

    console.log(`기준일 ${baseDate}`);
    for (const code of codes) {
        const regular = (await k.rest.getRegularDailyChart(code, false, { baseDate })).data.result_list ?? [];
        const whole = (await k.rest.getRawDailyChart(code, { baseDate })).data.stk_dt_pole_chart_qry ?? [];
        const hit = regular.some((r) => r.dt === baseDate);
        console.log(`${hit ? "✅" : "⚠️ 기준일 행 없음"} ${code}`);
        console.log(`   ka11081 ${show(regular[0])}`);
        console.log(`   ka10081 ${show(whole[0])}`);
    }
}

main().catch(handleError);
