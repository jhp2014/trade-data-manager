// 라벨 [탐색] 순수부 — 정렬 3층 · 칸(직접 ● / 하위 경유 ○, ▣ 도 타점 줄에) · 「타점 없음」 줄 · 범위 · 순회.
import { describe, expect, it } from "vitest";
import type { Group } from "../../../api/groups.js";
import {
    labelChartsOf, navOrderOf, noPointCellOf, parseLabelCols, pointCellOf, renameInLabelCols,
    shownRowsOf, stepFrom, stockCellOf, type LabelCol, type LabelRow,
} from "../labelRows.js";

const g = (name: string, parentName: string | null = null): Group => ({ name, parentName }) as Group;
const dict = new Map([g("돌파"), g("돌파:VI", "돌파"), g("눌림"), g("주도"), g("주도:대장", "주도")].map((x) => [x.name, x]));

const day = (stockCode: string, date: string, ...groupNames: string[]) => ({ stockCode, date, groupNames });
const pt = (stockCode: string, date: string, time: string, ...groupNames: string[]) => ({ stockCode, date, time, groupNames });

const memberships = [day("A", "2026-09-25", "주도:대장"), day("C", "2026-09-25", "주도")];
const points = [
    pt("A", "2026-09-25", "10:41:00", "눌림"),
    pt("A", "2026-09-25", "09:12:00", "돌파"),
    pt("B", "2026-09-24", "09:04:00", "돌파:VI"),
    pt("B", "2026-09-24", "11:20:00", "눌림"),
];
const charts = labelChartsOf(memberships, points, dict);

const P = (name: string): LabelCol => ({ name, scope: "point" });
const D = (name: string): LabelCol => ({ name, scope: "day" });

const shape = (rows: readonly LabelRow[]): string[] => rows.map((r) =>
    r.kind === "date" ? r.date : r.kind === "stock" ? `  ${r.chart.code}` : r.kind === "nopoint" ? "    타점 없음" : `    ${r.point.time.slice(0, 5)}`);

describe("labelChartsOf — 정렬 3층", () => {
    it("날짜 내림 · 종목 코드 오름 · 시각 오름, 하루 라벨만 있는 차트는 「타점 없음」 줄로 선다", () => {
        expect(shape(shownRowsOf(charts, [], "all"))).toEqual([
            "2026-09-25", "  A", "    09:12", "    10:41", "  C", "    타점 없음",
            "2026-09-24", "  B", "    09:04", "    11:20",
        ]);
    });

    it("지워진 그룹은 사전이 왔을 때만 떨어진다 — 빈 사전이면 모름이라 그대로 선다", () => {
        const gone = [pt("Z", "2026-09-26", "09:00:00", "지워짐")];
        expect(labelChartsOf([], gone, dict)).toEqual([]);
        expect(labelChartsOf([], gone, new Map())).toHaveLength(1);
    });
});

describe("칸 상태 — 직접 ● / 하위 경유 ○", () => {
    const [a, c] = charts; // 09-25 의 A, C
    it("▣ 열: 그날 타점 줄에 다른 라벨과 똑같이 — 직접 ● / 하위 경유 ○(하루인지는 범례가 말한다)", () => {
        expect(stockCellOf(c!, D("주도"))).toBe("direct");
        expect(stockCellOf(a!, D("주도"))).toBe("inherited"); // 주도:대장 경유
        expect(pointCellOf(a!, a!.points[0]!, D("주도:대장"))).toBe("direct");
        expect(pointCellOf(a!, a!.points[0]!, D("주도"))).toBe("inherited");
        expect(pointCellOf(a!, a!.points[0]!, D("눌림"))).toBe("none");
    });

    it("◆ 열: 타점 줄 = 직접 ● / 하위 경유 ○, 종목 머리줄은 해당 없음", () => {
        const b = charts.find((x) => x.code === "B")!;
        expect(pointCellOf(b, b.points[0]!, P("돌파"))).toBe("inherited"); // 돌파:VI 경유
        expect(pointCellOf(b, b.points[0]!, P("돌파:VI"))).toBe("direct");
        expect(stockCellOf(b, P("돌파"))).toBe("na");
    });
});

describe("shownRowsOf — 행 범위", () => {
    it("고른 라벨: 고른 열 중 하나라도 ●/○ 인 타점만, 머리줄은 자식이 있을 때", () => {
        expect(shape(shownRowsOf(charts, [P("돌파")], "cols"))).toEqual(["2026-09-25", "  A", "    09:12", "2026-09-24", "  B", "    09:04"]);
    });

    it("▣ 열이 차트에 걸리면 머리줄이 서고 그날 타점은 상속으로 전부 선다", () => {
        expect(shape(shownRowsOf(charts, [D("주도")], "cols"))).toEqual(["2026-09-25", "  A", "    09:12", "    10:41", "  C", "    타점 없음"]);
    });

    it("열이 0개면 「고른 라벨」은 비고, 「모든 라벨」은 전부", () => {
        expect(shownRowsOf(charts, [], "cols")).toEqual([]);
        expect(shownRowsOf(charts, [], "all")).toHaveLength(10);
    });

    it("좁히기는 범위와 무관하게 그 열 하나로", () => {
        expect(shape(shownRowsOf(charts, [P("돌파"), P("눌림")], "all", P("눌림")))).toEqual(["2026-09-25", "  A", "    10:41", "2026-09-24", "  B", "    11:20"]);
    });
});

describe("「타점 없음」 줄의 칸", () => {
    it("▣ 는 직접 ● / 하위 경유 ○ · ◆ 는 늘 ·(그 차트엔 타점 라벨이 없다)", () => {
        const c = charts.find((x) => x.code === "C")!;
        expect(noPointCellOf(c, D("주도"))).toBe("direct");
        expect(noPointCellOf(c, P("돌파"))).toBe("none");
        const a = charts.find((x) => x.code === "A")!;
        expect(noPointCellOf(a, D("주도"))).toBe("inherited");
    });
});

describe("순회 — 렌더 순서 그대로, 날짜 경계 없음", () => {
    const order = navOrderOf(shownRowsOf(charts, [], "all"));

    it("타점과 「타점 없음」 줄만 밟는다(「타점 없음」 = 시각 없음)", () => {
        expect(order.map((k) => `${k.date.slice(5)} ${k.code} ${k.time?.slice(0, 5) ?? "▣"}`)).toEqual([
            "09-25 A 09:12", "09-25 A 10:41", "09-25 C ▣", "09-24 B 09:04", "09-24 B 11:20",
        ]);
    });

    it("「타점 없음」 커서(time null)에서 다음 날짜로 넘어간다", () => {
        expect(stepFrom(order, { code: "C", date: "2026-09-25", time: null }, 1)).toEqual({ kind: "move", to: order[3] });
    });

    it("커서가 목록에 없으면 정렬상 끼어들 자리의 이웃으로", () => {
        // A 10:00 은 라벨이 아니다 — 09:12 와 10:41 사이
        expect(stepFrom(order, { code: "A", date: "2026-09-25", time: "10:00:00" }, 1)).toEqual({ kind: "move", to: order[1] });
        expect(stepFrom(order, { code: "A", date: "2026-09-25", time: "10:00:00" }, -1)).toEqual({ kind: "move", to: order[0] });
    });

    it("끝은 boundary(넘기지 않는다) · 커서 없음 = 방향의 첫 칸", () => {
        expect(stepFrom(order, { code: "B", date: "2026-09-24", time: "11:20:00" }, 1)).toEqual({ kind: "boundary" });
        expect(stepFrom(order, null, -1)).toEqual({ kind: "move", to: order[4] });
    });
});

describe("저장물", () => {
    it("개명 승계 — 바뀔 게 없으면 같은 배열", () => {
        const cols = [P("돌파"), D("주도")];
        expect(renameInLabelCols(cols, "돌파", "돌파2")).toEqual([P("돌파2"), D("주도")]);
        expect(renameInLabelCols(cols, "없음", "x")).toBe(cols);
    });

    it("모양이 틀린 칸은 버린다", () => {
        expect(parseLabelCols([P("a"), { name: "b", scope: "x" }, null, "c"])).toEqual([P("a")]);
        expect(parseLabelCols("nope")).toEqual([]);
    });
});
