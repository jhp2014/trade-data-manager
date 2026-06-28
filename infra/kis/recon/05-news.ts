// 정찰 5: 종합 시황/공시(제목) FHKST01011800 — 응답 output 필드명·내용 실측.
// 사용: pnpm --filter @trade-data-manager/kis recon:news [종목코드(선택)]
//   종목코드 없으면 전체 시황 뉴스, 주면 해당 종목 뉴스.
import { makeKis, saveExploration, argv, handleError } from "./_shared.js";

async function main() {
    const stockCode = argv(2, ""); // 빈값 = 전체 시황
    const k = makeKis();

    const res = await k.rest.getNewsTitles({ stockCode });
    const list = res.data.output ?? [];

    saveExploration({
        trId: "FHKST01011800",
        label: `news-${stockCode || "all"}`,
        request: { stockCode },
        headers: { trCont: res.trCont, rt_cd: res.data.rt_cd, msg_cd: res.data.msg_cd, msg1: res.data.msg1 },
        response: {
            outputKeys: Object.keys(list[0] ?? {}),
            count: list.length,
            firstThree: list.slice(0, 3),
        },
        raw: res.data,
    });
}

main().catch(handleError);
