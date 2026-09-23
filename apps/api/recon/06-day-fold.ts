// 격자 접기 대조 — 하루 굽기(zigzag 1%)를 읽기 시점에 p% 로 접은 격자(foldGrid)가 **원본 분봉으로
// 직접 p% 를 구운 격자**와 얼마나 같은지 잰다(decisions.md 「하루 타점 — 서버가 날짜 격자를 굽고
// 클라가 조건으로 뽑는다」). 게이트는 **깨짐 0**(불변식 위반·레벨 뷰/타점 판정 throw) — 근사(사라짐·
// 생김·확정 시각 차)는 크기만 보고한다.
//
// 내는 것: ① 깨짐(접은 격자) — 직접 격자의 같은 검사와 나란히(직접도 깨지면 접기 탓이 아니다)
//          ② 피벗 모양 일치 차트 수 · 확정 시각 차(직접 − 접음, 분 — 이른 경계라 ≥ 0 이 기대, 늦음은
//             피벗 봉의 반대쪽 값이 숨은 근사의 예외라 표본으로 낸다)
//          ③ 마디 재돌파 타점(기준선 없음): 사라짐·생김·시각만 옮김 — onePerLevel 둘 다
//          ④ 기준선 있는 타점(라벨 격자 캐시의 기준선을 빌림, 그 날 캐시가 있을 때만)
//          ⑤ 클래스 ① 차트 수 · 대금 모르는 크로싱 수 · 접기 시간
// DB 는 **읽기만**(분봉·유니버스), 격자 캐시도 읽기만 — 개발 워크트리 금지 규칙 무관.
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:day-fold
// 플래그: --dates "2026-06-17,2026-05-29,2026-09-16" · --pcts "2,3" · --gate(재돌파 억, 30) · --gateBase(돌파 억, 50)
//         · --approach(m', 0.5) · --bull(1|0) · --dir(라벨 격자 캐시 루트)
import { createDb, createPoolFromEnv, DrizzleDailyUniverseProvider, DrizzleMinuteCandleRepository } from "@trade-data-manager/persistence";
import {
    checkGridInvariants,
    DAY_GRID_DETECT_OPTIONS,
    DEFAULT_POINT_DEFINITION,
    detectGrid,
    foldGrid,
    levelViewOf,
    mapWithConcurrency,
    pointsOf,
    type PointDefinition,
    type PointGrid,
} from "@trade-data-manager/market";
import { fileGridStore } from "../src/market/grid/gridStore.js";
import { distributionOf, numFlag, saveReport, strFlag } from "./_shared.js";

/** 깨짐 사유 — 없으면 null. 불변식 위반과 판정 throw 를 한 목록으로. */
function brokenWhy(g: PointGrid, def: PointDefinition): string | null {
    const v = checkGridInvariants(g).violations;
    if (v.length > 0) return v[0];
    try {
        levelViewOf(g);
        pointsOf(g, def, { onePerLevel: true });
        pointsOf(g, def, { onePerLevel: false });
    } catch (err) {
        return `throw: ${err instanceof Error ? err.message : String(err)}`;
    }
    return null;
}

interface PointTally { direct: number; lost: number; added: number; moved: number; samples: string[] }
const tally = (): PointTally => ({ direct: 0, lost: 0, added: 0, moved: 0, samples: [] });

/** 한 차트의 타점 대조 — 시각으로 짝짓고, 짝 없는 것 중 같은 레벨 순번끼리는 "옮김"으로 센다. */
function diffPoints(t: PointTally, tag: string, direct: PointGrid, folded: PointGrid, def: PointDefinition, onePerLevel: boolean): void {
    const a = pointsOf(direct, def, { onePerLevel });
    const b = pointsOf(folded, def, { onePerLevel });
    t.direct += a.length;
    const bMins = new Set(b.map((p) => p.min));
    const aMins = new Set(a.map((p) => p.min));
    const lost = a.filter((p) => !bMins.has(p.min));
    const added = b.filter((p) => !aMins.has(p.min));
    // 옮김 — 사라진 것과 생긴 것이 같은 레벨 가격에 귀속되면 "같은 재돌파가 시각만 달라졌다"로 본다.
    const addedLevels = new Map<number, number>();
    for (const p of added) addedLevels.set(p.levelPrice, (addedLevels.get(p.levelPrice) ?? 0) + 1);
    let moved = 0;
    for (const p of lost) {
        const c = addedLevels.get(p.levelPrice) ?? 0;
        if (c > 0) {
            addedLevels.set(p.levelPrice, c - 1);
            moved++;
        }
    }
    t.moved += moved;
    t.lost += lost.length - moved;
    t.added += added.length - moved;
    if ((lost.length > 0 || added.length > 0) && t.samples.length < 20) {
        const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        t.samples.push(`${tag} 사라짐[${lost.map((p) => `${hm(p.min)}@${p.levelPrice}`).join(",")}] 생김[${added.map((p) => `${hm(p.min)}@${p.levelPrice}`).join(",")}]`);
    }
}

async function main(): Promise<void> {
    const dates = (strFlag("dates") ?? "2026-06-17,2026-05-29,2026-09-16").split(",").map((s) => s.trim());
    const pcts = (strFlag("pcts") ?? "2,3").split(",").map((s) => Number(s.trim()));
    const def: PointDefinition = {
        ...DEFAULT_POINT_DEFINITION,
        baselineGateEok: numFlag("gateBase", 50),
        renewalGateEok: numFlag("gate", 30),
        approachPct: numFlag("approach", 0.5),
        bullOnly: numFlag("bull", 1) !== 0,
    };
    const pool = createPoolFromEnv();
    const db = createDb(pool);
    const minute = new DrizzleMinuteCandleRepository(db);
    const universe = new DrizzleDailyUniverseProvider(db);
    const labelStore = fileGridStore(strFlag("dir"));

    const report: Record<string, unknown> = { dates, pcts, def: { gateBase: def.baselineGateEok, gate: def.renewalGateEok, approach: def.approachPct, bull: def.bullOnly } };
    for (const pct of pcts) {
        let charts = 0;
        let shapeSame = 0;
        let classOneFold = 0;
        let classOneDirect = 0;
        let crossTvUnknown = 0;
        let foldMs = 0;
        const brokenFold: string[] = [];
        const brokenDirect: string[] = [];
        const confirmLead: number[] = []; // 직접 − 접음(분), 짝지은 확정 피벗만
        let confirmLate = 0; // 접음이 직접보다 늦은 확정(이른 경계 가정 위반 — 관찰)
        const confirmSamples: string[] = [];
        const renewal = { one: tally(), all: tally() };
        const withBase = { one: tally(), all: tally(), charts: 0 };

        for (const date of dates) {
            const codes = await universe.stockCodesByDate(date);
            const mins = await mapWithConcurrency(codes, 8, (c: string) => minute.getMinuteCandles(c, date));
            const labelFile = await labelStore.read(date);
            for (let i = 0; i < codes.length; i++) {
                const m = mins[i]!;
                if (m.length === 0) continue;
                const code = codes[i]!;
                const g1 = detectGrid(m, { base: null, prevBase: null, prevBaseKrx: null }, DAY_GRID_DETECT_OPTIONS);
                if (g1 === null) continue;
                const direct = detectGrid(m, { base: null, prevBase: null, prevBaseKrx: null }, { ...DAY_GRID_DETECT_OPTIONS, zigzagPct: pct })!;
                const t0 = performance.now();
                const f = foldGrid(g1, pct);
                foldMs += performance.now() - t0;
                charts++;
                crossTvUnknown += f.crossTvUnknown;

                const bf = brokenWhy(f.grid, def);
                if (bf !== null) brokenFold.push(`${date} ${code}: ${bf}`);
                const bd = brokenWhy(direct, def);
                if (bd !== null) brokenDirect.push(`${date} ${code}: ${bd}`);
                if (checkGridInvariants(f.grid).sessionHighAbovePivots) classOneFold++;
                if (checkGridInvariants(direct).sessionHighAbovePivots) classOneDirect++;

                const key = (g: PointGrid) => g.pivots.map((p) => `${p.kind}${p.min}`).join();
                if (key(f.grid) === key(direct)) shapeSame++;
                const byKey = new Map(direct.pivots.map((p) => [`${p.kind}${p.min}`, p]));
                for (const p of f.grid.pivots) {
                    const d = byKey.get(`${p.kind}${p.min}`);
                    if (!d || d.confirmedMin === null || p.confirmedMin === null) continue;
                    const lead = d.confirmedMin - p.confirmedMin;
                    if (lead < 0) confirmLate++;
                    else confirmLead.push(lead);
                    if ((lead < 0 || lead > 120) && confirmSamples.length < 30) {
                        confirmSamples.push(`${date} ${code} ${p.kind}@${p.min}=${p.price} 직접확정 ${d.confirmedMin} 접음확정 ${p.confirmedMin}`);
                    }
                }

                // 기준선 없음 — 마디 재돌파만(조건 ②).
                if (bf === null && bd === null) {
                    diffPoints(renewal.one, `${date} ${code}`, direct, f.grid, def, true);
                    diffPoints(renewal.all, `${date} ${code}`, direct, f.grid, def, false);
                }
                // 기준선 있음 — 라벨 격자 캐시의 기준선을 빌린다(그 날 캐시가 있을 때만).
                const base = labelFile?.charts[code]?.grid.base ?? null;
                if (base !== null) {
                    const px = { base, prevBase: null, prevBaseKrx: null };
                    const gb1 = detectGrid(m, px, DAY_GRID_DETECT_OPTIONS)!;
                    const db2 = detectGrid(m, px, { ...DAY_GRID_DETECT_OPTIONS, zigzagPct: pct })!;
                    const fb = foldGrid(gb1, pct).grid;
                    if (brokenWhy(fb, def) === null && brokenWhy(db2, def) === null) {
                        withBase.charts++;
                        diffPoints(withBase.one, `${date} ${code}`, db2, fb, def, true);
                        diffPoints(withBase.all, `${date} ${code}`, db2, fb, def, false);
                    }
                }
            }
            console.log(`  ${pct}% · ${date}: 누적 ${charts}차트`);
        }

        const lead = distributionOf(confirmLead);
        const r = {
            charts,
            broken: { fold: brokenFold.length, direct: brokenDirect.length, foldSamples: brokenFold.slice(0, 20), directSamples: brokenDirect.slice(0, 20) },
            shapeSame,
            confirmLead: lead,
            confirmLate,
            confirmSamples,
            classOne: { fold: classOneFold, direct: classOneDirect },
            crossTvUnknown,
            foldMs: { total: Math.round(foldMs), perChartUs: Math.round((foldMs / Math.max(1, charts)) * 1000) },
            renewal,
            withBase,
        };
        report[`pct${pct}`] = r;
        const line = (name: string, t: PointTally) => `${name}: 직접 ${t.direct} · 사라짐 ${t.lost} · 생김 ${t.added} · 옮김 ${t.moved}`;
        console.log(`\n■ ${pct}% — ${charts}차트`);
        console.log(`  깨짐: 접음 ${brokenFold.length} · 직접 ${brokenDirect.length}${brokenFold.length > 0 ? " ❌" : " ✅"}`);
        for (const s of brokenFold.slice(0, 5)) console.log(`    ${s}`);
        console.log(`  피벗 모양 일치 ${shapeSame}/${charts} · 확정 앞섬 p50 ${lead.p50} p90 ${lead.p90} max ${lead.max}분 · 늦음 ${confirmLate}`);
        console.log(`  클래스① 접음 ${classOneFold} · 직접 ${classOneDirect} · 대금 모르는 크로싱 ${crossTvUnknown} · 접기 ${r.foldMs.total}ms(${r.foldMs.perChartUs}µs/차트)`);
        console.log(`  ${line("재돌파(레벨당 하나)", renewal.one)}`);
        console.log(`  ${line("재돌파(전부)", renewal.all)}`);
        console.log(`  기준선 있음 ${withBase.charts}차트 — ${line("레벨당 하나", withBase.one)} / ${line("전부", withBase.all)}`);
    }
    saveReport("day-fold", report);
    await pool.end();
}

main().catch((err) => {
    console.error("❌ day-fold 실패", err);
    process.exit(1);
});
