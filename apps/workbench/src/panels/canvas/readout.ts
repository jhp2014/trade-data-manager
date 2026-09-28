// 세로선 판독 칩의 **세로 자리 계산**(순수) — 겹치는 칩을 한 열에서 위아래로 벌린다.
//
// ## 왜 열이 아니라 세로 벌리기인가(사용자 확정)
// 예전 핀 판독은 겹치면 옆 열로 밀었는데, 열이 늘면 화면 오른쪽을 넘고 "어느 시각 것이냐"를 열로 읽는
// 규칙까지 따로 배워야 했다. 지시선이 이미 대응을 지고 있으니 **한 열에서 위아래로 벌리면** 그만이다.
// (후보 고르기 — 등락률 상위 ∪ 거래대금 상위 — 는 유일 소비자였던 정규화 패널과 함께 2026-09-28 은퇴.
//  지금 소비자는 장중 테마 테이프 하나다.)
import { spreadByY } from "./amountRuns.js";

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
