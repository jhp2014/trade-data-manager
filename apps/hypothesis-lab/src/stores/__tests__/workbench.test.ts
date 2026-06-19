import { beforeEach, describe, expect, it } from "vitest";
import { currentMonth, useWorkbench } from "@/stores/workbench";

beforeEach(() => {
    useWorkbench.setState({
        filterMode: "workingset",
        mode: { kind: "review-month", month: currentMonth() },
        expr: "",
        settingsOpen: false,
        savedFilterModal: null,
        _lastInsert: null,
    });
});

describe("useWorkbench", () => {
    it("가설 코드 삽입 시 불리언 모드로 전환하고 빈 식에서는 코드와 NOT을 순환한다", () => {
        const s = useWorkbench.getState();

        s.appendOrCycleRef("H0001");
        expect(useWorkbench.getState()).toMatchObject({
            filterMode: "boolean",
            expr: "H0001",
        });

        useWorkbench.getState().appendOrCycleRef("H0001");
        expect(useWorkbench.getState().expr).toBe("!H0001");

        useWorkbench.getState().appendOrCycleRef("H0001");
        expect(useWorkbench.getState().expr).toBe("");
    });

    it("같은 가설을 연속 삽입하면 연결 연산자와 NOT 조합을 순환한다", () => {
        const s = useWorkbench.getState();

        s.setExpr("H0001");
        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 & H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 | H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 & !H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 | !H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001");
    });

    it("수동으로 식을 수정하면 직전 삽입 순환을 끊는다", () => {
        const s = useWorkbench.getState();

        s.appendOrCycleRef("H0001");
        useWorkbench.getState().setExpr("H0001 & H0002");
        useWorkbench.getState().appendOrCycleRef("H0001");

        expect(useWorkbench.getState().expr).toBe("H0001 & H0002 & H0001");
    });

    it("설정 모달과 저장 필터 모달 상태를 열고 닫는다", () => {
        const s = useWorkbench.getState();

        s.openSettings();
        expect(useWorkbench.getState().settingsOpen).toBe(true);
        useWorkbench.getState().closeSettings();
        expect(useWorkbench.getState().settingsOpen).toBe(false);

        useWorkbench.getState().openSavedFilter("save");
        expect(useWorkbench.getState().savedFilterModal).toBe("save");
        useWorkbench.getState().closeSavedFilter();
        expect(useWorkbench.getState().savedFilterModal).toBeNull();
    });
});
