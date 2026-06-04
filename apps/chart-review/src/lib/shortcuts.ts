import type { ReviewViewMode } from "@/types/review";

/**
 * 복기 UX 상수 — 단축키·뷰 순환·마커 조작값의 단일 출처.
 * (쿠키/env 같은 인프라 설정은 readSheetConfig 곁에, 차트 수치는 constants.ts 에)
 */

// ── 뷰 모드 ──────────────────────────────────────────────────────────────────

/** 중앙 차트 뷰 모드 순서 + 라벨. 헤더 세그먼트 렌더와 e/q 순환의 공통 출처. */
export const VIEW_MODES: ReadonlyArray<{ mode: ReviewViewMode; label: string }> = [
  { mode: "summary", label: "Summary" },
  { mode: "minute", label: "Minute" },
  { mode: "daily", label: "Daily" },
  { mode: "overlay", label: "Overlay" },
];

/** 순환 순서만 추린 배열(e=정방향, q=역방향). */
export const VIEW_MODE_CYCLE: readonly ReviewViewMode[] = VIEW_MODES.map((v) => v.mode);

/** 현재 뷰에서 dir(+1/-1) 방향으로 한 칸 순환한 뷰 모드. */
export function cycleViewMode(current: ReviewViewMode, dir: 1 | -1): ReviewViewMode {
  const len = VIEW_MODE_CYCLE.length;
  const cur = VIEW_MODE_CYCLE.indexOf(current);
  return VIEW_MODE_CYCLE[(cur + dir + len) % len];
}

// ── 단축키 키 매핑 ───────────────────────────────────────────────────────────

/**
 * 전역 단축키 → 동작. 입력창/모달 포커스 시에는 무시(호출부에서 가드).
 *
 * - q/e   : 종목(그룹) 탐색
 * - a/d         : 마커 시각 ←/→ 1분 (키 누르고 있으면 자동 반복)
 * - Shift+a/d   : 마커 시각 ←/→ 1시간
 * - Ctrl+a/d    : 타점 탐색 위(과거)/아래(미래) — 브라우저 기본동작 차단
 * - w/s   : 테마 리스트 위/아래 종목 탐색(순환)
 * - z     : 뷰 모드 순환(Summary/Minute/Daily/Overlay)
 * - c     : 본 종목으로 복귀(override 해제)
 * - Space : 입력 드로어
 *
 * markerLeft/prevPoint 는 같은 "a", markerRight/nextPoint 는 같은 "d" 키이며
 * Shift/Ctrl 수정키 유무로 구분한다(호출부 useGlobalShortcuts 에서 분기).
 */
export const SHORTCUT_KEYS = {
  prevGroup: "q",
  nextGroup: "e",
  markerLeft: "a",
  markerRight: "d",
  prevPoint: "a",
  nextPoint: "d",
  themeUp: "w",
  themeDown: "s",
  cycleView: "z",
  resetOverride: "c",
  openInput: " ",
  /** f: Write Tab 마지막 행에 현재 탐색 종목 추가. */
  writeAppend: "f",
  /** r: 읽기 탭 순환(다음 Sheet Tab 으로 전환). */
  cycleReadTab: "r",
  /** t: KRX/NXT 가격 모드 토글. */
  togglePriceMode: "t",
  /** x: 분봉 마커 중심 확대 ↔ 기본 뷰(클립 시각까지) 토글. */
  toggleMinuteZoom: "x",
} as const;

// ── 마커 / 히스토리 스위처 ───────────────────────────────────────────────────

/** 타점 tradeTime 이 없을 때 마커 기본 시각(분). 540 = 09:00. */
export const DEFAULT_MARKER_MINUTES = 540;

/** Shift+휠 또는 a/d 1회 마커 이동량(분). */
export const MARKER_WHEEL_STEP_MIN = 1;

/** Shift+a/Shift+d 1회 마커 이동량(분). 20 = 20분. */
export const MARKER_HOUR_STEP_MIN = 20;

/** Tab 히스토리 스위처: 무입력 시 현재 항목으로 자동 확정되기까지의 지연(ms). */
export const SWITCHER_AUTO_COMMIT_MS = 2000;
