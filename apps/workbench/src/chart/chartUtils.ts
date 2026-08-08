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

/**
 * 거래대금 8구간(domain AMOUNT_BUCKETS_EOK) 색 — 낮은 구간=밝은 노랑 → 높은 구간=진한 적자.
 *
 * 이 램프는 **흰 배경**(차트 마커·골격 선)과 **거의 검은 배경**(보드 버킷 히스토그램 툴팁 rgba(20,20,24))
 * 양쪽에 얹힌다. 그래서 명도를 끝까지 밀지 않는다 — 예전 최상위 두 색(#b91c1c·#7f1d1d)은 흰 배경에선
 * 또렷했지만 그 툴팁 위에서 대비 1.8:1 로 배경에 묻혔다. **정작 제일 중요한 구간**이 안 보인 셈이다.
 * 지금은 위쪽 둘을 명도 대신 **색상**(빨강 → 적자)으로 갈라 양쪽 배경에서 다 읽힌다.
 * 30~100억 다섯 색은 그대로 뒀다 — 눈이 익은 대응을 이유 없이 깨지 않는다.
 */
export const AMOUNT_BUCKET_COLORS = ["#fde047", "#fcd34d", "#fbbf24", "#fb923c", "#f97316", "#ef4444", "#dc2626", "#be185d"] as const;

/**
 * 거래대금 8구간 → **굵기 단계 5개**(+ 구간 아래 = 0, 합쳐서 6단계). 골격 겹쳐 그리기가 세 번째 차원을
 * 굵기로 실을 때. 경계는 **20 / 30 / 50 / 70 / 100억**(사용자 확정).
 *
 * 8구간을 굵기로 다 쪼개지 않는 이유: 획에서 눈이 가르는 굵기 차이는 대여섯이 한계다. 색이 실패한
 * 것과 같은 이유(채널 대역폭)이니 여기서 같은 실수를 반복하지 않는다. 정확한 값은 숫자 라벨이 답한다.
 * 인덱스 = AMOUNT_BUCKETS_EOK([20,30,40,50,70,100,150,200]) 인덱스.
 * ⚠ 150·200억이 100억과 **같은 굵기**로 묶인다(사용자 확정) — 위쪽이 뭉개지면 단계를 하나 더 나눈다.
 */
export const AMOUNT_LEVEL_OF_BUCKET = [1, 2, 2, 3, 4, 5, 5, 5] as const;

/** 단계 → 획 굵기(배수 1 기준). 0 = 구간 아래(가장 가늘다 — 조용함은 물러난다). */
export const AMOUNT_LEVEL_WIDTH = [0.9, 1.5, 2.3, 3.2, 4.4, 6.0] as const;

/** 굵기 범례에 적을 경계(억) — AMOUNT_LEVEL_OF_BUCKET 이 단계를 바꾸는 지점. */
export const AMOUNT_LEVEL_EDGES_EOK = [20, 30, 50, 70, 100] as const;
