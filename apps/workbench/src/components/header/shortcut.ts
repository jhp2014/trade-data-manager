// 단축키 1~5 의 착지 — keymap 의 숫자 커맨드가 활성 패널 id 를 들고 여기로 온다(dock 은 keymap 이
// 읽는다 — 이 폴더는 dock 을 모른다). "배정 대기 중이면 배정, 아니면 호출"을 **숫자 커맨드 하나가**
// 가른다: 배정용 keydown 리스너를 따로 두면 같은 키를 두 곳이 듣게 된다(keymap registry 등록 규칙).
import { useHeaderLedger, typeKeyOf } from "./ledger.js";
import { useHeaderNotice } from "./notice.js";
import { useHeaderRegistry } from "./registry.js";
import { invokeControl } from "./invoke.js";
import type { SlotDigit } from "./spec.js";

export function pressSlot(panelId: string | undefined, digit: SlotDigit): void {
    const reg = useHeaderRegistry.getState();

    // 배정 대기가 있으면 이 숫자는 **무조건 배정으로 소비**하고 끝낸다 — 활성 패널과 무관하게 대기가 든
    // 장부(typeKey)에 적는다. 대기를 버리고 아래로 흐르면 그 숫자에 배정된 딴 판의 컨트롤이 실행된다
    // (배지를 누른 판이 비활성 그룹일 수 있다 — 리뷰가 잡은 자리).
    const pending = reg.pendingAssign;
    if (pending !== null) {
        reg.setPendingAssign(null);
        useHeaderLedger.getState().assignKey(pending.typeKey, digit, pending.controlId);
        const name = reg.byPanel[pending.panelId]?.decl.controls.find((c) => c.id === pending.controlId)?.name ?? pending.controlId;
        useHeaderNotice.getState().flash(pending.panelId, `${digit} = ${name}`);
        return;
    }

    if (panelId === undefined) return;
    const typeKey = typeKeyOf(panelId);
    const controlId = useHeaderLedger.getState().keys[typeKey]?.[String(digit)];
    if (controlId === undefined) return;
    const spec = reg.byPanel[panelId]?.decl.controls.find((c) => c.id === controlId);
    if (spec === undefined || spec.available === false) return;

    const out = invokeControl(spec);
    if (out.kind === "done") useHeaderNotice.getState().flash(panelId, out.notice);
    else if (out.kind === "popover") reg.requestPopover(panelId, controlId);
}
