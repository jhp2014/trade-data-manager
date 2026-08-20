// 주어진 날짜에 큐레이션 흔적(앵커·타점·그룹·코멘트)이 있는 종목코드 집합 — 이슈/복기 보드에서
// "주석 있는 종목" 좌측 바 표시용. 존재 지도(작업셋과 같은 캐시)를 재사용 → 백엔드 0.
// 옛 기준선∪타점 판정을 지도 판정으로 넓혔다 — 작업셋에 뜨는 날이면 보드 바도 켜진다(같은 모수).
import { useMemo } from "react";
import { usePresenceIndex } from "./usePresence.js";

export function useAnnotatedCodes(date: string): Set<string> {
    const { index } = usePresenceIndex();
    return useMemo(() => {
        const set = new Set<string>();
        for (const d of index.values()) if (d.date === date) set.add(d.stockCode);
        return set;
    }, [index, date]);
}
