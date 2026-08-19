// ItemRows — 가상 목록. 여기서 잠그는 것:
//   · 큰 목록이 **다 그려지지는 않는다**(DOM 노드 수가 비용이라 잘라 그리는 게 이 컴포넌트의 존재 이유).
//   · 그런데 **비어 있지도 않다** — 높이를 못 재면 가상화는 0줄을 그리고, 화면은 조용히 빈 채로 남는다.
//     이게 가상화의 유일한 조용한 실패 방식이라 첫 검사가 그것이다.
//   · 문맥이 줄 안에 있다: 덩어리 첫 줄만 날짜·이름을 쓴다(잘라 그려도 그대로여야 한다).
//   · 구분줄은 목록 **안에** 산다(섹션 머리가 밖에 있으면 가상화가 자리를 못 잡는다).
//
// 높이는 테스트 하네스가 준다(setup.ts 가 getBoundingClientRect·ResizeObserver 를 1000×600 으로 고정).
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ItemRows, type RowItem } from "../ItemRows.js";

const nameOf = (code: string): string => `종목${code}`;

/** N개의 하루 항목 — (종목·날짜)가 다 달라 덩어리가 N개다(키가 겹치면 목록이 섞인다). */
const days = (n: number): RowItem[] =>
    Array.from({ length: n }, (_, i) => ({ stockCode: `A${i}`, date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}` }));

describe("ItemRows — 잘라 그리되 비지 않는다", () => {
    it("5,000줄을 줘도 DOM 은 한 화면치만 — 이게 MAX_ROWS 를 없앨 수 있었던 이유다", () => {
        const { container } = render(
            <ItemRows sections={[{ items: days(5000) }]} showTime={false} nameOf={nameOf} onPick={() => {}} />,
        );
        const painted = container.querySelectorAll("[data-row]").length;
        expect(painted).toBeGreaterThan(0);   // 비면 화면이 조용히 사라진 것
        expect(painted).toBeLessThan(200);    // 다 그리면 가상화가 안 걸린 것
    });

    it("덩어리 첫 줄만 날짜·이름을 쓴다 — 문맥이 줄 안에 박혀 있어 잘라 그려도 유지된다", () => {
        const pts: RowItem[] = [
            { stockCode: "A", date: "2026-07-11", time: "09:32:00" },
            { stockCode: "A", date: "2026-07-11", time: "10:05:00" },
        ];
        render(<ItemRows sections={[{ items: pts }]} showTime nameOf={nameOf} onPick={() => {}} />);
        // 이름은 한 번만 — 두 줄 다 쓰면 몇 개의 차트인지 안 읽힌다.
        expect(screen.getAllByText("종목A")).toHaveLength(1);
        expect(screen.getByText("09:32")).toBeTruthy();
        expect(screen.getByText("10:05")).toBeTruthy();
    });

    it("구분줄이 목록 안에 선다 — 토막 머리가 밖에 있으면 스크롤 상자가 둘로 갈린다", () => {
        render(
            <ItemRows showTime={false} nameOf={nameOf} onPick={() => {}}
                sections={[
                    { items: [{ stockCode: "A", date: "2026-07-11" }] },
                    { label: "표현 안 됨 1", warn: true, items: [{ stockCode: "B", date: "2026-07-10" }] },
                ]} />,
        );
        expect(screen.getByText("표현 안 됨 1")).toBeTruthy();
    });

    it("빈 토막은 구분줄도 안 남긴다 — 결손이 0인데 '표현 안 됨' 머리가 서면 거짓말이다", () => {
        render(
            <ItemRows showTime={false} nameOf={nameOf} onPick={() => {}}
                sections={[
                    { items: [{ stockCode: "A", date: "2026-07-11" }] },
                    { label: "표현 안 됨 0", warn: true, items: [] },
                ]} />,
        );
        expect(screen.queryByText("표현 안 됨 0")).toBeNull();
    });

    it("줄 클릭 = 그 항목 — 시각 없는 하루 줄도 눌린다(타점 없는 하루도 선택이다)", () => {
        const picked: RowItem[] = [];
        render(
            <ItemRows sections={[{ items: [{ stockCode: "A", date: "2026-07-11" }] }]}
                showTime={false} nameOf={nameOf} onPick={(it) => picked.push(it)} />,
        );
        fireEvent.click(screen.getByText("종목A"));
        expect(picked).toEqual([{ stockCode: "A", date: "2026-07-11" }]);
    });
});
