// 스크롤 위치는 세션 한정(모듈 메모) — 프리셋 전환(재마운트)엔 이어지고 새로고침엔 초기화(목록 중간 튐 방지).
// ⚠ 단일 인스턴스 전제(panelCatalog 의 rank-sheet-1 하나) — 모듈 전역이라 시트가 둘이 되면 스크롤을
//   공유한다. 시트가 패널 id 를 받게 되면 Map<panelId, …> 로 바꿀 것.
import { useEffect, useRef } from "react";

let sheetScroll = { top: 0, left: 0 };

/** 세션 스크롤 보존 — 데이터가 그려진(표 렌더된) 뒤 1회 복원, onScroll 로 저장. */
export function useSessionScroll(
    scrollRef: React.RefObject<HTMLDivElement | null>,
    /** 표가 실제로 그려졌나 — 빈 화면에 복원하면 스크롤이 그냥 사라진다. */
    dataReady: boolean,
): { onScroll: (e: React.UIEvent<HTMLDivElement>) => void } {
    const restoredRef = useRef(false);
    useEffect(() => {
        if (!dataReady || restoredRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = sheetScroll.top;
        el.scrollLeft = sheetScroll.left;
        restoredRef.current = true;
    }, [dataReady, scrollRef]);
    return {
        onScroll: (e) => { sheetScroll = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }; },
    };
}
