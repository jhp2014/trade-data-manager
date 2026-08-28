// 서수(순위) ↔ 프랙션 — 컷 레일의 √ 척도(순수).
//
// 왜 √ 인가: 순위 컷의 행동은 상위권(1~100위)에 몰리는데 도메인은 1..~600 균등이라, 선형이면
// 쓰는 구간이 트랙 왼쪽 1/6 에 구겨진다. √ 는 상위권을 펼치고 하위권을 접되 로그처럼 끝이
// 무한히 눌리지는 않는다(decisions.md "테마 강도" — 서수 레일 √ 스케일).
//
// 스냅은 fracToOrd 의 반올림이 겸한다 — 서수는 전부 정수 자리라 별도 스냅 색인이 필요 없다.

/** 서수(1..max) → 0..1. max ≤ 1 이면 자리 구분이 없다 — 0(강한 끝)에 세운다. */
export function ordToFrac(ord: number, max: number): number {
    if (max <= 1) return 0;
    const t = (Math.min(Math.max(ord, 1), max) - 1) / (max - 1);
    return Math.sqrt(t);
}

/** 0..1 → 서수(1..max, 정수). ordToFrac 의 역함수 + 반올림 스냅. */
export function fracToOrd(frac: number, max: number): number {
    if (max <= 1) return 1;
    const t = Math.min(Math.max(frac, 0), 1);
    return Math.min(max, Math.max(1, 1 + Math.round(t * t * (max - 1))));
}
