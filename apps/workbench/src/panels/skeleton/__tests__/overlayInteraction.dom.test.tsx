// 골격 겹쳐 그리기의 **손짓** — 겪은 버그가 있는데 회귀 테스트가 없던 자리들.
//
// 여기 셋은 전부 "주석은 사람이 지키고 테스트는 기계가 지킨다"의 대상이다:
//   · 일봉 캔들 켜기 — 옛날엔 푸터에서 `pointTarget!` 을 단언해 **패널이 흰 화면**이 됐다(일봉엔 null).
//   · 뱃지 목록에서 행 클릭 — 목록이 닫히면 그 행은 언마운트라 mouseleave 가 영영 안 온다.
//   · `t` 단축키 — 전역이 아니라 **포인터가 이 패널 안일 때만** 듣는다는 규약이 세 겹이다.
//
// ⚠ React 의 onMouseEnter/Leave 는 native enter/leave 를 안 듣는다 → fireEvent 는 mouseOver/mouseOut.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, act } from "@testing-library/react";
import type { ChartBundle, DailyCandle } from "@trade-data-manager/wire";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { drawnOps, kindIn } from "./drawProbe.js";
import { useWorkbench } from "../../../store/workbench.js";
import { CLUSTER_CODES, DATE, clusterFeed, clusterPoints, points, skeletonFeed } from "./overlayFixture.js";

const CODE = "005930";

const labelChips = (c: HTMLElement): HTMLButtonElement[] =>
    [...c.querySelectorAll("button")].filter((b) => (b.title ?? "").includes("우클릭=그룹"));
const badgeOf = (c: HTMLElement): HTMLButtonElement | undefined =>
    [...c.querySelectorAll("button")].find((b) => (b.title ?? "").includes("개 뭉침"));
/** 짚은 라벨은 굵어진다 — 호버가 풀렸는지 화면에서 직접 읽는 유일한 표식. */
const pinnedCount = (c: HTMLElement): number => labelChips(c).filter((b) => b.style.fontWeight === "700").length;

// focus 도 리셋한다 — 선택(subject)이 activePoint 없으면 focus 의 (종목,날짜)로 폴백하므로,
// 앞 테스트가 goToPoint 로 옮긴 focus 가 남으면 다음 테스트에 유령 선택이 생긴다.
const resetStore = (): void => {
    useWorkbench.setState({ activePoint: null, skeletonSelection: new Set(), focus: { date: DATE, code: "", time: null } });
};
beforeEach(resetStore);
afterEach(() => { resetStore(); localStorage.clear(); });

// ── 일봉 캔들 ────────────────────────────────────────────────────────────────
/** 일봉 봉 하나 — 값은 자리만 채운다(환산의 뜻은 candles 테스트의 몫). */
const bar = (close: number): DailyCandle["krx"] =>
    ({ open: String(close), high: String(close + 100), low: String(close - 100), close: String(close), volume: "1000", amount: "100000000" });
const dailyAt = (date: string, close: number): DailyCandle => ({ stockCode: CODE, date, krx: bar(close), un: bar(close) });
/** 골격 피벗(t=0,6)이 배열 인덱스라 최소 7봉 — baseT=6 이 마지막 봉을 가리켜야 한다. */
const bundle: ChartBundle = {
    stockCode: CODE,
    daily: Array.from({ length: 7 }, (_, i) => dailyAt(`2026-07-0${i + 2}`, 10_000 + i * 300)),
    minutes: [],
    basePrice: { krx: 10_000, un: 10_000 },
};

describe("일봉 캔들 — 켜도 패널이 안 죽는다", () => {
    // ⚠ 겪은 버그: 푸터의 이름 줄이 `pointTarget!` 을 단언했는데 일봉 패널엔 그게 null 이라
    //   캔들을 켜는 **순간** 터져 패널이 통째로 흰 화면이 됐다. 단언은 그 자리에서 깨진다.
    const render = (): HTMLElement =>
        renderWithProviders(<SkeletonOverlayPanel grain="daily" />, {
            skeletons: { daily: [clusterFeed.daily[0]], minute: [], levels: [] },
            points: [clusterPoints[0]],
            charts: [{ code: CODE, date: DATE, data: bundle }],
        }).container;

    it("선택된 라벨을 **다시 누르면** 캔들이 켜진다 — 고르는 손짓이 곧 켜는 손짓", () => {
        const c = render();
        fireEvent.click(labelChips(c)[0]);                 // 첫 클릭 = 선택·이동
        expect(labelChips(c)[0].title).toContain("캔들 켜기"); // 이제 재클릭이 토글이라고 말한다
        fireEvent.click(labelChips(c)[0]);                 // 재클릭 = 캔들
        expect(labelChips(c)[0].title).toContain("캔들 끄기");
    });

    it("켜면 캔들 층에 봉이 실제로 그려진다 — 안 그려지면 아래 '안 죽는다'가 헛돈다", () => {
        const c = render();
        fireEvent.click(labelChips(c)[0]);
        fireEvent.click(labelChips(c)[0]);
        // 캔들은 캔버스로 옮겨 가 DOM 에 없다 — 캔버스가 그린 표시목록에서 봉(몸통)을 센다.
        expect(kindIn(drawnOps(c, "candles"), "rect").length).toBeGreaterThan(0);
    });

    it("푸터가 켠 종목 이름을 말한다 — 옛 흰 화면이 정확히 이 줄에서 났다", () => {
        const c = render();
        fireEvent.click(labelChips(c)[0]);
        fireEvent.click(labelChips(c)[0]);
        expect(c.textContent).toContain("삼성전자");
        expect(labelChips(c).length).toBeGreaterThan(0); // 화면이 살아 있다(흰 화면이 아니다)
    });

    it("다시 누르면 꺼지고 봉이 사라진다", () => {
        const c = render();
        fireEvent.click(labelChips(c)[0]);
        fireEvent.click(labelChips(c)[0]);
        fireEvent.click(labelChips(c)[0]);
        expect(drawnOps(c, "candles")).toHaveLength(0);
    });
});

// ── 뱃지 목록 ────────────────────────────────────────────────────────────────
describe("뱃지 목록 — 행을 누르면 호버가 남지 않는다", () => {
    // ⚠ 겪은 버그와 같은 부류(라벨 노드 부수기)지만 처방이 반대다: 거기선 노드를 **안 부수는** 게
    //   답이었고, 여기선 목록을 닫는 게 목적이라 **손으로 풀어 주는** 게 답이다.
    const render = (): HTMLElement =>
        renderWithProviders(<SkeletonOverlayPanel grain="daily" />, { skeletons: clusterFeed, points: clusterPoints }).container;

    /** 열린 목록 — 제목 줄로 찾는다(라벨 층에도 같은 종목명이 서므로 반드시 목록 안에서 골라야 한다). */
    const popover = (): HTMLElement =>
        [...document.body.querySelectorAll("div")].find((d) => d.textContent?.startsWith("3개 골격"))!;
    /** 목록의 행 버튼(MenuItem) — 호버 손잡이는 그 부모 div 다. */
    const rowOf = (name: string): HTMLButtonElement =>
        [...popover().querySelectorAll("button")].find((b) => b.textContent?.includes(name))!;

    it("행에 손을 올리면 그 골격이 짚힌다 — 목록↔그림을 잇는 손짓", () => {
        const c = render();
        fireEvent.click(badgeOf(c)!);
        expect(pinnedCount(c)).toBe(0);
        fireEvent.mouseOver(rowOf("카카오").parentElement!, { relatedTarget: document.body });
        expect(pinnedCount(c)).toBe(1);
    });

    it("**행을 누르면 목록이 닫히고 호버도 풀린다** — 언마운트된 행은 leave 를 안 쏜다", () => {
        const c = render();
        fireEvent.click(badgeOf(c)!);
        const row = rowOf("카카오");
        fireEvent.mouseOver(row.parentElement!, { relatedTarget: document.body });
        fireEvent.click(row);

        expect(document.body.textContent).not.toContain("3개 골격");        // 목록이 닫혔다
        expect(useWorkbench.getState().activePoint?.code).toBe(CLUSTER_CODES[2]); // 그 타점으로 갔다

        // ⚠ 호버가 남았는지는 **다른 것을 선택했을 때** 드러난다. 누른 직후엔 그 선이 선택으로도 굵어서
        //   호버가 남아 있어도 굵은 라벨 수가 같다 — 선택을 옮겨야 옛 호버가 홀로 남아 모습을 드러낸다.
        act(() => { useWorkbench.setState({ skeletonSelection: new Set([`${CLUSTER_CODES[0]}|${DATE}`]) }); });
        expect(pinnedCount(c)).toBe(1); // 남아 있으면 2(선택 하나 + 안 풀린 호버 하나)
    });
});

// ── t 단축키 ─────────────────────────────────────────────────────────────────
describe("t 단축키 — 포인터가 이 패널 안일 때만", () => {
    // 전역 커맨드 레지스트리에 안 올린 이유가 그대로 규약이다: 한 글자 키라 다른 패널(검색 입력 등)과
    // 충돌하고, "지금 보고 있는 이 패널의 토글"이라는 뜻이 전역에선 성립하지 않는다.
    const KEY = "wb.skeletonOverlayTheme.minute";
    const render = (): HTMLElement =>
        renderWithProviders(<SkeletonOverlayPanel grain="minute" />, { skeletons: skeletonFeed, points }).container;
    /** 그림 영역(wrapRef) — 이 안에 포인터가 있을 때만 듣는다. */
    const plot = (c: HTMLElement): HTMLElement => c.querySelector<HTMLElement>("[data-plot]")!;

    it("손이 안 올라가 있으면 안 듣는다 — 다른 패널에서 t 를 쳐도 조용하다", () => {
        const c = render();
        fireEvent.keyDown(window, { key: "t" });
        expect(localStorage.getItem(KEY)).toBe("false");
        expect(c).toBeTruthy();
    });

    it("손이 올라가면 테마가 켜진다", () => {
        const c = render();
        fireEvent.mouseOver(plot(c), { relatedTarget: document.body });
        fireEvent.keyDown(window, { key: "t" });
        expect(localStorage.getItem(KEY)).toBe("true");
    });

    it("입력 요소에 포커스가 있으면 **글자 입력이 이긴다**", () => {
        const c = render();
        fireEvent.mouseOver(plot(c), { relatedTarget: document.body });
        const input = document.createElement("input");
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: "t" });
        expect(localStorage.getItem(KEY)).toBe("false"); // 안 켜졌다
        input.remove();
    });

    it("수식키가 붙으면 안 듣는다 — Ctrl+T 는 브라우저 것이다", () => {
        const c = render();
        fireEvent.mouseOver(plot(c), { relatedTarget: document.body });
        fireEvent.keyDown(window, { key: "t", ctrlKey: true });
        expect(localStorage.getItem(KEY)).toBe("false");
    });

    it("손을 치우면 다시 안 듣는다 — 리스너가 걷힌다", () => {
        const c = render();
        fireEvent.mouseOver(plot(c), { relatedTarget: document.body });
        fireEvent.keyDown(window, { key: "t" });
        expect(localStorage.getItem(KEY)).toBe("true");

        fireEvent.mouseOut(plot(c), { relatedTarget: document.body });
        fireEvent.keyDown(window, { key: "t" });
        expect(localStorage.getItem(KEY)).toBe("true"); // 안 꺼졌다 = 안 들었다
    });

    it("일봉 패널은 아예 안 듣는다 — 테마는 분봉 화면의 개념", () => {
        const { container } = renderWithProviders(<SkeletonOverlayPanel grain="daily" />, { skeletons: clusterFeed, points: clusterPoints });
        fireEvent.mouseOver(container.querySelector<HTMLElement>("[data-plot]")!, { relatedTarget: document.body });
        fireEvent.keyDown(window, { key: "t" });
        expect(localStorage.getItem("wb.skeletonOverlayTheme.daily")).toBe("false");
    });
});
