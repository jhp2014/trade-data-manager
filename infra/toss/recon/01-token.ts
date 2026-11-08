// 정찰 1: 키가 도는가 + 응답의 실제 모양 — 토큰 수명(문서에 없음), 값 타입(BigDecimal 이 문자열인가 숫자인가), 시각 표기, 유량 헤더.
// 1분봉은 두 쪽을 받아 커서의 의미를 확정한다: nextBefore 가 앞 쪽 마지막 봉을 다시 포함하면 페이지 경계에서 봉이 겹친다.
// 사용: pnpm --filter @trade-data-manager/toss recon:token [종목코드=005930]
import { handleError, makeToss, saveJson } from "./_shared.js";

async function main(): Promise<void> {
    const code = process.argv[2] ?? "005930";
    const toss = makeToss();

    const tokenInfo = await toss.rest.issueToken();
    console.log("토큰 응답(칸 이름 + 비밀 아닌 칸):", tokenInfo);

    const minute = await toss.rest.getCandles({ symbol: code, interval: "1m", count: 5 });
    const nextPage = minute.nextBefore
        ? await toss.rest.getCandles({ symbol: code, interval: "1m", count: 5, before: minute.nextBefore })
        : null;
    const daily = await toss.rest.getCandles({ symbol: code, interval: "1d", count: 5 });
    console.log("1m:", JSON.stringify(minute, null, 2));
    console.log("1m 다음 쪽:", JSON.stringify(nextPage, null, 2));
    console.log("1d:", JSON.stringify(daily, null, 2));

    const cursor = {
        pageOldest: minute.candles[minute.candles.length - 1]?.timestamp ?? null,
        nextBefore: minute.nextBefore,
        nextPageNewest: nextPage?.candles[0]?.timestamp ?? null,
    };
    console.log("커서:", cursor, "· 겹침:", cursor.pageOldest !== null && cursor.pageOldest === cursor.nextPageNewest);

    const file = saveJson(`toss-01-token-${code}.json`, { tokenInfo, minute, nextPage, cursor, daily });
    console.log("저장:", file);
}

main().catch(handleError);
