// 바인딩 칩 — 패널 헤더 **왼쪽**(말의 자리)에 서서 "지금 이 패널이 보는 집합"을 상시 말한다:
// `라벨 n/N` = 집합 이름 · 표현됨/전체. 패널마다 다른 집합을 볼 수 있게 된 순간부터 이 라벨이 없으면
// 사과와 배를 나란히 놓고 같은 줄 안다.
//
// 누르면 **사이드바**(SetSidebar)가 열린다 — 바인딩 고르기와 멤버 목록이 다 거기 있다.
// 깨진 참조면 경고색으로 선다(빈 집합 + 사람 손의 전환 — 자동 폴백 금지).
import type { CSSProperties } from "react";
import { FAIL } from "../../styles/palette.js";
import type { SetBinding } from "./useSetBinding.js";
import type { SetMembers } from "./setMembers.js";

export function SetBindingChip({ binding, members, open, onToggle }: {
    binding: SetBinding;
    /** 패널 층위의 멤버 판정(setMembersOf) — n/N 의 재료. 사이드바와 같은 한 벌을 받는다. */
    members: SetMembers;
    open: boolean;
    onToggle: () => void;
}): JSX.Element {
    return (
        <button onClick={onToggle}
            style={{ ...chip, ...(binding.broken ? { color: FAIL, borderColor: FAIL } : open ? { color: "var(--text-primary)", background: "var(--bg-tertiary)" } : {}) }}
            title={binding.broken
                ? `${binding.label} — 참조가 깨졌습니다(지워진 대상). 눌러서 바꾸세요`
                : `보는 집합: ${binding.label} — 표현됨 ${members.okCount} / 전체 ${members.total}. 눌러서 목록·바꾸기`}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{binding.broken ? `⚠ ${binding.label}` : binding.label}</span>
            <span style={{ color: "var(--text-tertiary)", marginLeft: 5, fontVariantNumeric: "tabular-nums" }}>
                {members.okCount}/{members.total}
            </span>
        </button>
    );
}

const chip: CSSProperties = {
    display: "inline-flex", alignItems: "center", maxWidth: 180, overflow: "hidden", whiteSpace: "nowrap",
    border: "1px solid var(--border-default)", borderRadius: 5, background: "transparent", cursor: "pointer",
    padding: "1px 6px", font: "inherit", fontSize: 11, color: "var(--text-secondary)", flexShrink: 0,
};
