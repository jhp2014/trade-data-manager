// 열 프리셋(순수) — 파서 관대성 · 적용 계산 · 유령 청소의 참조 동일성 규약.
import { describe, expect, it } from "vitest";
import { BUILTIN_POINT_PRESETS, parseSheetPresets, presetHidden, prunePresets } from "../sheetPresets.js";

describe("parseSheetPresets — 출처가 localStorage 라 관대하게", () => {
    it("정상 항목은 그대로, 형태 불량 항목·비문자 키는 조용히 버린다", () => {
        expect(parseSheetPresets([
            { name: "결과만", cols: ["name", "out:extHigh", 3] },
            { name: "", cols: [] }, // 빈 이름
            { cols: ["date"] }, // 이름 없음
            "쓰레기",
        ])).toEqual([{ name: "결과만", cols: ["name", "out:extHigh"] }]);
    });
    it("배열이 아니면 null(기본값으로)", () => {
        expect(parseSheetPresets({ name: "x" })).toBeNull();
        expect(parseSheetPresets("nope")).toBeNull();
    });
});

describe("presetHidden — 적용 = 전체 − cols", () => {
    it("프리셋에 없는 열이 숨김이 된다 · 종목(name)은 붙박이라 계산에서 뺀다", () => {
        expect(presetHidden(["name", "date", "time", "ax:1", "out:status"], ["date", "out:status"]))
            .toEqual(["time", "ax:1"]);
    });
    it("프리셋 cols 의 유령 키(지금 전체에 없는 키)는 무해 — 숨김 목록에 안 들어간다", () => {
        expect(presetHidden(["name", "date"], ["date", "ax:죽은축"])).toEqual([]);
    });
});

describe("prunePresets — 죽은 축 키 청소(다른 넷과 같은 사정)", () => {
    it("`ax:` 죽은 키만 버리고 `out:`·기본 열은 남긴다", () => {
        const ps = [{ name: "p", cols: ["name", "ax:살", "ax:죽", "out:extHigh"] }];
        expect(prunePresets(ps, ["살"])).toEqual([{ name: "p", cols: ["name", "ax:살", "out:extHigh"] }]);
    });
    it("바뀐 게 없으면 **같은 참조** — usePersistedState 저장 effect 가 헛돌지 않게", () => {
        const ps = [{ name: "p", cols: ["name", "ax:살"] }];
        expect(prunePresets(ps, ["살"])).toBe(ps);
    });
});

describe("붙박이 프리셋", () => {
    it("point 모드 '결과' = 결과 걷기 열 6(시뮬 무포함) · '시뮬' = 시뮬 열 4 — 사용자 확정 분리", () => {
        expect(BUILTIN_POINT_PRESETS).toHaveLength(2);
        expect(BUILTIN_POINT_PRESETS[0]!.cols).toEqual([
            "name", "date", "time",
            "out:extHigh", "out:deltaExt", "out:dropFromHigh", "out:dropFromClose", "out:recovered", "out:status",
        ]);
        expect(BUILTIN_POINT_PRESETS[1]!).toEqual({
            name: "시뮬",
            cols: ["name", "date", "time", "out:simStatus", "out:simRequired", "out:simPeak", "out:simTrough"],
        });
    });
});
