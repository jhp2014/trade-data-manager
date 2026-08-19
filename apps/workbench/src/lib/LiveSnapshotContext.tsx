// 실시간 스냅샷 한 벌 — **셸에서 한 번 연결해 나눠 준다**(GroupsContext 와 같은 이유).
//
// 소비자가 넷이다(작업표시줄·실시간 보드·모니터링·테마 배정 팝업). 각자 훅에서 EventSource 를
// 열면 같은 /live/stream 을 화면 수만큼 중복 구독한다(실측 4중) — 연결은 여기 하나만 열고 값만
// 나눠 준다. EventSource 는 끊기면 자동 재연결 — error 는 배너 표시용. react-query 대신 커스텀(스트림이라).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LiveSnapshot } from "@trade-data-manager/wire";

export interface LiveSnapshotView {
    snapshot: LiveSnapshot | null;
    error: boolean;
}

const Ctx = createContext<LiveSnapshotView | null>(null);

export function LiveSnapshotProvider({ children }: { children: ReactNode }): JSX.Element {
    const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (typeof EventSource === "undefined") return; // 테스트(jsdom) — 연결 없이 null 스냅샷 유지
        const es = new EventSource("/live/stream");
        es.onmessage = (e): void => {
            setSnapshot(JSON.parse(e.data) as LiveSnapshot);
            setError(false);
        };
        es.onerror = (): void => setError(true); // 브라우저가 자동 재연결
        return () => es.close();
    }, []);
    const v = useMemo<LiveSnapshotView>(() => ({ snapshot, error }), [snapshot, error]);
    return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** 실시간 스냅샷 구독 — 소비하는 곳은 전부 이걸 쓴다(연결은 Provider 하나가 쥔다). */
export function useLiveSnapshot(): LiveSnapshotView {
    const v = useContext(Ctx);
    if (!v) throw new Error("LiveSnapshotProvider 밖에서 useLiveSnapshot — main 배선을 확인하세요");
    return v;
}
