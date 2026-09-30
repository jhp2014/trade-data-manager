// 컨트롤 호출의 뜻 — 클릭이든 단축키든 **무슨 일이 일어나는지는 kind 가 정한다**(순수 판정).
// 실행형(토글·순환·액션)은 값을 바꾸고 "바뀌었다" 한마디를 돌려주고, 판형(팝오버·긴 택1)은
// "판을 열어라"만 말한다 — 실제로 여는 것(anchor·껍데기)은 호출한 쪽(widgets·HeaderButtons)의 몫이다.
import type { ChoiceSpec, ControlSpec } from "./spec.js";

/** 순환으로 다룰 최대 값 수 — 넘으면 판(한 바퀴가 길어지면 되돌리기가 못 견딘다). widgets 와 한 벌. */
export const CYCLE_MAX = 3;

export type InvokeOutcome =
    | { kind: "none" }
    | { kind: "done"; notice: string }
    | { kind: "popover" };

/** 순환 택1의 다음 값 — 지금 값이 목록에 없으면(-1) 첫 값부터. */
export function nextChoice(spec: ChoiceSpec): ChoiceSpec["values"][number] {
    const idx = spec.values.findIndex((o) => o.v === spec.value);
    return spec.values[(idx + 1) % spec.values.length]!;
}

export function invokeControl(spec: ControlSpec): InvokeOutcome {
    if (spec.available === false) return { kind: "none" };
    switch (spec.kind) {
        case "toggle": {
            if (spec.disabled === true) return { kind: "none" };
            spec.set(!spec.on);
            return { kind: "done", notice: `${spec.label ?? spec.name} ${spec.on ? "끔" : "켬"}` };
        }
        case "choice": {
            if (spec.values.length === 0) return { kind: "none" };
            if (spec.values.length > CYCLE_MAX) return { kind: "popover" };
            const next = nextChoice(spec);
            spec.set(next.v);
            return { kind: "done", notice: `${spec.name}: ${next.label}` };
        }
        case "action": {
            if (spec.disabled === true) return { kind: "none" };
            const said = spec.run();
            // null = 조용히 — 실제로는 안 일어났고 그 이유는 다른 채널(일시 알림)이 말한다. 여기서
            // 라벨을 칩으로 띄우면 "다음 거래일로"와 "마지막 거래일입니다"가 나란히 서는 모순이 난다.
            if (said === null) return { kind: "none" };
            return { kind: "done", notice: typeof said === "string" ? said : (spec.label ?? spec.name) };
        }
        case "popover":
            return spec.disabled === true ? { kind: "none" } : { kind: "popover" };
    }
}
