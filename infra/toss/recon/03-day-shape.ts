// 정찰 3: 옛 날짜의 봉이 온전한가 — 원주가(adjusted=false) 하루치를 그날 일봉과 맞춰 본다.
// 재는 것: 봉 수·첫/끝 시각·가장 긴 빈 구간·정규장 밖 봉 수·거래량 합 vs 일봉 거래량·극값 일치·요청 수(백필 비용의 근거).
// 일봉에는 있고 분봉에는 없는 체결(시간외종가 등)이 있다고 문서가 말하므로 거래량 비율이 1 이 아니어도 바로 틀린 건 아니다.
// NXT 이후 날짜는 첫·끝 봉이 NXT 시간대라 openMatch·closeMatch 가 정의 차이로 false 일 수 있다 — NXT 이전 날짜로 품질을 판단할 것.
// 사용: pnpm --filter @trade-data-manager/toss recon:shape [코드,코드…] [YYYY-MM-DD,…]
import { fetchDayCandle, fetchDayMinutes, handleError, listArg, makeToss, minutesOf, num, saveJson } from "./_shared.js";

// NXT 출범(2025-03) 앞 3일 · 뒤 2일
const DEFAULT_DATES = ["2022-11-23", "2023-06-15", "2024-06-14", "2025-04-15", "2026-10-15"];

async function main(): Promise<void> {
    const codes = listArg(2, ["005930", "247540", "003545"]);
    const dates = listArg(3, DEFAULT_DATES);
    const toss = makeToss();
    const rows: unknown[] = [];

    for (const code of codes) {
        for (const date of dates) {
            const { bars, pages, duplicates } = await fetchDayMinutes(toss, code, date, false);
            const day = await fetchDayCandle(toss, code, date, false);
            // 토스는 무거래 분을 거래량 0 평탄봉으로 채워 준다(옛 날짜의 NXT 시간대까지) — 판정은 체결 봉으로만 한다.
            const traded = bars.filter((b) => num(b.volume) > 0);
            if (!traded.length) {
                const empty = { code, date, bars: bars.length, traded: 0, pages, daily: day };
                rows.push(empty);
                console.log(JSON.stringify(empty));
                continue;
            }
            let maxGap = 0;
            for (let i = 1; i < traded.length; i++) {
                maxGap = Math.max(maxGap, minutesOf(traded[i].kstTime) - minutesOf(traded[i - 1].kstTime));
            }
            const volume = traded.reduce((s, b) => s + num(b.volume), 0);
            const high = Math.max(...traded.map((b) => num(b.highPrice)));
            const low = Math.min(...traded.map((b) => num(b.lowPrice)));
            /** 봉 끝 시각 구간별 체결 봉 수·거래량. */
            const session = (from: string, to: string) => {
                const inRange = traded.filter((b) => b.kstTime >= from && b.kstTime <= to);
                return { bars: inRange.length, volume: inRange.reduce((s, b) => s + num(b.volume), 0) };
            };
            const row = {
                code,
                date,
                bars: bars.length,
                traded: traded.length,
                pages,
                duplicates,
                first: traded[0].kstTime,
                last: traded[traded.length - 1].kstTime,
                maxGapMin: maxGap,
                sessions: {
                    pre: session("00:00:00", "09:00:00"),
                    regular: session("09:00:01", "15:20:00"),
                    auction: session("15:20:01", "15:31:00"),
                    post: session("15:31:01", "23:59:59"),
                },
                lastTraded: traded.slice(-3).map((b) => [b.kstTime, b.openPrice, b.highPrice, b.lowPrice, b.closePrice, b.volume]),
                volumeSum: volume,
                daily: day && {
                    open: day.openPrice,
                    high: day.highPrice,
                    low: day.lowPrice,
                    close: day.closePrice,
                    volume: day.volume,
                },
                volumeRatio: day ? volume / num(day.volume) : null,
                highMatch: day ? high === num(day.highPrice) : null,
                lowMatch: day ? low === num(day.lowPrice) : null,
                openMatch: day ? num(traded[0].openPrice) === num(day.openPrice) : null,
                closeMatch: day ? num(traded[traded.length - 1].closePrice) === num(day.closePrice) : null,
            };
            rows.push(row);
            console.log(JSON.stringify(row));
        }
    }

    console.log("\n저장:", saveJson("toss-03-day-shape.json", rows));
}

main().catch(handleError);
