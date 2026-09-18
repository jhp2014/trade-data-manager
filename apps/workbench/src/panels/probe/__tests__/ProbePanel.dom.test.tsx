// 탐색 후보 패널 — 조건 칸 목록이 **실제로 모수를 바꾸는가**(칸 = 로직 모델의 화면 증거).
// 판정 규칙 자체는 core 테스트(cellset/engine·equivalence)가 지킨다 — 여긴 배선만 본다.
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { DayReplay, MinuteDerived } from "@trade-data-manager/wire";
import { kstToUnix, SEED_IDS } from "@trade-data-manager/market/domain";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { selectRowNavOwner, useRowNavHotkeys } from "../../../lib/rowNav.js";
import { useKeymapDynamic } from "../../../keymap/dynamic.js";
import { useWorkbench } from "../../../store/workbench.js";
import { ProbePanel } from "../ProbePanel.js";

const DATE = "2026-09-16";
const PANEL = "probe-1";
const t0 = kstToUnix(DATE, "09:00:00");

const md = (code: string, rate: number[], cum: number[]): MinuteDerived => ({
    code,
    times: rate.map((_, i) => t0 + i * 60),
    rate,
    cumAmount: cum,
    high: rate,
    low: rate,
    open: 0,
    minuteOpen: rate,
    minuteHigh: rate,
    minuteLow: rate,
    trailingHighs: { krx: [], un: [] },
    basePrice: { krx: null, un: null },
});

/** 두 종목 — 등락률이 09:01 에 6%, 09:03 에 8% 로 오른다(누적대금은 처음부터 임계 위). */
const snapshot: DayReplay = {
    date: DATE,
    stocks: [
        { ...md("000100", [1, 6, 6, 8, 8], [200e8, 210e8, 220e8, 230e8, 240e8]), name: "유한양행", market: "거래소", marketCap: null, themes: [] },
        { ...md("247540", [0, 0, 0, 0, 0], [500e8, 510e8, 520e8, 530e8, 540e8]), name: "에코프로비엠", market: "코스닥", marketCap: null, themes: [] },
    ],
};

const seed = { daySnapshot: { date: DATE, data: snapshot } };

const render = (): ReturnType<typeof renderWithProviders> => renderWithProviders(<ProbePanel panelId={PANEL} />, seed);

/** w/s 는 **키맵 커맨드**가 실제 경로다(App 이 useRowNavHotkeys 를 1회 등록) — 그 경로를 그대로 태운다. */
function Harness(): JSX.Element {
    useRowNavHotkeys();
    return <ProbePanel panelId={PANEL} />;
}
const renderWithHotkeys = (): ReturnType<typeof renderWithProviders> => renderWithProviders(<Harness />, seed);
const press = (key: "w" | "s"): void => {
    const cmd = Object.values(useKeymapDynamic.getState().commands).find((c) => c.keys === key);
    act(() => cmd?.run?.(new KeyboardEvent("keydown")));
};
const setConds = (conds: unknown[]): void => useWorkbench.setState({ panelUi: { [PANEL]: { cellConditions: conds } } });

/** 칸 토글들 — 시드 순서(격자·급등대금·전고돌파·존순위). 이름 텍스트는 행 태그 칩과 겹쳐서 title 로 집는다. */
const condToggles = (): HTMLElement[] => screen.getAllByTitle(/이 칸을 껐다 켜기/);
const SURGE = 1;

beforeEach(() => {
    useWorkbench.setState({ focus: { ...useWorkbench.getState().focus, date: DATE, code: "", time: null }, panelUi: {} });
    useKeymapDynamic.setState({ commands: {} });
    act(() => selectRowNavOwner("point-probe"));
});

describe("ProbePanel — 조건 칸이 곧 로직", () => {
    it("시드 4칸이 서고 급등대금 칸이 하루 1회 발화한다(칸별 걸린 수 표시)", () => {
        render();
        expect(condToggles().map((b) => b.textContent)).toEqual(["격자", "급등대금", "전고돌파", "존순위"]);
        // 09:01 에 rate 6 ≥ 5 · 누적 210억 ≥ 100억 → 하루 처음 1건
        expect(screen.getByText("09:01")).toBeTruthy();
        // 머리글은 **셀 수**를 말한다(칸별 발화 수의 합이 아니다 — 단위가 섞이면 행 수와 어긋난다).
        expect(screen.getByText(/조건 1건/)).toBeTruthy();
    });

    it("칸을 끄면 그 칸의 행이 사라진다 — 지우지 않고 빼보는 손짓", () => {
        render();
        fireEvent.click(condToggles()[SURGE]);
        expect(screen.queryByText("09:01")).toBeNull();
        expect(screen.getByText(/걸린 셀 없음/)).toBeTruthy(); // 칸은 남아 있다 — "조건 없음"이 아니다
    });

    it("노브 편집이 모수를 바꾼다 — 등락 임계를 올리면 발화가 뒤로 밀린다", () => {
        render();
        const input = screen.getByDisplayValue("5"); // 등락≥ 5%
        fireEvent.change(input, { target: { value: "7" } });
        fireEvent.blur(input);
        expect(screen.queryByText("09:01")).toBeNull();
        expect(screen.getByText("09:03")).toBeTruthy(); // rate 8 ≥ 7 인 첫 분
    });

    it("칸을 지우면 사라지고, 시드 복원이 4칸을 되살린다(시드는 빌트인이 아니다)", () => {
        const { client } = render();
        expect(client).toBeTruthy();
        const removes = screen.getAllByTitle(/이 칸을 지운다/);
        expect(removes).toHaveLength(4);
        fireEvent.click(removes[SURGE]);
        expect(condToggles().map((b) => b.textContent)).toEqual(["격자", "전고돌파", "존순위"]);

        fireEvent.click(screen.getByText("시드 복원"));
        expect(condToggles().map((b) => b.textContent)).toEqual(["격자", "급등대금", "전고돌파", "존순위"]);
    });

    it("하한 일괄은 **모든 칸**에 항을 넣는다(저장은 칸마다)", () => {
        render();
        const floor = screen.getByDisplayValue("0");
        fireEvent.change(floor, { target: { value: "300" } });
        fireEvent.blur(floor);
        // 유한양행은 240억까지라 하한 300억을 못 넘는다 → 급등대금 발화 소멸
        expect(screen.queryByText("09:01")).toBeNull();
        const saved = useWorkbench.getState().panelUi[PANEL]?.cellConditions as { id: string; predicates: unknown[] }[];
        expect(saved).toHaveLength(4);
        for (const c of saved) {
            expect(c.predicates, c.id).toContainEqual({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: 300 } }] });
        }
    });

    it("편집은 panelUi 에 남는다 — 새로고침(재마운트) 뒤에도 그대로", () => {
        const first = render();
        fireEvent.click(condToggles()[0]); // 격자 끔
        first.unmount();
        render();
        const saved = useWorkbench.getState().panelUi[PANEL]?.cellConditions as { id: string; enabled: boolean }[];
        expect(saved.find((c) => c.id === SEED_IDS.grid)?.enabled).toBe(false);
    });

    it("좌클릭은 시선 이동이다", () => {
        render();
        fireEvent.click(screen.getByText("09:01").closest("div")!);
        const f = useWorkbench.getState().focus;
        expect(f.code).toBe("000100");
        expect(f.time).toBe("09:01:00");
    });

    it("w/s 순회는 **화면 목록 그대로**를 밟는다 — 커서가 전진하고 끝에서 안 넘어간다", () => {
        // 조건을 넓혀 한 종목에 여러 행이 서게 한다(등락 ≥ 0 · 전이 없음 → 유한양행 09:00~09:04).
        setConds([{ id: "wide", name: "전부", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 1 } }] }] }]);
        renderWithHotkeys();

        press("s");
        expect(useWorkbench.getState().focus.time).toBe("09:00:00");
        press("s");
        expect(useWorkbench.getState().focus.time).toBe("09:01:00");
        press("w");
        expect(useWorkbench.getState().focus.time).toBe("09:00:00");
        press("w"); // 첫 행에서 더 위로 — 목록 밖으로 안 나간다
        expect(useWorkbench.getState().focus.time).toBe("09:00:00");
    });

    it("조건이 너무 넓으면 목록 대신 그 사실을 말하고 **순회도 멈춘다**(없는 행으로 시선이 안 샌다)", () => {
        // 그물(50,000셀)을 실제로 넘긴다 — 120종목 × 500분 = 60,000셀.
        const wide: DayReplay = {
            date: DATE,
            stocks: Array.from({ length: 120 }, (_, si) => {
                const rate = new Array(500).fill(9);
                const cum = new Array(500).fill(100e8);
                return { ...md(`W${String(si).padStart(4, "0")}`, rate, cum), name: `종목${si}`, market: "코스닥", marketCap: null, themes: [] };
            }),
        };
        setConds([{ id: "wide", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 0 } }] }] }]);
        renderWithProviders(<Harness />, { daySnapshot: { date: DATE, data: wide } });

        expect(screen.getByText(/너무 넓습니다/)).toBeTruthy();
        const before = useWorkbench.getState().focus.time;
        press("s");
        expect(useWorkbench.getState().focus.time, "tooWide 면 순회가 no-op 이어야 한다").toBe(before);
    });

    it("옛 노브 저장물이 있으면 그 값으로 시드가 선다 — 조정값이 조용히 안 사라진다", () => {
        useWorkbench.setState({ panelUi: { [PANEL]: { surgeRatePct: 7 } } });
        render();
        expect(screen.getByDisplayValue("7")).toBeTruthy();
        expect(screen.queryByText("09:01")).toBeNull();
        expect(screen.getByText("09:03")).toBeTruthy();
    });
});

describe("ProbePanel — 화면이 모름을 말한다", () => {
    it("칸이 하나도 없으면 목록이 아니라 '조건 없음'을 말한다(조건 없음 = 전부가 아니다)", () => {
        useWorkbench.setState({ panelUi: { [PANEL]: { cellConditions: [] } } });
        render();
        expect(screen.getByText(/조건 없음/)).toBeTruthy();
        expect(screen.queryByText("09:01")).toBeNull();
    });

    it("행에는 시각·종목명·칸 이름·값이 함께 선다", () => {
        render();
        const row = screen.getByText("09:01").closest("div")!;
        expect(within(row).getByText("유한양행")).toBeTruthy();
        expect(within(row).getByText("급등대금")).toBeTruthy();
        expect(within(row).getByText("6.0%")).toBeTruthy();
    });
});
