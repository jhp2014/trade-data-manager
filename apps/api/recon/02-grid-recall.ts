// 손 타점 재현율 실측 — 캘리브레이션 셋(curation review_points, 로컬 미러)과 자동 Point 를 ±N분 매칭.
// 미재현은 사유를 분류해 남긴다 — 이 목록이 검출 규칙/파라미터를 고치는 재료다.
//
// 실행 전 미러 신선도: pnpm --filter @trade-data-manager/db-ops sync (안 하면 최근 손 타점이 안 보인다)
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:grid-recall -- --tolerance 3
// 플래그: --tolerance(분) + 01 과 같은 검출/판정 플래그(--dir·--zigzag·--floor·--sessionStart/End·--gateBase/Renewal·--exclude·--merge·--bull)
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import {
    DEFAULT_GRID_OPTIONS,
    DEFAULT_POINT_DEFINITION,
    pointsOf,
    type DerivedPoint,
    type PointGrid,
} from "@trade-data-manager/market";
import { axisDepsOf } from "../src/market/rank/axisDeps.js";
import { fileGridStore, type PointGridFile } from "../src/market/grid/gridStore.js";
import { PointGrids } from "../src/market/grid/pointGrids.js";
import { numFlag, saveReport, strFlag, toMin } from "./_shared.js";

const KRW_PER_EOK = 100_000_000n;

/** 미재현 사유 — 손 타점 근처(±tolerance)의 격자 상태를 보고 하나로 좁힌다. */
function diagnose(grid: PointGrid | undefined, handMin: number, def: typeof DEFAULT_POINT_DEFINITION, tolerance: number): string {
    if (!grid) return "격자 없음(기준선 미확정·재료 없음)";
    if (grid.touchMin === null) return "기준선 미터치(그날 기준선에 안 닿음)";
    const near = grid.newHighs.filter((e) => Math.abs(e.min - handMin) <= tolerance);
    if (near.length === 0) return "근처 신고가 캔들 없음(신고가 아님 또는 floor 20억 미달)";
    if (def.bullOnly && near.every((e) => !(e.close > e.open))) return "근처 후보 전부 음봉";
    if (near.every((e) => e.min <= def.excludeUptoMin)) return `제외 창(~${def.excludeUptoMin}분) 안`;
    const gate = BigInt(def.renewalGateEok) * KRW_PER_EOK;
    if (near.every((e) => BigInt(e.tv) < gate)) return `게이트 미달(재돌파 ${def.renewalGateEok}억 기준)`;
    return "레벨 불충족(그 레벨 Point 를 다른 캔들이 선점·마디 미확정·병합)";
}

async function main(): Promise<void> {
    const tolerance = numFlag("tolerance", 3);
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
        bullOnly: numFlag("bull", DEFAULT_POINT_DEFINITION.bullOnly ? 1 : 0) !== 0,
    };

    const pool = createPoolFromEnv();
    const deps = axisDepsOf(pool);
    const store = fileGridStore(strFlag("dir"));
    const grids = new PointGrids({ deps, store, detect });

    console.log("⏳ 대사(격자 최신화)…");
    const recon = await grids.reconcile();
    console.log(`대사: 기대 ${recon.charts} · 구움 ${recon.baked} · 히트 ${recon.kept} · 재료없음 ${recon.materialMissing.length} · 실패 ${recon.failed}`);
    if (recon.failed > 0) console.warn(`⚠ 굽기 실패 ${recon.failed}건 — 그만큼 빠진 모수 위에서 재현율을 잰다`);

    const handPoints = await deps.reviewPoints.listAllPoints();
    console.log(`손 타점(캘리브레이션 셋): ${handPoints.length}건`);

    const fileCache = new Map<string, PointGridFile | null>();
    const readFile = async (date: string): Promise<PointGridFile | null> => {
        if (!fileCache.has(date)) fileCache.set(date, await store.read(date));
        return fileCache.get(date) ?? null;
    };

    interface MatchRow {
        stockCode: string;
        date: string;
        hand: string;
        auto: { min: number; kind: string; ordinal: number } | null;
        deltaMin: number | null;
        reason?: string;
    }
    const rows: MatchRow[] = [];
    const autoCountByChart = new Map<string, number>();
    for (const p of handPoints) {
        const file = await readFile(p.date);
        const grid = file?.charts[p.stockCode]?.grid;
        const handMin = toMin(p.time);
        const derived: DerivedPoint[] = grid ? pointsOf(grid, def) : [];
        const chartKey = `${p.stockCode}|${p.date}`;
        if (grid && !autoCountByChart.has(chartKey)) autoCountByChart.set(chartKey, derived.length);
        let best: DerivedPoint | null = null;
        for (const d of derived) {
            if (Math.abs(d.min - handMin) > tolerance) continue;
            if (!best || Math.abs(d.min - handMin) < Math.abs(best.min - handMin)) best = d;
        }
        rows.push({
            stockCode: p.stockCode,
            date: p.date,
            hand: p.time.slice(0, 5),
            auto: best ? { min: best.min, kind: best.kind, ordinal: best.ordinal } : null,
            deltaMin: best ? best.min - handMin : null,
            ...(best ? {} : { reason: diagnose(grid, handMin, def, tolerance) }),
        });
    }

    const matched = rows.filter((r) => r.auto !== null);
    const unmatched = rows.filter((r) => r.auto === null);
    const reasonCounts: Record<string, number> = {};
    for (const r of unmatched) reasonCounts[r.reason!] = (reasonCounts[r.reason!] ?? 0) + 1;
    const autoTotal = [...autoCountByChart.values()].reduce((a, b) => a + b, 0);
    // 과검출 배율의 분자·분모는 같은 모수(격자 있는 차트)여야 한다 — 격자 없는 차트의 손 타점을 분모에
    // 넣으면 배율이 눌려 보인다.
    const handOnGridCharts = rows.filter((r) => autoCountByChart.has(`${r.stockCode}|${r.date}`)).length;

    console.log(`\n✅ 재현 ${matched.length}/${rows.length} (${rows.length ? ((matched.length / rows.length) * 100).toFixed(1) : "0"}%) · 허용 ±${tolerance}분`);
    console.log(`   과검출 규모: 격자 있는 차트 ${autoCountByChart.size}개 — 자동 Point ${autoTotal}개 vs 손 ${handOnGridCharts}개`);
    console.log("   미재현 사유:");
    for (const [reason, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) console.log(`     · ${reason}: ${n}`);
    for (const r of unmatched) console.log(`     ✗ ${r.stockCode} ${r.date} ${r.hand} — ${r.reason}`);

    saveReport("grid-recall", { tolerance, detect, pointDefinition: def, reconcile: { ...recon, materialMissing: recon.materialMissing.length }, recall: { matched: matched.length, total: rows.length }, reasonCounts, autoPerChart: { charts: autoCountByChart.size, autoTotal, handOnGridCharts }, rows });
    await pool.end();
}

main().catch((err) => {
    console.error("❌ grid-recall 실패", err);
    process.exit(1);
});
