// 정찰 6: WebSocket 조건검색 실측 (CNSRLST 목록 → CNSRREQ 검색).
// connect → LOGIN → 조건식 목록조회 → 첫 조건식(또는 인자 seq) 1회 검색.
// 모든 프레임은 logs/raw-samples/ws-condition-<ts>.jsonl 로 적재된다.
// 사용: pnpm --filter @trade-data-manager/kiwoom-core recon:condition [seq]
// 정본 프로토콜: market-eye/recon/02-condition-list.ts + 03-condition-search.ts
import { makeKiwoom } from "./_shared.js";
import { createKiwoomWs } from "../src/ws.js";
import { createFileFrameLogger } from "../src/ws/frameLogger.js";
import { saveExploration, handleError } from "./_shared.js";

async function main() {
    const seqArg = process.argv[2];
    const k = makeKiwoom();

    const p = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const ts = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const ws = createKiwoomWs(k, { logFrame: createFileFrameLogger(`logs/raw-samples/ws-condition-${ts}.jsonl`) });

    await ws.connect();
    console.log("🔌 연결 + LOGIN 완료.");

    // 1) 조건식 목록 (CNSRLST / ka10171)
    const list = await ws.request({ trnm: "CNSRLST" }, (f) => f.trnm === "CNSRLST");
    const conditions: Array<{ seq: string; name: string }> = Array.isArray(list.data)
        ? list.data.map((c: any) => ({ seq: String(c[0] ?? c.seq), name: String(c[1] ?? c.cnsr_nm ?? "") }))
        : [];
    saveExploration({ apiId: "ka10171", label: "CNSRLST", request: { trnm: "CNSRLST" }, response: list });
    console.log(`\n📋 조건식 ${conditions.length}개:`);
    conditions.forEach((c) => console.log(`   seq=${c.seq}  ${c.name}`));

    if (conditions.length === 0) {
        console.log("\n조건식이 없어 검색은 건너뜀(영웅문에서 조건식을 먼저 등록해야 함).");
        ws.close();
        process.exit(0);
    }

    // 2) 조건검색 (CNSRREQ search_type=0 / ka10172)
    const seq = seqArg ?? conditions[0].seq;
    console.log(`\n🔎 조건식 seq=${seq} 일반검색 요청...`);
    const req = { trnm: "CNSRREQ", seq, search_type: "0", stex_tp: "K" };
    const res = await ws.request(req, (f) => f.trnm === "CNSRREQ" && f.seq === seq, 15000);
    saveExploration({ apiId: "ka10172", label: `CNSRREQ-seq${seq}`, request: req, response: res });

    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`\n📈 충족 종목 ${rows.length}개 (첫 10개):`);
    rows.slice(0, 10).forEach((r: unknown) => console.log("  ", JSON.stringify(r)));

    console.log("\n══════ WS 검수 요약 ══════");
    console.log(`LOGIN ✅ / CNSRLST ${conditions.length}개 ✅ / CNSRREQ seq=${seq} → ${rows.length}종목 ✅`);

    ws.close();
    process.exit(0);
}

main().catch(handleError);
