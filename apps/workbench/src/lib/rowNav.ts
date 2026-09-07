import { useEffect, useRef, type MutableRefObject } from "react";
import { create } from "zustand";
import { useDock } from "../store/dock.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { RANK_SHEET_PANEL_ID } from "../panels/rank/rankSheetPanelIds.js";

// 행 순회(w/s) — **등록 지점은 여기 하나**(App 1회), 패널은 순회 함수만 얹는다(publish).
//
// 왜 패널이 직접 등록하지 않나: `resolveCommand` 는 scope 기계 없이 **등록 순 첫 매치**라, 패널마다
// 조건부로 같은 키를 등록하면 승자가 마운트·이벤트 순서에 매인다. 특히 패널 제거 전이(dock 이벤트로
// openPanelIds 가 갱신되는 커밋 ↔ React 언마운트 커밋)에서 **찰나의 중복 등록**이 원리적으로 남는다.
// 등록을 한 곳으로 모으면 그 상태가 구조적으로 불가능해지고, 승자는 순서가 아니라 아래 소유자 규칙이 정한다.
//
// 소유자 = **시트 패널이 배치에 존재하면 시트, 아니면 작업셋**(활성/포커스가 아니라 존재 — w/s 는 보통
// 차트를 보면서 누르므로 "활성 패널이 주인"이면 아무도 안 걷는다). 판정 소스가 `dock.openPanelIds` 인 것도
// 이유가 있다: `api.getPanel` 은 비반응형이라(패널이 늘고 줄어도 api 참조가 안 바뀐다) 리렌더를 못 낸다.
//
// 프로바이더가 없으면(예: 시트가 배경 탭에서 언마운트되는 경우) 작업셋으로 흘려보낸다 — 단일 디스패처라
// 이중 발화는 어차피 불가능하므로 이 폴백은 공짜다.
// ⚠ 모듈 전역 단일 소유 — 시트·작업셋 각 1개 전제(panelCatalog). 인스턴스가 둘이 되면 나중 것이 앞을 덮는다.

export type RowNavOwner = "rank-sheet" | "workset";
type Step = (dir: 1 | -1) => void;

interface RowNavStore {
    providers: Partial<Record<RowNavOwner, Step>>;
    publish: (owner: RowNavOwner, step: Step) => void;
    withdraw: (owner: RowNavOwner, step: Step) => void;
}

const useRowNav = create<RowNavStore>((set) => ({
    providers: {},
    publish: (owner, step) => set((s) => ({ providers: { ...s.providers, [owner]: step } })),
    // 내가 얹은 그 함수일 때만 거둔다 — 리마운트가 겹칠 때(새 것 publish → 옛 것 cleanup) 새 프로바이더를 지우지 않게.
    withdraw: (owner, step) =>
        set((s) => {
            if (s.providers[owner] !== step) return s;
            const next = { ...s.providers };
            delete next[owner];
            return { providers: next };
        }),
}));

/** 지금 w/s 를 가진 쪽. dock 미준비(null)면 작업셋(옛 동작). */
export function ownerOf(openPanelIds: string[] | null): RowNavOwner {
    return openPanelIds?.includes(RANK_SHEET_PANEL_ID) ? "rank-sheet" : "workset";
}

export function useRowNavOwner(): RowNavOwner {
    return useDock((s) => ownerOf(s.openPanelIds));
}

/**
 * 순회 함수를 얹는다 — 돌려받은 ref 의 `current` 를 **매 렌더 최신 클로저로 갈아 끼우면** 된다
 * (등록 effect 는 deps `[]`, 차트 `useChartHotkeys` 의 `h.current` 규약과 같은 이유).
 *
 * ⚠ 기존 `h.current` 들과 하나 다른 점: 이 ref 는 모듈 전역 스토어를 거쳐 **밖에서** 불린다.
 *   지금 이 트리엔 transition/Suspense 가 없어 버려지는 렌더가 안 생기지만, 시트·작업셋에
 *   `startTransition`/`useDeferredValue` 를 들이면 "커밋 안 된 렌더의 클로저로 w/s 가 걷는" 경로가 열린다.
 */
export function usePublishRowNav(owner: RowNavOwner): MutableRefObject<Step> {
    const ref = useRef<Step>(() => {});
    useEffect(() => {
        const step: Step = (dir) => ref.current(dir);
        const { publish, withdraw } = useRowNav.getState();
        publish(owner, step);
        return () => withdraw(owner, step);
    }, [owner]);
    return ref;
}

/** w/s 등록 — App 에서 1회. 소유자가 바뀌면 같은 id 로 다시 등록된다(Record 라 항상 정확히 한 벌). */
export function useRowNavHotkeys(): void {
    const owner = useRowNavOwner();
    useEffect(() => {
        // 소유자·프로바이더는 **누르는 순간** 읽는다 — 이 effect 가 도는 건 도움말 문구 때문이지
        // 디스패치의 정확성이 등록 시점 값에 매여선 안 된다(프리셋 전환 중 churn 대비).
        const step = (dir: 1 | -1): void => {
            const { providers } = useRowNav.getState();
            const cur = ownerOf(useDock.getState().openPanelIds);
            (providers[cur] ?? providers.workset)?.(dir);
        };
        const unit = owner === "rank-sheet" ? "행(시트)" : "타점(작업셋)";
        const { register, unregister } = useKeymapDynamic.getState();
        register({ id: "nav.row.prev", title: `이전 ${unit}`, category: "탐색", keys: "w", run: () => step(-1) });
        register({ id: "nav.row.next", title: `다음 ${unit}`, category: "탐색", keys: "s", run: () => step(1) });
        return () => { unregister("nav.row.prev"); unregister("nav.row.next"); };
    }, [owner]);
}
