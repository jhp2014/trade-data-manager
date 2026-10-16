// 패널 본문 누름 → 그 패널이 보는 경로가 활성(캡처 단계 — 본문 요소가 전파를 끊어도).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePaths } from "../store/paths.js";
import { PanelHost } from "./panelCatalog.js";

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
});
afterEach(cleanup);

describe("PanelHost", () => {
    it("본문을 누르면 그 패널의 경로가 활성 — 안쪽이 전파를 끊어도", () => {
        usePaths.getState().bind("theme-2", "B");
        render(
            <PanelHost panelId="theme-2">
                <button onPointerDown={(e) => e.stopPropagation()}>카드</button>
            </PanelHost>,
        );
        fireEvent.pointerDown(screen.getByText("카드"));
        expect(usePaths.getState().active).toBe("B");
    });
});
