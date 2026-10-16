import { describe, it, expect } from "vitest";
import { sanitizeLayout as sanitize } from "./sanitize.js";

// 등록 컴포넌트 — chart 만 유효, hypothesis(지운 패널 흉내)는 무효.
const sanitizeLayout = (l: Parameters<typeof sanitize>[0]) => sanitize(l, new Set(["chart"]));

// tdm-work workbench store/dock.test.ts 에서 옮겨 왔다.
// dockview toJSON 형태 최소본 — 등록 안 된 컴포넌트의 패널이 섞였을 때 panels 맵·grid 트리·activeGroup 이
// 함께 정리돼 fromJSON 이 안 깨지는지 검증(순수 함수라 dockview 불필요).

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

    // 외자식 칸 걷기 — 루트 아닌 칸에 자식이 하나만 남으면 그 안의 마지막 판을 옮길 때 dockview 가
    // 빈 자리를 남긴다(2026-10-10 실측). 트리 모양만 보는 검증이라 노드 최소본 헬퍼로 쓴다.
    const leaf = (id: string, size?: number) => ({ type: "leaf", data: { views: [`chart-${id}`], activeView: `chart-${id}`, id }, ...(size != null ? { size } : {}) });
    const branch = (data: unknown[], size?: number) => ({ type: "branch", data, ...(size != null ? { size } : {}) });
    const layoutOf = (root: unknown, ids: string[]) =>
        asLayout({
            grid: { root, height: 100, width: 300, orientation: "HORIZONTAL" },
            panels: Object.fromEntries(ids.map((id) => [`chart-${id}`, { id: `chart-${id}`, contentComponent: id === "x" ? "hypothesis" : "chart" }])),
        });

    it("루트의 외자식 칸은 두고, 고칠 게 없으면 원본 그대로", () => {
        const layout = layoutOf(branch([branch([leaf("1", 100), leaf("2", 200)], 100)], 300), ["1", "2"]);
        expect(sanitizeLayout(layout).json).toBe(layout);
    });

    it("제거 0건이어도 외자식 칸은 걷고, 남은 그룹이 그 칸 자리(크기)를 물려받는다", () => {
        // 이미 망가진 채 저장된 프리셋 — 셋째 칸이 [그룹 3] 하나만 품은 칸
        const layout = layoutOf(branch([branch([leaf("1", 100), leaf("2", 100), branch([leaf("3", 40)], 100)], 100)], 300), ["1", "2", "3"]);
        const { json, removed } = sanitizeLayout(layout);
        const row = asLayout(json).grid.root.data[0];
        expect(removed).toEqual([]);
        expect(json).not.toBe(layout); // 고쳤으므로 새 객체(프리셋 되쓰기 신호)
        expect(row.data.map((n: any) => [n.type, n.data.id ?? null, n.size])).toEqual([["leaf", "1", 100], ["leaf", "2", 100], ["leaf", "3", 100]]);
    });

    it("판 제거로 외자식 칸이 생기면 걷는다(은퇴 판이 칸을 나눠 쓰던 경우)", () => {
        const layout = layoutOf(branch([branch([leaf("1", 150), branch([leaf("2", 60), leaf("x", 40)], 150)], 100)], 300), ["1", "2", "x"]);
        const { json, removed } = sanitizeLayout(layout);
        const row = asLayout(json).grid.root.data[0];
        expect(removed).toEqual(["chart-x"]);
        expect(row.data.map((n: any) => [n.type, n.data.id, n.size])).toEqual([["leaf", "1", 150], ["leaf", "2", 150]]);
    });

    it("외자식이 칸이면 그 자식들을 부모 줄에 펼치고 크기를 이 칸 몫으로 비례 배분한다", () => {
        // 셋째 칸(200) = 외자식 칸 → 그 안의 [3, 4](방향 = 부모 줄)가 부모 줄로 올라온다
        const layout = layoutOf(branch([branch([leaf("1", 100), branch([branch([leaf("3", 30), leaf("4", 10)], 50)], 200)], 100)], 300), ["1", "3", "4"]);
        const row = asLayout(sanitizeLayout(layout).json).grid.root.data[0];
        expect(row.data.map((n: any) => [n.data.id, n.size])).toEqual([["1", 100], ["3", 150], ["4", 50]]);
    });

    it("외자식 칸 사슬은 안쪽부터 걷혀 방향이 맞는 칸에 안착한다 — 입력은 그대로, activeGroup 은 유지", () => {
        // 둘째 칸 = 칸A(200)[칸B(100)[칸C(20)[3, 4]]] — 외자식 사슬. 방향은 한 단계마다 바뀌므로 [3, 4] 는
        // 줄과 수직이다: 외자식 B 만 걷혀 [3, 4] 가 A 안으로 올라오고(B 몫 100 을 30:10 으로 → 75·25), A 는 둘을 품어 산다.
        const layout = layoutOf(branch([branch([leaf("1", 100), branch([branch([branch([leaf("3", 30), leaf("4", 10)], 20)], 100)], 200)], 100)], 300), ["1", "3", "4"]);
        layout.activeGroup = "3";
        layout.grid.maximizedNode = { location: [0, 1, 0, 0, 0] };
        const before = JSON.stringify(layout);
        const { json } = sanitizeLayout(layout);
        const out = asLayout(json);
        const row = out.grid.root.data[0];
        expect(row.data.map((n: any) => [n.type, n.size])).toEqual([["leaf", 100], ["branch", 200]]);
        expect(row.data[1].data.map((n: any) => [n.type, n.data.id, n.size])).toEqual([["leaf", "3", 75], ["leaf", "4", 25]]);
        expect(out.activeGroup).toBe("3"); // 칸만 걷었지 그룹은 안 버렸다
        expect(out.grid.maximizedNode).toBeUndefined(); // 인덱스 경로가 어긋났으므로 버린다
        expect(JSON.stringify(layout)).toBe(before); // 원본 불변
    });

    it("자식 없는 빈 칸은 접는다(빈 자리가 자동저장된 마지막 배치)", () => {
        const layout = layoutOf(branch([branch([leaf("1", 100), branch([], 100), leaf("2", 100)], 100)], 300), ["1", "2"]);
        const row = asLayout(sanitizeLayout(layout).json).grid.root.data[0];
        expect(row.data.map((n: any) => n.data.id)).toEqual(["1", "2"]);
    });
});
