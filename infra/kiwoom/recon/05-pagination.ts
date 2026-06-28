// 정찰 5: 연속조회(페이지네이션) + 키핀 실측.
// getDailyChartsByCount / getMinuteChartsForDate 가 여러 페이지를 cont-yn/next-key 로
// 안전하게 이어받는지, 시퀀스 전체가 한 키에 핀 고정되는지 실 API 로 확인한다.
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:pagination [종목코드] [거래일YYYYMMDD]
import { makeKiwoom, saveExploration, argv, today, handleError } from "./_shared.js";
import { consoleLogger, type Logger } from "../src/index.js";

// 성공 로그("... [apiId] cred=<id>")에서 apiId 별로 사용된 키 id 를 수집.
function capturingLogger(sink: Array<{ apiId: string; cred: string }>): Logger {
    return {
        ...consoleLogger,
        debug: (m, meta) => {
            const mt = /\[(\w+)\] cred=(\w+)/.exec(String(m));
            if (mt) sink.push({ apiId: mt[1], cred: mt[2] });
            consoleLogger.debug(m, meta);
        },
    };
}

/** 한 시퀀스의 키핀 검증: 사용된 키가 정확히 1개여야 한다. */
function pinReport(calls: Array<{ apiId: string; cred: string }>, apiId: string) {
    const creds = calls.filter((c) => c.apiId === apiId).map((c) => c.cred);
    const distinct = [...new Set(creds)];
    return { pages: creds.length, distinctKeys: distinct, pinned: distinct.length <= 1 };
}

async function main() {
    const stockCode = argv(2, "005930");
    const tradeDate = argv(3, today());

    const calls: Array<{ apiId: string; cred: string }> = [];
    const k = makeKiwoom(capturingLogger(calls));

    // ── 일봉: 1200개 목표 → 1페이지(=600)로 안 끝나고 연속조회 강제 ──
    const targetCount = 1200;
    const daily = await k.rest.getDailyChartsByCount(stockCode, tradeDate, targetCount);
    const dates = daily.map((c) => c.dt);
    const dupDates = dates.filter((d, i) => dates.indexOf(d) !== i);
    const sortedDesc = dates.every((d, i) => i === 0 || dates[i - 1] >= d);
    const dailyPin = pinReport(calls, "ka10081");

    saveExploration({
        apiId: "ka10081",
        label: `pagination-${stockCode}-${tradeDate}`,
        request: { stk_cd: stockCode, base_dt: tradeDate, targetCount },
        response: {
            collected: daily.length,
            pages: dailyPin.pages,
            keyPinned: dailyPin.pinned,
            distinctKeys: dailyPin.distinctKeys,
            duplicateDates: dupDates.length,
            sortedDescending: sortedDesc,
            firstDate: dates[0] ?? null,
            lastDate: dates[dates.length - 1] ?? null,
        },
    });

    // ── 분봉: 특정 거래일 전체 수집 → 여러 페이지 ──
    const minute = await k.rest.getMinuteChartsForDate(stockCode, tradeDate);
    const times = minute.map((c) => c.cntr_tm);
    const dupTimes = times.filter((t, i) => times.indexOf(t) !== i);
    const minutePin = pinReport(calls, "ka10080");

    saveExploration({
        apiId: "ka10080",
        label: `pagination-${stockCode}-${tradeDate}`,
        request: { stk_cd: stockCode, base_dt: tradeDate },
        response: {
            collected: minute.length,
            pages: minutePin.pages,
            keyPinned: minutePin.pinned,
            distinctKeys: minutePin.distinctKeys,
            duplicateTimes: dupTimes.length,
            firstTime: times[0] ?? null,
            lastTime: times[times.length - 1] ?? null,
        },
    });

    // ── 종합 판정 ──
    console.log("\n══════ 페이지네이션 검수 요약 ══════");
    const dailyOk = dailyPin.pages >= 2 && dailyPin.pinned && dupDates.length === 0 && sortedDesc;
    const minuteOk = minutePin.pages >= 1 && minutePin.pinned && dupTimes.length === 0;
    console.log(
        `일봉  ka10081: ${daily.length}개 / ${dailyPin.pages}페이지 / 핀=${dailyPin.pinned} / 중복=${dupDates.length} / 내림차순=${sortedDesc} → ${dailyOk ? "✅" : "❌"}`,
    );
    console.log(
        `분봉  ka10080: ${minute.length}개 / ${minutePin.pages}페이지 / 핀=${minutePin.pinned} / 중복=${dupTimes.length} → ${minuteOk ? "✅" : "❌"}`,
    );
    if (!dailyOk || !minuteOk) process.exit(1);
}

main().catch(handleError);
