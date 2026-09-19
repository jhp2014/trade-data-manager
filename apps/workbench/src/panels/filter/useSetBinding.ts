// 집합 참조의 **이름** 두 함수 — 패널 라벨·칩 줄이 같은 어휘를 쓰게 하는 자리.
//
// 배선(어느 집합을 보나)은 여기 없다: 기본은 전역 선택 포인터를 따르는 연동이고, 패널은 거기에
// **고정(1비트)** 할 수 있다 — 그 규칙과 두 우주의 갈래는 전부 `useBoundSet` 이 진다(2026-09-18 단계 ④).
// 옛 `useLinkedSet`(연동 전용)은 소비자가 0이 되어 삭제했다 — 남겨 두면 다음 사람이 그걸로 배선해
// 그 패널만 핀을 무시하고 전역 포인터를 따라간다(④ 가 없애려던 "어느 쪽이 진짜냐"의 재발).
//
// 옛 고정 바인딩의 영속(`wb.setBinding.*`)은 **여전히 안 읽는다** — 폐지된 개념의 저장물이라 변환할
// 대상이 없고, 새 핀은 `panelUi[panelId].setPin` 이라는 다른 자리에 산다.
import type { SavedSet } from "../../store/savedSetsSlice.js";
import type { SetRef } from "../../lib/setRef.js";

/** 집합 참조의 이름 — 저장 집합은 저장 사전에서 찾는다(지워졌으면 그렇게 말한다). */
export function setRefLabel(ref: SetRef, savedSets: readonly SavedSet[]): string {
    switch (ref.kind) {
        case "universe": return "전체";
        case "survivors": return "최종 생존";
        case "saved": return savedSets.find((f) => f.id === ref.setId)?.name ?? "(지워진 집합)";
        case "orphan": return `${ref.label} (폐지된 바인딩)`;
        case "items": return ref.label;
    }
}

/**
 * 연동(포인터 없음)이 **지금 실제로 풀리는 대상** — 최종 생존 > 전체(조건 0개). 칩 이름은 "연동"
 * 하나지만 라벨은 풀린 대상을 같이 말해야 "뭘 보고 있나"에 답이 된다.
 */
export function linkedTargetLabel(filtering: boolean): string {
    return `연동 · ${filtering ? "최종 생존" : "전체"}`;
}

