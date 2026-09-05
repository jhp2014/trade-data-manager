// 게이트 분포 실측 — 정의층 게이트 스트립(레벨당 최대 자격 대금)의 **정직성 대조** + x 도메인 분위수.
//
// 스트립의 전제(decisions.md 「깔때기 조건 UI」 2026-09-06): 레벨 L 이 Point 를 낳는다 ⟺
// levelMaxTvOf 의 maxTv(L) ≥ gate(L) — 게이트에 대해 단조. 이 등가는 귀속 비감소 정리에 기대므로,
// 판정 규칙이 바뀔 때마다 여기로 다시 잰다(예측이 실행과 갈리면 스트립이 조용히 거짓말한다 — 정지 신호).
//
// 내는 것: ① 게이트별(돌파=레벨0/재돌파=그 밖) maxTv 분위수 — 스트립 x 도메인(로그 상한·p99 접기)의 재료
//          ② 등가 대조 — 게이트 사다리 × 전 차트에서 "예측 소멸(max<gate)" vs "실행(pointsOf) 소멸" 일치
//          ③ 귀속 역행(등가의 전제) 위반 건수
// DB 를 안 본다 — 격자 파일만으로 완결(04 와 같은 성질). 읽기 전용이라 개발 워크트리 금지 규칙 무관.
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:gate-dist
// 플래그: --dir(캐시 루트) · 비게이트 노브(--exclude/--merge/--bull/--approach) · --gates "20,30,50,80,150"
import {
    DEFAULT_POINT_DEFINITION,
    levelMaxTvOf,
    pointsOf,
    type PointDefinition,
} from "@trade-data-manager/market";
import { fileGridStore } from "../src/market/grid/gridStore.js";
import { distributionOf, numFlag, saveReport, strFlag } from "./_shared.js";

const EOK = 100_000_000;

async function main(): Promise<void> {
    const def: PointDefinition = {
        ...DEFAULT_POINT_DEFINITION,
        excludeUptoMin: numFlag("exclude", DEFAULT_POINT_DEFINITION.excludeUptoMin),
        mergeRisePct: numFlag("merge", DEFAULT_POINT_DEFINITION.mergeRisePct),
        bullOnly: numFlag("bull", DEFAULT_POINT_DEFINITION.bullOnly ? 1 : 0) !== 0,
        approachPct: numFlag("approach", DEFAULT_POINT_DEFINITION.approachPct),
    };
    // 게이트는 양의 정수만 — 소수는 pointsOf 의 BigInt 변환이 던져 중도 사망한다(입력 검증이 그 앞을 막는다).
    const gates = (strFlag("gates") ?? "20,30,50,80,150").split(",").map((s) => Number(s.trim()));
    if (gates.length === 0 || gates.some((g) => !Number.isInteger(g) || g <= 0)) {
        throw new Error(`--gates 는 양의 정수 목록이어야 한다(예: "20,30,50"): ${gates.join(",")}`);
    }
    const store = fileGridStore(strFlag("dir"));
    const dates = await store.listDates();
    if (dates.length === 0) throw new Error("격자 캐시가 비어 있다 — 서버 대사(또는 recon:grid-scale)를 먼저 돌릴 것");
    console.log(`${dates.length}일 · 비게이트 노브: 제외 ${def.excludeUptoMin}분 · 병합 ${def.mergeRisePct}% · bullOnly ${def.bullOnly} · 근접 ${def.approachPct}%`);

    // 분위수 재료 — 게이트별 maxTv(억원 환산). 등가 대조 — 게이트 사다리 × (예측, 실행) 교차표.
    const baselineTvs: number[] = [];
    const renewalTvs: number[] = [];
    let charts = 0;
    let emptyLevelCharts = 0; // 자격 캔들 0개라 목록이 빈 차트(기준선은 있는데)
    // 총수와 표본을 가른다 — 표본만 세면 cap(40)에서 포화해 정지 신호의 **규모**를 못 읽는다.
    let mismatchTotal = 0;
    const mismatch: { gate: number; code: string; date: string; levelIdx: number; maxTv: number; predicted: boolean; actual: boolean }[] = [];
    const agree = new Map<number, { levels: number; dead: number }>(gates.map((g) => [g, { levels: 0, dead: 0 }]));

    for (const date of dates) {
        const file = await store.read(date);
        if (!file) {
            console.warn(`⚠ ${date}: 파일 버전 불일치(스킵) — 재굽기 필요`);
            continue;
        }
        for (const [code, entry] of Object.entries(file.charts)) {
            if (entry.grid.base === null) continue;
            charts++;
            const stats = levelMaxTvOf(entry.grid, def);
            if (stats.length === 0) emptyLevelCharts++;
            for (const s of stats) (s.gate === "baseline" ? baselineTvs : renewalTvs).push(s.maxTv / EOK);
            for (const gate of gates) {
                const pts = pointsOf(entry.grid, { ...def, baselineGateEok: gate, renewalGateEok: gate });
                const survived = new Set(pts.map((p) => p.levelIdx));
                const tally = agree.get(gate)!;
                for (const s of stats) {
                    tally.levels++;
                    const predicted = s.maxTv >= gate * EOK;
                    if (!predicted) tally.dead++;
                    const actual = survived.has(s.levelIdx);
                    if (predicted !== actual) {
                        mismatchTotal++;
                        if (mismatch.length < 40) mismatch.push({ gate, code, date, levelIdx: s.levelIdx, maxTv: s.maxTv, predicted, actual });
                    }
                }
                // 역방향 — 목록 밖 레벨이 Point 를 낳으면 등가 위반(자격 0개 레벨의 생존 = 있을 수 없음).
                for (const li of survived) {
                    if (!stats.some((s) => s.levelIdx === li)) {
                        mismatchTotal++;
                        if (mismatch.length < 40) mismatch.push({ gate, code, date, levelIdx: li, maxTv: -1, predicted: false, actual: true });
                    }
                }
            }
        }
    }

    const base = distributionOf(baselineTvs);
    const renew = distributionOf(renewalTvs);
    const p = (v: number): string => v.toFixed(0);
    console.log(`\n── 레벨당 최대 자격 대금(억원) — 스트립 x 도메인 재료 ──`);
    console.log(`돌파(레벨 0, 차트당 ≤1): n ${base.n} · p50 ${p(base.p50)} · p90 ${p(base.p90)} · p99 ${p(base.p99)} · max ${p(base.max)}`);
    console.log(`재돌파(레벨 ≥1):        n ${renew.n} · p50 ${p(renew.p50)} · p90 ${p(renew.p90)} · p99 ${p(renew.p99)} · max ${p(renew.max)}`);
    console.log(`차트 ${charts}(자격 캔들 0개 차트 ${emptyLevelCharts})`);
    console.log(`\n── 등가 대조(게이트 사다리 — 예측 소멸 vs 실행 소멸) ──`);
    for (const gate of gates) {
        const t = agree.get(gate)!;
        console.log(`게이트 ${gate}억: 레벨 ${t.levels} · 예측 소멸 ${t.dead}(${((t.dead / Math.max(1, t.levels)) * 100).toFixed(1)}%)`);
    }
    console.log(`불일치 ${mismatchTotal}(표본 ${mismatch.length}) ${mismatchTotal > 0 ? "⚠ 정지 신호 — 등가 정리 위반(스트립이 거짓말한다)" : "— 통과"}`);

    saveReport("gate-dist", { def: { ...def, baselineGateEok: undefined, renewalGateEok: undefined }, gates, baseline: base, renewal: renew, charts, emptyLevelCharts, agree: [...agree.entries()], mismatchTotal, mismatch });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
