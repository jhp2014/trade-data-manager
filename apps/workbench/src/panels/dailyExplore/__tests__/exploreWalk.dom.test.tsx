// 일별 타점 [탐색] — 옛 작업 대상에서 이식한 손(2026-09-27 작업 대상 은퇴): 종목 접기 · 우클릭 그룹 배정.
// 여기서 잠그는 불변식은 옛 worksetDaily 가 지키던 것 그대로다 —
//  ① 순회와 렌더가 **같은 목록** — 접힌 종목은 화면에서도 w/s 에서도 빠진다.
//  ② 배정 입구 둘 — 종목 머리줄 우클릭 = 하루(차트), 행 우클릭 = 타점(좌표).
import { describe, it, expect, beforeEach } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { DayReplay, MinuteDerived } from "@trade-data-manager/wire";
import { kstToUnix } from "@trade-data-manager/market/domain";
import { exprOfStages } from "../../filter/expr.js";
import type { FilterStage } from "../../filter/stage.js";
import { Providers, seedEditing, seededClient, type Seed } from "../../../test/renderPanel.js";
import { selectRowNavOwner, useRowNavHotkeys } from "../../../lib/rowNav.js";
import { useKeymapDynamic } from "../../../keymap/dynamic.js";
import { useGroupAssign } from "../../../store/groupAssign.js";
import { useWorkbench } from "../../../store/workbench.js";
import { pointGroupMembershipsQuery } from "../../../api/queries.js";
import { DailyExplorePanel } from "../DailyExplorePanel.js";

const DATE = "2026-09-16";
const PANEL = "daily-explore-1";
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

/** 두 종목 다 등락 ≥ 1 — 유한양행 3분, 에코프로비엠 2분. */
const snapshot: DayReplay = {
    date: DATE,
    stocks: [
        { ...md("000100", [1, 6, 6], [200e8, 210e8, 220e8]), name: "유한양행", market: "거래소", marketCap: null, themes: [] },
        { ...md("247540", [2, 3], [500e8, 510e8]), name: "에코프로비엠", market: "코스닥", marketCap: null, themes: [] },
    ],
};

const wide: FilterStage = { id: "wide", enabled: true, predicates: [{ kind: "candle", axes: { rate: { on: true, from: 1 } } }] };

function Harness(): JSX.Element {
    useRowNavHotkeys();
    return <DailyExplorePanel panelId={PANEL} />;
}

const renderExplore = (stages: FilterStage[] = [wide], extra: Partial<Seed> = {}, negIds: string[] = []): ReturnType<typeof render> & { client: ReturnType<typeof seededClient> } => {
    const seed: Seed = {
        daySnapshot: { date: DATE, data: snapshot },
        stockNames: snapshot.stocks.map((st) => ({ stockCode: st.code, name: st.name ?? st.code, market: st.market ?? "거래소" })),
        ...extra,
    };
    const client = seededClient(seed);
    client.setQueryData(["data-dates"], [DATE]);
    const e = exprOfStages(stages);
    seedEditing({ ...e, of: e.of.map((t) => (t.kind === "cond" && negIds.includes(t.stage.id) ? { ...t, neg: true } : t)) });
    return { ...render(<Providers client={client}><Harness /></Providers>), client };
};

const press = (key: "w" | "s"): void => {
    const cmd = Object.values(useKeymapDynamic.getState().commands).find((c) => c.keys === key);
    act(() => cmd?.run?.(new KeyboardEvent("keydown")));
};

/** 본 줄(시간 칸이 있는 tr) — 머리줄은 colSpan 한 칸짜리라 뺀다. */
const bodyRows = (c: HTMLElement): HTMLTableRowElement[] =>
    [...c.querySelectorAll<HTMLTableRowElement>("tbody tr")].filter((tr) => tr.cells.length > 1);

beforeEach(() => {
    localStorage.clear();
    useWorkbench.setState({ focus: { ...useWorkbench.getState().focus, date: DATE, code: "", time: null }, panelUi: {}, savedSets: [] });
    useKeymapDynamic.setState({ commands: {} });
    useGroupAssign.getState().close();
    act(() => selectRowNavOwner("daily-explore"));
});

describe("탐색판 — 종목 접기", () => {
    it("접으면 본 줄이 사라지고 **순회에서도 빠진다** — 머리줄은 남아 후보 수를 말한다", () => {
        const { container } = renderExplore();
        expect(bodyRows(container)).toHaveLength(5);

        const fold = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "▾")!;
        act(() => { fireEvent.click(fold); }); // 첫 종목(유한양행) 접기
        expect(bodyRows(container)).toHaveLength(2);
        expect(container.textContent).toContain("후보 3");

        press("s");
        expect(useWorkbench.getState().focus.code, "접힌 종목은 안 밟는다").toBe("247540");
    });
});

describe("탐색판 — 우클릭 그룹 배정", () => {
    it("종목 머리줄 = 하루(시각 없음) · 본 줄 = 타점(그 시각)", () => {
        const { container } = renderExplore();
        const head = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").startsWith("유한양행"))!;
        act(() => { fireEvent.contextMenu(head, { clientX: 10, clientY: 20 }); });
        expect(useGroupAssign.getState().target).toEqual({ stockCode: "000100", name: "유한양행", date: DATE });

        act(() => { fireEvent.contextMenu(bodyRows(container)[1]!, { clientX: 10, clientY: 20 }); });
        expect(useGroupAssign.getState().target).toEqual({ stockCode: "000100", name: "유한양행", date: DATE, time: "09:01:00" });
    });
});

describe("탐색판 — 라벨 조건", () => {
    it("「후보 AND NOT ◆ 라벨」 — 라벨을 붙이는 순간 그 행이 목록에서 빠진다(분류 작업 큐)", async () => {
        const notLabeled: FilterStage = { id: "nl", enabled: true, predicates: [{ kind: "label", scope: "point", groups: ["돌파: 성공"] }] };
        const { container, client } = renderExplore([wide, notLabeled], {
            points: [],
            groups: [{ name: "돌파: 성공", parentName: null }],
            memberships: [],
            pointMemberships: [],
        }, ["nl"]);
        expect(bodyRows(container), "라벨 없음 = 후보 전부가 미분류").toHaveLength(5);
        // react-query v5 는 구독자 통지를 setTimeout(0) 배치로 보낸다 — waitFor 로 흘려야 렌더가 따라온다.
        act(() => {
            client.setQueryData(pointGroupMembershipsQuery().queryKey,
                [{ stockCode: "000100", date: DATE, time: "09:01:00", groupNames: ["돌파: 성공"] }]);
        });
        await waitFor(() => expect(bodyRows(container), "붙인 좌표 하나가 즉시 빠진다").toHaveLength(4));
    });
});
