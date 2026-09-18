// 날짜 경계 넘기(순수부) — 목록의 끝에서 w/s 가 날짜를 넘길 때의 규칙.
//
// 종단 우주에선 날짜가 목록 안에 섹션으로 있어 s 를 계속 누르면 자연히 다음 날로 내려간다.
// 하루 우주는 날짜가 머리로 빠졌을 뿐이므로, **그 손짓을 재현**하는 것이 이 파일의 일이다
// (decisions 「집합」: s = 다음 날짜의 첫 항목 · w = 이전 날짜의 마지막 항목).
//
// 비동기(재료 로딩)는 훅이 맡고 여기엔 **날짜 산수**만 둔다 — 그래야 상한·스킵 규칙을 단위 테스트가 잠근다.

/** 빈 날 자동 스킵의 기본 상한(거래일) — 빈 날마다 멈추면 손이 아프고, 무한이면 조용히 한 달을 훑는다. */
export const MAX_SKIP_DAYS = 10;

/**
 * **무거운 조건일 때의 상한** — 자동 스킵은 재료가 아니라 **그 날의 조건 평가**를 요구한다.
 * 존 순위·격자를 쓰는 조건은 하루 평가가 수 초라(실측 5.7초) 10일 스킵이 수십 초 프리즈가 된다.
 * 상한 10일은 "빈 날마다 멈추면 손이 아프다"를 풀려던 것인데, 그 대가가 1분 정지면 손이 더 아프다.
 */
export const MAX_SKIP_DAYS_HEAVY = 1;

/**
 * 방향대로 다음 후보 날짜들 — `dates`(분봉 보유일, 오름차순)에서 현재 다음/이전을 최대 `max` 개.
 * 휴장일은 애초에 목록에 없으므로 따로 거를 게 없다.
 */
export function nextDates(dates: readonly string[], cur: string, dir: 1 | -1, max: number): string[] {
    const at = dates.indexOf(cur);
    if (at < 0) {
        // 현재 날짜가 목록 밖(데이터 없는 날) — 방향으로 가장 가까운 것부터 준다.
        const near = dir > 0 ? dates.filter((d) => d > cur) : [...dates].reverse().filter((d) => d < cur);
        return near.slice(0, max);
    }
    const out: string[] = [];
    for (let i = at + dir; i >= 0 && i < dates.length && out.length < max; i += dir) out.push(dates[i]!);
    return out;
}

/** 이웃 날짜 — 프리페치가 당길 앞뒤 1일(없으면 생략). */
export function neighborDates(dates: readonly string[], cur: string): string[] {
    return [...nextDates(dates, cur, -1, 1), ...nextDates(dates, cur, 1, 1)];
}
