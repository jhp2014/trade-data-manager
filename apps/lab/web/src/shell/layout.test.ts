// 패널 열기·최소화·삭제·화면 불러오기가 구독과 화면 설정을 어떻게 다루는가 — dockview 는 가짜 api 로 대신한다.
import { beforeEach, describe, expect, it } from "vitest";
import type { DockviewApi } from "dockview-react";
import { captureScreen, destroyPanel, loadScreen, openPanel, restorePanel } from "./layout.js";
import { useDock } from "../store/dock.js";
import { ACTIVE, usePaths } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";

type Fake = DockviewApi & { added: { id: string; position?: unknown }[]; loaded: unknown[] };

/** failOn = 이 패널이 든 배치를 fromJSON 하면 dockview 처럼 먼저 비운 뒤 던진다. */
function fakeApi(ids: string[], failOn?: string): Fake {
    let panels = ids.map((id) => ({ id }));
    const added: { id: string; position?: unknown }[] = [];
    const loaded: unknown[] = [];
    return {
        added,
        loaded,
        get panels() {
            return panels;
        },
        getPanel: (id: string) => panels.find((p) => p.id === id),
        addPanel: (o: { id: string; position?: unknown }) => {
            panels.push({ id: o.id });
            added.push(o);
        },
        toJSON: () => ({ panels: Object.fromEntries(panels.map((p) => [p.id, { id: p.id, contentComponent: p.id.split("-")[0] }])) }),
        fromJSON: (json: { panels: Record<string, unknown> }) => {
            loaded.push(json);
            panels = [];
            if (failOn && failOn in json.panels) {
                // dockview 처럼 그룹을 열다가(add 이벤트 → 셸이 대장에 올림) 중간에 던진다.
                useDock.getState().register(Object.keys(json.panels));
                throw new Error("bad layout");
            }
            panels = Object.keys(json.panels).map((id) => ({ id }));
        },
        clear: () => {
            panels = [];
        },
    } as unknown as Fake;
}

beforeEach(() => {
    localStorage.clear();
    usePaths.setState(usePaths.getInitialState(), true);
    usePanelUiStore.setState({ ui: {} });
    useDock.setState({ slots: [], openIds: null });
});

describe("openPanel", () => {
    it("비어 있는 가장 작은 번호를 쓰고, 활성을 구독한다", () => {
        const api = fakeApi(["chart-1", "chart-3"]);
        expect(openPanel(api, "chart")).toBe("chart-2");
        expect(usePaths.getState().bindings["chart-2"]).toBe(ACTIVE);
    });
    it("다시 쓰는 번호는 지난 패널의 화면 설정을 물려받지 않는다", () => {
        usePanelUiStore.getState().set("chart-2", "view", "daily"); // 닫힌 chart-2 의 흔적
        openPanel(fakeApi(["chart-1"]), "chart");
        expect(usePanelUiStore.getState().ui["chart-2"]).toBeUndefined();
    });
});

describe("최소화 · 되살리기 · 삭제", () => {
    it("새 번호는 최소화한 패널의 번호도 피한다", () => {
        useDock.getState().register(["chart-2"]); // 최소화된 chart-2
        expect(openPanel(fakeApi(["chart-1"]), "chart")).toBe("chart-3");
    });
    it("되살리면 구독·설정이 최소화 전 그대로", () => {
        useDock.getState().register(["chart-2"]);
        usePaths.getState().bind("chart-2", "B");
        usePanelUiStore.getState().set("chart-2", "view", "daily");
        const api = fakeApi(["chart-1"]);
        restorePanel(api, "chart-2");
        expect(api.added.map((a) => a.id)).toEqual(["chart-2"]);
        expect(usePaths.getState().bindings["chart-2"]).toBe("B");
        expect(usePanelUiStore.getState().ui["chart-2"]).toEqual({ view: "daily" });
    });
    it("영구 삭제는 대장·구독·설정을 지운다 — 열린 패널은 못 지운다", () => {
        useDock.getState().register(["chart-1", "chart-2"]);
        usePaths.getState().bind("chart-2", "B");
        usePanelUiStore.getState().set("chart-2", "view", "daily");
        const api = fakeApi(["chart-1"]);
        destroyPanel(api, "chart-1"); // 열려 있음 → 그대로
        destroyPanel(api, "chart-2");
        expect(useDock.getState().slots).toEqual(["chart-1"]);
        expect(usePaths.getState().bindings["chart-2"]).toBeUndefined();
        expect(usePanelUiStore.getState().ui["chart-2"]).toBeUndefined();
    });
});

describe("화면 저장 · 불러오기", () => {
    it("사진은 열린 패널마다 구독·설정을 담는다", () => {
        usePaths.getState().bind("chart-1", "A");
        usePanelUiStore.getState().set("chart-1", "view", "minute");
        const snap = captureScreen(fakeApi(["chart-1", "hts-1"]));
        expect(snap.panels).toEqual({ "chart-1": { ref: "A", ui: { view: "minute" } }, "hts-1": { ref: ACTIVE } });
    });
    it("불러오면 구독·설정을 사진대로 맞추고, 그 패널들을 대장에 올린다 — 사라진 패널은 최소화로 남는다", () => {
        const api = fakeApi(["chart-1", "chart-2"]);
        useDock.getState().register(["chart-1", "chart-2"]);
        usePaths.getState().bind("chart-1", "B");
        usePanelUiStore.getState().set("chart-1", "view", "daily");
        const ok = loadScreen(api, {
            layout: { panels: { "chart-1": { id: "chart-1", contentComponent: "chart" } } } as never,
            panels: { "chart-1": { ref: "A" } },
        });
        expect(ok).toBe(true);
        expect(usePaths.getState().bindings["chart-1"]).toBe("A");
        expect(usePanelUiStore.getState().ui["chart-1"]).toBeUndefined();
        expect(useDock.getState().openIds).toEqual(["chart-1"]);
        expect(useDock.getState().slots).toEqual(["chart-1", "chart-2"]); // chart-2 는 최소화
    });
    it("등록 안 된 패널은 걸러서 불러온다", () => {
        const api = fakeApi([]);
        loadScreen(api, {
            layout: { panels: { "chart-1": { id: "chart-1", contentComponent: "chart" }, "old-1": { id: "old-1", contentComponent: "old" } } } as never,
            panels: {},
        });
        expect(Object.keys((api.loaded[0] as { panels: object }).panels)).toEqual(["chart-1"]);
    });
});

describe("화면 불러오기 실패", () => {
    it("구독·설정과 배치를 불러오기 전으로 되돌린다", () => {
        const api = fakeApi(["chart-1", "hts-1"], "chart-9");
        useDock.getState().register(["chart-1", "hts-1"]);
        usePaths.getState().bind("chart-1", "B");
        usePanelUiStore.getState().set("chart-1", "view", "daily");
        const ok = loadScreen(api, {
            layout: { panels: { "chart-1": { id: "chart-1", contentComponent: "chart" }, "chart-9": { id: "chart-9", contentComponent: "chart" } } } as never,
            panels: { "chart-1": { ref: "A", ui: { view: "minute" } }, "chart-9": { ref: "A" } },
        });
        expect(ok).toBe(false);
        expect(usePaths.getState().bindings["chart-1"]).toBe("B");
        expect(usePaths.getState().bindings["chart-9"]).toBeUndefined();
        expect(usePanelUiStore.getState().ui["chart-1"]).toEqual({ view: "daily" });
        expect(api.panels.map((p) => p.id)).toEqual(["chart-1", "hts-1"]);
        expect(useDock.getState().openIds).toEqual(["chart-1", "hts-1"]);
        expect(useDock.getState().slots).toEqual(["chart-1", "hts-1"]); // 중간에 잠깐 열렸던 chart-9 는 칩으로 남지 않는다
    });
});
