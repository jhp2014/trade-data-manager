// 그룹 배정 팝오버 — 섹션 구성(입구 grain)·grain 후보 필터·계층 상속 흐린 행·정렬 불변(토글 재정렬 금지).
//
// 네트워크 뮤테이션(토글·생성·개명·삭제)은 여기서 실행하지 않는다 — jsdom 엔 서버가 없어 실패 경로만
// 타게 되고, 그건 렌더 계약 검증이 아니다. 낙관 토글 자체는 groupIndex(applyGroupToggle) 유닛이 지킨다.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { GroupAssignPopover } from "../GroupAssignPopover.js";
import { useGroupAssign } from "../../store/groupAssign.js";
import { Providers, seededClient, type Seed } from "../../test/renderPanel.js";

// 사전: 테마 ⊃ 소재(day 그룹, A 가 소재 소속) · 눌림(point 그룹) · 미정1(빈 그룹 = 양쪽 후보).
const SEED: Seed = {
    // 서버 정렬(이름 오름차순) 그대로 심는다 — 팝오버는 사전 순서를 재정렬하지 않는다.
    groups: [
        { name: "눌림", parentName: null },
        { name: "미정1", parentName: null },
        { name: "소재", parentName: "테마" },
        { name: "테마", parentName: null },
    ],
    memberships: [{ stockCode: "005930", date: "2026-07-01", groupNames: ["소재"] }],
    pointMemberships: [{ stockCode: "005930", date: "2026-07-01", time: "10:03:00", groupNames: ["눌림"] }],
};

function show(target: { stockCode: string; date: string; time?: string }): void {
    // 렌더 전에 연다 — 렌더 밖 스토어 갱신을 act 로 감싸는 대신, 첫 렌더부터 열린 상태로 그린다.
    useGroupAssign.getState().open(target, { x: 10, y: 10 });
    render(
        <Providers client={seededClient(SEED)}>
            <GroupAssignPopover />
        </Providers>,
    );
}

afterEach(() => {
    useGroupAssign.getState().close();
    cleanup();
});

/** 섹션 헤더 텍스트로 그 섹션의 루트(부모 div)를 잡는다 — 행 존재 판정은 섹션 안에서만. */
const sectionOf = (label: RegExp): HTMLElement => {
    const head = screen.getByText(label);
    return head.parentElement as HTMLElement;
};

describe("타점 입구(두 섹션)", () => {
    it("이 타점 / 이 날 두 섹션이 서고, grain 으로 후보가 갈린다(빈 그룹은 양쪽)", () => {
        show({ stockCode: "005930", date: "2026-07-01", time: "10:03:00" });

        const pt = sectionOf(/^이 타점/);
        const day = sectionOf(/^이 날/);

        // point 섹션: point 그룹(눌림) + 빈 그룹(미정1)만 — day 그룹(테마·소재)은 후보가 아니다.
        expect(within(pt).getByText("눌림")).toBeTruthy();
        expect(within(pt).getByText("미정1")).toBeTruthy();
        expect(within(pt).queryByText("소재")).toBeNull();
        expect(within(pt).queryByText("테마")).toBeNull();

        // day 섹션: day 그룹(테마·소재) + 빈 그룹(미정1) — point 그룹(눌림)은 안 뜬다.
        expect(within(day).getByText("소재")).toBeTruthy();
        expect(within(day).getByText("테마")).toBeTruthy();
        expect(within(day).queryByText("눌림")).toBeNull();
    });

    it("계층 상속 소속은 흐린 행 — '하위 ○○ 경유' 라벨이 붙고 토글 대상이 아니다", () => {
        show({ stockCode: "005930", date: "2026-07-01", time: "10:03:00" });
        // A 는 소재(직접) 소속 → 조상 테마는 상속으로만 적용된다.
        expect(screen.getByText(/하위 소재 경유/)).toBeTruthy();
    });

    it("직접 소속엔 ✓ — point 는 눌림, day 는 소재", () => {
        show({ stockCode: "005930", date: "2026-07-01", time: "10:03:00" });
        const pt = sectionOf(/^이 타점/);
        const day = sectionOf(/^이 날/);
        // 행 배경/✓ 는 스타일이라 텍스트로만 못 재고, ✓ 글리프 수로 잰다(직접 소속 = 섹션당 1).
        expect(within(pt).getAllByText("✓")).toHaveLength(1);
        expect(within(day).getAllByText("✓")).toHaveLength(1);
    });
});

describe("day 입구(한 섹션)", () => {
    it("'이 타점' 섹션이 없다 — 날→타점은 다의라 원리적으로 못 연다", () => {
        show({ stockCode: "005930", date: "2026-07-01" });
        expect(screen.queryByText(/^이 타점/)).toBeNull();
        expect(screen.getByText(/^이 날/)).toBeTruthy();
    });
});

describe("정렬 불변", () => {
    it("목록은 사전 순서(이름순) 고정 — 체크 여부로 줄이 안 튄다", () => {
        show({ stockCode: "005930", date: "2026-07-01", time: "10:03:00" });
        const day = sectionOf(/^이 날/);
        // 행의 title = 전체 경로(pathLabel) — ⋯ 버튼(title="그룹 관리")은 뺀다.
        const titles = within(day).getAllByTitle(/./)
            .map((el) => el.getAttribute("title") ?? "")
            .filter((t) => t !== "그룹 관리");
        // day 섹션 후보 = 미정1 · 소재 · 테마(사전 순서). 소재가 ✓ 라도 맨 위로 안 온다.
        expect(titles).toEqual(["미정1", "테마 › 소재", "테마"]);
    });
});
