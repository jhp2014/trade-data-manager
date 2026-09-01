// Point 판정 diff 실측 — 읽기 층 규칙이 바뀔 때 갈림을 4분류로 기계 판정한다(격자는 불변).
//
// 왜 grid-diff 로 안 되나: 03 은 **격자**(피벗·신고가) 비교기다. 판정 규칙 변경은 격자를 한 톨도 안
// 바꾸므로 거기선 원리적으로 안 잡힌다. 손 타점 재현율(옛 02)이 이 자리를 메우던 물건인데 손 타점이
// 폐지되면서(2026-09-01) 라벨이 없어졌다 — 그 대체가 **옛 규칙 vs 새 규칙의 전수 대조**다.
//
// 분류(레벨 단위 — 격자·정의가 같으니 levels 배열이 양쪽 동일해서 levelIdx 가 비교 가능한 키가 된다):
//   · 재라벨 — 같은 캔들인데 귀속 레벨이 다르다(돌파 → 재돌파. 이번 개정의 본체)
//   · 이동   — 그 레벨의 Point 가 다른 캔들로 옮겨갔다(귀속 변경으로 게이트가 갈린 자리)
//   · 신설/소멸 — 한쪽에만 있는 레벨
// 셋째 절은 **독립 재계산 대조**다(03 의 순진 재계산과 같은 수법 — ⚠ 판정 정의를 고치면 `naivePoints` 도
// **다시 진술해야** 한다. 구현을 베껴 오면 대조가 동어반복이 되어 그 순간 그물이 사라진다): 격자에서 정의를 브루트포스로 다시
// 진술해(레벨 = prefix max, 귀속 = 위→아래 첫 히트, 레벨당 1개 = claimed **집합**) `pointsOf` 산출과 전량
// 비교한다. 자기 구현의 파생값을 다시 세는 "불변식 스캔"은 동어반복이라 안 쓴다 — 특히 claimed 를 단조
// 커서(usedLevel)가 아니라 집합으로 두고 newHighs 를 **정렬해서** 도는 것이 요점이다: 귀속 단조성과
// 목록 정렬성이라는 두 전제가 실제로 성립할 때만 두 산출이 일치한다.
//
// DB 를 안 본다 — 격자 파일만으로 완결된다(격자 스키마 충분성이 여기서도 증명된다).
// 캐시 신선도는 호출자 책임: 규칙만 바뀐 경우 재굽기는 불필요하고, 격자가 바뀌었다면 서버 대사를 먼저 돌릴 것.
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:point-diff
// 플래그: --dir(캐시 루트) · 판정 노브(--gateBase/--gateRenewal/--exclude/--merge/--bull) · --samples(분류별 표본 수)
import { DEFAULT_POINT_DEFINITION, levelsOf, pointsOf, type DerivedPoint, type GridNewHigh, type PointDefinition, type PointGrid } from "@trade-data-manager/market";
import { fileGridStore } from "../src/market/grid/gridStore.js";
import { numFlag, saveReport, strFlag } from "./_shared.js";

const KRW_PER_EOK = 100_000_000n;

/**
 * 옛 규칙(2026-09-01 이전) 재현 — **레벨별 독립 스캔 + 캔들 선착순(가장 낮은 레벨 승)**.
 * 새 규칙과 한 파일에서 마주 보게 두는 것이 이 도구의 전부다. 규칙이 또 바뀌면 여기를 "직전 규칙"으로
 * 갈아 끼운다(이력 보관소가 아니라 **직전과의 대조기**).
 */
function pointsOfLegacy(grid: PointGrid, def: PointDefinition): DerivedPoint[] {
    if (grid.base === null || grid.touchMin === null) return [];
    const levels = levelsOf(grid, def);
    const gateBase = BigInt(def.baselineGateEok) * KRW_PER_EOK;
    const gateRenewal = BigInt(def.renewalGateEok) * KRW_PER_EOK;
    const chosen = new Map<number, { levelIdx: number; e: GridNewHigh }>();
    for (let li = 0; li < levels.length; li++) {
        const level = levels[li];
        const gate = level.renewal ? gateRenewal : gateBase;
        for (const e of grid.newHighs) {
            if (e.min <= def.excludeUptoMin) continue;
            if (def.bullOnly && !(e.close > e.open)) continue;
            if (level.renewal ? e.high <= level.price : e.high < level.price) continue;
            if (BigInt(e.tv) < gate) continue;
            if (!chosen.has(e.min)) chosen.set(e.min, { levelIdx: li, e });
            break;
        }
    }
    return [...chosen.values()]
        .sort((a, b) => a.e.min - b.e.min)
        .map((c, i) => ({
            kind: c.levelIdx === 0 ? ("breakout" as const) : ("renewal" as const),
            ordinal: i,
            min: c.e.min,
            high: c.e.high,
            close: c.e.close,
            tv: c.e.tv,
            levelPrice: levels[c.levelIdx].price,
            levelIdx: c.levelIdx,
            levelMin: levels[c.levelIdx].min,
        }));
}

/**
 * 정의의 브루트포스 재진술 — 검출 구현(단조 커서 usedLevel·입력 순서 신뢰)과 **다른 형태**라 전제 위반을
 * 잡을 수 있는 진짜 독립 구현이다: 레벨은 prefix max 로 O(n²) 재계산하고, 캔들은 min 으로 **정렬해서**
 * 돌며, 레벨당 1개는 커서가 아니라 claimed **집합**으로 막는다. 두 산출이 갈리면 귀속 단조성이나 격자
 * 정렬성 중 하나가 깨진 것이다(= 정지 신호).
 */
function naivePoints(grid: PointGrid, def: PointDefinition): DerivedPoint[] {
    if (grid.base === null || grid.touchMin === null) return [];
    const base = grid.base;
    const highs = grid.pivots.filter((p) => p.kind === "high" && p.confirmedMin !== null);
    const lowBefore = (min: number): number | null => {
        const lows = grid.pivots.filter((p) => p.kind === "low" && p.min < min);
        return lows.length > 0 ? lows[lows.length - 1].price : null;
    };
    const levels: { price: number; renewal: boolean; min: number | null }[] = [{ price: base, renewal: false, min: null }];
    for (const h of highs) {
        if (h.price <= Math.max(base, ...levels.map((l) => l.price))) continue;
        const low = lowBefore(h.min);
        if (def.mergeRisePct > 0 && low !== null && ((h.price - low) / low) * 100 < def.mergeRisePct) continue;
        levels.push({ price: h.price, renewal: true, min: h.min });
    }

    const gate = (renewal: boolean): bigint => BigInt(renewal ? def.renewalGateEok : def.baselineGateEok) * KRW_PER_EOK;
    const claimed = new Set<number>();
    const out: DerivedPoint[] = [];
    for (const e of [...grid.newHighs].sort((a, b) => a.min - b.min)) {
        if (e.min <= def.excludeUptoMin) continue;
        if (def.bullOnly && !(e.close > e.open)) continue;
        const crossed = levels.map((l, i) => ({ l, i })).filter(({ l }) => (l.renewal ? e.high > l.price : e.high >= l.price));
        if (crossed.length === 0) continue;
        const top = crossed[crossed.length - 1];
        if (claimed.has(top.i)) continue;
        if (BigInt(e.tv) < gate(top.l.renewal)) continue;
        claimed.add(top.i);
        out.push({
            kind: top.i === 0 ? "breakout" : "renewal",
            ordinal: out.length,
            min: e.min,
            high: e.high,
            close: e.close,
            tv: e.tv,
            levelPrice: top.l.price,
            levelIdx: top.i,
            levelMin: top.l.min,
        });
    }
    return out;
}

/** 값 정규화 — 대조가 필드 **순서**가 아니라 값에 걸리게(구현에서 필드를 재배치해도 오경보가 없게). */
const canon = (ps: readonly DerivedPoint[]): string =>
    JSON.stringify(ps.map((p) => [p.kind, p.ordinal, p.min, p.high, p.close, p.tv, p.levelPrice, p.levelIdx, p.levelMin]));

interface DiffRow {
    code: string;
    date: string;
    levelIdx: number;
    old?: { min: number; kind: string; levelIdx: number };
    now?: { min: number; kind: string; levelIdx: number };
}

async function main(): Promise<void> {
    const def: PointDefinition = {
        ...DEFAULT_POINT_DEFINITION,
        baselineGateEok: numFlag("gateBase", DEFAULT_POINT_DEFINITION.baselineGateEok),
        renewalGateEok: numFlag("gateRenewal", DEFAULT_POINT_DEFINITION.renewalGateEok),
        excludeUptoMin: numFlag("exclude", DEFAULT_POINT_DEFINITION.excludeUptoMin),
        mergeRisePct: numFlag("merge", DEFAULT_POINT_DEFINITION.mergeRisePct),
        bullOnly: numFlag("bull", DEFAULT_POINT_DEFINITION.bullOnly ? 1 : 0) !== 0,
    };
    const sampleCap = numFlag("samples", 20);
    const store = fileGridStore(strFlag("dir"));
    const dates = await store.listDates();
    if (dates.length === 0) throw new Error("격자 캐시가 비어 있다 — 서버 대사(또는 recon:grid-scale)를 먼저 돌릴 것");
    console.log(`격자 캐시: ${dates.length}일 · 정의 게이트 ${def.baselineGateEok}/${def.renewalGateEok}억 · 제외 ${def.excludeUptoMin}분 · 병합 ${def.mergeRisePct}% · bullOnly ${def.bullOnly}`);

    const counts = { charts: 0, gridsWithPoints: 0, equal: 0, relabeled: 0, moved: 0, added: 0, removed: 0 };
    const kinds = { oldBreakout: 0, oldRenewal: 0, nowBreakout: 0, nowRenewal: 0 };
    const samples: Record<"relabeled" | "moved" | "added" | "removed", DiffRow[]> = { relabeled: [], moved: [], added: [], removed: [] };
    const push = (bucket: keyof typeof samples, row: DiffRow): void => {
        counts[bucket]++;
        if (samples[bucket].length < sampleCap) samples[bucket].push(row);
    };
    const naive = { ok: 0, okWithPoints: 0, bad: [] as { code: string; date: string; expected: unknown; actual: unknown }[] };
    const removedByLevel = new Map<number, number>(); // 소멸의 레벨 분해 — "전부 레벨 0" 주장이 리포트로 자립하게
    const gridOrder = { minOrder: 0, highMonotone: 0 }; // 논증이 기대는 격자 전제(파일이 실제로 그런가)

    for (const date of dates) {
        const file = await store.read(date);
        if (!file) {
            console.warn(`⚠ ${date}: 파일 버전 불일치(스킵) — 재굽기 필요`);
            continue;
        }
        for (const [code, entry] of Object.entries(file.charts)) {
            counts.charts++;
            const old = pointsOfLegacy(entry.grid, def);
            const now = pointsOf(entry.grid, def);
            if (old.length > 0 || now.length > 0) counts.gridsWithPoints++;
            for (const p of old) (p.kind === "breakout" ? kinds.oldBreakout++ : kinds.oldRenewal++);
            for (const p of now) (p.kind === "breakout" ? kinds.nowBreakout++ : kinds.nowRenewal++);

            // 독립 재계산 대조 — 어기면 정지 신호(분류 이전의 문제). **값으로** 비교한다(필드 순서에 안 걸리게).
            const naiveNow = naivePoints(entry.grid, def);
            if (canon(naiveNow) === canon(now)) {
                naive.ok++;
                if (now.length > 0) naive.okWithPoints++; // 빈 차트끼리의 일치가 통과 수를 부풀리지 않게 갈라 센다
            } else if (naive.bad.length < sampleCap) naive.bad.push({ code, date, expected: naiveNow, actual: now });
            else naive.bad.push({ code, date, expected: "(생략)", actual: "(생략)" });

            // 논증이 기대는 격자 전제 — 파일이 실제로 시간 오름차순·high 강한 단조인가.
            let prevMin = -1;
            let prevHigh = -Infinity;
            for (const e of entry.grid.newHighs) {
                if (e.min <= prevMin) gridOrder.minOrder++;
                if (e.high <= prevHigh) gridOrder.highMonotone++;
                prevMin = e.min;
                prevHigh = e.high;
            }

            // 분류 — 먼저 같은 캔들(min)끼리 맞춘 뒤, 남은 것을 레벨 존재로 갈라 이동/신설/소멸로.
            const oldByMin = new Map(old.map((p) => [p.min, p]));
            const nowByMin = new Map(now.map((p) => [p.min, p]));
            const oldLevels = new Set(old.map((p) => p.levelIdx));
            const nowLevels = new Set(now.map((p) => p.levelIdx));
            const brief = (p: DerivedPoint): { min: number; kind: string; levelIdx: number } => ({ min: p.min, kind: p.kind, levelIdx: p.levelIdx });
            for (const p of old) {
                const twin = nowByMin.get(p.min);
                if (twin) {
                    if (twin.levelIdx === p.levelIdx) counts.equal++;
                    else push("relabeled", { code, date, levelIdx: twin.levelIdx, old: brief(p), now: brief(twin) });
                    continue;
                }
                // 그 레벨이 새 규칙에도 있으면 Point 가 다른 캔들로 간 것(이동), 없으면 소멸.
                if (nowLevels.has(p.levelIdx)) {
                    const moved = now.find((q) => q.levelIdx === p.levelIdx);
                    push("moved", { code, date, levelIdx: p.levelIdx, old: brief(p), now: moved ? brief(moved) : undefined });
                } else {
                    push("removed", { code, date, levelIdx: p.levelIdx, old: brief(p) });
                    removedByLevel.set(p.levelIdx, (removedByLevel.get(p.levelIdx) ?? 0) + 1);
                }
            }
            for (const p of now) {
                if (oldByMin.has(p.min)) continue; // 위에서 equal/재라벨로 처리됨
                if (oldLevels.has(p.levelIdx)) continue; // 이동의 도착점 — 옛 쪽에서 한 번 셌다
                push("added", { code, date, levelIdx: p.levelIdx, now: brief(p) });
            }
        }
    }

    const total = { old: kinds.oldBreakout + kinds.oldRenewal, now: kinds.nowBreakout + kinds.nowRenewal };
    console.log(`\n── Point 총수 ──`);
    console.log(`옛 ${total.old}(돌파 ${kinds.oldBreakout} · 재돌파 ${kinds.oldRenewal}) → 새 ${total.now}(돌파 ${kinds.nowBreakout} · 재돌파 ${kinds.nowRenewal})`);
    console.log(`차트 ${counts.charts}(Point 있는 차트 ${counts.gridsWithPoints})`);
    console.log(`\n── 갈림 4분류 ──`);
    console.log(`동일 ${counts.equal} · 재라벨 ${counts.relabeled} · 이동 ${counts.moved} · 신설 ${counts.added} · 소멸 ${counts.removed}`);
    console.log(`소멸의 레벨 분해: ${[...removedByLevel].sort((a, b) => a[0] - b[0]).map(([l, n]) => `레벨${l} ${n}`).join(" · ") || "없음"}`);
    console.log(`\n── 독립 재계산 대조(전 차트) ──`);
    console.log(`일치 ${naive.ok}(그중 Point 있는 차트 ${naive.okWithPoints}) / 불일치 ${naive.bad.length} ${naive.bad.length > 0 ? "⚠ 정지 신호" : "— 통과"}`);
    const orderBad = gridOrder.minOrder + gridOrder.highMonotone;
    console.log(`격자 전제: 시각 역행 ${gridOrder.minOrder} · high 비단조 ${gridOrder.highMonotone} ${orderBad > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    saveReport("point-diff", { def, counts, kinds, total, naive: { ok: naive.ok, bad: naive.bad }, gridOrder, samples });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
