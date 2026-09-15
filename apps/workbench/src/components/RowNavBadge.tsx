import { TextToggle } from "./ControlChrome.js";
import { selectRowNavOwner, useRowNavOwner, type RowNavOwner } from "../lib/rowNav.js";

// w/s 순회 배지 — **지금 누가 걷는지**를 후보 패널 머리글에서 말하고, 클릭 한 번으로 그 자리를 가져온다.
// 컨트롤 바(HeaderControls)가 아니라 왼쪽 "말" 자리에 둔다: 켜고 끄는 취향이 아니라 **지금 상태의 표시**라
// 접힘 뒤로 숨으면 안 된다(보드의 "필터" 버튼이 컨트롤 바 밖에 있는 것과 같은 이유).
// 끄는 손은 없다 — 소유자는 항상 정확히 하나이고, 옮기는 건 다른 후보를 켜는 것뿐이다(`q` = 순환).
export function RowNavBadge({ owner }: { owner: RowNavOwner }): JSX.Element {
    const on = useRowNavOwner() === owner;
    return (
        <TextToggle
            active={on}
            activeColor="var(--accent-primary)"
            onClick={() => selectRowNavOwner(owner)}
            title={on ? "w/s 순회가 여기를 걷는다 (q: 다음 후보로)" : "클릭 = w/s 순회를 이 패널로 (q: 순환)"}
        >
            w/s
        </TextToggle>
    );
}
