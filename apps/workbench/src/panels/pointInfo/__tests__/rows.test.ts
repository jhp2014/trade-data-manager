import { describe, it, expect } from "vitest";
import type { SimResult } from "@trade-data-manager/market/domain";
import type { AxisRef } from "../../../lib/computedAxis.js";
import type { AxisPlacement } from "../../../lib/rankIndex.js";
import type { OutcomeRecord } from "../../../lib/useOutcomes.js";
import type { ThemeZoneVerdict as ThemeVerdict } from "@trade-data-manager/market/domain";
import { pointInfoRows, slotOf, type PointInfoSources } from "../rows.js";

const axis = (key: string, name = key): AxisRef => ({ key, name, scope: "point" });
const placed = (axisKey: string, rank: number, total: number): AxisPlacement => ({
    axisKey, axisName: axisKey, cell: { rank, total, frac: 0.5, orderKey: 1 },
});

const rec = (over: Partial<OutcomeRecord["slice"]> = {}, evalOver: OutcomeRecord["eval"] = {}): OutcomeRecord => ({
    slice: {
        status: "exceeded", extHighMin: 0, extHighPrice: 0, extPct: 8.4,
        lowMin: 1, lowPrice: 1, dropFromHighPct: -3.1, dropFromClosePct: -1.2, recovered: true, ...over,
    },
    eval: { extHigh: 8.4, dropFromHigh: -3.1, dropFromClose: -1.2, ...evalOver },
});

const sim = (over: Partial<SimResult> = {}): SimResult => ({
    status: "take", entryPrice: 1000, entryMin: 1, peakPct: 5.2, troughPct: -1.1,
    requiredPct: -1.2, missedRisePct: null, ...over,
});

const src = (over: Partial<PointInfoSources> = {}): PointInfoSources => ({
    axes: [axis("c:a1", "당일%"), axis("c:a2", "시총")],
    placed: [placed("c:a1", 3, 120), placed("c:a2", 7, 120)],
    axisText: (k) => (k === "c:a1" ? "+12.3%" : "3,035억"),
    rec: rec(),
    sim: sim(),
    verdicts: null,
    ...over,
});

describe("pointInfoRows — 기본 순서와 키", () => {
    it("축 → 결과 → 테마 순서. 키 이름공간은 시트 관례(ax:·out:)를 빌리고 테마는 th:.", () => {
        const v: ThemeVerdict[] = [{ theme: "반도체", pass: true, zoneCount: 7, baseRank: 3, zoneRank: 2 }];
        const rows = pointInfoRows(src({ verdicts: v }));
        expect(rows.map((r) => r.key)).toEqual([
            "ax:c:a1", "ax:c:a2",
            "out:extHigh", "out:dropFromHigh", "out:dropFromClose", "out:status", "out:simStatus", "out:simPeak", "out:simTrough",
            "th:반도체",
        ]);
        expect(rows.map((r) => r.kind).filter((k, i, a) => a.indexOf(k) === i)).toEqual(["axis", "outcome", "theme"]);
    });

    it("짝인 값은 **줄 하나·키 하나** — 회복·요구 타점은 키 공간에 안 나타난다(순서·청소 규칙이 단순해진다).", () => {
        const rows = pointInfoRows(src());
        expect(rows.some((r) => r.key === "out:recovered")).toBe(false);
        expect(rows.some((r) => r.key === "out:simRequired")).toBe(false);
        const status = rows.find((r) => r.key === "out:status")!;
        expect(status.name).toBe("상태·회복");
        expect(status.value?.text).toBe("초과");
        expect(status.extra?.text).toBe("○");
        const s = rows.find((r) => r.key === "out:simStatus")!;
        expect(s.name).toBe("시뮬·요구 타점");
        expect(s.value?.text).toBe("익절");
        expect(s.extra?.text).toBe("-1.2%");
    });
});

describe("pointInfoRows — 값과 결손", () => {
    it("축 값은 포맷된 수치 그대로고 순위는 **툴팁에만** 남는다(줄에는 n/m 이 없다).", () => {
        const row = pointInfoRows(src())[0];
        expect(row.value?.text).toBe("+12.3%");
        expect(row.title).toBe("당일% — +12.3% · 3/120");
        expect(row.value?.text).not.toContain("/");
    });

    it("부호가 뜻을 갖는 축만 색이 붙는다 — 단위 글자(억·분)는 중립.", () => {
        const rows = pointInfoRows(src());
        expect(rows[0].value?.color).toBe("var(--rise)");
        expect(rows[1].value?.color).toBe("var(--text-primary)"); // 3,035억
        const down = pointInfoRows(src({ axisText: () => "-4.2%" }))[0];
        expect(down.value?.color).toBe("var(--fall)");
    });

    it("결손(값 없음)만 서랍으로 — 무사건(무눌림의 낙폭·회복)은 값이 있는 사실이라 본문에 선다.", () => {
        const none = rec({ status: "none", dropFromHighPct: null, recovered: null }, { dropFromHigh: undefined });
        const rows = pointInfoRows(src({ rec: none }));
        const drop = rows.find((r) => r.key === "out:dropFromHigh")!;
        expect(drop.value?.text).toBe("—");
        expect(slotOf(drop, new Set())).toBe("body"); // 결손이 아니다
        const status = rows.find((r) => r.key === "out:status")!;
        expect(status.value?.text).toBe("무눌림");
    });

    it("격자 미도착(레코드·시뮬 없음)과 값 없는 축은 '값 없음' 칸으로 간다.", () => {
        const rows = pointInfoRows(src({ rec: undefined, sim: undefined, axisText: () => undefined }));
        expect(rows.every((r) => slotOf(r, new Set()) === "missing")).toBe(true);
        expect(rows[0].title).toContain("값 없음");
    });

    it("숨김이 결손보다 세다 — 내가 치운 줄은 '값 없음'이어도 숨김 칸에 있다.", () => {
        const rows = pointInfoRows(src({ axisText: () => undefined }));
        expect(slotOf(rows[0], new Set(["ax:c:a1"]))).toBe("hidden");
    });
});

describe("pointInfoRows — 테마 줄", () => {
    const v = (over: Partial<ThemeVerdict>): ThemeVerdict => ({ theme: "반도체", pass: true, zoneCount: 7, baseRank: 3, zoneRank: 2, ...over });

    it("값 한 칸 = 존 순위 하나고 나머지 셋은 툴팁이 진다.", () => {
        const row = pointInfoRows(src({ verdicts: [v({})] })).at(-1)!;
        expect(row.value?.text).toBe("2위");
        expect(row.title).toBe("반도체 — 존 순위 2위 · 존 인원 7 · 전체 순위 3위 · 이 테마 단독 통과");
    });

    it("존 밖은 **사실**이라 본문에 선다(결손이 아니다).", () => {
        const row = pointInfoRows(src({ verdicts: [v({ zoneRank: null, pass: false })] })).at(-1)!;
        expect(row.value?.text).toBe("존 밖");
        expect(slotOf(row, new Set())).toBe("body");
    });

    it("재료가 없으면(null) 테마 줄 자체가 없다 — 없는 값을 지어내지 않는다.", () => {
        expect(pointInfoRows(src({ verdicts: null })).some((r) => r.kind === "theme")).toBe(false);
    });

    it("테마 줄은 시트에 대응 열이 없어 클릭 대상이 아니다.", () => {
        const row = pointInfoRows(src({ verdicts: [v({})] })).at(-1)!;
        expect(row.revealKey).toBeNull();
        expect(pointInfoRows(src())[0].revealKey).toBe("ax:c:a1");
    });
});
