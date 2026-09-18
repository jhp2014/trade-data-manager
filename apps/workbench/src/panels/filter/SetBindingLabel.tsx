// 보는 집합 라벨 — 패널 헤더 **왼쪽**(말의 자리)에 서서 "지금 이 패널이 보는 집합"을 상시 말한다:
// `우주 · 라벨 n/N` = 우주 뱃지 · 집합 이름 · 표현됨/전체. 층위·재료가 패널마다 달라 n/N 도 다르다 —
// 그 차이가 이 라벨의 존재 이유다.
//
// 못 누르는 라벨이다: 헤더의 좌우는 **말 / 손**으로 갈린다(HeaderControls 규약). 집합을 **고르는** 손은
// 여전히 집합 편성/작업 대상 하나고, 이 패널의 "고정/해제"(1비트)는 컨트롤 줄에 선다(useBoundSet).
//
// 우주 뱃지가 상시 서는 이유(2026-09-18 단계 ④): 같은 이름의 집합이 두 우주에 있을 수 있고(⧉ 복제),
// "왜 이 패널만 다른 걸 보여주지"의 답이 대개 우주다 — 이름만으로는 그 질문에 답이 안 된다.
import type { CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { dnfSummary, hasActiveDnf } from "../../lib/presence.js";
import type { BoundSet } from "./useBoundSet.js";
import { UNIVERSE_LABEL } from "./universe.js";
import type { SetMembers } from "./setMembers.js";

export function SetBindingLabel({ bound, members }: {
    bound: BoundSet;
    /** 패널 층위의 멤버 판정(setMembersOf) — n/N 의 재료. */
    members: SetMembers;
}): JSX.Element {
    // 시선 꼬리 — 월·존재필터가 걸려 있으면 **왜 줄었는지**를 이 자리에서 말한다. 시선은 작업셋에서
    // 걸고 잊기 쉬운데, 다른 패널에 단서가 n/N 숫자뿐이면 "왜 이것밖에 없지" 사고가 난다(안전판).
    // ⚠ 하루 집합엔 시선이 **안 걸린다**(날짜가 곧 시선 — useBoundSet 머리 주석) → 꼬리도 안 단다.
    const gazeMonths = useWorkbench((s) => s.gazeMonths);
    const gazePresence = useWorkbench((s) => s.gazePresence);
    const focusDate = useWorkbench((s) => s.focus.date);
    const daily = bound.day.on;
    const gazeParts = daily ? [] : [
        ...(gazeMonths === null ? [] : [[...gazeMonths].sort().reverse().map((m) => m.slice(2).replace("-", ".")).join(",")]),
        ...(hasActiveDnf(gazePresence) ? [dnfSummary(gazePresence)] : []),
    ];
    const gazeTail = gazeParts.join(" · ");
    // 하루 집합의 꼬리는 **날짜와 상태**다 — 상한·결손은 숫자가 거짓말을 하기 전에 말해야 한다.
    const dayTail = !daily ? "" : [
        focusDate,
        ...(bound.day.error ? ["재료 오류 — 조회 실패"] : []), // "오늘은 후보가 없다"와 정반대의 사실
        ...(bound.day.isLoading ? ["계산중…"] : []),
        ...(!bound.day.themesReady ? ["존 순위 재료 대기"] : []),
        ...(bound.day.tooWide ? [`너무 넓음 ${bound.day.matched.toLocaleString("ko-KR")}+`] : []),
        ...(bound.day.truncated && !bound.day.tooWide ? ["상한 초과 — 잘림"] : []),
    ].join(" · ");
    const tail = daily ? dayTail : gazeTail;
    const pinned = bound.pinned !== null;
    return (
        <span style={label}
            title={[
                `보는 집합: ${UNIVERSE_LABEL[bound.universe]} · ${bound.label}`,
                pinned ? "이 패널에 고정됨(전역 선택을 안 따라갑니다)" : "연동 — 전역 선택을 따라갑니다",
                tail ? (daily ? `날짜 ${tail}` : `시선 ${tail}`) : "",
                `표현됨 ${members.okCount} / 전체 ${members.total}`,
                bound.day.unsupported ?? "",
            ].filter(Boolean).join(" · ")}>
            <span style={badge}>{UNIVERSE_LABEL[bound.universe]}</span>
            {pinned && <span style={{ color: "var(--text-tertiary)", marginRight: 3 }}>🔒</span>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{bound.label}</span>
            <span style={{ color: "var(--text-tertiary)", marginLeft: 5, fontVariantNumeric: "tabular-nums" }}>
                {members.okCount}/{members.total}
            </span>
            {tail && (
                <span style={{ color: "var(--text-tertiary)", marginLeft: 6, fontSize: 10, whiteSpace: "nowrap" }}>
                    · {tail}
                </span>
            )}
            {bound.day.unsupported && (
                <span style={{ color: "var(--fall)", marginLeft: 6, fontSize: 10, whiteSpace: "nowrap" }}>
                    · {bound.day.unsupported}
                </span>
            )}
        </span>
    );
}

const label: CSSProperties = {
    display: "inline-flex", alignItems: "center", maxWidth: 320, overflow: "hidden", whiteSpace: "nowrap",
    font: "inherit", fontSize: 11, color: "var(--text-primary)", flexShrink: 0,
};

const badge: CSSProperties = {
    fontSize: 9.5, color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: 4,
    padding: "0 3px", marginRight: 5, flexShrink: 0,
};
