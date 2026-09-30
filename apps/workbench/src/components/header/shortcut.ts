// 단축키 1~5 의 착지 — keymap 의 숫자 커맨드가 활성 패널 id 를 들고 여기로 온다(dock 은 keymap 이
// 읽는다 — 이 폴더는 dock 을 모른다). "배정 대기 중이면 배정, 아니면 호출"을 **숫자 커맨드 하나가**
// 가른다: 배정용 keydown 리스너를 따로 두면 같은 키를 두 곳이 듣게 된다(keymap registry 등록 규칙).
import { useHeaderLedger, typeKeyOf } from "./ledger.js";
import { useHeaderNotice } from "./notice.js";
import { useHeaderRegistry } from "./registry.js";
import { invokeControl } from "./invoke.js";
import type { SlotDigit } from "./spec.js";

export function pressSlot(panelId: string | undefined, digit: SlotDigit): void {
    if (panelId === undefined) return;
    const reg = useHeaderRegistry.getState();
    const typeKey = typeKeyOf(panelId);

    const pending = reg.pendingAssign;
    if (pending !== null) {
        reg.setPendingAssign(null);
        // 다른 패널로 시선이 옮겨간 채 남은 대기는 소비하지 않고 버린다 — 엉뚱한 종류의 장부에 적히지 않게.
        if (pending.typeKey === typeKey) {
            useHeaderLedger.getState().assignKey(typeKey, digit, pending.controlId);
            const name = reg.byPanel[panelId]?.decl.controls.find((c) => c.id === pending.controlId)?.name ?? pending.controlId;
            useHeaderNotice.getState().flash(panelId, `${digit} = ${name}`);
            return;
        }
    }

    const controlId = useHeaderLedger.getState().keys[typeKey]?.[String(digit)];
    if (controlId === undefined) return;
    const spec = reg.byPanel[panelId]?.decl.controls.find((c) => c.id === controlId);
    if (spec === undefined || spec.available === false) return;

    const out = invokeControl(spec);
    if (out.kind === "done") useHeaderNotice.getState().flash(panelId, out.notice);
    else if (out.kind === "popover") reg.requestPopover(panelId, controlId);
}
