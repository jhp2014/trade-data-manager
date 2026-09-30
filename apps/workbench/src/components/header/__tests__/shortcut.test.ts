// 단축키 착지(pressSlot)와 등록부(withdraw 토큰)의 상태 규칙 — 새 층에서 가장 위험한 두 규칙을 잠근다.
//   · 배정 대기가 있으면 숫자는 **무조건 배정으로 소비**되고 끝난다 — 활성 패널이 달라도
//     대기가 든 장부(typeKey)에 적히지, 그 숫자에 배정된 딴 판의 컨트롤이 실행되지 않는다.
//   · withdraw 는 내 토큰일 때만 거둔다 — 리마운트 겹침(새 publish → 옛 cleanup)이 새 선언을 못 지운다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHeaderLedger } from "../ledger.js";
import { useHeaderNotice } from "../notice.js";
import { useHeaderRegistry } from "../registry.js";
import { pressSlot } from "../shortcut.js";
import type { ControlSpec, HeaderDecl } from "../spec.js";

const toggle = (id: string, set: (on: boolean) => void = () => {}): ControlSpec =>
    ({ kind: "toggle", id, name: `이름-${id}`, on: false, set });
const decl = (...controls: ControlSpec[]): HeaderDecl => ({ info: [], controls });
const reg = (panelId: string, d: HeaderDecl): void => useHeaderRegistry.getState().publish(panelId, d, {});

beforeEach(() => {
    // node 환경(순수 테스트)이라 localStorage 가 없다 — 영속은 persist 의 try/catch 가 조용히 삼키고,
    // 상태 격리는 store setState 리셋으로 충분하다.
    useHeaderRegistry.setState({ byPanel: {}, pendingPopover: null, pendingAssign: null });
    useHeaderLedger.setState({ layout: {}, keys: {} });
    useHeaderNotice.setState({ byPanel: {} });
});

describe("pressSlot — 배정 대기 소비", () => {
    it("대기가 있으면 무조건 배정이고 끝 — 활성 패널이 달라도 대기의 장부에 적힌다", () => {
        const otherSet = vi.fn();
        reg("aaa-1", decl(toggle("c1")));
        reg("bbb-1", decl(toggle("x", otherSet)));
        // 딴 판(bbb)의 숫자 2 에 이미 배정이 있다 — 대기를 버리고 흘러내리면 이게 실행된다(옛 버그).
        useHeaderLedger.getState().assignKey("bbb", 2, "x");
        useHeaderRegistry.getState().setPendingAssign({ panelId: "aaa-1", typeKey: "aaa", controlId: "c1" });

        pressSlot("bbb-1", 2); // 활성 패널은 bbb-1

        expect(useHeaderLedger.getState().keys["aaa"]).toEqual({ "2": "c1" });
        expect(useHeaderRegistry.getState().pendingAssign).toBeNull();
        expect(otherSet, "딴 판의 컨트롤이 실행되면 안 된다").not.toHaveBeenCalled();
        expect(useHeaderNotice.getState().byPanel["aaa-1"]?.text, "피드백은 배지를 누른 판에").toBe("2 = 이름-c1");
    });

    it("같은 컨트롤·같은 숫자 재배정 = 해제(assignDigit 규칙이 그대로 탄다)", () => {
        reg("aaa-1", decl(toggle("c1")));
        useHeaderLedger.getState().assignKey("aaa", 1, "c1");
        useHeaderRegistry.getState().setPendingAssign({ panelId: "aaa-1", typeKey: "aaa", controlId: "c1" });
        pressSlot("aaa-1", 1);
        expect(useHeaderLedger.getState().keys["aaa"]).toBeUndefined();
    });
});

describe("pressSlot — 호출", () => {
    it("실행형: 장부의 컨트롤을 실행하고 피드백을 그 판에 남긴다", () => {
        const set = vi.fn();
        reg("aaa-1", decl(toggle("c1", set)));
        useHeaderLedger.getState().assignKey("aaa", 1, "c1");
        pressSlot("aaa-1", 1);
        expect(set).toHaveBeenCalledWith(true);
        expect(useHeaderNotice.getState().byPanel["aaa-1"]?.text).toBe("이름-c1 켬");
    });

    it("판형: pendingPopover 요청이 선다(실행 없음)", () => {
        reg("aaa-1", decl({ kind: "popover", id: "p1", name: "판", renderPopover: () => null }));
        useHeaderLedger.getState().assignKey("aaa", 3, "p1");
        pressSlot("aaa-1", 3);
        expect(useHeaderRegistry.getState().pendingPopover).toMatchObject({ panelId: "aaa-1", controlId: "p1" });
    });

    it("무동작 셋 — 배정 없음 · 선언에 없는 id · available:false", () => {
        const set = vi.fn();
        reg("aaa-1", decl({ ...toggle("c1", set), available: false } as ControlSpec));
        pressSlot("aaa-1", 1); // 배정 없음
        useHeaderLedger.getState().assignKey("aaa", 1, "ghost");
        pressSlot("aaa-1", 1); // 선언에 없는 id
        useHeaderLedger.getState().assignKey("aaa", 2, "c1");
        pressSlot("aaa-1", 2); // available:false
        expect(set).not.toHaveBeenCalled();
        expect(useHeaderNotice.getState().byPanel["aaa-1"]).toBeUndefined();
    });
});

describe("registry.withdraw — 내 토큰일 때만 거둔다", () => {
    it("리마운트 겹침(새 publish → 옛 cleanup)이 새 선언을 못 지운다", () => {
        const t1 = {};
        const t2 = {};
        const d2 = decl(toggle("c2"));
        useHeaderRegistry.getState().publish("aaa-1", decl(toggle("c1")), t1);
        useHeaderRegistry.getState().publish("aaa-1", d2, t2);
        useHeaderRegistry.getState().withdraw("aaa-1", t1); // 옛 마운트의 cleanup
        expect(useHeaderRegistry.getState().byPanel["aaa-1"]?.decl).toBe(d2);
        useHeaderRegistry.getState().withdraw("aaa-1", t2);
        expect(useHeaderRegistry.getState().byPanel["aaa-1"]).toBeUndefined();
    });
});
