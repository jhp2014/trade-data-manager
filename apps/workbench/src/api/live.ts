import { useEffect, useState } from "react";
import type { LiveSnapshot } from "@trade-data-manager/wire";

// 실시간 백엔드(apps/live) SSE 구독 훅. /live/stream 을 EventSource 로 열어 매 틱 스냅샷 갱신.
// EventSource 는 끊기면 자동 재연결 — error 는 배너 표시용. react-query 대신 커스텀 훅(스트림이라).
export function useLiveSnapshot(): { snapshot: LiveSnapshot | null; error: boolean } {
    const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        const es = new EventSource("/live/stream");
        es.onmessage = (e): void => {
            setSnapshot(JSON.parse(e.data) as LiveSnapshot);
            setError(false);
        };
        es.onerror = (): void => setError(true); // 브라우저가 자동 재연결
        return () => es.close();
    }, []);
    return { snapshot, error };
}
