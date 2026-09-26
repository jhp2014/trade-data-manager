// 표식 합집합(◇ = 라벨 ∪ 후보) — 입력을 안 고치고(StrictMode 이중 렌더에도 라벨이 안 불어남), 후보 항이 이긴다.
import { describe, expect, it } from "vitest";
import { unionMarkPoints } from "../minuteOverlays.js";
import { resolveChartWalk } from "../../lib/chartHooks.js";

describe("unionMarkPoints", () => {
    const mk = (l: { time: number; hms: string; text: string }) => ({ time: l.time, hms: l.hms, label: `라벨: ${l.text}` });
    const auto = [{ time: 200, hms: "09:20:00", label: "조건 · 30억" }, { time: 100, hms: "09:10:00", label: "조건" }];

    it("시간 오름차순 합집합 — 같은 분이면 후보 항에 라벨 이름이 덧붙는다", () => {
        const out = unionMarkPoints(auto, [{ time: 200, hms: "09:20:00", text: "돌파A" }, { time: 300, hms: "09:30:00", text: "돌파B" }], mk);
        expect(out.map((x) => [x.time, x.label])).toEqual([
            [100, "조건"],
            [200, "조건 · 30억 · 라벨: 돌파A"],
            [300, "라벨: 돌파B"],
        ]);
    });

    it("입력을 고치지 않는다 — 두 번 불러도 라벨이 안 불어난다(StrictMode 이중 렌더·재배정)", () => {
        const labels = [{ time: 200, hms: "09:20:00", text: "돌파A" }];
        unionMarkPoints(auto, labels, mk);
        const again = unionMarkPoints(auto, labels, mk);
        expect(auto[0]!.label).toBe("조건 · 30억");
        expect(again.find((x) => x.time === 200)!.label).toBe("조건 · 30억 · 라벨: 돌파A");
    });
});

describe("resolveChartWalk — 게시가 (종목,날짜)와 맞을 때만, 아니면 라벨 폴백", () => {
    const fb = ["09:00:00"];
    it("일치 = 게시 목록 · 불일치(다른 종목·날짜·게시 없음) = 폴백", () => {
        const pub = { code: "A", date: "2026-09-23", times: ["09:00:00", "09:01:00"] };
        expect(resolveChartWalk(pub, "A", "2026-09-23", fb)).toBe(pub.times);
        expect(resolveChartWalk(pub, "B", "2026-09-23", fb)).toBe(fb);
        expect(resolveChartWalk(pub, "A", "2026-09-24", fb)).toBe(fb);
        expect(resolveChartWalk(null, "A", "2026-09-23", fb)).toBe(fb);
    });
});
