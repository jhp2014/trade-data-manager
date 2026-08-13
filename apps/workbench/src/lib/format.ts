// 표시 포맷 헬퍼(순수). 반올림/기호는 표현계층 몫.

/**
 * 퍼센트 — 부호를 늘 붙이고 자릿수만 자리마다 다르다. 같은 두 줄이 세 벌(2자리·보드 1자리·골격 1자리)로
 * 흩어져 있었는데, 갈리는 건 자릿수 하나뿐이라 그것만 인자로 받는다.
 * 화면 폭이 넓으면 2자리, 좁거나 훑어보는 자리(보드·골격)면 1자리가 관례다.
 */
export const fmtPct = (v: number, digits = 1): string => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

/** 등락률 % — 부호 붙여 소수 2자리(차트 툴팁처럼 한 값을 정밀하게 읽는 자리). */
export const fmtRate = (v: number): string => fmtPct(v, 2);

/** 거래대금(원) → 억/조/만 단위 축약. */
export function fmtEok(krw: number): string {
    const eok = krw / 1e8;
    if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조`;
    if (eok >= 1) return `${eok.toFixed(0)}억`;
    if (krw >= 1e4) return `${(krw / 1e4).toFixed(0)}만`;
    return `${krw.toFixed(0)}`;
}
