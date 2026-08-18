// 패널 바인딩 + 집합 사이드바 — 여기서 잠그는 계약:
//   · 디폴트는 연동 — 아무것도 안 만지면 바인딩 도입 전과 화면이 같다.
//   · 참조를 묶으면 그 패널만 그 집합을 본다(전역 렌즈의 해체 — 옆 패널과 무관).
//   · 깨진 참조는 **빈 집합 + 경고 칩**이다 — 전체로 조용히 넓어지지 않는다(자동 폴백 금지).
//   · 칩 = `라벨 n/N`(표현됨/전체) 상시 요약이자 사이드바 토글. 바인딩 고르기는 사이드바 안에 산다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Group } from "../../../api/groups.js";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { clusterFeed, clusterPoints, CLUSTER_CODES, DATE } from "../../skeleton/__tests__/overlayFixture.js";

const g = (name: string): Group => ({ name, scope: "day", parentName: null });

// 골격 픽스처의 세 차트 중 **둘만** 그룹에 넣는다 — 바인딩이 서면 3이 2가 되어야 한다.
const SEED: Seed = {
    skeletons: clusterFeed,
    points: clusterPoints,
    groups: [g("돌파")],
    memberships: CLUSTER_CODES.slice(0, 2).map((code) => ({ stockCode: code, date: DATE, groupNames: ["돌파"] })),
    candidateDays: CLUSTER_CODES.map((code) => ({ stockCode: code, date: DATE, traces: [] })),
};

const BIND_KEY = "wb.setBinding.skeleton.daily";

function renderPanel(): void {
    render(
        <Providers client={seededClient(SEED)}>
            <div style={{ width: 900, height: 600 }}>
                <SkeletonOverlayPanel grain="daily" />
            </div>
        </Providers>,
    );
}

beforeEach(() => {
    useWorkbench.setState({ pick: null, filterStages: [], funnelSelection: null, skeletonSelection: new Set(), activePoint: null });
});
afterEach(() => {
    useWorkbench.setState({ pick: null });
    cleanup();
    localStorage.clear();
});

describe("패널 바인딩 — 골격이 자기 집합을 고른다", () => {
    it("디폴트는 연동 — 칩이 '연동'으로 서고 전체가 그려진다(바인딩 도입 전과 동일)", () => {
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 연동/)).toBeTruthy();
        expect(screen.getByText("3개")).toBeTruthy();
    });

    it("그룹을 묶으면 그 멤버만 — 전역 렌즈가 아니라 이 패널의 선택", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "돌파" }));
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 돌파/)).toBeTruthy(); // 칩 = 지금 뭘 보고 있나
        expect(screen.getByText("2개")).toBeTruthy();
    });

    it("깨진 참조 = 빈 집합 + 경고 칩 — 전체로 조용히 넓어지지 않는다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "지워진그룹" }));
        renderPanel();
        expect(screen.getByTitle(/참조가 깨졌습니다/)).toBeTruthy();
        expect(screen.getByText("0개")).toBeTruthy();
    });

    it("칩 → 사이드바 → 연동으로 되돌리면 전체가 돌아온다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "돌파" }));
        renderPanel();
        fireEvent.click(screen.getByTitle(/보는 집합: 돌파/)); // 칩 = 사이드바 토글
        fireEvent.click(screen.getByTitle("보는 집합 바꾸기")); // 고르는 판 펼치기
        fireEvent.click(screen.getByText("연동"));
        expect(screen.getByText("3개")).toBeTruthy();
    });

    it("칩의 n/N = 표현됨/전체 — 사이드바에 멤버 목록이 선다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "돌파" }));
        renderPanel();
        const chip = screen.getByTitle(/보는 집합: 돌파/);
        expect(chip.textContent).toContain("2/2"); // 멤버 둘 다 골격이 있어 표현됨
        fireEvent.click(chip);
        // 사이드바 머리에도 같은 n/N — 칩과 사이드바가 같은 한 벌을 본다.
        expect(screen.getByTitle("보는 집합 바꾸기").textContent).toContain("2/2");
    });
});
