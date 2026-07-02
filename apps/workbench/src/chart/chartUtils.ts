// chart-utils 를 workbench 로 vendoring(패키지 의존 대신 복사). 우리가 쓰는 최소만.
// 원본: packages/chart-utils (kstHHmm·색상). core domain(계산)과 달리 이건 렌더 헬퍼라 앱-로컬 소유.

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

/** unix(초, UTC) → KST "YYYY-MM-DD". */
export function kstYmd(unixSec: number): string {
    const d = new Date((unixSec + KST_OFFSET_SEC) * 1000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

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

/** 분봉 거래대금 마커 표시 임계(억, 오름차순). chart-review 와 동일. */
export const AMOUNT_MARKER_THRESHOLDS_EOK = [30, 40, 50, 60, 70, 80, 90, 100, 200, 300] as const;

/** 거래대금 마커 색(억 임계). 커질수록 강조. */
export function amountMarkerColor(thresholdEok: number): string {
    if (thresholdEok < 50) return "#fbbf24";
    if (thresholdEok < 80) return "#fb923c";
    if (thresholdEok < 100) return "#ef4444";
    if (thresholdEok < 200) return "#a855f7";
    return "#7c3aed";
}

/** 분봉 거래대금(원) → 마커(도달한 최고 임계 + 색). 30억 미만이면 null. */
export function amountMarkerFor(amountKrw: number): { thresholdEok: number; color: string } | null {
    const eok = amountKrw / 1e8;
    let hit: number | null = null;
    for (const t of AMOUNT_MARKER_THRESHOLDS_EOK) if (eok >= t) hit = t;
    return hit === null ? null : { thresholdEok: hit, color: amountMarkerColor(hit) };
}
