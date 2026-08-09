// 세로선 판독의 **순수 계산** — "이 시각에 누구를 보여주고, 그 칩을 세로 어디에 세울까".
//
// ## 왜 뽑아야 하나
// 테마가 30선이면 값도 30개다. 다 세우면 화면이 숫자로 덮여 정작 아무것도 안 읽힌다.
// 커서에서 가까운 순 같은 기준은 **왜 그 종목이 뽑혔는지 설명이 안 된다**(그저 마우스가 거기 있었을 뿐).
// 그래서 뜻이 있는 두 축으로 자른다(사용자 확정): **그 시각 등락률 상위 N** ∪ **누적 거래대금 상위 N**
// — "센 놈"과 "돈이 몰린 놈". 겹치면 합집합이라 10개보다 적게 나오고, 그건 괜찮다.
//
// ## 왜 열이 아니라 세로 벌리기인가(사용자 확정)
// 예전 핀 판독은 겹치면 옆 열로 밀었는데, 열이 늘면 화면 오른쪽을 넘고 "어느 시각 것이냐"를 열로 읽는
// 규칙까지 따로 배워야 했다. 지시선이 이미 대응을 지고 있으니 **한 열에서 위아래로 벌리면** 그만이다
// — 거터 이름 라벨과 같은 문법이 되어 이 패널의 라벨 규칙이 하나로 통일된다.
import { spreadByY } from "./skeletonOverlay.js";

/** 판독 후보 하나 — 어떤 x 에서 읽은 한 선의 값. */
export interface ReadoutCandidate {
    code: string;
    name: string;
    /** 뷰 y(값 공간) — 화면 좌표 환산은 호출측의 몫. */
    y: number;
    /** 전일 종가 대비 %(칩에 적는 값). */
    pct: number;
    /** 그 분 거래대금(원). 그날 유니버스 밖이면 null — 0으로 지어내지 않는다. */
    amount: number | null;
    /** 그 시각까지 누적 거래대금(원) — **뽑기 기준**(칩엔 안 적는다). 모르면 0. */
    cumAmount: number;
    /** 내 골격선인가 — 주인공은 순위와 무관하게 언제나 남는다. */
    own?: boolean;
}

/**
 * 보여줄 후보 고르기 — `own` ∪ 등락률 상위 ∪ 누적 거래대금 상위. 결과는 **값 내림차순**
 * (화면에서 위에 있는 선이 목록에서도 위 — 눈이 안 헤맨다).
 */
export function pickReadouts(
    items: readonly ReadoutCandidate[],
    topRate: number,
    topAmount: number,
): ReadoutCandidate[] {
    const keep = new Set<string>();
    for (const it of items) if (it.own) keep.add(it.code);
    for (const it of [...items].sort((a, b) => b.pct - a.pct).slice(0, topRate)) keep.add(it.code);
    for (const it of [...items].sort((a, b) => b.cumAmount - a.cumAmount).slice(0, topAmount)) keep.add(it.code);
    return items.filter((it) => keep.has(it.code)).sort((a, b) => b.y - a.y);
}

/** 자리를 잡은 칩 하나 — 화면 좌표. */
export interface PlacedRow<T> {
    item: T;
    /** 지시선이 가리키는 자리(상자 안으로 당겨진 값). */
    anchorY: number;
    /** 칩이 실제로 서는 자리. */
    labelY: number;
    /** 진짜 값이 상자 **밖**이라 가장자리로 당겨졌나 — 칩에 ▲▼ 로 표시한다. */
    off: "up" | "down" | null;
}

/**
 * 칩의 세로 자리 — 세 단계.
 *  ① **상자 밖 값은 가장자리로 당긴다**(사용자 확정). 확대해서 y 범위를 벗어난 선이 조용히 사라지면
 *     "위에 뭔가 더 있다"를 알 길이 없다. 당긴 것은 `off` 로 표시해 진짜 값이 밖이라는 걸 남긴다.
 *  ② 겹치면 벌린다(spreadByY — 무리 중심은 보존).
 *  ③ 벌린 무리가 상자를 넘치면 **통째로 민다**. 개별로 다시 클램프하면 ②의 간격이 도로 깨진다.
 */
export function layoutReadoutRows<T>(
    rows: readonly { item: T; y: number }[],
    range: { min: number; max: number },
    gap: number,
): PlacedRow<T>[] {
    if (rows.length === 0) return [];
    const clamped = rows.map((r) => ({
        item: r.item,
        off: (r.y < range.min ? "up" : r.y > range.max ? "down" : null) as "up" | "down" | null,
        anchorY: Math.min(range.max, Math.max(range.min, r.y)),
    }));
    const spread = spreadByY(clamped.map((c) => ({ ...c, x: 0, y: c.anchorY })), Number.MAX_SAFE_INTEGER, gap);
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of spread) {
        if (s.labelY < lo) lo = s.labelY;
        if (s.labelY > hi) hi = s.labelY;
    }
    const shift = lo < range.min ? range.min - lo : hi > range.max ? range.max - hi : 0;
    return spread.map((s) => ({ item: s.item, anchorY: s.anchorY, labelY: s.labelY + shift, off: s.off }));
}
