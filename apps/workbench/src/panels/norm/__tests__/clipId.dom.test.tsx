// clipPath id — **패널 인스턴스마다 달라야 한다**.
//
// 일봉·분봉 패널이 한 문서에 같이 떠 있는데 id 가 문자열 상수면 `url(#…)` 이 **문서의 첫** clipPath 로
// 풀린다(SVG 참조는 패널이 아니라 문서 전역이다) — 나중에 마운트된 패널의 손짓 층(테마 히트·피벗
// 손잡이·기준선·축)이 다른 패널의 상자 사각형으로 잘리던 실측 버그. 두 패널을 같이 세워 기계로 지킨다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { CODE, DATE, dailyPin, fullBundle, minutePin, seedPins, stockNames } from "./overlayFixture.js";

const resetStore = (): void => {
    useWorkbench.setState({ activePoint: null, focus: { date: DATE, code: "", time: null } });
};
beforeEach(resetStore);
afterEach(() => { resetStore(); localStorage.clear(); });

describe("clipPath id — 두 패널이 한 문서에 서도 안 겹친다", () => {
    it("일봉·분봉의 id 가 갈리고, 각 패널의 clip 그룹은 전부 **자기** clipPath 를 가리킨다", () => {
        seedPins("daily", [dailyPin]);
        seedPins("minute", [minutePin]);
        const { container } = renderWithProviders(
            <>
                <NormOverlayPanel grain="daily" />
                <NormOverlayPanel grain="minute" />
            </>,
            { charts: [{ code: CODE, date: DATE, data: fullBundle }], stockNames },
        );
        const panels = [...container.querySelectorAll<HTMLElement>("[data-plot]")];
        expect(panels).toHaveLength(2);

        // ⚠ getElementsByTagName — SVG 태그는 대소문자를 지키므로 셀렉터 엔진의 소문자화에 안 기댄다.
        const ids = panels.map((p) => p.getElementsByTagName("clipPath")[0]?.id ?? "");
        expect(ids[0]).toBeTruthy(); // 그림이 실제로 섰다 — 빈 화면을 상대로 통과하지 않게
        expect(ids[1]).toBeTruthy();
        expect(ids[0]).not.toBe(ids[1]); // 여기가 본론 — 상수 id 면 둘이 같아 참조가 한쪽으로 쏠린다

        panels.forEach((p, i) => {
            const refs = [...p.querySelectorAll("[clip-path]")].map((el) => el.getAttribute("clip-path"));
            expect(refs.length).toBeGreaterThan(0); // 축 층 + 손짓 층 — 자리가 있어야 참조를 잴 수 있다
            for (const r of refs) expect(r).toBe(`url(#${ids[i]})`);
        });
    });
});
