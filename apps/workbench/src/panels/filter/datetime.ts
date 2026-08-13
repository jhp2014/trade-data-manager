// 날짜·시각의 표기와 읽기(순수) — 화면 어디서나 같은 모양이어야 하는 것들.
//
// 좁은 자리라 연도는 두 자리(`26.07.01`), 시각은 분까지(`09:35`). 입력은 관용적으로 받되
// **못 읽은 것을 조용히 넘기지 않는다** — null 을 돌려주고 호출부가 그 칸을 빨갛게 남긴다.
// (옛 필터 바·구간 편집기·라벨이 같은 정규식을 세 벌 들고 있었다.)

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

/** HH:MM[:SS] → 자정부터의 분. 레일 좌표는 시각을 수로 봐야 잰다. */
export const minutesOfDay = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** 분 → HH:MM(0..1439 로 클램프). 레일에서 프랙션을 시각으로 되돌릴 때. */
export function timeOfMinutes(min: number): string {
    const m = Math.max(0, Math.min(1439, Math.round(min)));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
