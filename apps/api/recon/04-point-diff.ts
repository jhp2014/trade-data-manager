// Point 판정 diff 실측 — 옛 캐시(v8 격자 + v8 규칙) vs 현재 캐시(v9 격자 + 현재 규칙)를 4분류로 기계 판정.
//
// 왜 grid-diff 로 안 되나: 03 은 **격자** 비교기다. Point 는 격자 + 판정 규칙의 함수라, 격자 개정(v9)의
// 회귀 증명은 "옛 격자에 옛 규칙 / 새 격자에 새 규칙"을 나란히 돌려 Point 가 안 움직였는지로 닫는다.
// v9 1단계 게이트(명세 §7): 이동·신설·소멸·재라벨이 **클래스 ①(선행 국면 — 첫 레벨이 갈린 차트) 밖에서 0**.
//
// 분류(캔들 min 매칭 → 레벨 존재로 이동/신설/소멸): 클래스 ① 차트의 행은 따로 센다(예고된 갈림 — 게이트 아님).
// 셋째 절은 **독립 재계산 대조**(⚠ 판정 정의를 고치면 `naivePoints` 도 다시 진술해야 한다 — 베끼면 동어반복):
// 레벨 = 마디 뷰에서 prefix max, 귀속 = 위→아래 첫 히트, 레벨당 1개 = claimed **집합**, 후보 = 상단 돌파
// (`high > maxBefore`) — newHighs 를 **정렬해서** 돈다.
//
// DB 를 안 본다 — 격자 파일만으로 완결된다(격자 스키마 충분성이 여기서도 증명된다).
//
// 실행(CWD = apps/api): pnpm --filter @trade-data-manager/api recon:point-diff -- --old .cache/point-grid-v8
// 플래그: --old(v8 사본, 필수) · --dir(현재 캐시 루트) · 판정 노브(--gateBase/--gateRenewal/--exclude/--merge/--bull) · --samples
import { promises as fs } from "node:fs";
import path from "node:path";
import {
    DEFAULT_POINT_DEFINITION,
    levelsOf,
    levelViewOf,
    pointsOf,
    type DerivedPoint,
    type GridNewHigh,
    type PointDefinition,
    type PointGrid,
} from "@trade-data-manager/market";
import { fileGridStore } from "../src/market/grid/gridStore.js";
import { numFlag, saveReport, strFlag } from "./_shared.js";

const KRW_PER_EOK = 100_000_000n;

/** 옛(v8) 격자 — maxBefore 이전 모양. 피벗 쌍 열은 유효한 v9 경로 뷰라 levelsOf/levelViewOf 가 그대로 돈다. */
type OldGrid = Omit<PointGrid, "newHighs"> & { newHighs: Omit<GridNewHigh, "maxBefore">[] };
interface OldFile {
    v: number;
    date: string;
    charts: Record<string, { grid: OldGrid }>;
}

/**
 * 옛 규칙(v8) 재현 — 후보 = newHighs 전량(v8 목록은 전부 러닝 최고가 갱신 봉), 최고 레벨 귀속·게이트·
 * 레벨당 1개는 현재와 동일(2026-09-01 규칙). 규칙이 또 바뀌면 여기를 "직전 규칙"으로 갈아 끼운다
 * (이력 보관소가 아니라 **직전과의 대조기**).
 */
function pointsOfV8(grid: OldGrid, def: PointDefinition): DerivedPoint[] {
    if (grid.base === null || grid.touch === null) return [];
    const levels = levelsOf({ ...grid, newHighs: [] } as PointGrid, def);
    const gateBase = BigInt(def.baselineGateEok) * KRW_PER_EOK;
    const gateRenewal = BigInt(def.renewalGateEok) * KRW_PER_EOK;
    const out: DerivedPoint[] = [];
    let usedLevel = -1;
    for (const e of grid.newHighs) {
        if (e.min <= def.excludeUptoMin) continue;
        if (def.bullOnly && !(e.close > e.open)) continue;
        let li = -1;
        for (let i = levels.length - 1; i >= 0; i--) {
            const lv = levels[i];
            if (lv.renewal ? e.high > lv.price : e.high >= lv.price) {
                li = i;
                break;
            }
        }
        if (li < 0 || li <= usedLevel) continue;
        if (BigInt(e.tv) < (levels[li].renewal ? gateRenewal : gateBase)) continue;
        usedLevel = li;
        out.push({
            kind: li === 0 ? "breakout" : "renewal",
            ordinal: out.length,
            min: e.min,
            high: e.high,
            close: e.close,
            tv: e.tv,
            levelPrice: levels[li].price,
            levelIdx: li,
            levelMin: levels[li].min,
        });
    }
    return out;
}

/**
 * 정의의 브루트포스 재진술 — 검출 구현(단조 커서 usedLevel·입력 순서 신뢰)과 **다른 형태**라 전제 위반을
 * 잡는다: 레벨은 마디 뷰의 prefix max 로 재계산, 캔들은 min 으로 **정렬해서** 돌고, 후보는 상단 돌파
 * (`high > maxBefore` — 1단계), 레벨당 1개는 claimed **집합**. 갈리면 귀속 단조성·목록 정렬성 위반(정지 신호).
 */
function naivePoints(grid: PointGrid, def: PointDefinition): DerivedPoint[] {
    if (grid.base === null || grid.touch === null) return [];
    const base = grid.base;
    const pairHighs = levelViewOf(grid).map((p) => p.high);
    const lowOfPair = new Map(levelViewOf(grid).map((p) => [p.high.min, p.low.price]));
    const levels: { price: number; renewal: boolean; min: number | null }[] = [{ price: base, renewal: false, min: null }];
    let prevLow: number | null = null;
    for (const h of pairHighs) {
        const keep =
            h.price > Math.max(base, ...levels.map((l) => l.price)) &&
            !(def.mergeRisePct > 0 && prevLow !== null && ((h.price - prevLow) / prevLow) * 100 < def.mergeRisePct);
        if (keep) levels.push({ price: h.price, renewal: true, min: h.min });
        prevLow = lowOfPair.get(h.min) ?? prevLow;
    }

    const gate = (renewal: boolean): bigint => BigInt(renewal ? def.renewalGateEok : def.baselineGateEok) * KRW_PER_EOK;
    const bandK = 1 - def.approachPct / 100; // m'=0 이면 1 — 옛 strict 판정과 동일
    const claimed = new Set<number>();
    const out: DerivedPoint[] = [];
    for (const e of [...grid.newHighs].sort((a, b) => a.min - b.min)) {
        if (!(e.high > e.maxBefore * bandK)) continue; // 후보 = m' 밴드의 사건 봉(§10.3 재구성)
        if (e.min <= def.excludeUptoMin) continue;
        if (def.bullOnly && !(e.close > e.open)) continue;
        const crossed = levels.map((l, i) => ({ l, i })).filter(({ l }) => (l.renewal ? e.high > l.price * bandK : e.high >= l.price * bandK));
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

/** 클래스 ①(선행 국면) 판정 — 첫 레벨(마디 뷰)이 옛 격자와 다른 차트. 03 의 분류와 같은 정의의 축약형. */
function firstLevelDiffers(gOld: OldGrid, gNew: PointGrid): boolean {
    const oldFirst = gOld.pivots.find((p) => p.kind === "high");
    let newFirst: { min: number; price: number } | undefined;
    try {
        newFirst = levelViewOf(gNew)[0]?.high;
    } catch {
        return true;
    }
    if (!oldFirst && !newFirst) return false;
    if (!oldFirst || !newFirst) return true;
    return oldFirst.min !== newFirst.min || oldFirst.price !== newFirst.price;
}

interface DiffRow {
    code: string;
    date: string;
    levelIdx: number;
    old?: { min: number; kind: string; levelIdx: number };
    now?: { min: number; kind: string; levelIdx: number };
}

async function readOldDir(root: string): Promise<Map<string, OldFile>> {
    const out = new Map<string, OldFile>();
    for (const name of (await fs.readdir(root)).filter((n) => n.endsWith(".json"))) {
        const f = JSON.parse(await fs.readFile(path.join(root, name), "utf8")) as OldFile & { date: string };
        out.set(f.date, f);
    }
    return out;
}

async function main(): Promise<void> {
    const def: PointDefinition = {
        ...DEFAULT_POINT_DEFINITION,
        baselineGateEok: numFlag("gateBase", DEFAULT_POINT_DEFINITION.baselineGateEok),
        renewalGateEok: numFlag("gateRenewal", DEFAULT_POINT_DEFINITION.renewalGateEok),
        excludeUptoMin: numFlag("exclude", DEFAULT_POINT_DEFINITION.excludeUptoMin),
        mergeRisePct: numFlag("merge", DEFAULT_POINT_DEFINITION.mergeRisePct),
        bullOnly: numFlag("bull", DEFAULT_POINT_DEFINITION.bullOnly ? 1 : 0) !== 0,
        // v8 회귀 증명은 --approach 0(정확 돌파만 = v8 동치), 밴드 변화 계측은 0.5(기본).
        approachPct: numFlag("approach", DEFAULT_POINT_DEFINITION.approachPct),
    };
    const sampleCap = numFlag("samples", 20);
    const oldRoot = strFlag("old");
    if (!oldRoot) throw new Error("--old <옛 v8 사본 경로> 필수");
    const store = fileGridStore(strFlag("dir"));
    const dates = await store.listDates();
    if (dates.length === 0) throw new Error("격자 캐시가 비어 있다 — 서버 대사(또는 recon:grid-scale)를 먼저 돌릴 것");
    const oldFiles = await readOldDir(oldRoot);
    console.log(`현재 ${dates.length}일 / 옛 ${oldFiles.size}일 · 정의 게이트 ${def.baselineGateEok}/${def.renewalGateEok}억 · 제외 ${def.excludeUptoMin}분 · 병합 ${def.mergeRisePct}% · bullOnly ${def.bullOnly}`);

    const counts = { charts: 0, presence: 0, class1Charts: 0, gridsWithPoints: 0, equal: 0, relabeled: 0, moved: 0, added: 0, removed: 0, class1Rows: 0 };
    const kinds = { oldBreakout: 0, oldRenewal: 0, nowBreakout: 0, nowRenewal: 0 };
    const samples: Record<"relabeled" | "moved" | "added" | "removed" | "class1Rows", DiffRow[]> = { relabeled: [], moved: [], added: [], removed: [], class1Rows: [] };
    const push = (bucket: keyof typeof samples, row: DiffRow): void => {
        counts[bucket]++;
        if (samples[bucket].length < sampleCap) samples[bucket].push(row);
    };
    const naive = { ok: 0, okWithPoints: 0, bad: [] as { code: string; date: string; expected: unknown; actual: unknown }[] };
    const gridOrder = { minOrder: 0, maxBeforeOrder: 0, breakoutMonotone: 0 }; // 논증이 기대는 격자 전제

    for (const date of dates) {
        const file = await store.read(date);
        if (!file) {
            console.warn(`⚠ ${date}: 파일 버전 불일치(스킵) — 재굽기 필요`);
            continue;
        }
        const fOld = oldFiles.get(date);
        for (const [code, entry] of Object.entries(file.charts)) {
            const gOld = fOld?.charts[code]?.grid;
            if (!gOld) {
                counts.presence++;
                continue;
            }
            counts.charts++;
            const class1 = firstLevelDiffers(gOld, entry.grid);
            if (class1) counts.class1Charts++;
            const old = pointsOfV8(gOld, def);
            const now = pointsOf(entry.grid, def);
            if (old.length > 0 || now.length > 0) counts.gridsWithPoints++;
            for (const p of old) (p.kind === "breakout" ? kinds.oldBreakout++ : kinds.oldRenewal++);
            for (const p of now) (p.kind === "breakout" ? kinds.nowBreakout++ : kinds.nowRenewal++);

            // 독립 재계산 대조 — 어기면 정지 신호(분류 이전의 문제). **값으로** 비교한다.
            const naiveNow = naivePoints(entry.grid, def);
            if (canon(naiveNow) === canon(now)) {
                naive.ok++;
                if (now.length > 0) naive.okWithPoints++;
            } else if (naive.bad.length < sampleCap) naive.bad.push({ code, date, expected: naiveNow, actual: now });
            else naive.bad.push({ code, date, expected: "(생략)", actual: "(생략)" });

            // 격자 전제 — 시간 오름차순 · maxBefore 비감소 · 상단 돌파 부분열 high 강한 단조.
            let prevMin = -1;
            let prevMax = -1;
            let prevBreakHigh = -Infinity;
            for (const e of entry.grid.newHighs) {
                if (e.min <= prevMin) gridOrder.minOrder++;
                if (e.maxBefore < prevMax) gridOrder.maxBeforeOrder++;
                prevMin = e.min;
                prevMax = e.maxBefore;
                if (e.high > e.maxBefore) {
                    if (e.high <= prevBreakHigh) gridOrder.breakoutMonotone++;
                    prevBreakHigh = e.high;
                }
            }

            // 분류 — 캔들(min) 매칭 → 레벨 존재로 이동/신설/소멸. 클래스 ① 차트의 행은 예고된 갈림으로 따로.
            const brief = (p: DerivedPoint): { min: number; kind: string; levelIdx: number } => ({ min: p.min, kind: p.kind, levelIdx: p.levelIdx });
            const oldByMin = new Map(old.map((p) => [p.min, p]));
            const nowByMin = new Map(now.map((p) => [p.min, p]));
            const oldLevels = new Set(old.map((p) => p.levelIdx));
            const nowLevels = new Set(now.map((p) => p.levelIdx));
            const rowBucket = (b: "relabeled" | "moved" | "added" | "removed", row: DiffRow): void => {
                if (class1) push("class1Rows", row);
                else push(b, row);
            };
            for (const p of old) {
                const twin = nowByMin.get(p.min);
                if (twin) {
                    if (twin.levelIdx === p.levelIdx && twin.levelPrice === p.levelPrice) counts.equal++;
                    else rowBucket("relabeled", { code, date, levelIdx: twin.levelIdx, old: brief(p), now: brief(twin) });
                    continue;
                }
                if (nowLevels.has(p.levelIdx)) {
                    const moved = now.find((q) => q.levelIdx === p.levelIdx);
                    rowBucket("moved", { code, date, levelIdx: p.levelIdx, old: brief(p), now: moved ? brief(moved) : undefined });
                } else {
                    rowBucket("removed", { code, date, levelIdx: p.levelIdx, old: brief(p) });
                }
            }
            for (const p of now) {
                if (oldByMin.has(p.min)) continue; // 위에서 equal/재라벨로 처리됨
                if (oldLevels.has(p.levelIdx)) continue; // 이동의 도착점 — 옛 쪽에서 한 번 셌다
                rowBucket("added", { code, date, levelIdx: p.levelIdx, now: brief(p) });
            }
        }
    }

    const total = { old: kinds.oldBreakout + kinds.oldRenewal, now: kinds.nowBreakout + kinds.nowRenewal };
    console.log(`\n── Point 총수 ──`);
    console.log(`옛 ${total.old}(돌파 ${kinds.oldBreakout} · 재돌파 ${kinds.oldRenewal}) → 새 ${total.now}(돌파 ${kinds.nowBreakout} · 재돌파 ${kinds.nowRenewal})`);
    console.log(`차트 ${counts.charts}(Point 있는 차트 ${counts.gridsWithPoints} · 클래스① ${counts.class1Charts} · 존재차 ${counts.presence})`);
    console.log(`\n── 갈림 4분류(클래스① 밖 — 1단계 게이트: 전부 0) ──`);
    const cleanDiff = counts.relabeled + counts.moved + counts.added + counts.removed;
    console.log(`동일 ${counts.equal} · 재라벨 ${counts.relabeled} · 이동 ${counts.moved} · 신설 ${counts.added} · 소멸 ${counts.removed} ${cleanDiff > 0 ? "⚠ 정지 신호" : "— 통과"}`);
    console.log(`클래스① 차트의 행 갈림(예고된 것 — 게이트 아님): ${counts.class1Rows}`);
    console.log(`\n── 독립 재계산 대조(전 차트) ──`);
    console.log(`일치 ${naive.ok}(그중 Point 있는 차트 ${naive.okWithPoints}) / 불일치 ${naive.bad.length} ${naive.bad.length > 0 ? "⚠ 정지 신호" : "— 통과"}`);
    const orderBad = gridOrder.minOrder + gridOrder.maxBeforeOrder + gridOrder.breakoutMonotone;
    console.log(`격자 전제: 시각 역행 ${gridOrder.minOrder} · maxBefore 감소 ${gridOrder.maxBeforeOrder} · 돌파 부분열 비단조 ${gridOrder.breakoutMonotone} ${orderBad > 0 ? "⚠ 정지 신호" : "— 통과"}`);

    saveReport("point-diff", { def, counts, kinds, total, naive: { ok: naive.ok, bad: naive.bad }, gridOrder, samples });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
