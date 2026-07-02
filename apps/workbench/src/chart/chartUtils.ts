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
