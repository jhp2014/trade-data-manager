import { beforeEach, describe, expect, it } from "vitest";
import { normalizeSlots, useDock } from "./dock.js";
import { SEED_SLOT_IDS } from "../shell/panelCatalog.js";

// 슬롯 대장 — 실존 인스턴스 집합의 정규화·자가등록·소멸 규칙.
// 스토어는 모듈 싱글턴이라 각 테스트가 같은 상태에서 출발하게 리셋한다(node 환경 = localStorage 없음 → 영속은 무해한 no-op).
beforeEach(() => {
    useDock.setState({ slots: normalizeSlots([]), openPanelIds: null });
});

describe("normalizeSlots", () => {
    it("상비 슬롯 1 — 타입마다 항상 실존하고, 시딩 밖 추가 슬롯은 입력에 있을 때만", () => {
        const empty = normalizeSlots([]);
        expect(empty).toContain("chart-1");
        expect(empty).toContain("theme-scope-1");
        expect(empty).not.toContain("chart-2");
    });

    it("첫 시딩(옛 카탈로그 열거)은 chart-2·live-chart-2 를 담는다 — 쓰던 칩 회귀 방지선", () => {
        const seeded = normalizeSlots(SEED_SLOT_IDS);
        expect(seeded).toContain("chart-2");
        expect(seeded).toContain("live-chart-2");
    });

    it("정식 정렬 — 같은 타입의 슬롯이 이웃해 서고(타입 선언 순서 → 번호), 중복은 하나로", () => {
        const out = normalizeSlots(["theme-scope-2", "chart-3", "chart-3"]);
        expect(out.indexOf("chart-3")).toBe(out.indexOf("chart-1") + 1);
        expect(out.indexOf("theme-scope-2")).toBe(out.indexOf("theme-scope-1") + 1);
        expect(out.filter((id) => id === "chart-3")).toHaveLength(1);
    });

    it("미등록 밑동·비슬롯 문법은 걸러진다", () => {
        const out = normalizeSlots(["hypothesis-1", "chart", "chart-0", "chart-2"]);
        expect(out).not.toContain("hypothesis-1");
        expect(out).not.toContain("chart");
        expect(out).not.toContain("chart-0");
        expect(out).toContain("chart-2");
    });
});

describe("useDock 슬롯 대장", () => {
    it("setOpenPanels 가 대장 밖 슬롯을 자가등록한다 — 프리셋/복원에 나타난 id 가 칩 자격을 얻는 길", () => {
        useDock.getState().setOpenPanels(["theme-scope-2", "chart-1"]);
        expect(useDock.getState().slots).toContain("theme-scope-2");
    });

    it("registerSlots 는 합집합이고 무변경이면 참조도 안 바뀐다", () => {
        useDock.getState().registerSlots(["chart-2"]);
        const after = useDock.getState().slots;
        useDock.getState().registerSlots(["chart-2", "chart-1"]);
        expect(useDock.getState().slots).toBe(after);
    });

    it("destroySlot — 슬롯 2+ 만, 닫혀 있을 때만 소멸한다", () => {
        const st = useDock.getState();
        st.registerSlots(["chart-2"]);
        st.destroySlot("chart-1"); // 상비 — 거부
        expect(useDock.getState().slots).toContain("chart-1");

        useDock.getState().setOpenPanels(["chart-2"]);
        useDock.getState().destroySlot("chart-2"); // 열려 있음 — 거부
        expect(useDock.getState().slots).toContain("chart-2");

        useDock.getState().setOpenPanels([]);
        useDock.getState().destroySlot("chart-2"); // 닫힌 추가 슬롯 — 소멸
        expect(useDock.getState().slots).not.toContain("chart-2");
    });
});
