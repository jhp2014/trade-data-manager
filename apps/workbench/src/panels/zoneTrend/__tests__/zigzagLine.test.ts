// 뷰 전용 지그재그 축약 — 가산 %p 임계·prefix 인과성(스크럽을 앞으로 돌려도 지난 모양이 안 바뀐다).
import { describe, expect, it } from "vitest";
import { zigzagIdx } from "../zigzagLine.js";

describe("zigzagIdx — 퇴화 입력", () => {
    it("endIdx < 0 = [] · 샘플 하나 = [0]", () => {
        expect(zigzagIdx([], 2, -1)).toEqual([]);
        expect(zigzagIdx([1], 2, 0)).toEqual([0]);
        expect(zigzagIdx([1, 2, 3], 2, -1)).toEqual([]);
    });
});

describe("zigzagIdx — 축약 규칙", () => {
    it("단조 시계열은 [0, end]", () => {
        expect(zigzagIdx([0, 1, 3, 5, 9], 2, 4)).toEqual([0, 4]);
        expect(zigzagIdx([9, 7, 4, 1], 2, 3)).toEqual([0, 3]);
    });

    it("임계 미만의 흔들림은 사라진다(꼬리도 없다)", () => {
        expect(zigzagIdx([0, 1, 0.5, 1.2, 0.8, 1.5], 2, 5)).toEqual([0, 5]);
    });

    it("임계와 **같은** 반전은 확정된다(경계 ≥)", () => {
        // 3 → 1 이 정확히 2%p 반전 — 고점(인덱스 1)이 확정된다.
        expect(zigzagIdx([0, 3, 1, 1.5], 2, 3)).toEqual([0, 1, 2, 3]);
    });

    it("하락 leg 의 미확정 꼬리 저점도 선다(dir=-1 대칭)", () => {
        // 10→7 확정 하락 leg 진행 중, 7 이 미확정 저점·8 이 끝점 — [시작, 꼬리 저점, 끝].
        expect(zigzagIdx([10, 7, 8], 2, 2)).toEqual([0, 1, 2]);
    });
});

// 손으로 전개한 기준 계열 — 확정·미확정 꼬리·끝점 규칙을 분 단위로 고정한다.
const SERIES = [0, 3, 1, 4, 2, 6, 6.5, 5, 9];

describe("zigzagIdx — prefix 인과성(기준 계열 전 구간)", () => {
    const EXPECTED: Record<number, number[]> = {
        1: [0, 1],
        2: [0, 1, 2],
        3: [0, 1, 2, 3],
        4: [0, 1, 2, 3, 4],
        5: [0, 1, 2, 3, 4, 5],
        6: [0, 1, 2, 3, 4, 6],
        7: [0, 1, 2, 3, 4, 6, 7], // 6.5 는 미확정 꼬리 극값 — 아직 2%p 반전이 없다
        8: [0, 1, 2, 3, 4, 8], // 9 가 극값을 이어받아 꼬리가 끝점에 흡수된다
    };
    for (const [m, expected] of Object.entries(EXPECTED)) {
        it(`m=${m} → [${expected.join(",")}]`, () => {
            expect(zigzagIdx(SERIES, 2, Number(m))).toEqual(expected);
        });
    }

    it("확정 피벗은 m 이 자라도 안 바뀐다 — 공통 prefix [0,1,2,3,4]", () => {
        for (let m = 5; m <= 8; m++) {
            expect(zigzagIdx(SERIES, 2, m).slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
        }
    });
});
