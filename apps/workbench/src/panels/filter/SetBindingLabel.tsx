// 바인딩 라벨 — 패널 헤더 **왼쪽**(말의 자리)에 서서 "지금 이 패널이 보는 집합"을 상시 말한다:
// `라벨 n/N` = 집합 이름 · 표현됨/전체. 패널마다 다른 집합을 볼 수 있게 된 순간부터 이 라벨이 없으면
// 사과와 배를 나란히 놓고 같은 줄 안다.
//
// ## 왜 버튼이 아닌가
// 원래는 눌러서 사이드바를 여는 칩이었다. 그런데 헤더의 좌우는 **대상 / 표현**이 아니라 **말 / 손**으로
// 갈리는 자리고(왼쪽은 읽는 것, 오른쪽은 누르는 것 — HeaderControls 규약), 칩 하나가 그 규약의
// 유일한 예외로 남아 있었다. 그래서 말과 손을 쪼갰다: 여기는 **못 누르는 라벨**로 남고, 여는 일은
// 오른쪽 컨트롤 줄의 "집합" 토글이 한다.
//
// 쪼개도 배우기 어렵지 않은 이유는 더보기(⋯) 판이다 — 거기서 "집합"이 이름과 한 줄 설명을 달고 서 있다.
//
// ## 깨졌을 때
// 여기는 **무엇이** 잘못됐는지만 말한다(`⚠ (지워진 필터)`). **어디를 눌러 고치는지**는 오른쪽
// "집합" 토글이 같은 경고색으로 가리킨다(ControlSpec 의 `tone`) — 색이 쪼개진 둘을 다시 잇는 실이다.
import type { CSSProperties } from "react";
import type { ControlSpec } from "../../components/HeaderControls.js";
import { FAIL } from "../../styles/palette.js";
import type { SetBinding } from "./useSetBinding.js";
import type { SetMembers } from "./setMembers.js";

export function SetBindingLabel({ binding, members }: {
    binding: SetBinding;
    /** 패널 층위의 멤버 판정(setMembersOf) — n/N 의 재료. 사이드바와 같은 한 벌을 받는다. */
    members: SetMembers;
}): JSX.Element {
    return (
        <span style={{ ...label, ...(binding.broken ? { color: FAIL } : {}) }}
            title={binding.broken
                ? `${binding.label} — 참조가 깨졌습니다(지워진 대상). 오른쪽 "집합"에서 바꾸세요`
                : `보는 집합: ${binding.label} — 표현됨 ${members.okCount} / 전체 ${members.total}`}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {binding.broken ? `⚠ ${binding.label}` : binding.label}
            </span>
            <span style={{ color: binding.broken ? FAIL : "var(--text-tertiary)", opacity: binding.broken ? 0.75 : 1, marginLeft: 5, fontVariantNumeric: "tabular-nums" }}>
                {members.okCount}/{members.total}
            </span>
        </span>
    );
}

const label: CSSProperties = {
    display: "inline-flex", alignItems: "center", maxWidth: 180, overflow: "hidden", whiteSpace: "nowrap",
    font: "inherit", fontSize: 11, color: "var(--text-primary)", flexShrink: 0,
};

/**
 * 라벨의 **나머지 반쪽** — 사이드바를 여는 손잡이. 컨트롤 줄(오른쪽)에 서고, 선언이 세 패널에서
 * 같아야 하므로 여기 한 곳에서 만든다(라벨과 한 파일에 두는 건 쪼갠 둘이 같이 움직이게 하려는 것).
 *
 * 깨진 참조는 `tone` 으로 물든다 — 켜짐과 무관하게 칠해지므로 **닫혀 있을 때도** 보인다(사고는
 * 대개 닫혀 있을 때 난다). 라벨은 안 바꾼다: 글자가 갈리면 폭이 갈려 이웃 컨트롤이 밀린다.
 */
export function setBindingControl({ binding, open, setOpen }: {
    binding: SetBinding;
    open: boolean;
    setOpen: (on: boolean) => void;
}): ControlSpec {
    return {
        kind: "toggle", id: "setSidebar", name: "집합",
        help: "이 패널이 보는 집합 — 바인딩 바꾸기 · 멤버 목록 · 표현 안 됨",
        on: open, set: setOpen,
        ...(binding.broken ? { tone: "warn" as const } : null),
    };
}
