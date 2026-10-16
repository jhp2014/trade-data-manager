// 실행 중 선언 등록부 — 영속 아님. 패널이 `usePanelHeader` 로 선언을 게시하고, 셸(탭 뒤 정보·헤더 줄·
// 판 버튼)이 panelId 로 구독해 그린다. 패널은 무엇이 있는지만 말하고, 어디에 어떻게 그릴지는
// 셸·자리 장부(ledger)가 정한다. workbench components/header/registry.ts 에서 옮겼다.
import { useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import type { HeaderDecl } from "./spec.js";

interface Published {
    decl: HeaderDecl;
    /** 게시 주인(마운트 단위) — 리마운트가 겹칠 때(새 것 publish → 옛 것 cleanup) 새 선언을 지우지 않게. */
    token: object;
}

interface HeaderRegistryStore {
    byPanel: Record<string, Published>;
    publish: (panelId: string, decl: HeaderDecl, token: object) => void;
    withdraw: (panelId: string, token: object) => void;
}

export const useHeaderRegistry = create<HeaderRegistryStore>((set) => ({
    byPanel: {},
    publish: (panelId, decl, token) => set((s) => ({ byPanel: { ...s.byPanel, [panelId]: { decl, token } } })),
    withdraw: (panelId, token) =>
        set((s) => {
            if (s.byPanel[panelId]?.token !== token) return s;
            const next = { ...s.byPanel };
            delete next[panelId];
            return { byPanel: next };
        }),
}));

/** 패널의 선언 구독 — 등록 없는 패널 = null(판 버튼은 흐려진다, 안 사라진다). */
export function useHeaderDecl(panelId: string | undefined): HeaderDecl | null {
    return useHeaderRegistry((s) => (panelId === undefined ? null : s.byPanel[panelId]?.decl ?? null));
}

/**
 * 헤더 선언 게시 — 패널 최상단에서(로딩·오류 분기보다 위에서) 부른다.
 *
 * **매 커밋 게시한다**(의존성 없는 layout effect): 선언 안의 클로저(text()·renderPopover)가 낡지 않게
 * 하는 가장 안전한 길이다 — useMemo 의존성 목록은 빠뜨려도 조용히 낡는다. 게시로 다시 그려지는 것은
 * 셸의 작은 조각들뿐이다(패널 본문은 PanelFrame 의 children 동일성으로 재렌더를 피한다).
 * layout effect 인 이유: passive effect 면 첫 페인트에 헤더 줄이 한 프레임 늦게 튀어나온다.
 */
export function usePanelHeader(panelId: string, decl: HeaderDecl): void {
    const token = useRef<object | null>(null);
    token.current ??= {};
    useLayoutEffect(() => {
        useHeaderRegistry.getState().publish(panelId, decl, token.current!);
    });
    useLayoutEffect(() => {
        const t = token.current!;
        return () => useHeaderRegistry.getState().withdraw(panelId, t);
    }, [panelId]);
}
