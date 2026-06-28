// 한 종목 수직 슬라이스 ingest CLI(composition root 진입점).
// 전종목 스윕·크론은 다음 단계 — 여기선 실 키움/KIS/Postgres 와 붙어 끝까지 흐르는지 검증한다.
//
// 사용법: pnpm --filter @trade-data-manager/ingest start <종목코드> [분봉날짜 YYYY-MM-DD]
//   - 일봉: 항상 기본 1.5년 범위 수집(+자가치유 overwrite 판정)
//   - 분봉: 날짜 인자가 그 날, 생략 시 오늘(Asia/Seoul). 비거래일이면 saved=0 정상.
import { seoulToday } from "@trade-data-manager/market";
import { createIngestRuntime } from "./composition.js";

async function main(): Promise<void> {
    const [stockCode, minuteDate] = process.argv.slice(2);
    if (!stockCode) {
        console.error("사용법: pnpm --filter @trade-data-manager/ingest start <종목코드> [분봉날짜 YYYY-MM-DD]");
        process.exit(1);
    }
    const date = minuteDate ?? seoulToday();

    const rt = createIngestRuntime();
    try {
        console.log(`▶ 일봉 수집: ${stockCode} (기본 1.5년 범위)`);
        const daily = await rt.ingest.ingestDailyCandles(stockCode);
        console.log(`  ✓ healed=${daily.healed} saved=${daily.saved}`);

        console.log(`▶ 분봉 수집: ${stockCode} @ ${date}`);
        const minute = await rt.ingest.ingestMinuteCandles(stockCode, date);
        console.log(`  ✓ saved=${minute.saved}${minute.saved === 0 ? " (비거래일이면 0 정상)" : ""}`);

        console.log("✅ 완료");
    } catch (err) {
        console.error("\n❌ ingest 실패");
        console.error(err instanceof Error ? (err.stack ?? err.message) : err);
        process.exitCode = 1;
    } finally {
        await rt.close();
    }
}

void main();
