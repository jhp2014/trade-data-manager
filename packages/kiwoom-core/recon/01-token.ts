// 정찰 1: 모든 자격증명의 접근토큰 발급 확인 (멀티키 검수)
// 사용: pnpm --filter @trade-data-manager/kiwoom-core recon:token
import { makeKiwoom, handleError } from "./_shared.js";

async function main() {
    const k = makeKiwoom();
    console.log(`🔑 자격증명 풀 크기: ${k.pool.size}개`);
    const results = await k.pool.warmAll(true); // 강제 재발급
    for (const r of results) {
        console.log(r.ok ? `  ✅ ${r.id}` : `  ❌ ${r.id} — ${r.error}`);
    }
    const okCount = results.filter((r) => r.ok).length;
    console.log(`\n발급 성공 ${okCount}/${results.length}. 유효 처리량 ≈ ${okCount} × 5건/초 (TR당).`);
    if (okCount === 0) process.exit(1);
}

main().catch(handleError);
