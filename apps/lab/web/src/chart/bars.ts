// 봉 배열(시간 오름차순) 위치 찾기 · 시각 환산.

/** target 이하(≤) 마지막 봉의 time. target 이 null 이거나 첫 봉보다 이르면 null. */
export function snapToBar(bars: readonly { time: number }[], target: number | null): number | null {
    if (target == null) return null;
    let snapped: number | null = null;
    for (const b of bars) {
        if (b.time <= target) snapped = b.time;
        else break;
    }
    return snapped;
}

/** at(봉) 이 참인 앞쪽 구간의 마지막 인덱스 — 봉이 시간 오름차순이라 처음 거짓에서 멈춘다. 첫 봉부터 거짓이면 0. */
export function indexAtOrBefore<T>(bars: readonly T[], at: (b: T) => boolean): number {
    let idx = 0;
    for (let i = 0; i < bars.length; i++) {
        if (at(bars[i])) idx = i;
        else break;
    }
    return idx;
}

/**
 * 분봉 위에서 시각을 delta 봉 옮긴다 — 경로 시각("HH:MM", "" = 장 마감 15:30) 이하 마지막 봉에서 출발,
 * 첫 봉·마지막 봉에서 멈춘다(넘어가지 않는다). 시각이 첫 봉보다 이르면 첫 봉에서 출발. 봉이 없으면 null.
 * 분봉은 dense(분당 연속)라 1봉 = 1분이다.
 */
export function stepMinute(bars: readonly { tradeTime: string }[], time: string, delta: number, closeTime: string): string | null {
    if (bars.length === 0) return null;
    const target = time || closeTime;
    const idx = indexAtOrBefore(bars, (b) => b.tradeTime.slice(0, 5) <= target);
    const next = Math.max(0, Math.min(bars.length - 1, idx + delta));
    return bars[next].tradeTime.slice(0, 5);
}

/** "HH:MM[:SS]" → 그 날 0시부터의 분. */
export function minutesOfDay(hms: string): number {
    const [h, m] = hms.split(":").map(Number);
    return h * 60 + m;
}
