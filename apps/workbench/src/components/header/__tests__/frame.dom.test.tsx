// PanelFrame 의 **높이 규약**을 기계가 지킨다:
//   · 라인의 존재 = 배치 설정(그 자리에 배치된 조각이 있는가) — 값이 비어도(null) 라인은 산다.
//   · 일시 알림(transient)은 라인을 못 만든다 — 본문 위 오버레이 칩으로만 선다.
//   · 등록 없는 패널은 본문뿐인 틀 — 라인이 하나도 없다(이관 전 패널의 화면 불변).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PanelFrame } from "../PanelFrame.js";
import { usePanelHeader } from "../registry.js";
import { useHeaderLedger } from "../ledger.js";
import type { HeaderDecl, InfoSpec } from "../spec.js";

afterEach(() => {
    cleanup();
    localStorage.clear();
    useHeaderLedger.setState({ layout: {}, keys: {} });
});

function TestPanel({ decl }: { decl: HeaderDecl }): JSX.Element {
    usePanelHeader("test-1", decl);
    return <div data-body>본문</div>;
}

const draw = (decl: HeaderDecl): HTMLElement =>
    render(
        <PanelFrame panelId="test-1">
            <TestPanel decl={decl} />
        </PanelFrame>,
    ).container;

const info = (over: Partial<InfoSpec> & { id: string }): InfoSpec => ({ name: over.id, text: () => "값", ...over });

const lines = (c: HTMLElement): NodeListOf<HTMLElement> => c.querySelectorAll("[data-header-line]");

describe("라인 존재 = 배치 설정", () => {
    it("등록 없는 패널(선언 빈 것)은 본문뿐 — 라인 0", () => {
        const c = draw({ info: [], controls: [] });
        expect(lines(c).length).toBe(0);
        expect(c.textContent).toContain("본문");
    });

    it("첫줄·바닥에 배치된 조각이 있으면 그 라인이 선다", () => {
        const c = draw({
            info: [info({ id: "count", text: () => "후보 14" }), info({ id: "deep", defaultPlace: "bottom", text: () => "바닥 값" })],
            controls: [],
        });
        expect(lines(c).length).toBe(2);
        expect(c.textContent).toContain("후보 14");
        expect(c.textContent).toContain("바닥 값");
    });

    it("**값이 비어도(null) 라인은 산다** — 자리만 비운다(본문 높이 출렁임 방지)", () => {
        const c = draw({ info: [info({ id: "count", text: () => null })], controls: [] });
        expect(lines(c).length).toBe(1);
    });

    it("hidden 배치 조각만 있으면 라인이 없다 — 정보 판에서는 계속 읽힌다", () => {
        const c = draw({ info: [info({ id: "count", defaultPlace: "hidden" })], controls: [] });
        expect(lines(c).length).toBe(0);
    });

    it("장부 예외가 자리를 옮긴다 — 첫줄 기본을 바닥으로", () => {
        const spec = info({ id: "count", text: () => "후보 14" });
        useHeaderLedger.getState().setInfoPlace("test", spec, "bottom");
        const c = draw({ info: [spec], controls: [] });
        const ls = lines(c);
        expect(ls.length).toBe(1);
        expect(ls[0]!.dataset.headerLine).toBe("bottom");
    });

    it("항해형(nav) 컨트롤만 첫 줄에 선다 — 나머지는 라인을 못 만든다", () => {
        const c = draw({
            info: [],
            controls: [
                { kind: "toggle", id: "plain", name: "정렬", on: false, set: () => {} },
                { kind: "toggle", id: "cross", name: "날짜 고정", nav: true, on: false, set: () => {} },
            ],
        });
        expect(lines(c).length).toBe(1);
        expect(c.textContent).toContain("날짜 고정");
        expect(c.textContent).not.toContain("정렬");
    });
});

describe("일시 알림 — 라인이 아니라 오버레이 칩", () => {
    it("값이 있는 동안만 칩으로 선다 · 라인 수는 안 변한다", () => {
        const quiet = draw({ info: [info({ id: "note", transient: true, text: () => null })], controls: [] });
        expect(lines(quiet).length).toBe(0);
        expect(quiet.textContent).not.toContain("날짜 넘기는 중");
        cleanup();
        const loud = draw({ info: [info({ id: "note", transient: true, text: () => "날짜 넘기는 중…" })], controls: [] });
        expect(lines(loud).length).toBe(0); // 알림은 라인을 못 만든다
        expect(loud.textContent).toContain("날짜 넘기는 중…");
    });

    it("transient 는 장부가 첫줄로 보내도 라인에 안 선다", () => {
        const spec = info({ id: "note", transient: true, text: () => "알림" });
        useHeaderLedger.getState().setInfoPlace("test", spec, "line");
        const c = draw({ info: [spec], controls: [] });
        expect(lines(c).length).toBe(0);
    });
});
