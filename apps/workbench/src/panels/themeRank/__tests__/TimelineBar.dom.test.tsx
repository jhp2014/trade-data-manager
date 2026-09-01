// 타임라인 바 — 스크럽 좌표(PAD_X 보정)와 ▼ 점프의 배선. 띠·플레이헤드의 실제 페인트는 실측 몫.
// 트랙 폭은 setup 의 getBoundingClientRect 가 1000px 로 물린다 — 분 = lo + round((x−PAD)/(1000−2·PAD)·span).
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { TimelineBar } from "../TimelineBar.js";

const LO = 540; // 09:00
const HI = 940; // 15:40
const PAD = 10;
const xAt = (frac: number): number => PAD + frac * (1000 - 2 * PAD);

function setup(over: Partial<Parameters<typeof TimelineBar>[0]> = {}) {
    const onScrub = vi.fn();
    const utils = render(
        <TimelineBar lo={LO} hi={HI} minute={600} pointMinutes={[]} segments={null} onScrub={onScrub} {...over} />,
    );
    const track = utils.container.querySelector('[title^="누르거나 끌어서 시각"]') as HTMLElement;
    return { ...utils, onScrub, track };
}

describe("스크럽 — 트랙 좌표 → 분", () => {
    it("가운데를 누르면 도메인 가운데 분", () => {
        const { track, onScrub } = setup();
        fireEvent.pointerDown(track, { button: 0, clientX: xAt(0.5), pointerId: 1 });
        expect(onScrub).toHaveBeenCalledWith(LO + Math.round(0.5 * (HI - LO)));
    });

    it("끌면 지나는 분마다 갱신, 여백 밖은 도메인 끝으로 클램프", () => {
        const { track, onScrub } = setup();
        fireEvent.pointerDown(track, { button: 0, clientX: xAt(0.2), pointerId: 1 });
        fireEvent.pointerMove(track, { clientX: xAt(0.4), pointerId: 1 });
        fireEvent.pointerMove(track, { clientX: 9999, pointerId: 1 });
        expect(onScrub).toHaveBeenCalledTimes(3);
        expect(onScrub).toHaveBeenLastCalledWith(HI);
    });

    it("누르지 않고 지나가는 move 는 스크럽이 아니다", () => {
        const { track, onScrub } = setup();
        fireEvent.pointerMove(track, { clientX: xAt(0.5), pointerId: 1 });
        expect(onScrub).not.toHaveBeenCalled();
    });
});

describe("▼ 타점 — 클릭 = 그 시각으로 점프", () => {
    it("마커 클릭이 그 분을 그대로 넘긴다(트랙 좌표 아님)", () => {
        const { container, onScrub } = setup({ pointMinutes: [571] });
        const marker = [...container.querySelectorAll("button")].find((b) => b.title.startsWith("타점"));
        fireEvent.click(marker!);
        expect(onScrub).toHaveBeenCalledWith(571);
        expect(marker!.title).toContain("09:31");
    });
});
