// 화면 관리 — 되돌릴 수 없는 손짓(삭제·덮어쓰기·기본 배치)은 그 자리 확인 줄에서 한 번 더 묻는다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DockviewApi } from "dockview-react";
import { useScreens } from "../store/screens.js";
import { Dialog } from "../ui/Dialog.js";
import { ScreenManager } from "./ScreenManager.js";

const snap = { layout: {} as never, panels: {} };
const names = () => useScreens.getState().screens.map((s) => s.name);
const armed = () => act(() => new Promise((r) => setTimeout(r, 0))); // 막 연 판은 한 매크로태스크 뒤에 무장
const esc = () => act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));

let dialogClosed = 0;
function renderInDialog() {
    return render(
        <Dialog title="설정" width={600} height={400} onClose={() => dialogClosed++}>
            <ScreenManager api={{} as DockviewApi} onDone={() => {}} />
        </Dialog>,
    );
}

beforeEach(() => {
    dialogClosed = 0;
    localStorage.clear();
    useScreens.setState(useScreens.getInitialState(), true);
    useScreens.getState().add("매매", snap);
});
afterEach(cleanup);

describe("ScreenManager 확인 줄", () => {
    it("삭제 — 확인 줄에서 취소하면 그대로, 지우기를 누르면 지운다", () => {
        renderInDialog();
        fireEvent.click(screen.getByTitle("삭제"));
        expect(screen.getByRole("alertdialog", { name: "화면 「매매」을 지울까요?" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "취소" }));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(names()).toEqual(["매매"]);
        fireEvent.click(screen.getByTitle("삭제"));
        fireEvent.click(screen.getByRole("button", { name: "지우기" }));
        expect(names()).toEqual([]);
    });

    it("Esc 는 포커스가 어디 있든 확인 줄만 접는다(창은 그대로) · 하기 버튼에 포커스", async () => {
        renderInDialog();
        await armed();
        fireEvent.click(screen.getByText("기본 배치로 되돌리기"));
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "되돌리기" }));
        (document.activeElement as HTMLElement).blur(); // 포커스가 줄 밖(body)으로 빠진 경우
        await armed();
        esc();
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(screen.getByText("기본 배치로 되돌리기")).toBeTruthy();
        expect(dialogClosed).toBe(0);
        esc(); // 접을 줄이 없으면 창이 닫힌다
        expect(dialogClosed).toBe(1);
    });

    it("확인 줄 밖을 누르면 취소된다(창 안이면 창은 그대로)", async () => {
        renderInDialog();
        await armed();
        fireEvent.click(screen.getByTitle("삭제"));
        await armed();
        fireEvent.mouseDown(screen.getByText("기본 배치로 되돌리기"));
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(names()).toEqual(["매매"]);
        expect(dialogClosed).toBe(0);
    });
});
