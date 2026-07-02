// 표시 포맷 헬퍼(순수). 반올림/기호는 표현계층 몫.

/** 등락률 % — 부호 붙여 소수 2자리. */
export function fmtRate(v: number): string {
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** 거래대금(원) → 억/조/만 단위 축약. */
export function fmtEok(krw: number): string {
    const eok = krw / 1e8;
    if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조`;
    if (eok >= 1) return `${eok.toFixed(0)}억`;
    if (krw >= 1e4) return `${(krw / 1e4).toFixed(0)}만`;
    return `${krw.toFixed(0)}`;
}
