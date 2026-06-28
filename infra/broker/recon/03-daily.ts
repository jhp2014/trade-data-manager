// 정찰 3: KiwoomDailyAdapter 실측 — 일봉 어댑터를 실 키움 클라이언트에 물려 두 가설을 확인한다.
//   ① range 경계: getDailyCandles(code,{from,to}) 가 [from,to] 안의 날짜만, 오름차순으로 주는가.
//   ② 양시장 항상 제공: 신규상장/저유동 종목도 UN(코드_AL)·KRX 양쪽 날짜집합이 일치하는가
//      (불일치 = merge 가 skip → "일봉도 nullable 필요" 신호. 일치면 현행 krx·un 둘 다 필수 유지가 옳음).
//   ③ 거래대금 단위: amount(원) ÷ volume(주) 가 당일 가격범위 안인가(×1e6 환산 sanity).
// 사용: pnpm --filter @trade-data-manager/broker recon:daily [종목코드] [from YYYY-MM-DD] [to YYYY-MM-DD]
//       신규상장 검증은 최근 상장 종목코드를 넣고 상장 전후를 from..to 로 잡아 확인.
import fs from "node:fs";
import path from "node:path";
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { KiwoomDailyAdapter } from "../src/daily/kiwoomDailyAdapter.js";

function ymd(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
    const stockCode = process.argv[2] || "005930";
    const to = process.argv[4] || ymd(new Date());
    const from =
        process.argv[3] ||
        (() => {
            const d = new Date(to);
            d.setMonth(d.getMonth() - 1); // 기본 최근 한 달
            return ymd(d);
        })();

    const kw = createKiwoom();
    const adapter = new KiwoomDailyAdapter(kw.rest);

    console.log(`종목=${stockCode}  범위=[${from} .. ${to}]`);
    const candles = await adapter.getDailyCandles(stockCode, { from, to });

    // ① 경계 + 정렬
    const dates = candles.map((c) => c.date);
    const sorted = [...dates].sort();
    const inRange = dates.every((d) => d >= from && d <= to);
    const ascending = JSON.stringify(dates) === JSON.stringify(sorted);
    console.log(`① 경계: ${candles.length}봉  [${dates[0]} .. ${dates[dates.length - 1]}]  ` +
        `inRange=${inRange ? "✅" : "❌"}  오름차순=${ascending ? "✅" : "❌"}`);

    // ③ 거래대금 단위 sanity — 첫·마지막 봉
    for (const c of [candles[0], candles[candles.length - 1]].filter(Boolean)) {
        const vol = BigInt(c.un.volume || "0");
        const amt = BigInt(c.un.amount || "0");
        const avg = vol > 0n ? amt / vol : 0n;
        const lo = Number(c.un.low), hi = Number(c.un.high);
        const ok = vol === 0n || (Number(avg) >= lo * 0.5 && Number(avg) <= hi * 1.5);
        console.log(`③ ${c.date} UN  amount=${c.un.amount}원 vol=${c.un.volume}  평균가≈${avg}  ` +
            `(범위 ${lo}~${hi})  단위 sanity=${ok ? "✅" : "⚠️"}`);
    }

    // 로그: 양시장 일치 여부는 raw 로 떠서 사람이 본다(어댑터 머지가 이미 skip 처리하므로,
    // skip 된 날짜를 직접 보려면 양쪽 raw 날짜집합을 비교).
    const krxRaw = await kw.rest.getDailyChartsForRange(stockCode, from.replace(/-/g, ""), to.replace(/-/g, ""));
    const unRaw = await kw.rest.getDailyChartsForRange(`${stockCode}_AL`, from.replace(/-/g, ""), to.replace(/-/g, ""));
    const inWin = (dt: string) => dt >= from.replace(/-/g, "") && dt <= to.replace(/-/g, "");
    const krxDates = new Set(krxRaw.map((r) => r.dt).filter(inWin));
    const unDates = new Set(unRaw.map((r) => r.dt).filter(inWin));
    const onlyUn = [...unDates].filter((d) => !krxDates.has(d));
    const onlyKrx = [...krxDates].filter((d) => !unDates.has(d));
    console.log(`② 양시장 날짜집합: KRX=${krxDates.size} UN=${unDates.size}  ` +
        `UN전용=${onlyUn.length} KRX전용=${onlyKrx.length}  ` +
        `${onlyUn.length === 0 && onlyKrx.length === 0 ? "✅ 일치 → 둘다 필수 유지 옳음" : "⚠️ 불일치 → nullable 검토"}`);
    if (onlyUn.length) console.log(`   UN전용 날짜: ${onlyUn.join(", ")}`);
    if (onlyKrx.length) console.log(`   KRX전용 날짜: ${onlyKrx.join(", ")}`);

    const dir = path.resolve(process.cwd(), "logs/raw-samples");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `daily-${stockCode}-${ymd(new Date())}.json`);
    fs.writeFileSync(file, JSON.stringify({ stockCode, from, to, candles, onlyUn, onlyKrx }, null, 2), "utf-8");
    console.log(`💾 Saved: ${file}`);
}

main().catch((err) => {
    console.error("\n❌ 정찰 실패");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
