import type { MonthFingerprint } from "./manifest";

// 분봉 과거월 재기준 — 과거 분봉을 일부러 바꾼 뒤(소스 교체·수리) 한 번만, 지정한 달의 ③ 불감소 비교를 건너뛰고
// 지금 값을 새 기준으로 받아들인다. 가드 자체는 그대로 두고 "이 달은 내가 바꿨다"를 실행 인자로 밝히는 손잡이.
// 지정 안 한 달은 여전히 불감소를 지켜야 하고, ②b 의 minute_candles 행수 가드는 재기준 달에서 준 행수만큼만 느슨해진다.

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2025-03..2025-06" · "2025-03,2025-05" · 섞어 쓰기 → 달 집합. 형식이 틀리면 throw. */
export function parseRebaselineMonths(spec: string): Set<string> {
    const out = new Set<string>();
    for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
        const [from, to, ...extra] = part.split("..");
        if (extra.length > 0 || !YM.test(from) || (to !== undefined && !YM.test(to))) {
            throw new Error(`--rebaseline 형식 오류: "${part}" (예: 2025-03..2025-06 또는 2025-03,2025-05)`);
        }
        const end = to ?? from;
        if (end < from) throw new Error(`--rebaseline 구간이 거꾸로다: "${part}"`);
        let [y, m] = from.split("-").map(Number);
        for (;;) {
            const ym = `${y}-${String(m).padStart(2, "0")}`;
            out.add(ym);
            if (ym === end) break;
            if (m === 12) {
                y += 1;
                m = 1;
            } else {
                m += 1;
            }
        }
    }
    if (out.size === 0) throw new Error("--rebaseline 에 달이 없다");
    return out;
}

/** 재기준 달이 전부 기준값(manifest)에 있어야 한다 — 오타로 엉뚱한 달을 풀어 주지 않게. */
export function assertRebaselineKnown(months: ReadonlySet<string>, baseline: Record<string, MonthFingerprint>): void {
    const unknown = [...months].filter((ym) => !(ym in baseline));
    if (unknown.length > 0) {
        throw new Error(`--rebaseline 달이 기준값에 없다: ${unknown.join(", ")} (재기준은 이미 기준이 있는 달만)`);
    }
}

/** 재기준 달에서 줄어든 행수 합 — ②b minute_candles 가드가 이만큼만 감소를 허용한다. */
export function rebaselineRowDrop(
    months: ReadonlySet<string>,
    prev: Record<string, MonthFingerprint>,
    cur: Record<string, MonthFingerprint>,
): bigint {
    let drop = 0n;
    for (const ym of months) {
        const p = prev[ym];
        const c = cur[ym];
        if (p === undefined) continue;
        const d = BigInt(p.rows) - BigInt(c?.rows ?? "0");
        if (d > 0n) drop += d;
    }
    return drop;
}

/**
 * ③ 분봉 과거월 지문 불감소. 재기준 달은 비교 대신 바뀐 폭을 로그 줄로 돌려준다. 위반이면 throw.
 * 재기준 달이라도 통째 소실은 받아들이지 않는다(소스 교체로 한 달이 비는 일은 없다).
 */
export function checkMinuteMonthly(
    prev: Record<string, MonthFingerprint>,
    cur: Record<string, MonthFingerprint>,
    rebaseline: ReadonlySet<string> = new Set(),
): string[] {
    const notes: string[] = [];
    for (const [ym, p] of Object.entries(prev)) {
        const c = cur[ym];
        if (c === undefined) throw new Error(`③ 과거월 통째 소실: ${ym}`);
        if (rebaseline.has(ym)) {
            notes.push(
                `③ ${ym} 재기준 — 행 ${delta(p.rows, c.rows)} · OHLC합 ${delta(p.sumOhlc, c.sumOhlc)} · 거래량합 ${delta(p.sumVolume, c.sumVolume)}`,
            );
            continue;
        }
        if (BigInt(c.rows) < BigInt(p.rows)) throw new Error(`③ ${ym} 행수 감소 ${p.rows}→${c.rows} (유실 의심)`);
        if (BigInt(c.sumOhlc) < BigInt(p.sumOhlc)) throw new Error(`③ ${ym} OHLC합 감소 (값 손상 의심)`);
        if (BigInt(c.sumVolume) < BigInt(p.sumVolume)) throw new Error(`③ ${ym} 거래량합 감소 (값 손상 의심)`);
    }
    return notes;
}

/** "1592913(±0)" · "14693624117→14677060008(-16564109, -0.1127%)" */
function delta(prev: string, cur: string): string {
    const p = BigInt(prev);
    const d = BigInt(cur) - p;
    if (d === 0n) return `${prev}(±0)`;
    const sign = d > 0n ? "+" : "";
    const pct = p === 0n ? "" : `, ${sign}${((Number(d) / Number(p)) * 100).toFixed(4)}%`;
    return `${prev}→${cur}(${sign}${d}${pct})`;
}
