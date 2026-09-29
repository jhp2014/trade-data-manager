// 일별 타점 [탐색] — 종목 머리줄(이름 + 테마) · 우클릭 그룹 배정 · 라벨 조건.
// 여기서 잠그는 불변식 —
//  ① 순회와 렌더가 **같은 목록**(`shownRows` 한 배열) — 종목순 w/s 는 화면 순서 그대로 종목 경계를 넘는다(접기는 2026-09-28 은퇴).
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

describe("탐색판 — w/s 커서 = 책갈피(밖에서 온 시선 이동은 커서를 안 옮긴다)", () => {
    const focus = (): { code: string; time: string | null } => useWorkbench.getState().focus;
    /** 차트 쪽 손(시간선·a/d·◇ 클릭)을 흉내 — 이 판이 아닌 출처의 시선 이동. */
    const lookAround = (code: string, time: string): void => act(() => { useWorkbench.getState().goToPoint({ date: DATE, code, time }, "chart"); });

    it("주변을 둘러보다(목록 밖 분) s = 보던 타점의 다음으로 이어진다 — 처음부터가 아니다", () => {
        renderExplore();
        press("s"); press("s"); // 유한양행 09:01
        lookAround("000100", "09:05:00");
        press("s");
        expect(focus()).toMatchObject({ code: "000100", time: "09:02:00" });
    });

    it("둘러보다 목록의 다른 행에 닿아도 흐름이 안 바뀐다 · w = 보던 타점의 이전", () => {
        renderExplore();
        press("s"); press("s"); // 유한양행 09:01
        lookAround("247540", "09:00:00"); // 목록에 있는 에코프로비엠 첫 분
        press("s");
        expect(focus(), "에코프로비엠 다음이 아니라 유한양행 09:01 다음").toMatchObject({ code: "000100", time: "09:02:00" });
        lookAround("247540", "09:01:00");
        press("w");
        expect(focus()).toMatchObject({ code: "000100", time: "09:01:00" });
    });

    it("둘러보는 동안 책갈피 행은 선만 남고(칠 없음), 돌아오면 다시 칠한다", () => {
        const { container } = renderExplore();
        press("s"); press("s");
        const bg = (): string[] => bodyRows(container).map((tr) => tr.style.background);
        expect(bg()[1]).toBe("var(--accent-soft)");
        lookAround("000100", "09:05:00");
        expect(bg().every((b) => b === "var(--bg-primary)"), "시선이 떠나면 칠은 없다").toBe(true);
        press("w"); press("s");
        expect(bg()[1]).toBe("var(--accent-soft)");
    });

    it("작업표시줄로 날짜를 바꾸면 책갈피는 비워진다 — 돌아와도 되살아나지 않고 focus 에서 다시 들어간다", () => {
        const OTHER = "2026-09-15";
        const { client } = renderExplore();
        client.setQueryData(["day-replay-lru", OTHER], { date: OTHER, stocks: [] } satisfies DayReplay);
        press("s"); press("s"); press("s"); // 유한양행 09:02
        act(() => { useWorkbench.getState().setDate(OTHER); });
        act(() => { useWorkbench.getState().setDate(DATE); });
        press("s");
        expect(focus(), "옛 책갈피(09:02) 다음이 아니라 처음").toMatchObject({ code: "000100", time: "09:00:00" });
    });

    it("이 판의 행 클릭은 책갈피를 옮긴다", () => {
        const { container } = renderExplore();
        press("s");
        act(() => { fireEvent.click(bodyRows(container)[3]!); }); // 에코프로비엠 09:00
        press("s");
        expect(focus()).toMatchObject({ code: "247540", time: "09:01:00" });
    });
});

describe("탐색판 — 종목 머리줄", () => {
    it("이름 + 테마 앞 3개 + 나머지 +N · 접기 손은 없다", () => {
        const { container } = renderExplore([wide], {
            themeMembers: ["바이오", "제약", "비만치료제", "mRNA", "원격의료"].map((theme) => ({ theme, code: "000100" })),
        });
        const head = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((tr) => (tr.textContent ?? "").startsWith("유한양행"))!;
        expect(head.textContent).toBe("유한양행바이오제약비만치료제+2");
        expect(head.querySelector("span[title]")?.getAttribute("title")).toBe("바이오 · 제약 · 비만치료제 · mRNA · 원격의료");
        expect([...container.querySelectorAll("button")].some((b) => b.textContent === "▾" || b.textContent === "▸"), "종목 접기 없음").toBe(false);
    });

    it("테마가 없는 종목은 이름만", () => {
        const { container } = renderExplore();
        const head = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((tr) => (tr.textContent ?? "").startsWith("에코프로비엠"))!;
        expect(head.textContent).toBe("에코프로비엠");
    });

    it("종목순 w/s 는 화면 순서대로 종목 경계를 넘는다", () => {
        const { container } = renderExplore();
        expect(bodyRows(container)).toHaveLength(5);
        for (let k = 0; k < 4; k++) press("s");
        expect(useWorkbench.getState().focus, "유한양행 3분 뒤 에코프로비엠 첫 분").toMatchObject({ code: "247540", time: "09:00:00" });
    });

    it("종목순 → 시간순 전환 — 트리 들여쓰기가 걷히고 시간 칸 왼쪽 여백이 남는다(같은 td 재사용 회귀)", () => {
        const { container } = renderExplore();
        const timeCell = (): HTMLTableCellElement => bodyRows(container)[0]!.cells[0]!;
        expect(timeCell().style.paddingLeft).toBe("26px");
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "sortMode", "time"); });
        expect(timeCell().style.paddingLeft, "시간순 = 기본 여백").toBe("8px");
        expect(container.querySelector("thead")?.textContent).toContain("시간");
        expect(container.querySelector("thead")?.textContent).toContain("종목");
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
