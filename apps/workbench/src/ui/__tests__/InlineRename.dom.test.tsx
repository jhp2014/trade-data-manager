import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { InlineRename } from "../InlineRename.js";

// Esc 취소가 blur 커밋에 먹히던 함정 — 부모가 onCancel 에서 input 을 언마운트해도(포커스 제거 → blur)
// 커밋이 나가면 안 된다. 집합 이름변경에서 실제로 났던 사고(팝오버 Esc 리스너가 판을 닫으며 input 소멸).
function Host({ onCommit, onCancel }: { onCommit: (n: string) => void; onCancel: () => void }): JSX.Element {
    const [editing, setEditing] = useState(true);
    return editing
        ? <InlineRename initial="옛이름" onCommit={(n) => { onCommit(n); setEditing(false); }} onCancel={() => { onCancel(); setEditing(false); }} />
        : <span>닫힘</span>;
}

describe("InlineRename", () => {
    it("Esc = 취소 — 수정본이 있어도 onCommit 이 나가지 않는다", () => {
        const onCommit = vi.fn(); const onCancel = vi.fn();
        render(<Host onCommit={onCommit} onCancel={onCancel} />);
        const input = screen.getByDisplayValue("옛이름");
        fireEvent.change(input, { target: { value: "새이름" } });
        fireEvent.keyDown(input, { key: "Escape" });
        fireEvent.blur(input); // 브라우저가 언마운트/blur 유도 시 쏘는 것
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onCommit).not.toHaveBeenCalled();
        expect(screen.getByText("닫힘")).toBeTruthy();
    });

    it("Enter = 확정(trim) · 포커스 이탈 = 확정", () => {
        const onCommit = vi.fn(); const onCancel = vi.fn();
        render(<Host onCommit={onCommit} onCancel={onCancel} />);
        const input = screen.getByDisplayValue("옛이름");
        fireEvent.change(input, { target: { value: "  새이름 " } });
        fireEvent.keyDown(input, { key: "Enter" });
        fireEvent.blur(input);
        expect(onCommit).toHaveBeenCalledWith("새이름");
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("Esc 는 전파를 끊는다 — 편집 취소가 바깥 팝오버 닫기로 번지지 않는다", () => {
        const outer = vi.fn();
        document.addEventListener("keydown", outer);
        render(<Host onCommit={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.keyDown(screen.getByDisplayValue("옛이름"), { key: "Escape" });
        document.removeEventListener("keydown", outer);
        expect(outer).not.toHaveBeenCalled();
    });
});
