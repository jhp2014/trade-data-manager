// 작업 대상 — **하루·셀 우주**의 배선(2026-09-18 단계 ③, 옛 "탐색 후보" 패널을 흡수한 자리).
//
// 판정 규칙 자체는 core(cellset/engine·equivalence)가, 행 모델은 workset/rows 테스트가 지킨다.
// 여기서 잠그는 건 그 둘을 잇는 **두 불변식**뿐이다 — 옛 ProbePanel.dom 이 지키던 것과 같은 것:
//  ① 순회와 렌더가 **같은 목록** — 화면에 선 행 수 = 머리글 카운터 = w/s 가 밟는 순서.
//  ② 목록이 안 선 상태(조건이 너무 넓음·로딩)에서는 **순회가 멈춘다** — 없는 행으로 시선이 안 샌다.
import { describe, it, expect, beforeEach } from "vitest";
import { exprOfStages } from "../filter/expr.js";
import { act, render, screen } from "@testing-library/react";
import type { DayReplay, MinuteDerived } from "@trade-data-manager/wire";
import { kstToUnix } from "@trade-data-manager/market/domain";
import { Providers, seededClient, type Seed } from "../../test/renderPanel.js";
import { selectRowNavOwner, useRowNavHotkeys } from "../../lib/rowNav.js";
import { useKeymapDynamic } from "../../keymap/dynamic.js";
import { useWorkbench } from "../../store/workbench.js";
import { WorksetPanel } from "../WorksetPanel.js";
import type { FilterStage } from "../filter/stage.js";

const DATE = "2026-09-16";
const PANEL = "workset-1";
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

/** 두 종목 — 유한양행만 등락이 오른다(에코프로비엠은 0 이라 `등락 ≥ 1` 조건에 안 걸린다). */
const snapshot: DayReplay = {
    date: DATE,
    stocks: [
        { ...md("000100", [1, 6, 6, 8, 8], [200e8, 210e8, 220e8, 230e8, 240e8]), name: "유한양행", market: "거래소", marketCap: null, themes: [] },
        { ...md("247540", [0, 0, 0, 0, 0], [500e8, 510e8, 520e8, 530e8, 540e8]), name: "에코프로비엠", market: "코스닥", marketCap: null, themes: [] },
    ],
};

/** 등락 ≥ N 인 셀 전부(전이 없음) — 한 종목에 여러 행이 서야 순회 검사가 뜻이 있다. */
const wideStage = (from: number): FilterStage =>
    ({ id: "wide", name: "전부", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: from } }] }] });

/** 날짜 목록은 **명시로 심는다** — 하루 우주에서만 켜지는 쿼리라 안 심으면 setup 의 네트워크 그물에 걸린다. */
const renderDaily = (stages: FilterStage[], data: DayReplay = snapshot, dates: string[] = [DATE]): void => {
    const seed: Seed = {
        daySnapshot: { date: DATE, data },
        // 이름 사전은 **명시로** — 자동 조립은 seed.points(라벨 좌표)만 읽는데 여기엔 라벨이 없다.
        stockNames: data.stocks.map((st) => ({ stockCode: st.code, name: st.name ?? st.code, market: st.market ?? "거래소" })),
    };
    const client = seededClient(seed);
    client.setQueryData(["data-dates"], dates); // 기본값은 하루뿐 = 이웃이 없다 = 프리페치도 없다
    useWorkbench.setState({ filterExpr: exprOfStages(stages) });
    render(
        <Providers client={client}>
            <Harness />
        </Providers>,
    );
};

/** w/s 는 **키맵 커맨드**가 실제 경로다(App 이 useRowNavHotkeys 를 1회 등록) — 그 경로를 그대로 태운다. */
function Harness(): JSX.Element {
    useRowNavHotkeys();
    return <WorksetPanel panelId={PANEL} />;
}

const press = (key: "w" | "s"): void => {
    const cmd = Object.values(useKeymapDynamic.getState().commands).find((c) => c.keys === key);
    act(() => cmd?.run?.(new KeyboardEvent("keydown")));
};

/** 좌표 행만 — 키가 `날짜|종목|시각`(종목 머리는 파이프가 하나). */
const cellRows = (): string[] =>
    [...document.querySelectorAll<HTMLElement>("[data-row]")]
        .map((el) => el.dataset.row ?? "")
        .filter((k) => k.split("|").length === 3);

beforeEach(() => {
    localStorage.clear(); // 패널 노브(정렬·접힘·라벨)가 테스트를 건너 새면 안 된다
    useWorkbench.setState({
        focus: { ...useWorkbench.getState().focus, date: DATE, code: "", time: null },
        panelUi: {},
        savedSets: [],
        selectedSetRef: null,
    });
    useKeymapDynamic.setState({ commands: {} });
    act(() => selectRowNavOwner("workset"));
});

describe("작업 대상 — 하루 우주", () => {
    it("순회와 렌더가 같은 목록이다 — 행 수 = 머리글 카운터, w/s 가 그 순서를 밟는다", () => {
        renderDaily([wideStage(1)]);

        // 유한양행 5분 전부(등락 1·6·6·8·8 ≥ 1) · 에코프로비엠은 0 이라 없다.
        expect(cellRows()).toHaveLength(5);
        expect(screen.getByText(/조건 5/)).toBeTruthy();
        expect(screen.getByText("유한양행")).toBeTruthy();
        expect(screen.queryByText("에코프로비엠")).toBeNull();

        press("s");
        expect(useWorkbench.getState().focus.time).toBe("09:00:00");
        press("s");
        expect(useWorkbench.getState().focus.time).toBe("09:01:00");
        press("w");
        expect(useWorkbench.getState().focus.time).toBe("09:00:00");
    });

    it("접으면 자식 행이 사라지고 **순회에서도 빠진다** — 접힘이 곧 순회 제외다", () => {
        renderDaily([wideStage(1)]);
        act(() => { useWorkbench.getState().setPanelUi(PANEL, "dayCollapsed", ["000100"]); });

        expect(cellRows()).toHaveLength(0);
        // 빈 목록에서도 **날짜 넘기기는 시도한다**(막다른 길 금지 — 자동 스킵이 멈춘 빈 날에서
        // 키보드만으로 못 빠져나가면 안 된다). 여기선 거래일이 하루뿐이라 그 사실을 말하고 멈춘다.
        press("s");
        expect(screen.getByText("마지막 거래일입니다")).toBeTruthy();
        expect(useWorkbench.getState().focus.time).toBeNull();
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
        // 거래일을 **둘** 심는다 — 하나뿐이면 "넘길 곳이 없어서" 멈춘 것과 구분이 안 된다.
        renderDaily([wideStage(0)], wide, [DATE, "2026-09-17"]);

        expect(screen.getByText(/너무 넓습니다/)).toBeTruthy();
        expect(cellRows()).toHaveLength(0);
        const before = useWorkbench.getState().focus.time;
        press("s");
        expect(useWorkbench.getState().focus.time, "tooWide 면 순회가 no-op 이어야 한다").toBe(before);
        // **날짜도 안 넘어간다** — 0건의 이유가 "빈 날"이 아니라 "조건이 너무 넓어 층을 뺐다"이기 때문이다.
        expect(useWorkbench.getState().focus.date, "tooWide 의 0건은 빈 날이 아니다").toBe(DATE);
    });

    // ⚠ 2026-09-19 9단계(우주 파생) 이후 **"하루 우주 + 조건 0개"는 존재하지 않는다** — 우주가
    //   조건에서 나오므로 조건이 없으면 미정(= 종단)이다. 그래서 이 검사가 재는 것은 "하루 재료를
    //   안 당긴다" 하나로 좁혀졌고, 그게 원래 이 검사의 눈이었다(네트워크 그물).
    it("조건이 없으면 하루 재료를 **당기지 않는다** — 우주가 미정이라 셀 목록 자체가 안 선다", () => {
        // 재료를 안 심고 그린다: 당기면 setup 의 네트워크 그물이 이 테스트를 실패시킨다(그게 이 검사의 눈이다).
        const client = seededClient({});
        client.setQueryData(["data-dates"], [DATE]);
        useWorkbench.setState({ filterExpr: exprOfStages([]) });
        render(
            <Providers client={client}>
                <Harness />
            </Providers>,
        );
        expect(cellRows()).toHaveLength(0);
        // 하루 층이 아예 안 섰다는 증거 — 대신 종단 쪽 손잡이(달 시선)가 서 있다.
        expect(screen.queryByText(/너무 넓습니다/)).toBeNull();
        expect(screen.getByTitle(/모든 달/)).toBeTruthy();
    });
});
