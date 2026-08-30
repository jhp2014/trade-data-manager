// 격자 규모 실측 — 앵커 차트 전수 대사(굽기) 후 크기·이벤트 수·Point 수 분포를 리포트.
// 첫 줄 숫자(총 바이트)가 페이즈 2 "클라 통째 로드" 전제의 생사를 정한다.
//
// 실행(CWD = apps/api — 캐시 루트가 process.cwd() 기준):
//   pnpm --filter @trade-data-manager/api recon:grid-scale
// A/B(검출 파라미터·별도 캐시 루트 — 실캐시 오염 없음):
//   pnpm --filter @trade-data-manager/api recon:grid-scale -- --dir .cache/point-grid-ab --sessionStart 540
// 플래그: --dir · --zigzag(%) · --floor(억) · --sessionStart/--sessionEnd(분) · --gateBase/--gateRenewal(억) · --exclude(분) · --merge(%)
import { gzipSync } from "node:zlib";
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import { DEFAULT_GRID_OPTIONS, DEFAULT_POINT_DEFINITION, pointsOf } from "@trade-data-manager/market";
import { axisDepsOf } from "../src/market/rank/axisDeps.js";
import { fileGridStore } from "../src/market/grid/gridStore.js";
import { PointGrids } from "../src/market/grid/pointGrids.js";
import { distributionOf, numFlag, saveReport, strFlag } from "./_shared.js";

async function main(): Promise<void> {
    const detect = {
        zigzagPct: numFlag("zigzag", DEFAULT_GRID_OPTIONS.zigzagPct),
        floorEok: numFlag("floor", DEFAULT_GRID_OPTIONS.floorEok),
        sessionStartMin: numFlag("sessionStart", DEFAULT_GRID_OPTIONS.sessionStartMin),
        sessionEndMin: numFlag("sessionEnd", DEFAULT_GRID_OPTIONS.sessionEndMin),
    };
    const def = {
        ...DEFAULT_POINT_DEFINITION,
        baselineGateEok: numFlag("gateBase", DEFAULT_POINT_DEFINITION.baselineGateEok),
        renewalGateEok: numFlag("gateRenewal", DEFAULT_POINT_DEFINITION.renewalGateEok),
        excludeUptoMin: numFlag("exclude", DEFAULT_POINT_DEFINITION.excludeUptoMin),
        mergeRisePct: numFlag("merge", DEFAULT_POINT_DEFINITION.mergeRisePct),
    };

    const pool = createPoolFromEnv();
    const deps = axisDepsOf(pool);
    const store = fileGridStore(strFlag("dir"));
    const grids = new PointGrids({ deps, store, detect });

    console.log("⏳ 전수 대사(콜드면 분봉 조회 수천 회 — 수 분 걸릴 수 있음)…");
    const recon = await grids.reconcile();
    console.log(`대사: 기대 ${recon.charts} · 구움 ${recon.baked} · 히트 ${recon.kept} · 재료없음 ${recon.materialMissing.length} · 확정불가 ${recon.unresolved} · ${recon.tookMs}ms`);

    // 저장된 파일 전수를 다시 읽어 분포 집계 — 대사 결과가 아니라 실제 디스크 산출물을 잰다.
    const chartBytes: number[] = [];
    const pivotCounts: number[] = [];
    const newHighCounts: number[] = [];
    const pointCounts: number[] = [];
    const dateBytes: number[] = [];
    let rawTotal = 0;
    let gzTotal = 0;
    let touchless = 0;
    const dates = (await store.listDates()).sort();
    for (const date of dates) {
        const file = await store.read(date);
        if (!file) continue;
        const json = JSON.stringify(file);
        dateBytes.push(json.length);
        rawTotal += json.length;
        gzTotal += gzipSync(json).length;
        for (const entry of Object.values(file.charts)) {
            chartBytes.push(JSON.stringify(entry.grid).length);
            pivotCounts.push(entry.grid.pivots.length);
            newHighCounts.push(entry.grid.newHighs.length);
            pointCounts.push(pointsOf(entry.grid, def).length);
            if (entry.grid.touchMin === null) touchless++;
        }
    }

    const summary = {
        detect,
        pointDefinition: def,
        totalBytes: { raw: rawTotal, gzip: gzTotal, dates: dates.length },
        reconcile: { ...recon, materialMissing: recon.materialMissing.length },
        charts: chartBytes.length,
        touchless,
        chartGridBytes: distributionOf(chartBytes),
        dateFileBytes: distributionOf(dateBytes),
        pivots: distributionOf(pivotCounts),
        newHighs: distributionOf(newHighCounts),
        pointsPerChart: distributionOf(pointCounts),
    };
    console.log(`📐 총량: raw ${(rawTotal / 1e6).toFixed(1)}MB · gzip ${(gzTotal / 1e6).toFixed(1)}MB · ${dates.length}일 ${chartBytes.length}차트`);
    console.log(`   차트당 격자: p50 ${summary.chartGridBytes.p50}B · p90 ${summary.chartGridBytes.p90}B · max ${summary.chartGridBytes.max}B`);
    console.log(`   피벗 p50 ${summary.pivots.p50} · 신고가 p50 ${summary.newHighs.p50} · Point/차트 p50 ${summary.pointsPerChart.p50} (합 ${summary.pointsPerChart.sum})`);
    console.log(`   미터치 차트 ${touchless} · 재료없음 ${recon.materialMissing.length}`);

    saveReport("grid-scale", { ...summary, materialMissing: recon.materialMissing });
    await pool.end();
}

main().catch((err) => {
    console.error("❌ grid-scale 실패", err);
    process.exit(1);
});
