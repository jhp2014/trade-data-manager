// 보는 집합 구독(연동 단일) + 월 시선 — 사이드바 재편(2026-08-21) 이후 여기서 잠그는 계약:
//   · 패널은 **전역 선택 포인터 하나를 구독**한다(고정 바인딩 폐지 — 집합을 고르는 자리는 작업셋뿐).
//     포인터가 비면 작업 깔때기 시선 = 전체가 그려지고, 저장 집합을 고르면 전 구독 패널이 그 멤버만 본다.
//   · **월 시선도 같은 접기를 지난다**(viewOf 한 곳) — 작업셋에서 달을 누르면 골격도 그 달만 그린다.
//     이게 안 잠기면 "달을 눌렀는데 옆 패널이 무반응"(시선이 두 벌이던 시절의 어긋남)이 재생산된다.
//   · 옛 고정 바인딩 영속(wb.setBinding.*)은 읽지 않는다 — 개념이 사라졌으니 조용히 무시(우회 부활 금지).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Group } from "../../../api/groups.js";
import { Providers, seededClient, type Seed } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import type { SavedSet } from "../../../store/savedSetsSlice.js";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { clusterFeed, clusterPoints, CLUSTER_CODES, DATE } from "../../skeleton/__tests__/overlayFixture.js";

const g = (name: string): Group => ({ name, scope: "day", parentName: null });

// 골격 픽스처의 세 차트 중 **둘만** 그룹에 넣는다 — 그 그룹을 조건으로 삼은 집합이 서면 3이 2가 되어야 한다.
const SEED: Seed = {
    skeletons: clusterFeed,
    points: clusterPoints,
    groups: [g("돌파")],
    memberships: CLUSTER_CODES.slice(0, 2).map((code) => ({ stockCode: code, date: DATE, groupNames: ["돌파"] })),
    candidateDays: CLUSTER_CODES.map((code) => ({ stockCode: code, date: DATE, traces: [] })),
};

/** 저장 집합 "돌파 생존" — 그룹 '돌파' 단계 하나짜리 조건 사본, 부위=생존자. */
const BREAKOUT_SET: SavedSet = {
    id: "fs1",
    name: "돌파 생존",
    stages: [{ id: "s1", enabled: true, predicates: [{ kind: "group", expr: { groups: [{ literals: [{ groupId: "돌파", neg: false }] }] } }] }],
    part: { kind: "survivors" },
};

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
    useWorkbench.setState({
        pick: null, filterSlots: [[], [], []], filterSlotIndex: 0, funnelSelection: null, skeletonSelection: new Set(), activePoint: null,
        savedSets: [], selectedSetRef: null, openedSetId: null,
        gazeMonths: null, gazePresence: [], // 시선 전체 해제 — 시선 검사는 각 테스트가 명시로 건다
    });
});
afterEach(() => {
    useWorkbench.setState({ pick: null });
    cleanup();
    localStorage.clear();
});

describe("보는 집합 — 전역 포인터·월 시선 구독", () => {
    it("디폴트(포인터 없음·월 전체) — 라벨은 작업 깔때기, 전체가 그려진다", () => {
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 작업 깔때기/)).toBeTruthy();
        expect(screen.getByText("3개")).toBeTruthy();
    });

    it("포인터가 저장 집합이면 전 구독 패널이 그 멤버만 — 작업셋에서 고른 것이 여기로 온다", () => {
        useWorkbench.setState({ savedSets: [BREAKOUT_SET], selectedSetRef: { kind: "saved", setId: "fs1" } });
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 돌파 생존/)).toBeTruthy();
        expect(screen.getByText("2개")).toBeTruthy();
    });

    it("월 시선이 그 달이면 전체가, 딴 달이면 0개가 — 달 클릭이 구독 패널에 실제로 닿는다", () => {
        useWorkbench.setState({ gazeMonths: [DATE.slice(0, 7)] });
        renderPanel();
        expect(screen.getByText("3개")).toBeTruthy();
        cleanup();
        useWorkbench.setState({ gazeMonths: ["1999-01"] });
        renderPanel();
        expect(screen.getByText("0개")).toBeTruthy();
    });

    it("존재필터 시선도 구독 패널에 닿는다 — '타점 있음'이면 전체, '타점 없음'이면 0개", () => {
        // 픽스처 세 차트 전부 타점이 있다(clusterPoints) — 앵커 테이블은 비어 presence 의 marks 는 0.
        useWorkbench.setState({ gazePresence: [{ point: "has" }] });
        renderPanel();
        expect(screen.getByText("3개")).toBeTruthy();
        cleanup();
        useWorkbench.setState({ gazePresence: [{ point: "not" }] });
        renderPanel();
        expect(screen.getByText("0개")).toBeTruthy();
    });

    it("옛 고정 바인딩 영속은 무시된다 — 포인터만이 진실이다", () => {
        localStorage.setItem("wb.setBinding.skeleton.daily", JSON.stringify({ kind: "saved", setId: "없는집합" }));
        renderPanel();
        expect(screen.getByTitle(/보는 집합: 작업 깔때기/)).toBeTruthy();
        expect(screen.getByText("3개")).toBeTruthy();
    });
});
