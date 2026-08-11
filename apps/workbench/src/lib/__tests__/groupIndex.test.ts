import { describe, it, expect } from "vitest";
import type { GroupAttachment, ChartGroupAttachment } from "@trade-data-manager/wire";
import { applyGroupToggle, applyChartGroupToggle, buildGroupIndex, buildChartGroupIndex, countByGroup, presetToggle } from "../groupIndex.js";

const P = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const Q = { stockCode: "000660", date: "2026-06-30", time: "10:00:00" };
// groupId → 이름: 낙관적 삽입이 서버와 같은 이름순을 유지하는지 보려고 일부러 id 순과 이름순을 어긋나게 둔다.
const NAMES: Record<string, string> = { t1: "다", t2: "가", t3: "나" };
const nameOf = (id: string): string => NAMES[id] ?? id;

const att = (): GroupAttachment[] => [{ ...P, groupIds: ["t2", "t3"] }, { ...Q, groupIds: ["t1"] }];

describe("buildGroupIndex / countByGroup", () => {
    it("타점키로 접고, 그룹별 건수를 센다", () => {
        const idx = buildGroupIndex(att());
        expect(idx.get("005930|2026-06-30|09:11:00")).toEqual(["t2", "t3"]);
        expect(idx.get("없는|키|00:00:00")).toBeUndefined();

        const c = countByGroup(att());
        expect(c.get("t1")).toBe(1);
        expect(c.get("t2")).toBe(1);
        expect(c.get("t3")).toBe(1);
    });
});

describe("차트 부착(buildChartGroupIndex / applyChartGroupToggle / countByGroup 합산)", () => {
    const C = { stockCode: "005930", date: "2026-06-30" };
    const chartAtt = (): ChartGroupAttachment[] => [{ ...C, groupIds: ["t2"] }];

    it("차트키로 접는다", () => {
        expect(buildChartGroupIndex(chartAtt()).get("005930|2026-06-30")).toEqual(["t2"]);
    });

    it("건수는 타점+차트 합산 — 삭제 확인이 두 부착을 다 세야 한다", () => {
        const c = countByGroup(att(), chartAtt());
        expect(c.get("t2")).toBe(2); // 타점 1 + 차트 1
    });

    it("낙관적 토글 — 이름순 삽입·빈 항목 제거·같은 배열 재사용(타점판과 같은 규칙)", () => {
        const added = applyChartGroupToggle(chartAtt(), C, "t3", true, nameOf); // "나" → "가" 뒤
        expect(added[0].groupIds).toEqual(["t2", "t3"]);
        // 바뀔 게 없으면 같은 배열 그대로(useMemo 헛돌지 않게).
        const same = chartAtt();
        expect(applyChartGroupToggle(same, C, "t2", true, nameOf)).toBe(same);
        // 마지막 그룹를 떼면 항목째 사라진다.
        expect(applyChartGroupToggle(chartAtt(), C, "t2", false, nameOf)).toEqual([]);
    });
});

describe("applyGroupToggle — 낙관적 갱신", () => {
    it("부착: 이름순 자리에 끼워 넣는다(부착 순서가 아니라)", () => {
        const next = applyGroupToggle(att(), P, "t1", true, nameOf); // "다" → 가·나 뒤
        expect(next[0].groupIds).toEqual(["t2", "t3", "t1"]);
    });

    it("부착: 그룹 0개이던 타점은 항목이 새로 생긴다", () => {
        const R = { stockCode: "035720", date: "2026-06-30", time: "11:00:00" };
        const next = applyGroupToggle(att(), R, "t1", true, nameOf);
        expect(next).toHaveLength(3);
        expect(next[2]).toEqual({ ...R, groupIds: ["t1"] });
    });

    it("부착: 이미 붙어 있으면 그대로(멱등 — 새 배열도 안 만든다)", () => {
        const cur = att();
        expect(applyGroupToggle(cur, P, "t2", true, nameOf)).toBe(cur);
    });

    it("해제: 그 그룹만 빠지고, 마지막 하나면 항목째 사라진다(서버 표현과 동일)", () => {
        const one = applyGroupToggle(att(), P, "t2", false, nameOf);
        expect(one[0].groupIds).toEqual(["t3"]);

        const gone = applyGroupToggle(one, P, "t3", false, nameOf);
        expect(gone.map((a) => a.stockCode)).toEqual(["000660"]); // 빈 항목 안 남김
    });

    it("해제: 안 붙어 있으면 그대로", () => {
        const cur = att();
        expect(applyGroupToggle(cur, P, "t1", false, nameOf)).toBe(cur);
    });

    it("원본을 건드리지 않는다(불변)", () => {
        const cur = att();
        applyGroupToggle(cur, P, "t1", true, nameOf);
        expect(cur[0].groupIds).toEqual(["t2", "t3"]);
    });
});

describe("presetToggle — 숫자키 하나로 조합 탈부착", () => {
    const PRESET = ["t1", "t2"];

    it("하나도 안 붙었으면 전부 붙인다", () => {
        expect(presetToggle([], PRESET)).toEqual({ on: true, groupIds: ["t1", "t2"] });
    });

    it("일부만 붙었으면 **빠진 것만** 채운다(이미 붙은 건 안 건드림 — 깜빡임 없음)", () => {
        expect(presetToggle(["t1"], PRESET)).toEqual({ on: true, groupIds: ["t2"] });
    });

    it("전부 붙었으면 전부 뗀다", () => {
        expect(presetToggle(["t1", "t2"], PRESET)).toEqual({ on: false, groupIds: ["t1", "t2"] });
    });

    it("프리셋 밖 그룹는 뗄 때도 건드리지 않는다", () => {
        expect(presetToggle(["t1", "t2", "other"], PRESET)).toEqual({ on: false, groupIds: ["t1", "t2"] });
    });

    it("부분 상태 → 채움 → 비움(두 번 눌러야 비워지는 게 의도)", () => {
        const first = presetToggle(["t1"], PRESET);
        expect(first).toEqual({ on: true, groupIds: ["t2"] });
        expect(presetToggle(["t1", "t2"], PRESET)).toEqual({ on: false, groupIds: ["t1", "t2"] });
    });

    it("단일 그룹 프리셋은 그냥 토글(n=1 이 같은 규칙)", () => {
        expect(presetToggle([], ["t1"])).toEqual({ on: true, groupIds: ["t1"] });
        expect(presetToggle(["t1"], ["t1"])).toEqual({ on: false, groupIds: ["t1"] });
    });

    it("빈 슬롯은 아무 일도 안 한다", () => {
        expect(presetToggle(["t1"], [])).toEqual({ on: false, groupIds: [] });
    });
});
