// 정찰 1: 모든 자격증명의 접근토큰 발급 확인 (멀티키 검수)
// 사용: pnpm --filter @trade-data-manager/kis recon:token
// 주의: KIS 토큰 발급은 1초당 1건 + 24h 유효 → 기본은 캐시 우선(force 안 함). 강제 재발급은 인자 force.
import { makeKis, handleError } from "./_shared.js";

async function main() {
    const force = process.argv[2] === "force";
    const k = makeKis();
    console.log(`🔑 자격증명 풀 크기: ${k.pool.size}개 (force=${force})`);
    const results = await k.pool.warmAll(force);
    for (const r of results) {
        console.log(r.ok ? `  ✅ ${r.id}` : `  ❌ ${r.id} — ${r.error}`);
    }
    const okCount = results.filter((r) => r.ok).length;
    console.log(`\n발급/확인 성공 ${okCount}/${results.length}. 유효 처리량 ≈ ${okCount} × 18건/초 (계좌당).`);
    if (okCount === 0) process.exit(1);
}

main().catch(handleError);
