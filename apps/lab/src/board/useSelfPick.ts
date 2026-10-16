// 보드에서 직접 고른 종목 기억 — 보드는 "이 보드에서 고른 종목"이면 판을 움직이지 않고(제자리), 다른 곳에서 바뀐
// 종목이면 그 테마들을 맨 위로 올린다(BoardLayout 의 isSelfPick). 테마 · 시트 테마 패널이 같이 쓴다.
import { useCallback, useEffect, useRef } from "react";

/** code = 지금 경로의 종목, write = 경로에 쓰기. pick = 보드 행 클릭(기억 + 쓰기). */
export function useSelfPick(code: string, write: (code: string) => void): { pick: (code: string) => void; isSelfPick: (code: string) => boolean } {
    const lastPicked = useRef<string | null>(null);
    const pick = useCallback(
        (c: string) => {
            lastPicked.current = c;
            write(c);
        },
        [write],
    );
    const isSelfPick = useCallback((c: string) => c === lastPicked.current, []);
    // 경로의 종목이 이 보드가 고른 것과 달라지면(바깥에서 바뀜) 기억을 지운다 — 나중에 바깥에서 같은 종목으로
    // 돌아와도 "이 보드가 고른 것"으로 착각하지 않게. 보드(자식)의 판정이 먼저 돌고 이 effect 가 뒤에 돈다.
    useEffect(() => {
        if (code !== lastPicked.current) lastPicked.current = null;
    }, [code]);
    return { pick, isSelfPick };
}
