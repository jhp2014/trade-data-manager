// 작업셋 목록의 **붙는 머리 두 층**(날짜·종목) 산술 — 순수 함수로 뺀 이유는 jsdom 이 이 로직을
// 못 재기 때문이다: **스크롤이 안 된다**(scrollTop 이 0 에 붙박이다 — 상자 높이는 test/setup.ts 가
// 물려 준다). 그래서 dom 테스트는 startIndex 0 인 자명한 경로만 지나고, 새 날 경계·밀어올리기
// 회귀가 통째로 안 잡힌다. 화면(WorksetList)은 여기 결과를 그리기만 한다.
//
// 높이가 여기 사는 이유: 가상화기의 estimateSize 와 offset 계산이 **같은 수**를 봐야 한다.
// 한쪽만 바뀌면 붙는 띠가 행 경계와 어긋나 "머리가 다음 행을 반쯤 먹는" 상태가 조용히 생긴다.

export type StickyRowKind = "date" | "stock" | "point";

/** 고정 행 높이(px) — 균일해야 가상화가 재지 않고 앉힌다(WorksetList 머리 주석). */
export const ROW_H: Record<StickyRowKind, number> = { date: 24, stock: 24, point: 22 };

/** 붙는 띠의 두께 = 두 머리(날짜+종목)의 높이 합 — **종단 목록**의 값이다. */
export const BAND_H = ROW_H.date + ROW_H.stock;

/**
 * 띠 두께 — 머리가 몇 층인가로 정한다. **하루 우주는 날짜가 상수라 머리가 1층**(종목)뿐이고,
 * 이 값을 상수로 두면 띠가 행을 반쯤 먹는다(이 파일이 경고하는 바로 그 증상).
 */
export const bandHOf = (hasDateHead: boolean): number => (hasDateHead ? BAND_H : ROW_H.stock);

/** 각 행의 시작 offset(px) — 누적합. */
export function rowStarts(kinds: readonly StickyRowKind[]): number[] {
    const out: number[] = new Array(kinds.length);
    let o = 0;
    for (let i = 0; i < kinds.length; i++) {
        out[i] = o;
        o += ROW_H[kinds[i]!];
    }
    return out;
}

/**
 * 스크롤 오프셋 y 가 걸친 행의 지표 — starts 오름차순 위 이분 탐색.
 * ⚠ 빈 목록이면 **0**(없는 지표)이다 — `lib/chartFrame.indexAtOrBefore` 의 -1 과 **반대 계약**이니
 * 옮겨 쓸 때 주의. 여기가 0 인 이유는 뒤에 오는 `stickyDateOf` 가 어차피 kinds 길이로 자르기 때문.
 * 가상화기에게 범위를 캐묻는 대신 여기서 재는 이유: 붙는 머리 산술의 입력이 **한 출처**여야
 * 순수 함수 테스트가 산술을 통째로 잠근다(dom 테스트는 위 머리 주석의 이유로 못 잠근다). 다만 잠기는
 * 것은 **함수들의 관계**지 화면의 배선이 아니다 — 호출부가 인자를 어긋나게 넘기는 회귀는 실측의 몫이다.
 * `lib/chartFrame.indexAtOrBefore` 를 안 쓴다 — 그건 봉 배열용 선형 훑기고, 여긴 스크롤 프레임마다
 * 도는 자리라 행 수(수천)에 비례하면 안 된다.
 */
export function indexAt(starts: readonly number[], y: number): number {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid]! <= y) lo = mid;
        else hi = mid - 1;
    }
    return Math.max(lo, 0);
}

/**
 * 지금 구간의 붙는 **날짜** 머리 — 없으면 -1.
 * 종목 머리는 여기서 안 고른다(stickyStockAt 이 픽셀로 고른다): 행 지표(startIndex)는 뷰포트 y=0
 * 기준인데 종목 머리가 앉는 자리는 y=24 라, 지표로 갈아끼우면 24px 어긋나 다음 종목 이름이 한 번 깜빡인다.
 */
export function stickyDateOf(kinds: readonly StickyRowKind[], startIndex: number): number {
    let date = -1;
    const end = Math.min(startIndex, kinds.length - 1);
    for (let i = 0; i <= end; i++) if (kinds[i] === "date") date = i;
    return date;
}

/**
 * 실제로 붙는 종목 — **띠 바닥(y)** 에 걸린 종목이다. y = scrollOffset + ROW_H.date(종목 머리가
 * 앉는 자리). 갈아끼우는 문턱을 밀어올리기 기준(BAND_H)과 맞물리게 하는 게 요점: 그래야 앞 머리가
 * 딱 다 밀려난 순간 다음 머리가 제자리에서 이어받아 이음매가 안 튄다.
 * 다음 **날짜** 머리가 이미 그 자리까지 왔으면 -1 — 그 아래 행들은 이제 새 날의 것이라 앞 날 종목을
 * 붙여 두면 거짓말이다(새 날짜가 붙는 머리가 되는 건 한 박자 뒤다).
 */
export function stickyStockAt(
    kinds: readonly StickyRowKind[],
    starts: readonly number[],
    dateIdx: number,
    y: number,
): number {
    let stock = -1;
    for (let i = dateIdx + 1; i < kinds.length; i++) {
        if (starts[i]! > y) break;
        if (kinds[i] === "date") return -1;
        if (kinds[i] === "stock") stock = i;
    }
    return stock;
}

/**
 * 붙은 종목 머리의 **밀어올리기**(0 또는 음수 px) — 다음 머리(다음 종목이든 다음 날짜든)가 띠 안으로
 * 들어온 만큼 위로 민다. 안 밀면 띠(48px)가 다음 종목 행을 통째로 삼켜, 그 종목의 타점이 **앞 종목
 * 이름 밑에** 서는 구간이 두 행 높이만큼 생긴다(머리가 틀린 말을 하는 창).
 */
export function stockPushOf(
    kinds: readonly StickyRowKind[],
    starts: readonly number[],
    stockIdx: number,
    scrollOffset: number,
    /** 띠 두께 — 머리 층수에 따라 다르다(bandHOf). 기본은 종단(날짜+종목). */
    bandH: number = BAND_H,
): number {
    if (stockIdx < 0) return 0;
    let next = -1;
    for (let i = stockIdx + 1; i < kinds.length; i++) {
        if (kinds[i] !== "point") { next = i; break; }
    }
    if (next < 0) return 0; // 마지막 덩어리 — 뒤에서 밀 것이 없다
    return Math.min(0, starts[next]! - (scrollOffset + bandH));
}
