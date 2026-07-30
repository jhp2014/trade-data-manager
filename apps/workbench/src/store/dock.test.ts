import { describe, it, expect } from "vitest";
import { sanitizeLayout } from "./dock.js";

// dockview toJSON 형태 최소본 — 등록 안 된 컴포넌트(예: 삭제된 hypothesis)의 패널이 섞였을 때
// panels 맵·grid 트리·activeGroup 이 함께 정리돼 fromJSON 이 안 깨지는지 검증(순수 함수라 dockview 불필요).
// 유효/무효 판정은 실제 PANEL_CATALOG(chart=유효, hypothesis=제거됨=무효)를 그대로 쓴다.

// 레이아웃 JSON 을 느슨하게 다루는 캐스트 — 입력 구성(최소본)과 결과 검증 양쪽에 쓴다.
// dockview 타입에서 grid 노드의 data 는 leaf(GroupPanelViewState) | branch(배열) 유니온이라
// 내로잉 없이는 views/activeView 를 못 읽는다. 검증은 형태를 알고 하는 것이라 여기선 캐스트가 맞다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asLayout = (o: unknown): any => o;

describe("sanitizeLayout", () => {
    it("유효 패널만 있으면 원본 그대로(제거 0건)", () => {
        const layout = asLayout({
            grid: { root: { type: "leaf", data: { views: ["chart-1"], activeView: "chart-1", id: "g1" } }, height: 100, width: 100, orientation: "HORIZONTAL" },
            panels: { "chart-1": { id: "chart-1", contentComponent: "chart" } },
            activeGroup: "g1",
        });
        const { json, removed } = sanitizeLayout(layout);
        expect(removed).toEqual([]);
        expect(json).toBe(layout); // 변경 없으면 동일 참조 반환
    });

    it("등록 안 된 컴포넌트 패널을 panels·views 에서 제거하고 activeView 를 되살린다", () => {
        const layout = asLayout({
            grid: { root: { type: "leaf", data: { views: ["chart-1", "hypothesis-1"], activeView: "hypothesis-1", id: "g1" } }, height: 100, width: 100, orientation: "HORIZONTAL" },
            panels: {
                "chart-1": { id: "chart-1", contentComponent: "chart" },
                "hypothesis-1": { id: "hypothesis-1", contentComponent: "hypothesis" },
            },
            activeGroup: "g1",
        });
        const { json, removed } = sanitizeLayout(layout);
        const root = asLayout(json).grid.root;
        expect(removed).toEqual(["hypothesis-1"]);
        expect(Object.keys(json.panels)).toEqual(["chart-1"]);
        expect(root.data.views).toEqual(["chart-1"]);
        expect(root.data.activeView).toBe("chart-1"); // 제거된 activeView → 남은 첫 뷰
        expect(json.activeGroup).toBe("g1"); // 그룹은 비지 않았으므로 유지
        // 원본 불변(깊은 복제)
        expect(layout.panels["hypothesis-1"]).toBeDefined();
    });

    it("무효 패널만 있던 그룹은 접고, 그 그룹을 가리키던 activeGroup 은 해제한다", () => {
        const layout = asLayout({
            grid: {
                root: {
                    type: "branch",
                    data: [
                        { type: "leaf", data: { views: ["chart-1"], activeView: "chart-1", id: "g1" } },
                        { type: "leaf", data: { views: ["hypothesis-1"], activeView: "hypothesis-1", id: "g2" } },
                    ],
                },
                height: 100,
                width: 100,
                orientation: "HORIZONTAL",
            },
            panels: {
                "chart-1": { id: "chart-1", contentComponent: "chart" },
                "hypothesis-1": { id: "hypothesis-1", contentComponent: "hypothesis" },
            },
            activeGroup: "g2",
        });
        const { json, removed } = sanitizeLayout(layout);
        const root = asLayout(json).grid.root;
        expect(removed).toEqual(["hypothesis-1"]);
        expect(root.data).toHaveLength(1); // 빈 그룹(g2) 폐기
        expect(root.data[0].data.id).toBe("g1");
        expect(json.activeGroup).toBeUndefined(); // 폐기된 g2 참조 해제
    });

    it("플로팅 그룹의 무효 패널도 정리하고 빈 플로팅 그룹은 제거한다", () => {
        const layout = asLayout({
            grid: { root: { type: "leaf", data: { views: ["chart-1"], activeView: "chart-1", id: "g1" } }, height: 100, width: 100, orientation: "HORIZONTAL" },
            panels: {
                "chart-1": { id: "chart-1", contentComponent: "chart" },
                "hypothesis-1": { id: "hypothesis-1", contentComponent: "hypothesis" },
            },
            floatingGroups: [{ data: { views: ["hypothesis-1"], activeView: "hypothesis-1", id: "fg1" }, position: { top: 0, left: 0, width: 100, height: 100 } }],
        });
        const { json, removed } = sanitizeLayout(layout);
        expect(removed).toEqual(["hypothesis-1"]);
        expect(json.floatingGroups).toHaveLength(0);
    });
});
