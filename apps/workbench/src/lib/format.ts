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

// 옛 계산 축 인프라(lib/computedAxis — 2026-09-26 종단 은퇴)에서 살아남은 단위 규칙.
// 지금 소비자는 시장 단면 판의 값 축(대금·등락률)이다.
export interface ValueDisplay {
    suffix?: string;
    decimals?: number;
    signed?: boolean;
}

/** 수치 → 표시 문자열. 규격 없는 값은 등락률 모양(%·소수 1·부호). */
export function formatValue(v: number, display?: ValueDisplay): string {
    const { suffix = "%", decimals = 1, signed = true } = display ?? {};
    const render = (val: number, dec: number, sfx: string): string => {
        // 천단위 구분자 — 시총(억) 같은 큰 정수 값의 가독용.
        const [int, frac] = val.toFixed(dec).split(".");
        const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return `${signed && v > 0 ? "+" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}${sfx}`;
    };
    // 억 단위의 조 승격 — 1조(=10,000억) 이상은 "4.3조"(소수 한 자리). 단위의 규칙이라 억을 쓰는 값은 전부 같은 접힘.
    if (suffix === "억" && Math.abs(v) >= 10_000) return render(v / 10_000, 1, "조");
    // 분 단위의 시각 표기 — `94분` 은 눈이 시간으로 못 옮긴다(2026-09-05 사용자 확정).
    if (suffix === "분") return durationLabel(v);
    return render(v, decimals, suffix);
}

/** 분 → `1h 34m` / `45m` / `2h`(정각). 부호는 앞에 붙는다(포맷이 거짓말하면 안 된다). */
export function durationLabel(minutes: number): string {
    const total = Math.round(Math.abs(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    const sign = minutes < 0 ? "-" : "";
    if (h === 0) return `${sign}${m}m`;
    return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
}
