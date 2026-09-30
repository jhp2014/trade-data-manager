// 실행 중 선언 등록부 — 영속 아님. 패널이 `usePanelHeader` 로 선언을 게시하고, 셸(탭 칩·라인·모음
// 버튼)이 panelId 로 구독해 그린다. 책임의 역전이 이 store 한 장이다: 패널은 무엇이 있는지만 말하고,
// 어디에 어떻게 그릴지는 셸·장부(ledger)가 정한다.
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
    /**
     * 단축키의 판형 호출 — 그 패널의 컨트롤 모음 버튼(HeaderButtons)이 받아 자기 자리에 판을 연다
     * (anchor 규칙: 입구가 없으면 모음 버튼). seq 로 같은 컨트롤 재요청도 새 요청으로 갈린다.
     */
    pendingPopover: { panelId: string; controlId: string; seq: number } | null;
    /**
     * 단축키 배정 대기 — 모음 판의 숫자 배지 클릭이 세우고, 다음 숫자 키(shortcut.pressSlot)가 소비한다.
     * panelId 는 피드백 칩의 착지(배지를 누른 그 판) — 소비는 활성 패널과 무관하게 **이 대기의 장부**에 적힌다.
     */
    pendingAssign: { panelId: string; typeKey: string; controlId: string } | null;
    publish: (panelId: string, decl: HeaderDecl, token: object) => void;
    withdraw: (panelId: string, token: object) => void;
    requestPopover: (panelId: string, controlId: string) => void;
    clearPopover: () => void;
    setPendingAssign: (p: { panelId: string; typeKey: string; controlId: string } | null) => void;
}

export const useHeaderRegistry = create<HeaderRegistryStore>((set) => ({
    byPanel: {},
    pendingPopover: null,
    pendingAssign: null,
    publish: (panelId, decl, token) => set((s) => ({ byPanel: { ...s.byPanel, [panelId]: { decl, token } } })),
    withdraw: (panelId, token) =>
        set((s) => {
            if (s.byPanel[panelId]?.token !== token) return s;
            const next = { ...s.byPanel };
            delete next[panelId];
            return { byPanel: next };
        }),
    requestPopover: (panelId, controlId) =>
        set((s) => ({ pendingPopover: { panelId, controlId, seq: (s.pendingPopover?.seq ?? 0) + 1 } })),
    clearPopover: () => set(() => ({ pendingPopover: null })),
    setPendingAssign: (p) => set(() => ({ pendingAssign: p })),
}));

/** 패널의 선언 구독 — 셸 컴포넌트가 쓴다(등록 없는 패널 = null → 버튼은 흐려진다, 안 사라진다). */
export function useHeaderDecl(panelId: string | undefined): HeaderDecl | null {
    return useHeaderRegistry((s) => (panelId === undefined ? null : s.byPanel[panelId]?.decl ?? null));
}

/**
 * 헤더 선언 게시 — 패널 최상단에서 부른다.
 *
 * **매 커밋 게시한다**(의존성 없는 layout effect): 선언 안의 클로저(text()·renderPopover)가
 * 낡지 않게 하는 유일하게 안전한 방법이다 — useMemo 의존성 목록은 빠뜨려도 lint 가 없어 조용히
 * 낡는다. 선언 생성은 값싸고, 게시로 다시 그려지는 것은 셸의 작은 조각들뿐이다(패널 본문은
 * children 동일성으로 재렌더를 피한다 — PanelFrame).
 *
 * layout effect 인 이유: passive effect 면 첫 페인트에 헤더 라인이 한 프레임 늦게 튀어나온다.
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
