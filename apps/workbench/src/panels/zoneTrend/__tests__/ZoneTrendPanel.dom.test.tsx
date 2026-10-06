// 존 추세 판 스모크 — 등록·존 ▾ 복사 왕복(panelUi, 인스턴스 낟알)·캔버스 표시목록 관측(__drawList).
// 기하는 실측 몫 — jsdom 엔 2d 컨텍스트가 없어도 CanvasLayers 가 data-layers·__drawList 를 남긴다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { kstToUnix } from "../../../lib/derive.js";
import { PanelFrame } from "../../../components/header/PanelFrame.js";
import { ControlBoard } from "../../../components/header/ControlBoard.js";
import { ZoneTrendPanel } from "../ZoneTrendPanel.js";
import { ZoneTrendView } from "../ZoneTrendView.js";
import type { DrawLayer } from "../../canvas/drawList.js";
import type { ReplayStock } from "../../../api/dayReplay.js";

const DATE = "2026-08-14";
const PANEL = "zone-trend-1";

const stock = (code: string, bars: [string, number, number][], themes: string[] = ["T"]): ReplayStock => ({
    code, name: code, market: "KRX", marketCap: null, themes,
    times: bars.map(([t]) => kstToUnix(DATE, t)),
    rate: bars.map(([, r]) => r),
    high: bars.map(([, r]) => r),
    low: bars.map(([, r]) => r),
    open: 0,
    cumAmount: bars.map(([, , a]) => a),
    minuteOpen: bars.map(([, r]) => r),
    minuteHigh: bars.map(([, r]) => r),
    minuteLow: bars.map(([, r]) => r),
    trailingHighs: { krx: [], un: [] },
    basePrice: { krx: null, un: null },
});

const SEED: Seed = {
    daySnapshot: {
        date: DATE,
        data: {
            date: DATE,
            stocks: [
                stock("A", [["09:00:00", 1, 100], ["09:10:00", 5, 300]]),
                stock("B", [["09:00:00", 2, 50], ["09:10:00", 3, 900]]),
            ],
        },
    },
};

const renderPanel = (): ReturnType<typeof render> =>
    render(
        <>
            <PanelFrame panelId={PANEL}><ZoneTrendPanel panelId={PANEL} /></PanelFrame>
            <ControlBoard panelId={PANEL} />
        </>,
        { wrapper: ({ children }: { children: ReactNode }) => <Providers client={seededClient(SEED)}>{children}</Providers> },
    );

const drawListOf = (container: HTMLElement): readonly DrawLayer[] =>
    (container.querySelector("canvas") as HTMLCanvasElement & { __drawList?: readonly DrawLayer[] }).__drawList ?? [];

const RESET = { savedSets: [], sessionUi: {}, panelUi: {} };
beforeEach(() => { useWorkbench.setState(RESET); });
afterEach(() => { useWorkbench.setState(RESET); localStorage.clear(); });

// (카탈로그 등록 자체는 dock.slots.test 가 PANEL_TYPES 파생으로 커버한다 — 여기서 panelCatalog 를
//  import 하면 테스트 진입 순서에서 dock ↔ catalog 순환(TDZ)이 터진다. components/header 규약과 같은 함정.)

describe("본문 — 시선·존에 따른 상태", () => {
    it("시선 없음 = 안내 · 시선만 = 존 안내 줄 + 시선 선 · 존 복사 = 멤버 선", () => {
        const { container } = renderPanel();
        expect(container.textContent).toContain("종목을 짚으면");

        act(() => useWorkbench.getState().setFocus({ date: DATE, code: "A", time: null }));
        expect(container.textContent).toContain("존이 없다");
        let layers = drawListOf(container);
        expect(layers.map((l) => l.name)).toEqual(["trend-grid", "trend-members", "trend-lift", "trend-subject", "trend-now"]);
        expect(layers.find((l) => l.name === "trend-members")!.groups).toHaveLength(0); // 존 없음 = 멤버 0
        expect(layers.find((l) => l.name === "trend-subject")!.groups).toHaveLength(1); // 시선 선

        // 존을 판 값으로 심으면(복사의 결과물) 테마 동료 선이 선다 — B 한 줄(시선 A 는 subject 층, 테마 "T" 공유).
        act(() => useWorkbench.getState().setPanelUi(PANEL, "zone", { window: null, zoneAmountN: 9, rate: { mode: "rank", max: 9 }, from: "시드", key: "k" }));
        layers = drawListOf(container);
        expect(layers.find((l) => l.name === "trend-members")!.groups).toHaveLength(1);
        expect(container.textContent).toContain("멤버 2"); // 시선 겸직 포함
        expect(container.textContent).not.toContain("존이 없다");
    });
});

describe("존 ▾ — 시장 단면과 같은 복사 목록(ZoneMenu 공용)", () => {
    it("기본값으로 → panelUi zone 저장(인스턴스 낟알) · 끄기 → null. 축 키는 안 만든다(단면과 달리 zone 만 복사)", () => {
        act(() => useWorkbench.getState().setFocus({ date: DATE, code: "A", time: null }));
        const { container } = renderPanel();
        const trigger = [...container.querySelectorAll("button"), ...document.body.querySelectorAll("button")]
            .find((b) => (b.title ?? "").startsWith("걸린 테마 조건에서 존 값을 복사해 이 판의 모수"))!;
        act(() => { fireEvent.click(trigger); });
        const item = (text: string): HTMLElement =>
            [...document.body.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text))!;
        act(() => { fireEvent.click(item("기본값으로")); });
        const ui = useWorkbench.getState().panelUi[PANEL]!;
        expect(ui["zone"]).toMatchObject({ from: "기본값" });
        expect(ui["axes"]).toBeUndefined(); // 단면의 축 맞춤은 이 판 몫이 아니다
        act(() => { fireEvent.click(trigger); });
        act(() => { fireEvent.click(item("끄기")); });
        expect(useWorkbench.getState().panelUi[PANEL]!["zone"]).toBeNull();
    });
});

describe("ZoneTrendView — hover 칩은 현재 분 너머를 말하지 않는다(렌더 시점 클램프)", () => {
    it("크로스헤어가 미래 분(스크럽 역행 등)이어도 chipTextOf 의 분은 minute 에 잘린다", () => {
        const calls: [string, number][] = [];
        const model = {
            members: [],
            subject: { code: "S", name: "S", pts: [{ x: 540, y: 5 }, { x: 550, y: 5 }], amountAt: () => null },
            memberCount: 0,
        };
        function Harness(): JSX.Element {
            const [hovered, setHovered] = useState<string | null>(null);
            // 크로스헤어를 미래(560)에 **고정** — 포인터를 둔 채 minute 이 뒤로 간 상태의 재현
            // (이동 시점 클램프만 있으면 다음 pointermove 전까지 칩이 미래를 말한다).
            return (
                <div style={{ width: 1000, height: 600 }}>
                    <ZoneTrendView model={model} minuteRange={{ lo: 540, hi: 600 }} minute={550}
                        yView={{ lo: 0, hi: 15 }} onYView={() => undefined}
                        hovered={hovered} onHover={setHovered} crosshair={560} onCrosshair={() => undefined}
                        onPick={() => undefined}
                        chipTextOf={(code, m) => { calls.push([code, m]); return "chip"; }} />
                </div>
            );
        }
        const { container } = render(<Harness />);
        const svg = container.querySelector("svg")!;
        // box: left/top 6, width 988, height 588 (setup 의 1000×600 고정). x 창 = [540, 550+10].
        // y(5%)=6+(10/15)*588=398 · x(550)=6+(10/20)*988=500 — 선 머리 위를 짚어 hover 를 세운다.
        act(() => { fireEvent.pointerMove(svg, { clientX: 500, clientY: 398 }); });
        expect(calls.length).toBeGreaterThan(0);
        for (const [code, m] of calls) {
            expect(code).toBe("S");
            expect(m).toBeLessThanOrEqual(550);
        }
    });
});

describe("ZoneTrendView — 세로 끌기 = y 팬(클릭 이동이 터지지 않는다)", () => {
    it("슬롭을 넘겨 끌고 손을 떼면 onYView 는 불리고 onPick 은 안 불린다", () => {
        const picks: string[] = [];
        const yViews: { lo: number; hi: number }[] = [];
        const model = {
            members: [],
            subject: { code: "S", name: "S", pts: [{ x: 540, y: 5 }, { x: 550, y: 5 }], amountAt: () => null },
            memberCount: 0,
        };
        function Harness(): JSX.Element {
            const [hovered, setHovered] = useState<string | null>(null);
            const [crosshair, setCrosshair] = useState<number | null>(null);
            return (
                <div style={{ width: 1000, height: 600 }}>
                    <ZoneTrendView model={model} minuteRange={{ lo: 540, hi: 600 }} minute={550}
                        yView={{ lo: 0, hi: 15 }} onYView={(v) => { if (v) yViews.push(v); }}
                        hovered={hovered} onHover={setHovered} crosshair={crosshair} onCrosshair={setCrosshair}
                        onPick={(c) => picks.push(c)}
                        chipTextOf={() => "chip"} />
                </div>
            );
        }
        const { container } = render(<Harness />);
        const svg = container.querySelector("svg")!;
        // 선 머리(500, 398) 위에서 눌러 세로로 40px 끌고 놓는다 — 팬이지 클릭이 아니다.
        act(() => { fireEvent.pointerDown(svg, { clientX: 500, clientY: 398, button: 0 }); });
        act(() => { fireEvent.pointerMove(svg, { clientX: 500, clientY: 438 }); });
        act(() => { fireEvent.pointerUp(svg, { clientX: 500, clientY: 438 }); });
        expect(yViews.length).toBeGreaterThan(0);
        expect(picks).toEqual([]);
        // 같은 자리 누르고 그대로 떼면 클릭(시선 이동 후보)이다.
        act(() => { fireEvent.pointerDown(svg, { clientX: 500, clientY: 398, button: 0 }); });
        act(() => { fireEvent.pointerUp(svg, { clientX: 500, clientY: 398 }); });
        expect(picks).toEqual(["S"]);
    });
});

describe("y 자동 맞춤 — 수동값(ydom)은 (종목,날짜) 낟알", () => {
    const gridLabels = (container: HTMLElement): string[] =>
        drawListOf(container).find((l) => l.name === "trend-grid")!.groups[0].ops
            .filter((o) => o.op === "text" && o.text.endsWith("%"))
            .map((o) => (o.op === "text" ? o.text : ""));

    it("수동 y 창은 그 종목에서만 쓰이고, 종목이 바뀌면 자동 맞춤으로 돌아간다", () => {
        act(() => useWorkbench.getState().setFocus({ date: DATE, code: "A", time: null }));
        const { container } = renderPanel();
        // A 의 수동 창 [0, 50] — 10 스텝 눈금에 40% 가 선다.
        act(() => useWorkbench.getState().setSessionUi(PANEL, "ydom", { code: "A", date: DATE, lo: 0, hi: 50 }));
        expect(gridLabels(container)).toContain("40%");
        // 종목 B 로 — ydom 태그가 A 라 자동 맞춤(B 최고 3 → [−3, 6])으로 복귀.
        act(() => useWorkbench.getState().setFocus({ date: DATE, code: "B", time: null }));
        const labels = gridLabels(container);
        expect(labels).not.toContain("40%");
        expect(labels).toContain("0%");
        // A 로 돌아오면 수동값 **부활**(리셋 아님 — 단면 서수 zoom 날짜 낟알과 같은 의미론).
        act(() => useWorkbench.getState().setFocus({ date: DATE, code: "A", time: null }));
        expect(gridLabels(container)).toContain("40%");
    });
});

describe("축약 임계 — panelUi zigzagPct", () => {
    it("컨트롤 판 세그먼트에서 3% 선택 → 저장", () => {
        act(() => useWorkbench.getState().setFocus({ date: DATE, code: "A", time: null }));
        renderPanel();
        const btn = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "3%")!;
        act(() => { fireEvent.click(btn); });
        expect(useWorkbench.getState().panelUi[PANEL]?.["zigzagPct"]).toBe(3);
    });
});
