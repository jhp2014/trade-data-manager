// 작업셋 목록의 **붙는 머리 두 층**(날짜·종목) 산술 — 순수 함수로 뺀 이유는 jsdom 이 이 로직을
// 못 재기 때문이다: 스크롤 상자 높이가 0 이라 dom 테스트는 startIndex 0 인 자명한 경로만 지난다
// (새 날 경계·밀어올리기 회귀가 통째로 안 잡힌다). 화면(WorksetList)은 여기 결과를 그리기만 한다.
//
// 높이가 여기 사는 이유: 가상화기의 estimateSize 와 offset 계산이 **같은 수**를 봐야 한다.
// 한쪽만 바뀌면 붙는 띠가 행 경계와 어긋나 "머리가 다음 행을 반쯤 먹는" 상태가 조용히 생긴다.

export type StickyRowKind = "date" | "stock" | "point";

/** 고정 행 높이(px) — 균일해야 가상화가 재지 않고 앉힌다(WorksetList 머리 주석). */
export const ROW_H: Record<StickyRowKind, number> = { date: 24, stock: 24, point: 22 };

/** 붙는 띠의 두께 = 두 머리(날짜+종목)의 높이 합. */
export const BAND_H = ROW_H.date + ROW_H.stock;

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
 * 지금 구간의 붙는 머리 둘 — 날짜(위)·종목(아래). 없으면 -1.
 * 종목은 **그 날짜 머리 뒤의 것만** 붙는다: 새 날이 막 시작한 자리(머리만 보이는 구간)에서
 * 앞 날의 마지막 종목이 따라 붙으면 머리가 거짓말을 한다.
 *
 * ⚠ 이건 **그리기 범위에 넣을 후보**를 고르는 용도다(rangeExtractor). 실제로 붙는 종목은
 * `stickyStockAt` 이 픽셀로 다시 고른다 — 행 지표(startIndex)는 뷰포트 y=0 기준인데 종목 머리가
 * 앉는 자리는 y=24 라, 지표로 갈아끼우면 24px 어긋나 다음 종목 이름이 한 번 깜빡인다.
 * 픽셀로 고른 것은 늘 이 후보이거나 그보다 **뒤**(=이미 보이는 행)라 범위에 이미 들어 있다.
 */
export function stickyHeadsOf(kinds: readonly StickyRowKind[], startIndex: number): { date: number; stock: number } {
    let date = -1;
    let stock = -1;
    const end = Math.min(startIndex, kinds.length - 1);
    for (let i = 0; i <= end; i++) {
        if (kinds[i] === "date") { date = i; stock = -1; } // 새 날이 열리면 종목 후보를 버린다
        else if (kinds[i] === "stock") stock = i;
    }
    return { date, stock };
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
): number {
    if (stockIdx < 0) return 0;
    let next = -1;
    for (let i = stockIdx + 1; i < kinds.length; i++) {
        if (kinds[i] !== "point") { next = i; break; }
    }
    if (next < 0) return 0; // 마지막 덩어리 — 뒤에서 밀 것이 없다
    return Math.min(0, starts[next]! - (scrollOffset + BAND_H));
}
