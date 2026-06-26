// 정찰 4: 라운드로빈 키 로테이션 검수.
// 여러 종목을 단발 조회하며 각 호출이 어느 자격증명으로 나갔는지 콘솔에 보여준다.
// 사용: pnpm --filter @trade-data-manager/kiwoom-core recon:rotation [종목코드...]
import { makeKiwoom, handleError } from "./_shared.js";
import { consoleLogger, type Logger } from "../src/index.js";

async function main() {
    const codes = process.argv.slice(2);
    const stocks = codes.length ? codes : ["005930", "000660", "035720", "005380", "051910", "068270"];

    // 성공 로그("... cred=<id>")에서 사용된 키 id 를 수집.
    const served: string[] = [];
    const logger: Logger = {
        ...consoleLogger,
        debug: (m, meta) => {
            const mt = /cred=(\w+)/.exec(String(m));
            if (mt) served.push(mt[1]);
            consoleLogger.debug(m, meta);
        },
    };

    const k = makeKiwoom(logger);
    console.log(`🔁 풀 크기 ${k.pool.size} · 종목 ${stocks.length}개 단발 조회`);

    for (const code of stocks) {
        const res = await k.rest.getStockInfo(code);
        console.log(`  ${code} → ${res.data.name ?? "(이름없음)"}`);
    }

    console.log("\n사용된 키 순서:", served.join(" → "));
    const counts = served.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
    }, {});
    console.log("키별 호출 분포:", JSON.stringify(counts));
}

main().catch(handleError);
