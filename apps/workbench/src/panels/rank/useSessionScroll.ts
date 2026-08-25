// 스크롤 위치는 세션 한정(모듈 메모) — 프리셋 전환(재마운트)엔 이어지고 새로고침엔 초기화(목록 중간 튐 방지).
// ⚠ 단일 인스턴스 전제(panelCatalog 의 rank-sheet-1 하나) — 모듈 전역이라 시트가 둘이 되면 스크롤을
//   공유한다. 시트가 패널 id 를 받게 되면 Map<panelId, …> 로 바꿀 것.
//
// **두 축이 갈라져 있다.** 세로는 목록이 가상화라 가상화기가 배워야 하므로 호출자가 준 restoreTop 으로
// 돌리고(DOM 에 scrollTop 을 직접 쓰면 가상화기가 그 사실을 모른 채 남아 스크롤바와 그리는 구간이
// 어긋난다), 가로는 가상화기에 축이 없어 여기서 DOM 에 그대로 쓴다.
import { useEffect, useRef } from "react";

let sheetScroll = { top: 0, left: 0 };

/** 세션 스크롤 보존 — 줄이 실제로 그려진 뒤 1회 복원, onScroll 로 저장. */
export function useSessionScroll(
    scrollRef: React.RefObject<HTMLDivElement | null>,
    /** 목록이 실제로 그려졌나 — 빈 화면에 복원하면 스크롤이 그냥 사라진다(총 높이가 0이라 clamp 된다). */
    dataReady: boolean,
    /** 세로 복원 — 가상화기 API 로(`virt.scrollToOffset`). 저장값과 같은 좌표계다(scrollMargin 포함). */
    restoreTop: (top: number) => void,
): { onScroll: (e: React.UIEvent<HTMLDivElement>) => void } {
    const restoredRef = useRef(false);
    // 매 렌더 새 클로저라 deps 에 넣으면 effect 가 계속 돈다 — 최신 것만 ref 로 들고 본다.
    const restoreRef = useRef(restoreTop);
    restoreRef.current = restoreTop;
    useEffect(() => {
        if (!dataReady || restoredRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        restoredRef.current = true;
        el.scrollLeft = sheetScroll.left;
        restoreRef.current(sheetScroll.top);
    }, [dataReady, scrollRef]);
    return {
        onScroll: (e) => { sheetScroll = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }; },
    };
}
