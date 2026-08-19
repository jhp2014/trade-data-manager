// 패널 바인딩 — **이 패널이 보는 집합**을 패널마다 고른다(영속). 전역 렌즈 하나가 전 패널을 정하던
// 구조의 해체: 깔때기 시선(null)이 디폴트라 아무것도 안 만지면 오늘과 같고, 고정하고 싶은 패널만
// 참조를 묶는다. "시선은 따라가고, 고정은 안 따라간다" — HTS 연동 채널과 같은 문법.
//
// ## 어휘 (⚠ "선택"은 여기 안 쓴다)
// 이 앱에서 **선택**(subject)은 지금 보고 있는 **한 항목**(종목·날짜·시각)이고, 집합을 좁히는 일은
// **짚음**(pick)이다. 그래서 바인딩 이름에 "선택"을 넣으면 두 낱말이 한 헤더에서 서로 다른 것을
// 가리키게 된다("선택 집합 128/512" 옆에 "선택만 보기" 토글이 서는 자리다).
//
// 저장은 **영속 4종만**(parseSetRef 가 세션 2종을 거른다). 깨진 참조는 빈 집합 + broken 으로 오고,
// 화면이 라벨과 전환 손잡이를 보여준다 — 유니버스로 조용히 폴백하지 않는다(실패가 넓어지는 방향이라).
import { useCallback } from "react";
import { parseSetRef, type SetRef } from "../../lib/setRef.js";
import { usePersistedState } from "../../store/persist.js";
import { useWorkbench } from "../../store/workbench.js";
import type { SavedFunnel } from "../../store/filterFunnelSlice.js";
import { useFunnel } from "./FunnelContext.js";
import type { ViewedSet } from "./useFilterFunnel.js";

export interface SetBinding {
    /** null = 깔때기 시선(디폴트) — 깔때기의 "보는 집합"(짚은 칸 반영, 없으면 최종 생존)을 따라간다. */
    ref: SetRef | null;
    setRef: (r: SetRef | null) => void;
    /** 바인딩을 푼 결과 — viewed* 계약 그대로라 소비 코드가 바인딩 이전과 같은 필드를 쓴다. */
    view: ViewedSet;
    /** 사람이 읽는 이름 — 헤더 칩이 상시 표시한다("지금 뭘 보고 있나"의 답). */
    label: string;
    broken: boolean;
}

/** 바인딩 참조의 이름 — 그룹은 이름이 곧 정체, 필터는 저장 사전에서 찾는다(지워졌으면 그렇게 말한다). */
export function setRefLabel(ref: SetRef, savedFunnels: readonly SavedFunnel[]): string {
    switch (ref.kind) {
        case "universe": return "전체";
        case "group": return ref.name;
        case "filter": return ref.filterId === null ? "최종 생존" : (savedFunnels.find((f) => f.id === ref.filterId)?.name ?? "(지워진 필터)");
        case "cell": {
            const base = ref.filterId === null ? "최종 생존" : (savedFunnels.find((f) => f.id === ref.filterId)?.name ?? "(지워진 필터)");
            return `${base} · 칸`;
        }
        // 세션 2종은 저장을 못 하니 바인딩에 나타날 일이 없지만, 타입 총망라를 위해 남긴다.
        case "groupChain": return ref.names.join(" & ");
        case "items": return ref.label;
    }
}

export function useSetBinding(storageKey: string): SetBinding {
    const funnel = useFunnel();
    const savedFunnels = useWorkbench((s) => s.savedFunnels);
    const [ref, setRefState] = usePersistedState<SetRef | null>(storageKey, parseSetRef, null);
    const setRef = useCallback((r: SetRef | null) => setRefState(r), [setRefState]);
    const view = funnel.viewOf(ref);
    return {
        ref,
        setRef,
        view,
        label: ref === null ? "깔때기 시선" : setRefLabel(ref, savedFunnels),
        broken: view.broken,
    };
}
