// 머리글의 **두 규약**을 기계가 지킨다 — 주석만 남기면 다음 컨트롤이 추가될 때 조용히 깨진다.
//
//   ① 왼쪽은 손, 오른쪽은 말 — 선택 개수에 따라 생기는 손잡이는 머리글에 안 산다(그림 위 작업줄).
//   ② 자리는 안 사라진다 — 상태가 바뀌어도 머리글의 컨트롤 목록이 그대로다.
//
// 왜 테스트가 필요했나: 옛 머리글은 선을 하나 고를 때마다 "차트 1 그룹 · ✕ · 원위치 ⤺"가 뒤에 붙어
// 줄의 길이와 순서가 바뀌었다. 토글을 누르러 가던 손이 매번 줄을 다시 훑어야 했다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { DATE, clusterFeed, clusterPoints } from "./overlayFixture.js";

/** 머리글 줄 — PanelHeader 는 넘침 규약(가로 스크롤·스크롤바 숨김) 때문에 이 클래스를 단다. */
const headerOf = (c: HTMLElement): HTMLElement => c.querySelector<HTMLElement>(".no-scrollbar")!;
/** 머리글이 지금 들고 있는 누를 것들 — 라벨 그대로(순서까지 본다). */
const headerButtons = (c: HTMLElement): string[] =>
    [...headerOf(c).querySelectorAll("button")].map((b) => b.textContent ?? "");
const labelChips = (c: HTMLElement): HTMLButtonElement[] =>
    [...c.querySelectorAll("button")].filter((b) => (b.title ?? "").includes("우클릭=그룹"));
const buttonBy = (c: HTMLElement, text: string): HTMLButtonElement | undefined =>
    [...c.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text));

const resetStore = (): void => {
    useWorkbench.setState({ activePoint: null, skeletonSelection: new Set(), focus: { date: DATE, code: "", time: null } });
};
beforeEach(resetStore);
afterEach(() => { resetStore(); localStorage.clear(); });

// 골격 **하나만** 세운다 — 여럿이면 라벨이 뭉쳐 뱃지가 되어 개별 손잡이가 사라진다(labelHandles).
const render = (): HTMLElement =>
    renderWithProviders(<SkeletonOverlayPanel grain="daily" />, {
        skeletons: { daily: [clusterFeed.daily[0]], minute: [], levels: [] },
        points: [clusterPoints[0]],
    }).container;

describe("머리글 — 선택이 생겨도 컨트롤 줄이 안 움직인다", () => {
    it("선택 전후로 머리글의 버튼 목록이 같다", () => {
        const c = render();
        const before = headerButtons(c);
        fireEvent.click(labelChips(c)[0]);
        expect(headerButtons(c)).toEqual(before);
    });

    it("'차트 N 그룹'은 머리글이 아니라 그림 위에 뜬다", () => {
        const c = render();
        expect(buttonBy(c, "차트 1 그룹")).toBeUndefined(); // 선택 전엔 아예 없다
        fireEvent.click(labelChips(c)[0]);

        const btn = buttonBy(c, "차트 1 그룹");
        expect(btn).toBeTruthy();
        expect(headerOf(c).contains(btn!)).toBe(false);
    });

    it("아무것도 안 골랐으면 작업줄이 통째로 없다 — 빈 판이 그림을 가리지 않게", () => {
        const c = render();
        const bar = [...c.querySelectorAll("button")].find((b) => /그룹$|^원위치/.test(b.textContent ?? ""));
        expect(bar).toBeUndefined();
    });
});
