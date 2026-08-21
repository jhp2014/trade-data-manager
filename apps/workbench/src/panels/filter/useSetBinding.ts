// 보는 집합 구독 — **연동 하나뿐이다**(2026-08-21 사이드바 재편). 패널은 전역 선택 포인터
// (selectedSetRef — 주인은 작업셋의 집합 칩)를 따라가고, 자기만의 고정 바인딩은 폐지됐다:
// 집합을 고르는 자리가 작업셋 하나로 모이면서(사용자 확정 — "나머지 패널은 구독만"), 패널별
// 바인딩·사이드바는 같은 일을 두 곳에서 하는 중복이 됐다. 잠깐 딴 집합을 보고 싶으면 작업셋에서
// 갈아타면 된다 — 전 패널이 같이 움직이는 게 이제 버그가 아니라 그림이다.
//
// 옛 고정 바인딩의 영속(wb.setBinding.*)은 읽지 않는다 — 새 키가 아니라 개념이 사라진 것이라
// 변환할 대상이 없고, 안 읽으면 자연히 죽는다(옛 저장 필터 키의 선례).
import type { SavedSet } from "../../store/savedSetsSlice.js";
import { useWorkbench } from "../../store/workbench.js";
import type { SetRef } from "../../lib/setRef.js";
import { useFunnel } from "./FunnelContext.js";
import type { ViewedSet } from "./useSetViews.js";

export interface LinkedSet {
    /** 보는 집합(선택 포인터가 가리키는 것) — viewed* 계약 그대로(월 시선까지 접혀 온다). */
    view: ViewedSet;
    /** 사람이 읽는 이름 — 헤더 라벨이 상시 표시한다("지금 뭘 보고 있나"의 답). */
    label: string;
}

/** 집합 참조의 이름 — 저장 집합은 저장 사전에서 찾는다(지워졌으면 그렇게 말한다). */
export function setRefLabel(ref: SetRef, savedSets: readonly SavedSet[]): string {
    switch (ref.kind) {
        case "universe": return "전체";
        case "survivors": return "최종 생존";
        case "saved": return savedSets.find((f) => f.id === ref.setId)?.name ?? "(지워진 집합)";
        case "orphan": return `${ref.label} (폐지된 바인딩)`;
        case "cell": return "짚은 칸";
        case "groupChain": return ref.names.join(" & ");
        case "items": return ref.label;
    }
}

/**
 * 연동(포인터 없음)이 **지금 실제로 풀리는 대상** — 짚은 칸 > 최종 생존 > 전체(조건 0개). 칩 이름은 "연동"
 * 하나지만 라벨은 풀린 대상을 같이 말해야 "뭘 보고 있나"에 답이 된다.
 */
export function linkedTargetLabel(hasSelection: boolean, activeCount: number): string {
    return `연동 · ${hasSelection ? "짚은 칸" : activeCount > 0 ? "최종 생존" : "전체"}`;
}

export function useLinkedSet(): LinkedSet {
    const funnel = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const selection = useWorkbench((s) => s.funnelSelection);
    const view = funnel.viewOf(null);
    // 라벨은 **지금 따라가는 곳**을 말한다 — 어휘는 작업셋·집합 편성의 칩 줄과 같다(전체/연동/저장 집합).
    const label = selectedSetRef === null
        ? linkedTargetLabel(selection !== null, funnel.active.length)
        : setRefLabel(selectedSetRef, savedSets);
    return { view, label };
}
