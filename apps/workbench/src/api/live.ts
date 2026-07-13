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

// 실시간 백엔드(apps/live) 테마 멤버십 즉시 재로드 — 배정(apps/api)·시트 직접편집 후 실시간 보드에 반영.
// 보드는 SSE 라 reload 후 다음 틱에 자동 갱신(react-query invalidate 불필요). apps/live 미기동이면 throw → 호출부 best-effort.
export async function refreshLiveThemes(): Promise<void> {
    const res = await fetch("/live/theme/refresh", { method: "POST" });
    if (!res.ok) throw new Error(`POST /live/theme/refresh ${res.status}`);
}
