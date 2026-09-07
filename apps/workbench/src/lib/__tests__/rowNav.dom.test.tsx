// 행 순회(w/s)의 **소유권**과 그 불변식.
//
// ⚠ 이 파일의 존재 이유는 마지막 테스트다: `resolveCommand` 가 등록 순 첫 매치라, 같은 키를 두 곳이
//   등록하는 상태가 한 순간이라도 생기면 승자가 마운트 순서에 매인다. 등록 지점을 App 하나로 모은 게
//   그 처방이므로, "어느 전이에서도 w/s 커맨드는 정확히 한 벌"을 기계가 지키게 한다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDock } from "../../store/dock.js";
import { useKeymapDynamic } from "../../keymap/dynamic.js";
import { RANK_SHEET_PANEL_ID } from "../../panels/rank/rankSheetPanelIds.js";
import { usePublishRowNav, useRowNavHotkeys, ownerOf } from "../rowNav.js";

const OTHER = "workset-1";
const setOpen = (ids: string[] | null): void => act(() => useDock.setState({ openPanelIds: ids }));
const cmdsFor = (key: string): unknown[] => Object.values(useKeymapDynamic.getState().commands).filter((c) => c.keys === key);
const press = (key: "w" | "s"): void => {
    const cmd = Object.values(useKeymapDynamic.getState().commands).find((c) => c.keys === key);
    act(() => cmd?.run?.(new KeyboardEvent("keydown")));
};

beforeEach(() => { useDock.setState({ openPanelIds: null }); useKeymapDynamic.setState({ commands: {} }); });
afterEach(() => { useDock.setState({ openPanelIds: null }); useKeymapDynamic.setState({ commands: {} }); });

describe("ownerOf", () => {
    it("시트가 배치에 있으면 시트, 없으면 작업셋. dock 미준비(null)도 작업셋(옛 동작).", () => {
        expect(ownerOf([OTHER, RANK_SHEET_PANEL_ID])).toBe("rank-sheet");
        expect(ownerOf([OTHER])).toBe("workset");
        expect(ownerOf(null)).toBe("workset");
    });
});

describe("행 순회 소유권", () => {
    it("시트가 열려 있으면 시트 프로바이더가, 닫으면 작업셋이 걷는다.", () => {
        const seen: string[] = [];
        renderHook(() => {
            useRowNavHotkeys();
            usePublishRowNav("rank-sheet").current = (d) => seen.push(`sheet${d}`);
            usePublishRowNav("workset").current = (d) => seen.push(`workset${d}`);
        });

        setOpen([OTHER, RANK_SHEET_PANEL_ID]);
        press("s");
        press("w");
        expect(seen).toEqual(["sheet1", "sheet-1"]);

        setOpen([OTHER]); // 시트 닫힘 → 폴백
        press("s");
        expect(seen).toEqual(["sheet1", "sheet-1", "workset1"]);
    });

    it("시트가 열려 있어도 시트 프로바이더가 없으면 작업셋으로 흘린다(배경 탭 언마운트 대비).", () => {
        const seen: string[] = [];
        renderHook(() => {
            useRowNavHotkeys();
            usePublishRowNav("workset").current = (d) => seen.push(`workset${d}`);
        });
        setOpen([OTHER, RANK_SHEET_PANEL_ID]);
        press("s");
        expect(seen).toEqual(["workset1"]);
    });

    it("아무도 안 얹었으면 조용하다 — 키가 죽을 뿐 던지지 않는다.", () => {
        renderHook(() => useRowNavHotkeys());
        setOpen([RANK_SHEET_PANEL_ID]);
        expect(() => press("s")).not.toThrow();
    });

    it("도움말 문구는 소유자를 따른다 — 시트가 있으면 '행(시트)'.", () => {
        renderHook(() => useRowNavHotkeys());
        setOpen([OTHER]);
        expect(useKeymapDynamic.getState().commands["nav.row.next"].title).toContain("작업셋");
        setOpen([OTHER, RANK_SHEET_PANEL_ID]);
        expect(useKeymapDynamic.getState().commands["nav.row.next"].title).toContain("시트");
    });

    it("얹은 순서가 뒤집혀도 새 프로바이더를 안 지운다 — 리마운트(새 publish → 옛 cleanup) 대비.", () => {
        const seen: string[] = [];
        renderHook(() => useRowNavHotkeys());
        setOpen([RANK_SHEET_PANEL_ID]);
        const first = renderHook(() => { usePublishRowNav("rank-sheet").current = () => seen.push("old"); });
        renderHook(() => { usePublishRowNav("rank-sheet").current = () => seen.push("new"); }); // 새 것이 먼저 얹히고
        first.unmount(); // 옛 것이 나중에 거둔다
        press("s");
        expect(seen).toEqual(["new"]);
    });

    it("**어느 전이에서도 w/s 는 정확히 한 벌** — 등록 지점이 하나라는 사실의 기계적 보증.", () => {
        const { unmount } = renderHook(() => useRowNavHotkeys());
        const check = (): void => { expect(cmdsFor("w")).toHaveLength(1); expect(cmdsFor("s")).toHaveLength(1); };
        check();
        for (const ids of [[OTHER, RANK_SHEET_PANEL_ID], [OTHER], [], [RANK_SHEET_PANEL_ID], null]) { setOpen(ids); check(); }
        unmount();
        expect(cmdsFor("w")).toHaveLength(0);
    });
});
