// 종목코드 정규화 — Sheet 경계에서만(어댑터 안). market-eye engine/codes.ts 재구성.
// 'A005930'(조건검색 접두) · '005930_AL'(통합입력 접미) · 엑셀이 앞0 떼먹은 '5930' → 표준형 '005930'.

/** Sheet 코드 → 표준 6자리. A접두/_접미 제거, 숫자면 6자리 padStart. */
export function toCanonical(code: string): string {
    let c = (code ?? "").trim().toUpperCase();
    if (c.startsWith("A")) c = c.slice(1); // 조건검색 A접두 제거
    const us = c.indexOf("_"); // _AL/_NX 등 거래소 접미 제거
    if (us !== -1) c = c.slice(0, us);
    c = c.replace(/\s+/g, "");
    if (/^\d+$/.test(c) && c.length < 6) c = c.padStart(6, "0"); // 엑셀이 떼먹은 앞 0 복원
    return c;
}
