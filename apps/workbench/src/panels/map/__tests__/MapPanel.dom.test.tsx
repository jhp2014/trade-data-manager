// 맵 패널 배선 — 읽기(모집단 카운트)와 유일한 쓰기(필터에 추가)를 값으로 잠근다.
//
// 맵은 깔때기의 구독자다: 노드 숫자는 골격·시트가 보는 것과 같은 집합에서 나와야 하고,
// 노드를 짚고 "필터에 추가"를 누르면 깔때기에 그룹 단계가 **하나** 생기는 게 전부여야 한다
// (조건의 저자는 깔때기 하나 — 맵이 제 상태로 조건을 들면 진실이 둘이 된다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CandidateDay, ReviewPointListItem } from "@trade-data-manager/wire";
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

function renderMap(seed: Seed = SEED, scope: "day" | "point" = "day"): void {
    const client = seededClient(seed);
    client.setQueryData(mapsQuery().queryKey, [{ id: "m1", name: "평면", scope }]);
    render(
        <Providers client={client}>
            <div style={{ width: 800, height: 600 }}><MapPanel /></div>
        </Providers>,
    );
}

/** 평면 위 노드의 이름 — 체인에 들면 브레드크럼에도 같은 이름이 생겨 맨 이름으로는 모호해진다. */
function nodeLabel(name: string): HTMLElement {
    const el = screen.getAllByText(name).find((e) => e.closest(".react-flow__node") !== null);
    if (!el) throw new Error(`평면에 "${name}" 노드가 없다`);
    return el;
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

// ⚠ 이 블록이 실측으로 잡은 결함이다: 깔때기 해상도(자동)는 걸린 조건이 정하지 평면이 정하지 않는다.
// 그대로 쓰면 타점 평면인데 해상도가 하루일 때 타점 소속이 하루 항목에 안 걸려 **전 노드가 0**이 된다.
describe("MapPanel — 평면 층위로 모집단을 본다", () => {
    const pgrp = (id: string, name: string, x: number): Group =>
        ({ id, name, scope: "point", parentId: null, mapId: "m1", x, y: 0 });
    const POINTS: ReviewPointListItem[] = [
        { stockCode: "086520", date: "2026-07-01", time: "09:30:00", name: "에코프로" },
        { stockCode: "086520", date: "2026-07-01", time: "10:00:00", name: "에코프로" },
    ];
    const POINT_SEED: Seed = {
        groups: [pgrp("g-돌파", "돌파", 0), pgrp("g-눌림", "눌림", 300)],
        memberships: [
            { stockCode: "086520", date: "2026-07-01", time: "09:30:00", groupIds: ["g-돌파"] },
            { stockCode: "086520", date: "2026-07-01", time: "10:00:00", groupIds: ["g-돌파"] },
        ],
        candidateDays: [{ stockCode: "086520", date: "2026-07-01", traces: [] }],
        points: POINTS,
    };

    it("타점 평면은 하루 해상도에서도 타점 소속을 센다 — 0으로 죽지 않는다", () => {
        renderMap(POINT_SEED, "point");
        expect(screen.getByTitle(/^돌파 · 모집단 2$/)).toBeTruthy();
        expect(screen.getByTitle(/^눌림 · 모집단 0$/)).toBeTruthy();
    });

    it("타점 평면의 분모는 타점 수(하루 항목이 그날 타점 전부로 펼쳐진다)", () => {
        renderMap(POINT_SEED, "point");
        expect(screen.getByText(/모집단 2 \(전체\)/)).toBeTruthy();
    });

    it("하루 평면의 분모는 차트 수 — 타점으로 부풀지 않는다", () => {
        renderMap({ ...SEED, points: POINTS }, "day");
        expect(screen.getByText(/모집단 3 \(전체\)/)).toBeTruthy();
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

    it("짚으면 작업줄에 그 그룹과 공통 수가 뜬다", () => {
        renderMap();
        fireEvent.click(screen.getByText("2차전지"));
        expect(screen.getByText("공통 1")).toBeTruthy();
    });
});

// 체인은 **세션 시선**이지 조건이 아니다(조건의 저자는 깔때기 하나). 그래서 클릭으로만 자라고,
// 빈 곳을 눌러도 안 풀린다 — 짚어 놓고 화면을 옮기다 쌓은 경로를 잃으면 안 된다.
describe("MapPanel — 체인 클릭", () => {
    const g3 = (id: string, name: string, x: number, y = 0): Group =>
        ({ id, name, scope: "day", parentId: null, mapId: "m1", x, y });
    // A: 돌파+갭상승 · B: 돌파+갭상승 · C: 돌파만 → 돌파 3, 갭상승 2, 눌림 0
    const CHAIN_SEED: Seed = {
        groups: [g3("g1", "돌파", 0), g3("g2", "갭상승", 400), g3("g3", "눌림", 0, 400)],
        memberships: [
            { stockCode: "A", date: "2026-07-01", groupIds: ["g1", "g2"] },
            { stockCode: "B", date: "2026-07-01", groupIds: ["g1", "g2"] },
            { stockCode: "C", date: "2026-07-01", groupIds: ["g1"] },
        ],
        candidateDays: [
            { stockCode: "A", date: "2026-07-01", traces: [] },
            { stockCode: "B", date: "2026-07-01", traces: [] },
            { stockCode: "C", date: "2026-07-01", traces: [] },
        ],
    };

    it("이어 누르면 체인이 자라고 공통 수가 좁아진다", () => {
        renderMap(CHAIN_SEED);
        fireEvent.click(screen.getByText("돌파"));
        expect(screen.getByText("공통 3")).toBeTruthy();
        fireEvent.click(screen.getByText("갭상승"));
        expect(screen.getByText("공통 2")).toBeTruthy();
    });

    it("교집합이 없는 그룹은 이어붙지 않는다 — 갈 수 없는 곳", () => {
        renderMap(CHAIN_SEED);
        fireEvent.click(screen.getByText("돌파"));
        fireEvent.click(screen.getByText("눌림"));
        expect(screen.getByText("공통 3")).toBeTruthy(); // 그대로
    });

    it("체인 안 노드를 다시 누르면 거기까지 되감긴다", () => {
        renderMap(CHAIN_SEED);
        fireEvent.click(screen.getByText("돌파"));
        fireEvent.click(screen.getByText("갭상승"));
        // 체인에 들면 이름이 노드와 브레드크럼 두 곳에 있다 — 노드 쪽을 짚어 "맵에서 다시 누르기"를 재현.
        fireEvent.click(nodeLabel("갭상승"));
        expect(screen.getByText("공통 3")).toBeTruthy();
    });

    it("필터에 추가 = 체인 전체가 단계 여러 개로 — 한 단계에 몰면 어느 단계가 죽였는지 못 묻는다", () => {
        renderMap(CHAIN_SEED);
        fireEvent.click(screen.getByText("돌파"));
        fireEvent.click(screen.getByText("갭상승"));
        fireEvent.click(screen.getByText("필터에 추가"));
        const stages = useWorkbench.getState().filterStages;
        expect(stages).toHaveLength(2);
        expect(stages.map((s) => (s.predicates[0] as { expr: { groups: { literals: { groupId: string }[] }[] } }).expr.groups[0]!.literals[0]!.groupId))
            .toEqual(["g1", "g2"]);
    });
});
