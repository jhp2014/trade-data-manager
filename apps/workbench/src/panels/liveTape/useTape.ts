// 테이프 폴링 훅 — 3초마다 델타를 받아 누적(mergeTape). react-query 를 안 쓰는 이유: 캐시 단위가
// "마지막 응답"이 아니라 **누적 상태**라서다(델타 프로토콜의 클라 반쪽 — since/rev 를 직전 누적에서 뽑는다).
import { useEffect, useRef, useState } from "react";
import { fetchTape } from "../../api/liveTape.js";
import { LIVE_CADENCE_MS } from "../../lib/liveCadence.js";
import { mergeTape, type TapeData } from "./tapeData.js";

export function useTape(theme: string | null): { data: TapeData | null; error: string | null } {
    const [data, setData] = useState<TapeData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<TapeData | null>(null); // 인터벌 클로저가 최신 누적을 보게

    useEffect(() => {
        ref.current = null;
        setData(null);
        setError(null);
        if (!theme) return;
        let alive = true;
        let inflight = false;
        const poll = async (): Promise<void> => {
            if (inflight) return; // 응답이 밀리면 겹치지 않게 스킵(다음 인터벌이 따라잡는다)
            inflight = true;
            try {
                const prev = ref.current;
                // since = 보유 최대 분(엔진 틱 기준) — 마지막 분은 형성 중일 수 있어 서버가 재전송한다.
                const since = prev && prev.ticks.length > 0 ? prev.ticks[prev.ticks.length - 1] : undefined;
                const view = await fetchTape(theme, prev ? { since, rev: prev.rev } : {});
                if (!alive) return;
                const next = mergeTape(prev, view);
                ref.current = next;
                setData(next);
                setError(null);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : String(e));
            } finally {
                inflight = false;
            }
        };
        void poll();
        const t = setInterval(() => void poll(), LIVE_CADENCE_MS);
        return () => {
            alive = false;
            clearInterval(t);
        };
    }, [theme]);

    return { data, error };
}
