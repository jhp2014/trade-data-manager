// 날짜·시각의 표기와 읽기 공용 — 화면 어디서나 같은 모양이어야 하는 것들.
// (KST 거래일 문자열 YYYY-MM-DD 기준)
//
// 두 묶음이 산다:
//   · epoch ms ↔ KST 표시 — 요일·날짜 라벨·발화 시각
//   · 거래일 문자열의 파싱·축약 표기·분(分) 환산 — 필터 구간 입력, 레일 좌표, 분봉 시각
// 둘을 한 파일에 두는 이유는 부르는 쪽이 "날짜 다루는 것"을 한 곳에서 찾기 때문이다.
// 나뉘어 있던 동안 같은 분 환산이 **네 벌**로 복제됐고(그중 하나는 주석으로 다른 하나를 가리켰다),
// 두 자리 연도 표기도 두 벌이었다.
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** epoch ms → KST YYYY-MM-DD. (en-CA 로케일이 ISO 날짜 형식을 낸다 — timeZone 지정으로 KST 고정.) */
export function kstDateOf(ms: number): string {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 오늘(KST) YYYY-MM-DD. UTC 기반 toISOString 은 KST 새벽(00:00~08:59)에 전날로 잡히므로 timeZone 지정. */
export function kstToday(): string {
    return kstDateOf(Date.now());
}

/** epoch ms → KST HH:MM(초 없음, 24h). 뉴스 시각·시간 입력값 표시 공용. */
export function kstHm(ms: number): string {
    return new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 오늘(KST) 자정의 epoch ms — 당일 필터의 기본 floor. */
export function kstMidnight(): number {
    return new Date(`${kstToday()}T00:00:00+09:00`).getTime();
}

/** epoch ms → KST HH:MM:SS. 발화 시각 표시(모니터링·알람 로그 공용). */
export function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** 로컬 요일 문자(일~토). 빈/비정상 입력은 빈 문자열. */
export function weekdayOf(date: string): string {
    if (!date) return "";
    return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()] ?? "";
}

/** "YYYY-MM-DD (요일)" — 뉴스 날짜 구분선. */
export function dateLabel(date: string): string {
    if (!date) return "";
    return `${date} (${weekdayOf(date)})`;
}

/** "2026년 7월 9일 (목)" — 차트/세로선 날짜 라벨(연·월·일·요일). */
export function fmtDateKo(date: string): string {
    if (!date) return "";
    const [y, mo, d] = date.split("-").map(Number);
    return `${y}년 ${mo}월 ${d}일 (${weekdayOf(date)})`;
}

/** epoch ms → "2026-05-08 (금) 01:58:43" (로컬=KST). 실시간 최근 폴링 시각 표시용. */
export function fmtStampKo(ts: number): string {
    const d = new Date(ts);
    return `${d.toLocaleDateString("en-CA")} (${WEEKDAYS[d.getDay()]}) ${d.toLocaleTimeString("en-GB")}`;
}

// ── 거래일 문자열의 표기와 읽기 ─────────────────────────────────────────────
//
// 좁은 자리라 연도는 두 자리(`26.07.01`), 시각은 분까지(`09:35`). 입력은 관용적으로 받되
// **못 읽은 것을 조용히 넘기지 않는다** — null 을 돌려주고 호출부가 그 칸을 빨갛게 남긴다.

/** YYYY-MM-DD → yy.mm.dd. 빈 문자열은 빈 문자열. */
export const shortDate = (iso: string): string => (iso ? iso.slice(2).replace(/-/g, ".") : "");

/** yy.mm.dd | yyyy.mm.dd → YYYY-MM-DD. 형식이 아니거나 달·일이 범위 밖이면 null. */
export function parseDate(raw: string): string | null {
    const m = raw.trim().match(/^(\d{2}|\d{4})\.(\d{1,2})\.(\d{1,2})$/);
    if (!m) return null;
    const yy = m[1]!.length === 4 ? m[1]! : `20${m[1]}`;
    const mo = Number(m[2]), da = Number(m[3]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return `${yy}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

/** H:MM | HH:MM → HH:MM. 범위 밖이면 null. */
export function parseTime(raw: string): string | null {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/**
 * `HH:MM[:SS]` → 자정부터의 분. **초는 버린다** — 분봉·골격 피벗의 t 해상도가 분이다.
 * 레일 좌표·차트 프레이밍·골격 정규화가 전부 시각을 수로 봐야 잰다.
 */
export const minutesOfDay = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

/** 분 → HH:MM(0..1439 로 클램프). 먼저 반올림하고 시·분을 한 값에서 뽑는다 — 따로 뽑으면 599.7분이 "09:00"이 된다. */
export function timeOfMinutes(min: number): string {
    const m = Math.max(0, Math.min(1439, Math.round(min)));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
