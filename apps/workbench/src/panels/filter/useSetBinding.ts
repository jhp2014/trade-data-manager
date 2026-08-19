// 패널 바인딩 — **이 패널이 보는 집합**을 패널마다 고른다(영속). 전역 렌즈 하나가 전 패널을 정하던
// 구조의 해체: 모드는 딱 둘이다 —
//   · 연동(null, 디폴트) : 필터 패널의 선택 포인터를 따라간다(목록에서 고른 집합, 없으면 작업 깔때기 시선).
//   · 고정(참조)        : 집합 목록의 하나(전체·최종 생존·저장 집합)에 묶는다.
// "시선은 따라가고, 고정은 안 따라간다" — HTS 연동 채널과 같은 문법.
//
// ## 어휘 (⚠ "선택"은 여기 안 쓴다)
// 이 앱에서 **선택**(subject)은 지금 보고 있는 **한 항목**(종목·날짜·시각)이고, 집합을 좁히는 일은
// **짚음**(pick)이다. 그래서 바인딩 이름에 "선택"을 넣으면 두 낱말이 한 헤더에서 서로 다른 것을
// 가리키게 된다("선택 집합 128/512" 옆에 "선택만 보기" 토글이 서는 자리다).
//
// 저장은 **영속 3종만**(parseSetRef 가 세션 종류를 거르고, 폐지된 옛 바인딩은 orphan 으로 변환한다).
// 깨진 참조는 빈 집합 + broken 으로 오고, 화면이 라벨과 전환 손잡이를 보여준다 — 유니버스로 조용히
// 폴백하지 않는다(실패가 넓어지는 방향이라).
import { useCallback } from "react";
import { parseSetRef, type SetRef } from "../../lib/setRef.js";
import { usePersistedState } from "../../store/persist.js";
import { useWorkbench } from "../../store/workbench.js";
import type { SavedSet } from "../../store/filterFunnelSlice.js";
import { useFunnel } from "./FunnelContext.js";
import type { ViewedSet } from "./useFilterFunnel.js";

export interface SetBinding {
    /** null = 연동(디폴트) — 필터 패널의 선택 포인터를 따라간다. */
    ref: SetRef | null;
    setRef: (r: SetRef | null) => void;
    /** 바인딩을 푼 결과 — viewed* 계약 그대로라 소비 코드가 바인딩 이전과 같은 필드를 쓴다. */
    view: ViewedSet;
    /** 사람이 읽는 이름 — 헤더 칩이 상시 표시한다("지금 뭘 보고 있나"의 답). */
    label: string;
    broken: boolean;
}

/** 바인딩 참조의 이름 — 저장 집합은 저장 사전에서 찾는다(지워졌으면 그렇게 말한다). */
export function setRefLabel(ref: SetRef, savedSets: readonly SavedSet[]): string {
    switch (ref.kind) {
        case "universe": return "전체";
        case "survivors": return "최종 생존";
        case "saved": return savedSets.find((f) => f.id === ref.setId)?.name ?? "(지워진 집합)";
        case "orphan": return `${ref.label} (폐지된 바인딩)`;
        // 세션 종류는 저장을 못 하니 바인딩에 나타날 일이 없지만, 타입 총망라를 위해 남긴다.
        case "cell": return "짚은 칸";
        case "groupChain": return ref.names.join(" & ");
        case "items": return ref.label;
    }
}

export function useSetBinding(storageKey: string): SetBinding {
    const funnel = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const [ref, setRefState] = usePersistedState<SetRef | null>(storageKey, parseSetRef, null);
    const setRef = useCallback((r: SetRef | null) => setRefState(r), [setRefState]);
    const view = funnel.viewOf(ref);
    // 연동 라벨은 **지금 따라가는 곳**까지 말한다 — "연동"만으로는 화면들이 왜 같이 움직였는지 안 보인다.
    const label = ref === null
        ? `연동 · ${selectedSetRef === null ? "깔때기" : setRefLabel(selectedSetRef, savedSets)}`
        : setRefLabel(ref, savedSets);
    return { ref, setRef, view, label, broken: view.broken };
}
