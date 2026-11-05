// 표시 포맷 헬퍼(순수). 반올림·기호는 표현 계층 몫.

/** 퍼센트 — 부호를 늘 붙인다. */
export const fmtPct = (v: number, digits = 1): string => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

/** 등락률 % — 소수 2자리(툴팁처럼 한 값을 정밀하게 읽는 자리). */
export const fmtRate = (v: number): string => fmtPct(v, 2);

/**
 * 거래대금(억 단위 값) → 억/조 — 축·툴팁·종목 줄이 모두 이 한 규칙을 쓴다.
 * 반올림해 1조(1만 억) 이상 = 조(소수 한 자리, .0 은 뗀다 · 쉼표), 1억 이상 = 억(쉼표), 그 아래 = "0.4억". 0 = "0억".
 */
export function fmtEokValue(eok: number): string {
    const r = Math.round(eok);
    if (Math.abs(r) >= 10000) return `${Number((eok / 10000).toFixed(1)).toLocaleString("ko-KR")}조`;
    if (eok === 0 || Math.abs(eok) >= 0.95) return `${r.toLocaleString("ko-KR")}억`;
    return `${eok.toFixed(1)}억`;
}

/** 거래대금(원) → 억/조(fmtEokValue). */
export const fmtEok = (krw: number): string => fmtEokValue(krw / 1e8);

/**
 * 시가총액(원, KRX 원값 문자열) → 반올림해 1조 이상 = 조(소수 한 자리 고정 — 값을 읽는 자리라 자릿수가 안 흔들리게, 거래대금과 달리 .0 을 안 뗀다), 아래 = 억(쉼표).
 */
export function fmtMarketCap(cap: string): string {
    const krw = Number(cap);
    const eok = Math.round(krw / 1e8);
    if (eok < 10000) return `${eok.toLocaleString("ko-KR")}억`;
    return `${(krw / 1e12).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}조`;
}
