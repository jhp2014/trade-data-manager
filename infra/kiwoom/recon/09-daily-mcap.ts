// 정찰 9: 당일 시총용 ka10099 필드 실측 — listCount(상장주식수)·lastPrice(전일종가) 핀 박기.
// 닫을 미지수(설계 입력):
//   ① listCount 단위 — 주냐 천주냐. 앵커: 삼성전자 현재총수 ≈ 5,846,278,608.
//      listCount=5846279 면 천주(×1000), 5846278608 이면 주.
//   ② lastPrice 가 어느 날 종가 — 백필 저장값과 대조해 직전거래일 종가인지 + 호출시점 기준 정합 확인.
//      (백필 2026-06-29 행: 삼성 1984.8조 = shares × close(직전거래일). lastPrice×listCount 가 이와 같으면 정합.)
//   ③ 백필 원주가(ka10081 upd_stkpc_tp:0)와 lastPrice 가 같은 숫자인지(경계일 시총 튐 방지).
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:dailymcap
import { makeKiwoom, saveExploration, handleError } from "./_shared.js";

// 앵커 종목 + 백필이 저장한 2026-06-29 행 시총(직전거래일 종가 기준) — 정합 대조용.
const ANCHORS: Record<string, { name: string; storedMcap: string }> = {
    "005930": { name: "삼성전자", storedMcap: "1984811587416000" },
    "000660": { name: "SK하이닉스", storedMcap: "1905053421645000" },
    "005380": { name: "현대차", storedMcap: "98386106563000" },
    "000810": { name: "삼성화재", storedMcap: "28395492000000" }, // 백필 폴백 종목
};

const jo = (v: bigint): string => `${(Number(v) / 1e12).toFixed(2)}조`;

async function main() {
    const k = makeKiwoom();
    // 코스피·코스닥 전부(getStockList 가 개별주식 필터 내장).
    const [kospi, kosdaq] = await Promise.all([k.rest.getStockList("0"), k.rest.getStockList("10")]);
    const all = [...kospi, ...kosdaq];
    const byCode = new Map(all.map((e) => [e.code, e]));

    console.log(`\n총 ${all.length}종목 (코스피 ${kospi.length} + 코스닥 ${kosdaq.length})`);
    console.log("\n앵커 검증 (listCount × lastPrice vs 백필 저장 시총):");
    const probe: Record<string, unknown>[] = [];
    for (const [code, { name, storedMcap }] of Object.entries(ANCHORS)) {
        const e = byCode.get(code);
        if (!e) {
            console.log(`  ${code} ${name}: (없음)`);
            continue;
        }
        const lc = BigInt(String(e.listCount).trim() || "0");
        const lp = BigInt(String(e.lastPrice).replace(/^[+-]/, "").trim() || "0");
        const raw = lc * lp; // listCount=주 가정
        const x1000 = raw * 1000n; // listCount=천주 가정
        const stored = BigInt(storedMcap);
        console.log(`  ${code} ${name}`);
        console.log(`     listCount=${e.listCount}  lastPrice=${e.lastPrice}  regDay=${e.regDay}`);
        console.log(`     주가정  = ${jo(raw)}    천주가정 = ${jo(x1000)}    백필저장 = ${jo(stored)}`);
        probe.push({ code, name, listCount: e.listCount, lastPrice: e.lastPrice, raw: raw.toString(), x1000: x1000.toString(), storedMcap });
    }

    saveExploration({
        apiId: "ka10099",
        label: "daily-mcap-fields",
        request: { markets: ["0", "10"] },
        response: { total: all.length, sampleKeys: all[0] ? Object.keys(all[0]) : [], probe },
    });
}

main().catch(handleError);
