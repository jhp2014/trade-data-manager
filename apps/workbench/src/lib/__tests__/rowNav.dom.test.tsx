// 행 순회(w/s)의 **소유권**과 그 불변식.
//
// ⚠ 이 파일의 존재 이유는 마지막 테스트다: `resolveCommand` 가 등록 순 첫 매치라, 같은 키를 두 곳이
//   등록하는 상태가 한 순간이라도 생기면 승자가 마운트 순서에 매인다. 등록 지점을 App 하나로 모은 게
//   그 처방이므로, "어느 전이에서도 w/s 커맨드는 정확히 한 벌"을 기계가 지키게 한다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeymapDynamic } from "../../keymap/dynamic.js";
import { usePublishRowNav, useRowNavHotkeys, effectiveOwner, nextOwner, selectRowNavOwner } from "../rowNav.js";

const cmdsFor = (key: string): unknown[] => Object.values(useKeymapDynamic.getState().commands).filter((c) => c.keys === key);
const press = (key: "w" | "s" | "q"): void => {
    const cmd = Object.values(useKeymapDynamic.getState().commands).find((c) => c.keys === key);
    act(() => cmd?.run?.(new KeyboardEvent("keydown")));
};
const titleOf = (id: string): string => useKeymapDynamic.getState().commands[id]?.title ?? "";

beforeEach(() => {
    localStorage.clear();
    useKeymapDynamic.setState({ commands: {} });
    act(() => selectRowNavOwner("rank-sheet"));
});
afterEach(() => { useKeymapDynamic.setState({ commands: {} }); });

describe("effectiveOwner", () => {
    it("고른 주인이 얹혀 있으면 그것, 아니면 우선순위 폴백. 아무도 없으면 선택 그대로.", () => {
        expect(effectiveOwner(["workset", "rank-sheet"], "workset")).toBe("workset");
        expect(effectiveOwner(["workset", "theme-board"], "rank-sheet")).toBe("workset"); // 시트 없음 → 우선순위
        expect(effectiveOwner(["theme-board"], "rank-sheet")).toBe("theme-board");
        expect(effectiveOwner([], "replay-board")).toBe("replay-board");
    });
});

describe("nextOwner(q 순환)", () => {
    it("얹혀 있는 후보만 돌고, 끝에서 처음으로 감는다.", () => {
        const avail = ["rank-sheet", "replay-board", "theme-board"] as const;
        expect(nextOwner(avail, "rank-sheet")).toBe("replay-board");
        expect(nextOwner(avail, "replay-board")).toBe("theme-board");
        expect(nextOwner(avail, "theme-board")).toBe("rank-sheet");
        expect(nextOwner(avail, "workset")).toBe("rank-sheet"); // 후보 밖이면 첫 후보로
        expect(nextOwner([], "workset")).toBe("workset"); // 후보 없음 → 제자리
    });
});

describe("행 순회 소유권", () => {
    it("고른 주인이 걷는다 — 배지(select)로 옮기면 그때부터 그쪽이 걷는다.", () => {
        const seen: string[] = [];
        renderHook(() => {
            useRowNavHotkeys();
            usePublishRowNav("rank-sheet").current = (d) => seen.push(`sheet${d}`);
            usePublishRowNav("workset").current = (d) => seen.push(`workset${d}`);
            usePublishRowNav("replay-board").current = (d) => seen.push(`replay${d}`);
        });

        press("s");
        press("w");
        expect(seen).toEqual(["sheet1", "sheet-1"]);

        act(() => selectRowNavOwner("replay-board"));
        press("s");
        expect(seen).toEqual(["sheet1", "sheet-1", "replay1"]);
    });

    it("고른 주인이 안 얹혀 있으면(배경 탭 언마운트) 우선순위로 흘린다 — 선택 자체는 안 지운다.", () => {
        const seen: string[] = [];
        act(() => selectRowNavOwner("theme-board"));
        const sheet = renderHook(() => { usePublishRowNav("rank-sheet").current = (d) => seen.push(`sheet${d}`); });
        renderHook(() => {
            useRowNavHotkeys();
            usePublishRowNav("workset").current = (d) => seen.push(`workset${d}`);
        });
        press("s");
        expect(seen).toEqual(["sheet1"]); // 테마보드 없음 → 우선순위 1등(시트)

        sheet.unmount();
        press("s");
        expect(seen).toEqual(["sheet1", "workset1"]); // 시트도 사라지면 다음 후보로
    });

    it("q 는 얹혀 있는 후보 사이만 순환한다.", () => {
        renderHook(() => {
            useRowNavHotkeys();
            usePublishRowNav("rank-sheet").current = () => {};
            usePublishRowNav("theme-board").current = () => {};
        });
        expect(titleOf("nav.row.next")).toContain("시트");
        press("q");
        expect(titleOf("nav.row.next")).toContain("테마 [장 마감]"); // 작업셋·복기는 건너뛴다
        press("q");
        expect(titleOf("nav.row.next")).toContain("시트");
    });

    it("선택은 영속된다 — 새로고침(스토어 재생성) 대신 저장 키로 확인.", () => {
        act(() => selectRowNavOwner("replay-board"));
        expect(localStorage.getItem("wb.rowNavOwner")).toBe(JSON.stringify("replay-board"));
    });

    it("아무도 안 얹었으면 조용하다 — 키가 죽을 뿐 던지지 않는다.", () => {
        renderHook(() => useRowNavHotkeys());
        expect(() => press("s")).not.toThrow();
        expect(() => press("q")).not.toThrow();
    });

    it("얹은 순서가 뒤집혀도 새 프로바이더를 안 지운다 — 리마운트(새 publish → 옛 cleanup) 대비.", () => {
        const seen: string[] = [];
        renderHook(() => useRowNavHotkeys());
        const first = renderHook(() => { usePublishRowNav("rank-sheet").current = () => seen.push("old"); });
        renderHook(() => { usePublishRowNav("rank-sheet").current = () => seen.push("new"); }); // 새 것이 먼저 얹히고
        first.unmount(); // 옛 것이 나중에 거둔다
        press("s");
        expect(seen).toEqual(["new"]);
    });

    it("**어느 전이에서도 w/s·q 는 정확히 한 벌** — 등록 지점이 하나라는 사실의 기계적 보증.", () => {
        const { unmount } = renderHook(() => useRowNavHotkeys());
        const boards = renderHook(() => {
            usePublishRowNav("replay-board").current = () => {};
            usePublishRowNav("theme-board").current = () => {};
        });
        const check = (): void => {
            for (const k of ["w", "s", "q"]) expect(cmdsFor(k)).toHaveLength(1);
        };
        check();
        press("q"); check();
        press("q"); check();
        boards.unmount(); check();
        unmount();
        expect(cmdsFor("w")).toHaveLength(0);
        expect(cmdsFor("q")).toHaveLength(0);
    });
});
