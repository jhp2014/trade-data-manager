// 맵 패널 배선 — 읽기(모집단 카운트)와 유일한 쓰기(필터에 추가)를 값으로 잠근다.
//
// 맵은 깔때기의 구독자다: 노드 숫자는 골격·시트가 보는 것과 같은 집합에서 나와야 하고,
// 노드를 짚고 "필터에 추가"를 누르면 깔때기에 그룹 단계가 **하나** 생기는 게 전부여야 한다
// (조건의 저자는 깔때기 하나 — 맵이 제 상태로 조건을 들면 진실이 둘이 된다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CandidateDay } from "@trade-data-manager/wire";
import type { Group, GroupMembership } from "../../../api/groups.js";
import { mapsQuery } from "../../../api/queries.js";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { MapPanel } from "../../MapPanel.js";

const grp = (id: string, name: string, x: number, y: number, parentId: string | null = null): Group =>
    ({ id, name, scope: "day", parentId, mapId: "m1", x, y });

// 평면 위: 테마 ⊃ 2차전지 · 갭상승(독립). 에코프로만 2차전지에 직접 부착.
const GROUPS: Group[] = [
    grp("g-테마", "테마", 0, 0),
    grp("g-2차", "2차전지", 0, 0, "g-테마"),
    grp("g-갭", "갭상승", 400, 300),
];
const MEMBERS: GroupMembership[] = [
    { stockCode: "086520", date: "2026-07-01", groupIds: ["g-2차"] },
    { stockCode: "005930", date: "2026-07-01", groupIds: ["g-갭"] },
];
const DAYS: CandidateDay[] = [
    { stockCode: "086520", date: "2026-07-01", traces: [] },
    { stockCode: "005930", date: "2026-07-01", traces: [] },
    { stockCode: "000660", date: "2026-07-01", traces: [] }, // 아무 그룹에도 없다
];
const SEED: Seed = { groups: GROUPS, memberships: MEMBERS, candidateDays: DAYS };

function renderMap(): void {
    const client = seededClient(SEED);
    client.setQueryData(mapsQuery().queryKey, [{ id: "m1", name: "일봉", scope: "day" }]);
    render(
        <Providers client={client}>
            <div style={{ width: 800, height: 600 }}><MapPanel /></div>
        </Providers>,
    );
}

beforeEach(() => {
    useWorkbench.setState({ filterStages: [], filterExpandToPoints: false, funnelSelection: null });
});
afterEach(() => {
    useWorkbench.setState({ filterStages: [], funnelSelection: null });
    cleanup();
    localStorage.clear();
});

describe("MapPanel — 모집단 카운트(읽기)", () => {
    it("노드 숫자는 깔때기 '보는 집합' 기준 — 자식 소속이 부모에도 센다(상속)", () => {
        renderMap();
        // 필터 없음 → 모집단 = 후보 하루 3. 2차전지 1 · 테마 1(상속) · 갭상승 1.
        expect(screen.getByTitle(/^2차전지 · 모집단 1$/)).toBeTruthy();
        expect(screen.getByTitle(/^테마 · 모집단 1 · 하위 그룹 영역/)).toBeTruthy();
        expect(screen.getByTitle(/^갭상승 · 모집단 1$/)).toBeTruthy();
        expect(screen.getByText(/모집단 3 \(전체\)/)).toBeTruthy();
    });

    it("필터가 좁히면 노드 숫자도 좁아진다 — 골격·시트와 같은 잣대", () => {
        useWorkbench.setState({
            filterStages: [{ id: "s1", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId: "g-갭", neg: false }] }] } }] }],
        });
        renderMap();
        expect(screen.getByTitle(/^갭상승 · 모집단 1$/)).toBeTruthy();
        expect(screen.getByTitle(/^2차전지 · 모집단 0$/)).toBeTruthy();
    });
});

describe("MapPanel — 필터에 추가(유일한 쓰기)", () => {
    it("짚고 누르면 그룹 단계가 하나 생긴다 — 맵은 만든 뒤 잊는다", () => {
        renderMap();
        fireEvent.click(screen.getByText("갭상승"));
        fireEvent.click(screen.getByText("필터에 추가"));
        const stages = useWorkbench.getState().filterStages;
        expect(stages).toHaveLength(1);
        expect(stages[0]!.predicates).toEqual([
            { kind: "group", expr: { groups: [{ literals: [{ groupId: "g-갭", neg: false }] }] } },
        ]);
    });

    it("짚기 전에는 쓰기 진입점이 없다", () => {
        renderMap();
        expect(screen.queryByText("필터에 추가")).toBeNull();
    });
});

describe("MapPanel — 멤버 목록(토글)", () => {
    it("목록을 켜고 그룹을 짚으면 모집단 멤버가 보이고, 행 클릭 = 그 항목으로 이동", () => {
        renderMap();
        fireEvent.click(screen.getByText("목록"));
        fireEvent.click(screen.getByText("2차전지"));
        const row = screen.getByTitle("이 항목으로 이동");
        fireEvent.click(row);
        const s = useWorkbench.getState();
        expect(s.focus.code).toBe("086520");
        expect(s.focus.date).toBe("2026-07-01");
    });

    it("짚은 그룹의 경로가 작업줄에 뜬다 — 이름은 부모 밑에서만 뜻이 선다", () => {
        renderMap();
        fireEvent.click(screen.getByText("2차전지"));
        expect(screen.getByText("테마 › 2차전지")).toBeTruthy();
    });
});
