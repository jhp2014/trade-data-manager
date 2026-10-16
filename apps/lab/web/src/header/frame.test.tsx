// PanelFrame 의 높이 규약 + 판 버튼 — 라인의 존재는 배치 설정이고, 일시 알림은 라인이 아니라 오버레이 칩이다.
// 컨트롤은 기본 판 안이고, 판의 핀으로 꺼내면 줄에 선다(줄 모양 선언 renderLine 이 있으면 그것이).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PanelFrame } from "./PanelFrame.js";
import { HeaderButtons } from "./HeaderButtons.js";
import { usePanelHeader } from "./registry.js";
import { useHeaderLedger } from "./ledger.js";
import type { ControlSpec, HeaderDecl, InfoSpec } from "./spec.js";

afterEach(() => {
    cleanup();
    localStorage.clear();
    useHeaderLedger.setState({ layout: {} });
});

function TestPanel({ id, decl }: { id: string; decl: HeaderDecl }): JSX.Element {
    usePanelHeader(id, decl);
    return <div>본문</div>;
}

const draw = (decl: HeaderDecl, ids: string[] = ["test-1"]): HTMLElement =>
    render(
        <>
            {ids.map((id) => (
                <div key={id} data-testid={id}>
                    <HeaderButtons panelId={id} />
                    <PanelFrame panelId={id}>
                        <TestPanel id={id} decl={decl} />
                    </PanelFrame>
                </div>
            ))}
        </>,
    ).container;

const info = (over: Partial<InfoSpec> & { id: string }): InfoSpec => ({ name: over.id, text: () => "값", ...over });
const lines = (c: ParentNode): HTMLElement[] => [...c.querySelectorAll<HTMLElement>("[data-header-line]")];

describe("라인 존재 = 배치 설정", () => {
    it("선언이 빈 패널은 본문뿐 — 라인 0, 판 버튼은 흐려진다(사라지지 않는다)", () => {
        const c = draw({ info: [], controls: [] });
        expect(lines(c)).toHaveLength(0);
        expect((screen.getByTitle(/^컨트롤/) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByTitle(/^정보/) as HTMLButtonElement).disabled).toBe(true);
    });

    it("줄·바닥에 배치된 정보가 있으면 그 라인이 선다", () => {
        const c = draw({ info: [info({ id: "count", text: () => "14종목" }), info({ id: "deep", defaultPlace: "bottom", text: () => "바닥 값" })], controls: [] });
        expect(lines(c).map((l) => l.dataset.headerLine)).toEqual(["line", "bottom"]);
        expect(c.textContent).toContain("14종목");
    });

    it("값이 비어도(null) 라인은 산다 — 자리만 비운다(본문 높이 출렁임 방지)", () => {
        const c = draw({ info: [info({ id: "count", text: () => null })], controls: [] });
        expect(lines(c)).toHaveLength(1);
    });

    it("헤더 줄은 줄바꿈 없이 24px — 좁아지면 가로 스크롤", () => {
        const c = draw({ info: [info({ id: "a" })], controls: [] });
        const l = lines(c)[0]!;
        expect(l.style.height).toBe("24px");
        expect(l.style.flexWrap).toBe("nowrap");
        expect(l.style.overflowX).toBe("auto");
    });
});

describe("컨트롤 — 기본 판 안, 핀으로 꺼낸다", () => {
    const set = vi.fn();
    const controls: ControlSpec[] = [
        { kind: "choice", id: "view", name: "보기", values: [{ v: "a", label: "가" }, { v: "b", label: "나" }], value: "a", set },
        { kind: "action", id: "fill", name: "채우기", run: () => {}, renderLine: () => <b data-testid="custom">줄 모양</b> },
    ];

    it("컨트롤만 있는 패널은 꺼내기 전엔 라인이 없다", () => {
        const c = draw({ info: [], controls });
        expect(lines(c)).toHaveLength(0);
    });

    it("판을 열어 핀을 누르면 헤더 줄에 서고, 같은 종류의 다른 패널에도 선다", () => {
        draw({ info: [], controls }, ["kind-1", "kind-2"]);
        fireEvent.click(within(screen.getByTestId("kind-1")).getByTitle(/^컨트롤/));
        fireEvent.click(document.querySelector<HTMLElement>('[data-board-row="view"] [aria-label="헤더 줄로 꺼내기"]')!);
        for (const id of ["kind-1", "kind-2"]) {
            const l = screen.getByTestId(id).querySelector<HTMLElement>('[data-header-line="line"]')!;
            expect(within(l).getByTitle(/클릭 = 나/).textContent).toContain("가");
        }
        expect(useHeaderLedger.getState().layout).toEqual({ kind: { controls: { view: "line" } } });
    });

    it("줄 모양 선언(renderLine)이 있으면 꺼냈을 때 그것이 선다 — 판 안은 kind 판 위젯 그대로", () => {
        draw({ info: [], controls });
        fireEvent.click(screen.getByTitle(/^컨트롤/));
        expect(screen.getByRole("button", { name: "채우기" })).toBeTruthy(); // 판: 테두리 버튼
        fireEvent.click(document.querySelector<HTMLElement>('[data-board-row="fill"] [aria-label="헤더 줄로 꺼내기"]')!);
        const l = document.querySelector<HTMLElement>('[data-header-line="line"]')!;
        expect(within(l).getByTestId("custom").textContent).toBe("줄 모양");
    });

    it("기본이 줄인 컨트롤(검색칸 류)은 처음부터 줄에 선다", () => {
        const c = draw({ info: [], controls: [{ kind: "search", id: "q", name: "검색어", defaultPlace: "line", value: "", submit: () => {}, placeholder: "찾기" }] });
        expect(within(lines(c)[0]!).getByPlaceholderText("찾기")).toBeTruthy();
    });
});

describe("정보 판 — 자리 고르기", () => {
    it("숨긴 정보도 판에서는 읽히고, 탭으로 보낼 수 있다", () => {
        const c = draw({ info: [info({ id: "count", text: () => "14종목", defaultPlace: "hidden" })], controls: [] });
        expect(lines(c)).toHaveLength(0);
        fireEvent.click(screen.getByTitle(/^정보/));
        const row = document.querySelector<HTMLElement>('[data-info-row="count"]')!;
        expect(row.textContent).toContain("14종목");
        fireEvent.click(within(row).getByRole("button", { name: "줄" }));
        expect(lines(c)).toHaveLength(1);
        expect(useHeaderLedger.getState().layout).toEqual({ test: { info: { count: "line" } } });
    });
});

describe("일시 알림 — 라인이 아니라 오버레이 칩", () => {
    it("값이 있는 동안만 칩으로 선다 · 라인 수는 안 변한다", () => {
        const quiet = draw({ info: [info({ id: "note", transient: true, text: () => null })], controls: [] });
        expect(lines(quiet)).toHaveLength(0);
        expect(quiet.querySelector("[data-transient]")).toBeNull();
        cleanup();
        const loud = draw({ info: [info({ id: "note", transient: true, text: () => "불러오는 중…" })], controls: [] });
        expect(lines(loud)).toHaveLength(0);
        expect(loud.querySelector("[data-transient]")?.textContent).toBe("불러오는 중…");
    });

    it("transient 는 장부가 줄로 보내도 라인에 안 선다", () => {
        const spec = info({ id: "note", transient: true, text: () => "알림" });
        useHeaderLedger.getState().setInfoPlace("test", spec, "line");
        const c = draw({ info: [spec], controls: [] });
        expect(lines(c)).toHaveLength(0);
    });
});
