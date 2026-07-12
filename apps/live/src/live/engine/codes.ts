// 종목코드 포맷 정규화 — 한 곳에서만. 정본: market-eye/src/engine/codes.ts.
// 조건검색 출력 'A000150' · ka10095 통합입력 '000150_AL' · 표준형 '000150'.

/** 'A000150' | '000150_AL' | '000150' → 표준형 '000150' */
export function toCanonical(code: string): string {
    let c = (code ?? "").trim().toUpperCase();
    if (c.startsWith("A")) c = c.slice(1); // 조건검색 A접두 제거
    const us = c.indexOf("_"); // _AL/_NX 등 거래소 접미 제거
    if (us !== -1) c = c.slice(0, us);
    c = c.replace(/\s+/g, "");
    if (/^\d+$/.test(c) && c.length < 6) c = c.padStart(6, "0"); // 앞자리 0 복원
    return c;
}

/** 표준형 → ka10095 통합(_AL) 입력형 '000150_AL' (거래대금 KRX+NXT 합산, 라이브) */
export function toAlCode(code: string): string {
    return `${toCanonical(code)}_AL`;
}
