// 보는 집합 라벨 — 패널 헤더 **왼쪽**(말의 자리)에 서서 "지금 이 패널이 보는 집합"을 상시 말한다:
// `라벨 n/N` = 집합 이름 · 표현됨/전체. 전 패널이 같은 포인터를 구독하지만(연동 단일 — useLinkedSet),
// 층위·재료가 달라 n/N 은 패널마다 다르다 — 그 차이가 이 라벨의 존재 이유다.
//
// 못 누르는 라벨이다: 헤더의 좌우는 **말 / 손**으로 갈린다(HeaderControls 규약). 집합을 바꾸는 손은
// 이제 작업셋의 집합 칩 하나다(사이드바 재편 — 고르는 자리가 두 곳이면 어느 쪽이 진짜냐가 생긴다).
import type { CSSProperties } from "react";
import type { LinkedSet } from "./useSetBinding.js";
import type { SetMembers } from "./setMembers.js";

export function SetBindingLabel({ linked, members }: {
    linked: LinkedSet;
    /** 패널 층위의 멤버 판정(setMembersOf) — n/N 의 재료. */
    members: SetMembers;
}): JSX.Element {
    return (
        <span style={label}
            title={`보는 집합: ${linked.label} — 표현됨 ${members.okCount} / 전체 ${members.total} (바꾸는 곳: 작업 대상 패널의 집합 칩)`}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{linked.label}</span>
            <span style={{ color: "var(--text-tertiary)", marginLeft: 5, fontVariantNumeric: "tabular-nums" }}>
                {members.okCount}/{members.total}
            </span>
        </span>
    );
}

const label: CSSProperties = {
    display: "inline-flex", alignItems: "center", maxWidth: 180, overflow: "hidden", whiteSpace: "nowrap",
    font: "inherit", fontSize: 11, color: "var(--text-primary)", flexShrink: 0,
};
