import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { fetchMirrorStatus, runMirrorSync } from "../api/curation.js";

// 미러 동기화 — 작업표시줄 한 칸. "얼마나 낡았나"를 상시 보여주고, 누르면 당겨온다.
//
// **시각을 늘 띄우는 이유**: 협업자에겐 이게 유일한 신호다. 그쪽은 수집을 안 해 야간 작업이 없으므로
// 버튼을 안 누르면 며칠이고 옛 데이터를 본다 — 그런데 화면은 멀쩡해 보인다. "3일 전"이 눈에 보여야
// 누를 생각을 한다. (내 PC 는 야간 백업이 미러를 같이 갱신해서 대개 최신이다.)
const MINUTE = 60_000;
const STATUS_KEY = ["mirror-status"];

/** 상대 시각 — 정확한 시분보다 "얼마나 낡았나"가 판단 재료다. */
function agoLabel(iso: string | null): string {
    if (!iso) return "동기화 안 함";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 2 * MINUTE) return "방금";
    if (ms < 60 * MINUTE) return `${Math.floor(ms / MINUTE)}분 전`;
    const h = Math.floor(ms / (60 * MINUTE));
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
}

export function MirrorSync(): JSX.Element {
    const qc = useQueryClient();
    const status = useQuery({
        queryKey: STATUS_KEY,
        queryFn: ({ signal }) => fetchMirrorStatus(signal),
        // 시각 표시가 굳지 않게 주기적으로 다시 읽는다(바이트 몇 개짜리 로컬 조회다).
        refetchInterval: MINUTE,
        staleTime: MINUTE,
    });

    const sync = useMutation({
        mutationFn: runMirrorSync,
        onSuccess: (r) => {
            qc.setQueryData(STATUS_KEY, r);
            // **키를 나열하지 않는다** — 표식으로 건다(queries.ts CURATION). 새 쿼리가 늘어도 안 빠뜨린다.
            // 화면 구성(패널 배치·선택·캔버스)은 건드리지 않는다: 데이터만 갈아끼운다.
            void qc.invalidateQueries({ predicate: (q) => q.meta?.curation === true });
        },
        onError: (e: Error) => window.alert(`동기화 실패 — ${e.message}`),
    });

    const at = status.data?.syncedAt ?? null;
    const label = sync.isPending ? "동기화 중…" : agoLabel(at);
    return (
        <>
            <button
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
                title={`상대 작업 받아오기 — 마지막 동기화 ${at ? new Date(at).toLocaleString("ko-KR") : "없음"}\n(내 편집은 저장 즉시 반영된다 — 이건 받아오는 쪽이다)`}
                style={{
                    display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none",
                    font: "inherit", fontSize: 11, color: "var(--text-tertiary)",
                    cursor: sync.isPending ? "progress" : "pointer", padding: "2px 4px",
                }}
            >
                <span aria-hidden style={{ opacity: 0.8 }}>⟳</span>
                <span className="tabular">{label}</span>
            </button>
            {/* 도는 동안 클릭을 막는다 — 전체교체가 로컬 스키마를 잠깐 드롭했다 복원하므로 그 사이 편집이 들어가면 안 된다. */}
            {sync.isPending && <div style={{ position: "fixed", inset: 0, zIndex: 9000, cursor: "progress" }} />}
        </>
    );
}
