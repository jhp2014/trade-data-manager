// 이름 칩의 **손짓 배치**를 못박는다 — 클릭 = 고정 토글, Ctrl+클릭 = 시선 이동(사용자 확정).
//
// 대상은 일봉의 **바닥 원점 스택** 칩이다(일봉엔 거터가 없다). 분봉 거터 칩도 같은 손짓을 쓰므로
// 규칙이 갈릴 수 없다 — 배선이 한 벌이라는 걸 gutterHover 가 두 grain 으로 같이 지킨다.
//
// 옛 배치는 반대였다(클릭=이동, 우클릭=고정). 이 패널의 본론이 모수 구성(고정을 넣고 빼는 일)이라
// 한 번 누르는 자리를 그쪽에 준 것인데, 그 뒤집기는 **눈으로는 안 보이는 종류**라 테스트가 지켜야 한다:
//   · 클릭 한 번이 고정 슬롯(영속)을 뒤집는다.
//   · Ctrl+클릭은 고정을 **안 건드리고** 시선만 옮긴다(더블클릭이 아닌 이유는 GutterLayer 머리 주석).
//   · 고정된 칩은 화면에서 티가 난다(예전엔 툴팁 문구에만 있어 "고정한 게 뭔지" 안 보였다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { CODE, DATE, dailyBundle, dailyPin, stockNames } from "./overlayFixture.js";
import { useWorkbench } from "../../../store/workbench.js";

/** 이름 칩들 — 일봉이라 바닥 원점 스택에 산다. */
const labelChips = (c: HTMLElement): HTMLButtonElement[] =>
    [...(c.querySelector('[data-layer="origin-stack"]')?.querySelectorAll("button") ?? [])]
        .filter((b): b is HTMLButtonElement => (b.title ?? "").includes("클릭=고정"));

/** 지금 영속된 고정 슬롯들 — 클릭이 실제로 저장까지 갔나. */
const savedPins = (): unknown[] => JSON.parse(localStorage.getItem("wb.normPins.daily") ?? "[]");

const renderPanel = (): HTMLElement =>
    renderWithProviders(<NormOverlayPanel grain="daily" />, {
        charts: [{ code: CODE, date: DATE, data: dailyBundle }], stockNames,
    }).container;

beforeEach(() => {
    localStorage.clear();
    useWorkbench.setState({ focus: { date: DATE, code: "", time: null } });
});
afterEach(() => localStorage.clear());

describe("이름 칩 손짓", () => {
    it("클릭 = 고정 해제 — 한 번 누르면 슬롯이 비고, 화면에서도 사라진다", () => {
        seedPins();
        const c = renderPanel();
        const [chip] = labelChips(c);
        expect(savedPins()).toHaveLength(1);

        fireEvent.click(chip);

        expect(savedPins()).toHaveLength(0);
        expect(labelChips(c)).toHaveLength(0); // 모수에서 빠졌으니 선도 라벨도 없다
    });

    it("고정은 **눈에 보인다** — 배경이 채워지고 왼쪽에 그 선 색 바가 선다", () => {
        seedPins();
        const [chip] = labelChips(renderPanel());
        expect(chip.style.background).toBe("var(--bg-secondary)");
        expect(chip.style.borderLeftWidth).toBe("2px");
    });

    it("Ctrl+클릭 = 시선 이동 — 고정은 **안 건드린다**(수식키로 가른 이유)", () => {
        seedPins();
        const [chip] = labelChips(renderPanel());

        fireEvent.click(chip, { ctrlKey: true });

        expect(savedPins()).toHaveLength(1); // 그대로
        expect(useWorkbench.getState().focus).toMatchObject({ code: CODE, date: DATE });
    });

    it("우클릭도 고정 토글로 남는다 — 옛 손버릇이 틀린 동작을 하지 않게", () => {
        seedPins();
        const [chip] = labelChips(renderPanel());
        fireEvent.contextMenu(chip);
        expect(savedPins()).toHaveLength(0);
    });

    it("⌃우클릭(mac 의 ⌃클릭)은 고정을 안 건드린다 — 같은 손짓이 두 번 먹으면 안 된다", () => {
        seedPins();
        const [chip] = labelChips(renderPanel());
        fireEvent.contextMenu(chip, { ctrlKey: true });
        expect(savedPins()).toHaveLength(1);
    });
});

/** 고정 하나 심기 — 영속이라 **렌더 전에** 앉혀야 한다(useNormLines 가 마운트 시점에 읽는다). */
function seedPins(): void {
    localStorage.setItem("wb.normPins.daily", JSON.stringify([dailyPin]));
}
