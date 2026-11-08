/** 봉 시각 → KST 날짜·시각. 응답의 오프셋 표기가 무엇이든 한 기준으로 맞춘다. */
export function kstOf(timestamp: string): { date: string; time: string } {
    const iso = new Date(Date.parse(timestamp) + 9 * 3600e3).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}
