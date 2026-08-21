// 짚음 채널의 **건너감** — 그룹 패널에서 짚으면 골격이 그걸 받는다.
//
// 이 파일이 잠그는 건 배선이지 그림이 아니다: 짚음은 채널 하나이고(전역), 만든 패널이 자기 것만 거두며,
// 소비 패널은 제 보는 집합을 그대로 둔 채 **강조**로 받는다(좁히기는 그 패널의 선택). 두 패널을 한 트리에
// 같이 세우는 이유가 그것이다 — 따로 두면 "각자 잘 도는데 안 이어지는" 상태를 못 잡는다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Group } from "../../../api/groups.js";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { GroupListPanel } from "../../GroupListPanel.js";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { clusterFeed, clusterPoints, CLUSTER_CODES, DATE } from "../../skeleton/__tests__/overlayFixture.js";

const g = (name: string): Group => ({ name, scope: "day", parentName: null });

// 골격 픽스처의 세 차트 중 **둘만** 그룹에 넣는다 — 짚으면 3 중 2 가 되어야 배선이 산 것이다.
const SEED: Seed = {
    skeletons: clusterFeed,
    points: clusterPoints,
    groups: [g("돌파")],
    memberships: CLUSTER_CODES.slice(0, 2).map((code) => ({ stockCode: code, date: DATE, groupNames: ["돌파"] })),
    candidateDays: CLUSTER_CODES.map((code) => ({ stockCode: code, date: DATE })),
};

function renderBoth(): void {
    render(
        <Providers client={seededClient(SEED)}>
            <div style={{ width: 900, height: 600 }}>
                <GroupListPanel />
                <SkeletonOverlayPanel grain="daily" />
            </div>
        </Providers>,
    );
}

/** 그룹 목록의 행 — 골격 라벨에도 같은 글자가 설 수 있어 표 안에서 고른다. */
const groupRow = (name: string): HTMLElement =>
    screen.getAllByText(name).map((e) => e.closest("tr")).find((t): t is HTMLTableRowElement => t !== null)!;

beforeEach(() => {
    useWorkbench.setState({ pick: null, filterStages: [], funnelSelection: null, activePoint: null });
});
afterEach(() => {
    useWorkbench.setState({ pick: null, activePoint: null });
    cleanup();
    localStorage.clear();
});

describe("짚음 채널 — 그룹에서 짚으면 골격이 받는다", () => {
    it("짚기 전에는 채널이 비어 있다", () => {
        renderBoth();
        expect(useWorkbench.getState().pick).toBeNull();
    });

    it("그룹 행을 누르면 채널에 출처·이름·**참조**가 실린다 — 항목 스냅샷이 아니다(라이브)", () => {
        renderBoth();
        fireEvent.click(groupRow("돌파"));

        const pick = useWorkbench.getState().pick!;
        expect(pick.source).toBe("group");
        expect(pick.label).toBe("돌파");
        expect(pick.ref).toEqual({ kind: "groupChain", names: ["돌파"] });
    });

    it("골격 머리글에 **출처를 붙인 배지**와 분모가 뜬다 — 왜 강조가 생겼는지 말해 준다", () => {
        renderBoth();
        fireEvent.click(groupRow("돌파"));

        expect(screen.getByText("그룹 · 돌파")).toBeTruthy();
        expect(screen.getByTitle(/그룹 · 돌파 — 2 \/ 3/)).toBeTruthy();
    });

    it("**전체는 그대로다** — 짚음은 렌즈지 조건이 아니다(기본은 흐리게)", () => {
        renderBoth();
        fireEvent.click(groupRow("돌파"));
        expect(screen.getByText("3개")).toBeTruthy(); // 셋 다 그려진 채로 둘만 앞에 선다
    });

    it("좁히기로 바꾸면 짚은 것만 남는다 — 척도가 그만큼 커진다", () => {
        renderBoth();
        fireEvent.click(groupRow("돌파"));
        fireEvent.click(screen.getByTitle(/다른 패널이 좁혀 놓은 렌즈/));
        expect(screen.getByText("2개")).toBeTruthy();
    });

    it("체인을 풀면 채널도 비고 배지가 사라진다", () => {
        renderBoth();
        fireEvent.click(groupRow("돌파"));
        fireEvent.click(groupRow("돌파")); // 같은 행 재클릭 = 해제
        expect(useWorkbench.getState().pick).toBeNull();
        expect(screen.queryByText("그룹 · 돌파")).toBeNull();
    });
});
