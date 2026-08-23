// 테마가 **켜진 상태**의 골격 겹쳐 그리기 — 층 순서 테스트가 못 보던 자리.
//
// layerOrder 는 테마가 꺼진 화면만 본다. 껍데기 `<g>` 는 재료가 없어도 나오므로 그쪽 순서 검사는
// 테마 층이 실제로 무엇을 그리는지에 대해 아무 말도 하지 않는다 — 테마 층을 파일로 떼어내기 전에
// 그 상태를 덮어 두려고 세운다.
//
// 이 화면이 나오려면 다섯 가지가 동시에 맞아야 한다(overlayFixture.themeSnapshot 주석) — 하나라도
// 어긋나면 선이 0개인데 순서 검사는 통과한다. 그래서 여기서는 **선이 몇 개인지**부터 단언한다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { drawnNames, drawnOps, kindIn } from "./drawProbe.js";
import { PAINT_ORDER } from "../../canvas/drawList.js";
import { useWorkbench } from "../../../store/workbench.js";
import { CODE, DATE, MEMBER, TIME, TIME_MIN, minuteBundle, snapshotMinutes, stockNames, themeSnapshot, unixAtMinute } from "./overlayFixture.js";

/**
 * 테마 토글은 영속 상태라 **렌더 전에 저장소에 심는다** — 마운트 시점에 읽기 때문이다.
 * 키에 grain 이 붙는 건 일봉·분봉이 별도 패널이라서다(useOverlayToggles 참고).
 */
const armTheme = (): void => localStorage.setItem("wb.normTheme.minute", "true");

/**
 * 테마는 **짚은 선 하나**에만 펼친다. 로컬 선택이 비면 활성 타점이 그 하나가 되므로(effSelected 폴백)
 * 스토어에 타점을 앉히는 것으로 "짚은 상태"를 만든다 — 화면에서 라벨을 클릭한 것과 같은 경로다.
 */
const focusPoint = (): void => useWorkbench.getState().goToPoint({ code: CODE, date: DATE, time: TIME }, "test");

const renderThemed = (snapshot = themeSnapshot): HTMLElement =>
    renderWithProviders(<NormOverlayPanel grain="minute" />, {
        charts: [{ code: CODE, date: DATE, data: minuteBundle }],
        stockNames,
        daySnapshot: { date: DATE, data: snapshot },
    }).container;

beforeEach(() => {
    armTheme();
    focusPoint();
});

// 스토어는 모듈 싱글톤이라 다음 파일로 샌다 — 활성 타점이 남으면 다른 테스트의 "짚은 게 없는 화면"이
// 조용히 "짚은 화면"이 된다(effSelected 폴백). 저장소도 같이 비운다.
afterEach(() => {
    useWorkbench.setState({ activePoint: null });
    localStorage.clear();
});

describe("픽스처 자신 — 시각이 의도한 분에 놓였나", () => {
    // unixAtMinute 은 손으로 뒤집은 식이다. 여기가 틀리면 스냅샷이 통째로 엉뚱한 시각에 앉고
    // 테마·거래대금이 조용히 빈다 — 그 상태로도 층 순서는 통과하므로 픽스처를 먼저 못박는다.
    it("unixAtMinute 이 minuteOfDayOf 의 역함수다", () => {
        for (const m of [0, 540, TIME_MIN, 1439]) expect(minuteOfDayOf(unixAtMinute(m))).toBe(m);
    });

    it("스냅샷 두 종목이 타점 앞뒤 창에 놓여 있다", () => {
        for (const s of themeSnapshot.stocks) {
            const mins = snapshotMinutes(s);
            expect(mins[0]).toBe(TIME_MIN - 10);
            expect(mins[mins.length - 1]).toBe(TIME_MIN + 10);
        }
    });
});

describe("테마 켜짐 — 그려지는가", () => {
    it("테마 선이 실제로 그려진다(멤버 1개) — 0개면 아래 순서 검사가 헛돈다", () => {
        const c = renderThemed();
        // 테마 선은 캔버스로 옮겨 가 DOM 에 없다 — 캔버스가 그린 표시목록에서 센다.
        expect(kindIn(drawnOps(c, "theme-lines"), "polyline").length).toBeGreaterThan(0);
    });

    it("테마 선마다 투명 히트라인이 한 벌 — 선 위에서 손짓을 받는 유일한 수단이다", () => {
        const c = renderThemed();
        const hit = c.querySelector('[data-layer="theme-hit"]');
        expect(hit?.querySelectorAll("polyline").length ?? 0).toBeGreaterThan(0);
    });

    it("거터에 멤버 이름이 선다 — 테마를 켜면 왼쪽 여백이 이름 자리로 넓어진다", () => {
        const c = renderThemed();
        expect(c.textContent).toContain("SK하이닉스");
    });

    it("헤더가 펼쳐진 선 수를 말한다 — 켰는데 0이면 '없음'이라고 적어야 한다", () => {
        const c = renderThemed();
        expect(c.textContent).toContain("테마");
        expect(c.textContent).not.toContain("선 하나 선택"); // 짚은 게 있으므로 이 안내는 안 뜬다
    });
});

describe("테마 켜짐 — 층 순서", () => {
    const layersOf = (c: HTMLElement): string[] =>
        [...c.querySelectorAll("[data-layer]")].map((el) => el.getAttribute("data-layer")!);

    it("테마 선 → 정규화 선 순(캔버스 안) — 배경이 먼저, 주인공이 그 위", () => {
        const drawn = drawnNames(renderThemed());
        expect(drawn.indexOf("theme-lines")).toBeLessThan(drawn.indexOf("lines"));
    });

    it("손짓은 그림 **뒤** — 캔버스가 문서 순서에서 히트 층보다 앞에 온다", () => {
        const c = renderThemed();
        const canvas = c.querySelector("canvas")!;
        const hit = c.querySelector('[data-layer="theme-hit"]')!;
        // DOCUMENT_POSITION_FOLLOWING = 히트 층이 캔버스 **뒤**에 있다(= 위에 그려진다).
        expect(canvas.compareDocumentPosition(hit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // 손짓끼리의 우선순위는 그대로 — 테마 히트는 선 히트보다 아래여야 한다.
        const layers = layersOf(c);
        expect(layers.indexOf("theme-hit")).toBeLessThan(layers.indexOf("line-hit"));
    });

    it("캔들은 테마보다도 아래 — 참고용 배경의 배경", () => {
        const drawn = drawnNames(renderThemed());
        expect(drawn.indexOf("candles")).toBeLessThan(drawn.indexOf("theme-lines"));
    });

    // ⚠ 지시선은 눈금 숫자 칸을 **가로지른다** — 나중에 그리면 점선이 숫자 위에 얹혀 둘 다 못 읽는다.
    // 클립 밖이라는 것과는 별개의 규약이고, 테마를 켜야만 존재하므로 여기서만 잴 수 있다.
    it("지시선이 눈금보다 먼저 — 숫자가 점선 위에 얹혀야 읽힌다", () => {
        const layers = layersOf(renderThemed());
        expect(layers.indexOf("theme-leaders")).toBeLessThan(layers.indexOf("axis-ticks"));
    });

    it("거터 이름은 맨 위 — 그림 상자 밖 HTML 층이라 무엇에도 안 가린다", () => {
        const layers = layersOf(renderThemed());
        expect(layers.indexOf("theme-gutter")).toBe(layers.length - 1);
    });

    it("테마가 켜져도 그림 층의 목록과 순서는 그대로 — 켜고 끄는 것이 순서를 안 바꾼다", () => {
        // 켜면 지시선(맨 앞)·거터(맨 뒤)가 **더해질 뿐** 사이의 그림 층은 그대로다.
        const c = renderThemed();
        // DOM 에 남은 건 눈금·손짓·값뿐 — 그림 세 층은 캔버스로 갔다.
        expect(layersOf(c)).toEqual([
            "theme-leaders", "axis-ticks",
            "theme-hit", "line-hit", "amount-labels", "levels",
            "theme-gutter",
        ]);
        // 캔버스 쪽 순서도 켜고 끄는 것과 무관하게 그대로.
        expect(drawnNames(c)).toEqual([...PAINT_ORDER]);
    });
});

describe("테마 켜짐 — 멤버 선정 규칙", () => {
    it("앵커 자신은 테마 선에 안 든다 — 자기와의 동조는 잴 게 없다", () => {
        const c = renderThemed();
        const gutter = c.textContent ?? "";
        // 거터 이름 목록에 멤버는 있고, 앵커(삼성전자)는 선 라벨 쪽에만 있다.
        expect(gutter).toContain("SK하이닉스");
        const themeHit = c.querySelector('[data-layer="theme-hit"]');
        expect(themeHit?.querySelectorAll("polyline").length).toBe(1); // 멤버 하나뿐
    });

    it("테마가 안 겹치면 선이 없다 — 같이 움직였다는 주장의 근거가 멤버십이다", () => {
        const noOverlap = {
            ...themeSnapshot,
            stocks: [
                themeSnapshot.stocks[0],
                { ...themeSnapshot.stocks[1], themes: ["2차전지"] }, // 앵커는 반도체
            ],
        };
        const container = renderThemed(noOverlap);
        expect(drawnOps(container, "theme-lines")).toHaveLength(0);
        expect(container.textContent).not.toContain("SK하이닉스");
    });

    it("멤버 코드가 스냅샷에 없으면 조용히 빠진다 — 지어내지 않는다", () => {
        const onlyAnchor = { ...themeSnapshot, stocks: [themeSnapshot.stocks[0]] };
        const container = renderThemed(onlyAnchor);
        expect(drawnOps(container, "theme-lines")).toHaveLength(0);
        expect(container.textContent).not.toContain(MEMBER);
    });
});
