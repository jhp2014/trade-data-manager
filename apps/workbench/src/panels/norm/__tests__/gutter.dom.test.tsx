// 오른쪽 이름 거터의 **계약**을 화면에서 못박는다. 거터는 **분봉 전용**이다(사용자 확정).
//
//   ① 일봉엔 거터가 아예 없다 — 적을 값이 없어 폭을 그림에 돌려줬다(정체는 바닥 원점 스택이 진다).
//   ② 칩은 이름과 **값만** 적는다(시각 없음 — 종목명이 잘리면 정작 누구인지 안 읽힌다).
//   ③ 내 항목과 테마 멤버가 **한 목록**에 서되, 칩 모양(채운 점 / 빈 링)으로 갈린다.
//   ④ 칩마다 지시선이 한 벌 — 칩이 제 높이를 안 지키므로 대응은 그 선이 진다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { CODE, DATE, TIME, dailyBundle, dailyPin, fullBundle, minutePin, seedPins, stockNames, themeSnapshot } from "./overlayFixture.js";
import { useWorkbench } from "../../../store/workbench.js";

const gutterOf = (c: HTMLElement): HTMLElement => c.querySelector('[data-layer="gutter"]') as HTMLElement;
const chipsOf = (c: HTMLElement): HTMLButtonElement[] => [...gutterOf(c).querySelectorAll("button")];

const renderDaily = (): HTMLElement => {
    seedPins("daily", [dailyPin]);
    return renderWithProviders(<NormOverlayPanel grain="daily" />, {
        charts: [{ code: CODE, date: DATE, data: dailyBundle }], stockNames,
    }).container;
};

/** 테마까지 켠 분봉 — 내 항목 하나 + 테마 멤버 하나가 한 거터에 선다. */
const renderThemed = (): HTMLElement => {
    seedPins("minute", [minutePin]);
    localStorage.setItem("wb.normTheme.minute", JSON.stringify(true));
    useWorkbench.getState().goToPoint({ code: CODE, date: DATE, time: TIME }, "test");
    return renderWithProviders(<NormOverlayPanel grain="minute" />, {
        charts: [{ code: CODE, date: DATE, data: fullBundle }], points: [{ stockCode: CODE, date: DATE, time: TIME }], stockNames,
        daySnapshot: { date: DATE, data: themeSnapshot },
    }).container;
};

beforeEach(() => {
    localStorage.clear();
    useWorkbench.setState({ focus: { date: DATE, code: "", time: null } });
});
afterEach(() => {
    localStorage.clear();
    useWorkbench.setState({ focus: { date: DATE, code: "", time: null } });
});

describe("거터는 분봉 전용", () => {
    it("일봉엔 거터가 없다 — 적을 값이 없어 그 폭이 그림으로 돌아갔다", () => {
        const c = renderDaily();
        expect(c.querySelector('[data-layer="gutter"]')).toBeNull();
        expect(c.querySelector('[data-layer="gutter-leaders"]')).toBeNull();
        // 정체는 바닥 원점 스택이 진다 — 이름이 화면에서 사라진 게 아니다.
        expect(c.querySelector('[data-layer="origin-stack"]')?.textContent).toContain("삼성전자");
    });

    it("그림판 안엔 이름 칩이 없다 — 글자가 궤적을 덮지 않는다", () => {
        const c = renderThemed();
        const plot = c.querySelector("[data-plot]")!;
        const named = [...plot.querySelectorAll("button")].filter((b) => (b.textContent ?? "").includes("삼성전자"));
        // 이름이 붙은 버튼은 거터와 원점 스택 안에만 있다(그림 위에 떠 있는 칩은 없다).
        for (const b of named) {
            const inNameLayer = b.closest('[data-layer="gutter"]') ?? b.closest('[data-layer="origin-stack"]');
            expect(inNameLayer, `그림 위에 이름 칩이 떠 있다: ${b.textContent}`).not.toBeNull();
        }
        expect(named.length).toBeGreaterThan(0);
    });

    it("칩은 이름과 **값만** 적는다 — 시각은 빠졌다(정체는 원점 스택과 툴팁이 진다)", () => {
        const chip = chipsOf(renderThemed()).find((b) => (b.textContent ?? "").includes("삼성전자"))!;
        expect(chip.textContent).toMatch(/^삼성전자[+-]\d/);
        expect(chip.textContent).not.toContain("09:30");
        expect(chip.title).toContain("09:30"); // 툴팁엔 남는다
    });

    it("칩마다 지시선이 한 벌 — 칩이 제 높이를 안 지키니 대응은 그 선이 진다", () => {
        const c = renderThemed();
        const leaders = c.querySelectorAll('[data-layer="gutter-leaders"] line');
        expect(leaders).toHaveLength(chipsOf(c).length);
    });
});

describe("내 항목과 테마가 한 목록에 선다", () => {
    it("둘 다 거터에 있고, 칩 모양으로 갈린다 — 채운 점(항목) / 빈 링(테마)", () => {
        const c = renderThemed();
        const chips = chipsOf(c);
        const mine = chips.find((b) => (b.title ?? "").includes("클릭=고정"));
        const member = chips.find((b) => (b.textContent ?? "").includes("SK하이닉스"));
        expect(mine, "내 항목 칩이 없다").toBeDefined();
        expect(member, "테마 칩이 없다").toBeDefined();

        // 내 항목의 점은 배경이 차 있고, 테마의 점은 테두리만(배경 없음).
        const dotOf = (b: HTMLButtonElement): HTMLElement => b.querySelector("span") as HTMLElement;
        expect(dotOf(mine!).style.background).not.toBe("transparent");
        expect(dotOf(member!).style.background).toBe("transparent");
        expect(dotOf(member!).style.borderStyle).toBe("solid");
    });

    it("테마 칩은 한 단 들여쓴다 — 주인공과 배경이 자리로도 갈린다", () => {
        const member = chipsOf(renderThemed()).find((b) => (b.textContent ?? "").includes("SK하이닉스"))!;
        expect(member.style.left).toBe("10px");
    });
});
