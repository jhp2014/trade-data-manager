// 알람 발화 로그 — **읽기 포트**(실시간 플레인). 서버 로그 5,000건을 5초마다 통째로 내리면 수 MB 라
// **커서 증분**(마지막으로 본 seq 초과분)만 받아 클라가 누적한다. 서버 재시작이면 seq 가 0 부터 다시 →
// latestSeq < 커서 를 보고 누적을 리셋한다. 오늘(KST) 것만 보유 — 어제 것은 메모리에서도 뺀다.
//
// ⚠ 누적은 이 훅 인스턴스의 ref·state 에 산다(queryFn 의 부수효과). 같은 키 인스턴스가 둘이면 react-query 가
// queryFn 을 한쪽에서만 돌려 다른 쪽 누적이 멎는다 → **한 번에 하나만 마운트**가 전제다(현 카탈로그에선
// 알람 로그 패널 하나). 복수 마운트가 필요해지면 누적을 전역 스토어로 올린다 — 그때도 소비자는 이 훅만 본다.
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAlertLog, type AlertLogEntry } from "../api/alerts.js";
import { kstMidnight } from "./date.js";
import { LIVE_CADENCE_MS } from "./liveCadence.js";

const LOG_KEY = ["live-alert-log"];
const CLIENT_MAX = 5_000; // 서버 보유분(LOG_MAX)과 동일 — 하루치(실측 <3,000)를 다 볼 수 있게. 상한은 폭주 방어용.

export interface AlertLogView {
    /** 최신이 앞. 오늘(KST) 발화 전부(텔레그램으로 간 것 + 쿨다운에 막힌 것). */
    entries: AlertLogEntry[];
    isError: boolean;
    error: Error | null;
}

export function useAlertLog(): AlertLogView {
    const [entries, setEntries] = useState<AlertLogEntry[]>([]);
    const cursor = useRef(0);
    const poll = useQuery({
        queryKey: LOG_KEY,
        refetchInterval: LIVE_CADENCE_MS,
        queryFn: async ({ signal }) => {
            const view = await fetchAlertLog(cursor.current, signal);
            if (view.latestSeq < cursor.current) {
                cursor.current = 0; // 서버 재시작(seq 리셋) — 다음 폴링이 전체를 다시 받는다
                setEntries([]);
                return view;
            }
            if (view.entries.length > 0) {
                cursor.current = view.latestSeq;
                const midnight = kstMidnight();
                setEntries((prev) =>
                    [...[...view.entries].reverse(), ...prev].filter((e) => e.firing.at >= midnight).slice(0, CLIENT_MAX),
                );
            }
            return view;
        },
    });
    return { entries, isError: poll.isError, error: poll.error instanceof Error ? poll.error : null };
}
