// w/s 순회 자리 손잡이 — 후보 판(일별·라벨 [탐색] · 테마 [복기]·[장 마감])이 컨트롤 줄에 같은 선언을 얹는다.
// 순환 한 손잡이(규약 ③ 택1은 순환): 참여 → 걷는 중 → 빠짐 → 참여. 참여에서 한 번 = 이 판을 걷기(가장 잦은 손),
// 걷는 중에서 한 번 = 빼기(다음 참여 판으로 넘어간다). 지금 상태는 탭 칩이 늘 말하므로 접혀 있어도 된다.
import { useMemo } from "react";
import { setRowNavRole, useRowNavRole, type RowNavOwner, type RowNavRole } from "../lib/rowNav.js";
import type { ChoiceSpec } from "./HeaderControls.js";

const VALUES: ChoiceSpec["values"] = [
    { v: "join", label: "w/s 참여" },
    { v: "walk", label: "w/s 걷는 중", color: "var(--walk)" },
    { v: "out", label: "w/s 빠짐" },
];

/** `owner: null` = 이 판은 후보가 아니다(보드 공용 머리가 실시간 보드에 쓰일 때) → `available: false`. */
export function useRowNavControl(owner: RowNavOwner | null): ChoiceSpec {
    const role = useRowNavRole(owner);
    return useMemo<ChoiceSpec>(() => ({
        kind: "choice", id: "rowNav", name: "w/s 순회", available: owner !== null,
        help: "걷는 중 = w/s 가 이 판을 걷는다 · 참여 = q 순환에 선다 · 빠짐 = 순환에서 뺀다(지금 상태는 탭의 w/s 칩)",
        values: VALUES, value: role ?? "join", set: (v) => { if (owner !== null) setRowNavRole(owner, v as RowNavRole); },
    }), [owner, role]);
}
