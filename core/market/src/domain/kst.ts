// KST(UTC+9) 거래일/시각 ↔ 값 변환. 순수(외부 import 0). +09:00 오프셋 로직을 여기 한 곳에 모은다
// (예전엔 core dayReplay·workbench derive·api telegram 에 흩어져 드리프트 여지). 표시용 포맷(HH:mm 등)은 뷰층(workbench) 책임.

/** KST date(YYYY-MM-DD) + time(HH:MM:SS) → unix seconds(UTC). */
export function kstToUnix(date: string, time: string): number {
    return Math.floor(Date.parse(`${date}T${time}+09:00`) / 1000);
}

/** YYYY-MM-DD ± n일. UTC 파싱/포맷으로 TZ 드리프트 없이 날짜 산술. */
export function addDaysYmd(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
