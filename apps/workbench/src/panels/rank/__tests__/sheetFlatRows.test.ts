import { describe, it, expect } from "vitest";
import { flatIndexOfRow, flattenSheetGroups, stepFlatRow } from "../sheetFlatRows.js";
import type { SheetRow } from "../rankSheet.js";
import type { SheetGroup } from "../sheetSort.js";

const row = (code: string, date = "2026-07-01", time?: string): SheetRow => ({ stockCode: code, date, time, cells: {} });
const grp = (id: string, label: string | null, rows: SheetRow[]): SheetGroup => ({ id, label, rows });

describe("flattenSheetGroups", () => {
    it("머리 다음에 그 그룹 행들이 순서대로 — 그룹 순회 순서를 그대로 편다.", () => {
        const flat = flattenSheetGroups([
            grp("v2026-07-01", "2026.07.01", [row("A", "2026-07-01", "10:00:00"), row("B", "2026-07-01", "11:00:00")]),
            grp("v2026-07-02", "2026.07.02", [row("C", "2026-07-02", "09:30:00")]),
        ]);
        expect(flat.map((f) => f.kind)).toEqual(["group", "row", "row", "group", "row"]);
        expect(flat.filter((f) => f.kind === "row").map((f) => (f as { row: SheetRow }).row.stockCode)).toEqual(["A", "B", "C"]);
    });

    it("통짜 그룹(label=null)은 머리를 안 만든다 — 그룹이 안 걸린 정렬에 빈 줄이 서면 안 된다.", () => {
        const flat = flattenSheetGroups([grp("all", null, [row("A"), row("B")])]);
        expect(flat.map((f) => f.kind)).toEqual(["row", "row"]);
    });

    it("머리 줄은 라벨과 행 수를 싣는다 — 뷰가 그룹 객체를 다시 안 봐도 되게.", () => {
        const flat = flattenSheetGroups([grp("v상승", "상승", [row("A"), row("B"), row("C")])]);
        expect(flat[0]).toMatchObject({ kind: "group", key: "g-v상승", label: "상승", count: 3 });
    });

    it("키가 유일하다 — 머리(g-)와 행 키가 한 배열에 섞여도 안 부딪힌다.", () => {
        const flat = flattenSheetGroups([
            grp("v1", "하나", [row("A", "2026-07-01", "10:00:00"), row("A", "2026-07-01", "11:00:00")]),
            grp("v2", "둘", [row("A", "2026-07-02")]), // day 행(시각 없음)
        ]);
        expect(new Set(flat.map((f) => f.key)).size).toBe(flat.length);
    });

    it("빈 목록 → 빈 배열.", () => {
        expect(flattenSheetGroups([])).toEqual([]);
    });
});

describe("flatIndexOfRow", () => {
    it("행 줄만 찾는다 — 머리 줄은 후보가 아니다.", () => {
        const flat = flattenSheetGroups([grp("v1", "하나", [row("A", "2026-07-01", "10:00:00"), row("B", "2026-07-01", "11:00:00")])]);
        const bKey = flat[2].key;
        expect(flatIndexOfRow(flat, bKey)).toBe(2);
        expect(flatIndexOfRow(flat, "g-v1")).toBe(-1); // 머리 키로는 안 잡힌다
    });

    it("없는 키는 -1 — 필터로 행이 빠진 상태(따라가기가 조용히 아무것도 안 해야 한다).", () => {
        const flat = flattenSheetGroups([grp("all", null, [row("A", "2026-07-01", "10:00:00")])]);
        expect(flatIndexOfRow(flat, "없는키")).toBe(-1);
    });
});

describe("stepFlatRow", () => {
    const flat = flattenSheetGroups([
        grp("v1", "하나", [row("A", "2026-07-01", "10:00:00"), row("B", "2026-07-01", "11:00:00")]),
        grp("v2", "둘", [row("C", "2026-07-02", "09:30:00")]),
    ]);
    const keyAt = (i: number): string => flat[i].key;

    it("그룹 머리를 건너뛴다 — 그룹 경계에서도 다음 행으로 바로 간다.", () => {
        expect(stepFlatRow(flat, keyAt(2), 1)?.stockCode).toBe("C"); // B → (머리 건너) C
        expect(stepFlatRow(flat, keyAt(4), -1)?.stockCode).toBe("B");
    });

    it("커서가 없으면 방향의 끝에서 시작 — 아래=첫 행, 위=마지막 행.", () => {
        expect(stepFlatRow(flat, null, 1)?.stockCode).toBe("A");
        expect(stepFlatRow(flat, null, -1)?.stockCode).toBe("C");
    });

    it("커서가 목록 밖(필터로 빠짐)이어도 같은 규칙.", () => {
        expect(stepFlatRow(flat, "없는키", 1)?.stockCode).toBe("A");
        expect(stepFlatRow(flat, "없는키", -1)?.stockCode).toBe("C");
    });

    it("양 끝에서는 클램프 — 랩 없음(작업셋 순회와 같은 손맛).", () => {
        expect(stepFlatRow(flat, keyAt(1), -1)?.stockCode).toBe("A");
        expect(stepFlatRow(flat, keyAt(4), 1)?.stockCode).toBe("C");
    });

    it("day 행(시각 없는 2조각 키)도 같은 규칙으로 걷는다.", () => {
        const days = flattenSheetGroups([grp("all", null, [row("A", "2026-07-01"), row("B", "2026-07-02")])]);
        expect(stepFlatRow(days, days[0].key, 1)).toMatchObject({ stockCode: "B", time: undefined });
    });

    it("행이 없으면 null — 필터가 다 좁힌 시트에서 키를 눌러도 조용하다.", () => {
        expect(stepFlatRow([], null, 1)).toBeNull();
        expect(stepFlatRow(flattenSheetGroups([grp("v1", "빈그룹", [])]), null, 1)).toBeNull();
    });
});
