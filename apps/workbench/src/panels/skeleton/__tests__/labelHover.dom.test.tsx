// 라벨 손잡이의 **정체가 호버로 안 바뀐다**는 걸 실제 DOM 에서 못박는다.
//
// 겪은 버그: 라벨에 손을 올렸다가 다른 곳으로 옮겨도 호버가 남았다(간헐적). 원인은 그림이 아니라 정체였다 —
// 묶음 라벨과 짚은 라벨을 **다른 배열 두 벌**로 그려서, 짚는 순간 그 라벨이 배열을 갈아타며 커서 밑의
// DOM 노드가 부서지고 새로 만들어졌다. 언마운트된 노드는 mouseleave 를 안 쏘고(React 는 루트 위임이라
// 떨어져 나간 노드의 이벤트가 안 올라온다), 커서 밑에 새로 꽂힌 노드는 마우스가 멈춰 있으면 mouseover 를
// 못 받을 수 있다 — 그래서 손을 치워도 호버가 안 풀렸다.
//
// 순수 함수 쪽 계약은 `labelHandles` 테스트가 지키고, 여기서는 **그 계약이 화면까지 살아 오는지**를 본다:
// 짚기 전에 잡아 둔 노드가 짚은 뒤에도 그대로 문서에 붙어 있어야 하고, 그 노드에서 나가면 호버가 풀려야 한다.
//
// ⚠ React 의 onMouseEnter/onMouseLeave 는 native mouseenter 를 안 듣는다(mouseover/mouseout 으로 합성한다) —
//   그래서 fireEvent 도 mouseOver/mouseOut 으로 쏜다. 실제 브라우저가 주는 것과 같은 이벤트다.
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { points, skeletonFeed as feed } from "./overlayFixture.js";

/** 선 라벨 칩들 — 조작 안내가 붙은 버튼이 라벨이다(뱃지·헤더 버튼과 갈린다). */
function labelChips(container: HTMLElement): HTMLButtonElement[] {
    return [...container.querySelectorAll("button")].filter((b) => (b.title ?? "").includes("우클릭=그룹"));
}

describe.each([
    ["daily" as const, "일봉"],
    ["minute" as const, "분봉"],
])("골격 라벨 호버(%s)", (grain, label) => {
    const renderPanel = (): HTMLElement =>
        renderWithProviders(<SkeletonOverlayPanel grain={grain} />, { skeletons: feed, points }).container;

    it(`${label}: 라벨이 손잡이로 서 있다 — 아래 검사가 빈 화면을 상대로 헛돌지 않게`, () => {
        expect(labelChips(renderPanel())).toHaveLength(1);
    });

    it(`${label}: **짚어도 그 노드가 안 부서진다** — 부서지면 mouseleave 가 영영 안 온다`, () => {
        const [chip] = labelChips(renderPanel());
        expect(chip.style.fontWeight).not.toBe("700"); // 아직 안 짚은 상태

        fireEvent.mouseOver(chip, { relatedTarget: document.body });

        expect(chip.isConnected).toBe(true); // ← 옛 구조에선 여기서 떨어져 나갔다
        expect(chip.style.fontWeight).toBe("700"); // 같은 노드가 짚은 모습으로 바뀐 것
        expect(labelChips(document.body)).toHaveLength(1); // 새 노드가 따로 생기지도 않았다
    });

    it(`${label}: 손을 치우면 호버가 풀린다 — 짚었던 그 노드에서 leave 가 온다`, () => {
        const [chip] = labelChips(renderPanel());
        fireEvent.mouseOver(chip, { relatedTarget: document.body });
        fireEvent.mouseOut(chip, { relatedTarget: document.body });

        expect(chip.isConnected).toBe(true);
        expect(chip.style.fontWeight).not.toBe("700");
    });
});
