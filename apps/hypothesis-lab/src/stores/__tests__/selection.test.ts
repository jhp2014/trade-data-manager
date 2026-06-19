import { beforeEach, describe, expect, it } from "vitest";
import { useSelection } from "@/stores/selection";

beforeEach(() => {
    useSelection.setState({
        selectedCaseId: null,
        selectedHypothesisId: null,
        modalHypothesisId: null,
    });
});

describe("useSelection", () => {
    it("선택된 케이스와 가설을 갱신한다", () => {
        const s = useSelection.getState();

        s.selectCase("case-1");
        s.selectHypothesis("hyp-1");

        expect(useSelection.getState().selectedCaseId).toBe("case-1");
        expect(useSelection.getState().selectedHypothesisId).toBe("hyp-1");
    });

    it("가설 설정 모달 대상을 열고 닫는다", () => {
        const s = useSelection.getState();

        s.openHypothesisModal("hyp-2");
        expect(useSelection.getState().modalHypothesisId).toBe("hyp-2");

        useSelection.getState().closeHypothesisModal();
        expect(useSelection.getState().modalHypothesisId).toBeNull();
    });
});
