// 패널 바인딩 + 집합 사이드바 — 여기서 잠그는 계약:
//   · 디폴트는 깔때기 시선 — 아무것도 안 만지면 바인딩 도입 전과 화면이 같다.
//   · 참조를 묶으면 그 패널만 그 집합을 본다(전역 렌즈의 해체 — 옆 패널과 무관).
//   · 깨진 참조는 **빈 집합 + 경고**다 — 전체로 조용히 넓어지지 않는다(자동 폴백 금지).
//   · 말과 손은 쪼개져 있다: 왼쪽 라벨(`이름 n/N`)은 **못 누르고**, 여는 일은 오른쪽 "집합" 토글이 한다.
//     깨졌을 때 그 토글이 경고색으로 물드는 것까지가 계약이다 — 닫혀 있어도 고칠 자리가 보여야 한다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Group } from "../../../api/groups.js";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { FAIL } from "../../../styles/palette.js";
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

/** 오른쪽 컨트롤 줄의 "집합" 토글 — 사이드바를 여는 유일한 손잡이. */
const setToggle = (): HTMLElement => screen.getByText("집합");

/** jsdom 은 인라인 색을 rgb() 로 정규화한다 — 팔레트 상수와 견주려면 같은 꼴로 만든다. */
const rgb = (hex: string): string => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

beforeEach(() => {
    useWorkbench.setState({ pick: null, filterStages: [], funnelSelection: null, skeletonSelection: new Set(), activePoint: null });
});
afterEach(() => {
    useWorkbench.setState({ pick: null });
    cleanup();
    localStorage.clear();
});

describe("패널 바인딩 — 골격이 자기 집합을 고른다", () => {
    it("디폴트는 깔때기 시선 — 라벨이 그렇게 서고 전체가 그려진다(바인딩 도입 전과 동일)", () => {
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 깔때기 시선/)).toBeTruthy();
        expect(screen.getByText("3개")).toBeTruthy();
    });

    it("그룹을 묶으면 그 멤버만 — 전역 렌즈가 아니라 이 패널의 선택", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "돌파" }));
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 돌파/)).toBeTruthy(); // 라벨 = 지금 뭘 보고 있나
        expect(screen.getByText("2개")).toBeTruthy();
    });

    it("깨진 참조 = 빈 집합 + 경고 — 전체로 조용히 넓어지지 않는다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "지워진그룹" }));
        renderPanel();
        expect(screen.getByTitle(/참조가 깨졌습니다/)).toBeTruthy();
        expect(screen.getByText("0개")).toBeTruthy();
    });

    it("깨지면 '집합' 토글이 **닫힌 채로도** 경고색 — 사고는 사이드바가 닫혀 있을 때 난다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "지워진그룹" }));
        renderPanel();
        // 켜짐 색(activeColor)이었다면 닫힌 지금 아무 색도 없었을 자리다.
        expect(setToggle().style.color).toBe(rgb(FAIL));
    });

    it("멀쩡하면 안 물든다 — 경고색이 상시면 아무 말도 아니게 된다", () => {
        renderPanel();
        expect(setToggle().style.color).not.toBe(rgb(FAIL));
    });

    it("라벨은 못 누른다 — 여는 일은 오른쪽 '집합'이 한다(말과 손의 분리)", () => {
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 깔때기 시선/).tagName).not.toBe("BUTTON");
        expect(setToggle().tagName).toBe("BUTTON");
    });

    it("'집합' → 사이드바 → 깔때기 시선으로 되돌리면 전체가 돌아온다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "돌파" }));
        renderPanel();
        fireEvent.click(setToggle());
        fireEvent.click(screen.getByTitle("보는 집합 바꾸기")); // 고르는 판 펼치기
        fireEvent.click(screen.getByText("깔때기 시선"));
        expect(screen.getByText("3개")).toBeTruthy();
    });

    it("라벨의 n/N = 표현됨/전체 — 사이드바에 멤버 목록이 선다", () => {
        localStorage.setItem(BIND_KEY, JSON.stringify({ kind: "group", name: "돌파" }));
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 돌파/).textContent).toContain("2/2"); // 멤버 둘 다 골격이 있어 표현됨
        fireEvent.click(setToggle());
        // 사이드바 머리에도 같은 n/N — 라벨과 사이드바가 같은 한 벌을 본다.
        expect(screen.getByTitle("보는 집합 바꾸기").textContent).toContain("2/2");
    });
});
