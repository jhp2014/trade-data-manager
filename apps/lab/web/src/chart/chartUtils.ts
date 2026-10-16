// 차트 렌더 헬퍼 — KST 시각 표기 · 축 숫자 표기 · 색 · 거래대금 구간.

// ── KST 시각 (KST = UTC + 9h) ────────────────────────────────────────────
const KST_OFFSET_SEC = 9 * 3600;

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/** unix(초, UTC) → KST "HH:MM". */
export function kstHHmm(unixSec: number): string {
    const d = new Date((unixSec + KST_OFFSET_SEC) * 1000);
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

// ── 축 숫자 표기 ──────────────────────────────────────────────────────────
/** 일봉 가격 축 — 원, 천 단위 쉼표(12,345). */
export function fmtPriceAxis(price: number): string {
    return Math.round(price).toLocaleString("ko-KR");
}

// ── 색상(차트용 JS 상수 — CSS 변수와 같은 hex 유지) ─────────────────────────
/** 상승(빨강). CSS --rise 대응. */
export const RISE_COLOR = "#ef4444";
/** 하락(파랑). CSS --fall 대응. */
export const FALL_COLOR = "#3b82f6";
/** 상승 반투명(거래대금 막대). */
export const RISE_FILL = "rgba(239,68,68,0.5)";
/** 하락 반투명. */
export const FALL_FILL = "rgba(59,130,246,0.5)";
/** 거래대금 막대 기본색(방향성 없음). */
export const AMOUNT_BAR_COLOR = "rgba(120,120,140,0.5)";

/** 일봉 고가 마커 시작 임계(전일비 %). 이 미만은 마커 없음. */
export const HIGH_MARKER_MIN_PCT = 10;

/** 일봉 고가 마커 색(전일비 %) — 임계 미만이면 null. 임계 커질수록 강조 그라디언트. */
export function highMarkerColor(pct: number): string | null {
    if (pct < HIGH_MARKER_MIN_PCT) return null;
    if (pct < 15) return "#fbbf24"; // amber
    if (pct < 20) return "#fb923c"; // orange
    if (pct < 25) return "#ef4444"; // red
    if (pct < 30) return "#a855f7"; // purple
    return "#7c3aed"; // deep purple
}

/**
 * 거래대금 8구간(AMOUNT_BUCKETS_EOK) 색 — 낮은 구간=밝은 노랑 → 높은 구간=진한 적자.
 *
 * 이 램프는 **흰 배경**(차트 마커)과 **거의 검은 배경**(툴팁 rgba(20,20,24))
 * 양쪽에 얹힌다. 그래서 명도를 끝까지 밀지 않는다 — 예전 최상위 두 색(#b91c1c·#7f1d1d)은 흰 배경에선
 * 또렷했지만 그 툴팁 위에서 대비 1.8:1 로 배경에 묻혔다. **정작 제일 중요한 구간**이 안 보인 셈이다.
 * 지금은 위쪽 둘을 명도 대신 **색상**(빨강 → 적자)으로 갈라 양쪽 배경에서 다 읽힌다.
 * 30~100억 다섯 색은 그대로 뒀다 — 눈이 익은 대응을 이유 없이 깨지 않는다.
 */
export const AMOUNT_BUCKET_COLORS = ["#fde047", "#fcd34d", "#fbbf24", "#fb923c", "#f97316", "#ef4444", "#dc2626", "#be185d"] as const;

/** 분봉 거래대금 구간 하한(억) — 마커 숫자. 인덱스가 AMOUNT_BUCKET_COLORS 와 짝이다. */
export const AMOUNT_BUCKETS_EOK = [20, 30, 40, 50, 70, 100, 150, 200] as const;

/** 거래대금(원) → 구간 인덱스(0..7). 20억 미만이면 -1. */
export function amountBucketIndex(amountKrw: number): number {
    const eok = amountKrw / 1e8;
    let idx = -1;
    for (let i = 0; i < AMOUNT_BUCKETS_EOK.length; i++) if (eok >= AMOUNT_BUCKETS_EOK[i]) idx = i;
    return idx;
}
