// 목록 걷기(w/s)의 커서 — 일별 [탐색]·라벨 [탐색] 공용(2026-09-29).
//
// ## 커서 = **책갈피**(판이 든다) — 전역 focus 가 아니다
// 옛 규칙은 "커서 = focus 그대로"였다. 그러면 걷다가 그 타점 주변을 둘러보는 순간(시간선·a/d·차트 클릭) 커서가
// 목록 밖으로 나가 다음 w/s 가 처음부터 다시 시작하고, 둘러보다 우연히 목록의 다른 행에 닿으면 거기서부터
// 흐름이 바뀐다. 책갈피는 **이 판의 손**(w/s · 행 클릭 · 날짜 넘기기 착지)만 옮기고, 밖에서 온 focus 변화는
// 책갈피를 안 건드린다 → w/s 는 늘 책갈피 ±1 로 "이어서" 간다(되돌아가려면 w 한 번 — 사용자 확정 (가)).
//
// 책갈피가 없을 때(처음 · scope 가 바뀜)만 focus 에서 출발한다 — 그 규칙은 판마다 달라 `fallback` 으로 받는다
// (일별 = 방향의 첫 항목, 라벨 = 정렬상 끼어들 자리). 끝의 처리(날짜 넘기기 / 멈춤)도 `onBoundary` 로 받는다.
// 책갈피 행이 목록에서 사라졌을 때 다시 끼는 규칙도 판마다 다르다(`rejoin` — 기본 = 옛 순번 자리).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sameNavKey, stepFromMark, type NavKey, type WalkCursor, type WalkMark, type WalkStep } from "./walk.js";

export interface WalkCursorApi {
    /** w/s 한 칸 — navRef.current 에 그대로 건다. */
    step: (dir: 1 | -1) => void;
    /** 이 판의 손으로 그 칸에 선다(행 클릭·날짜 넘기기 착지) — 책갈피를 옮기고 시선을 보낸다. 참조 안정. */
    jump: (to: NavKey) => void;
    /** 지금 커서 — 책갈피(유효하면) 아니면 focus. 행 강조·스크롤 따라가기·순번이 이것을 본다. */
    cursor: WalkCursor | null;
    /** 시선이 책갈피를 떠나 있나 — 책갈피 행을 "선만" 으로 그려 "여기까지 봤다" 를 말한다. */
    drifted: boolean;
    /** 커서의 순번(1-base) — 목록에 없으면 null. */
    pos: number | null;
}

export function useWalkCursor({ order, scope, focus, fallback, rejoin, go, onBoundary }: {
    /** 화면 순서 = 순회 순서. */
    order: readonly NavKey[];
    /** 책갈피가 유효한 범위 — 밖에서 이게 바뀌면(일별 = 작업표시줄 날짜) 목록이 통째로 바뀐 것이라 책갈피는 없는 셈. */
    scope: string;
    focus: WalkCursor | null;
    /** 책갈피가 없을 때 focus 에서 한 칸 — 판마다 진입 규칙이 다르다. */
    fallback: (order: readonly NavKey[], cursor: WalkCursor | null, dir: 1 | -1) => WalkStep;
    /**
     * 책갈피 행이 사라졌을 때 그 책갈피에서 한 칸 — 없으면 옛 순번 자리(stepFromMark). 목록이 **정렬 가능한 자**를
     * 가지면(라벨 = 날짜·코드·시각) 그 자가 더 정확하다 — 앞 행이 여럿 같이 빠져도 이웃이 안 어긋난다.
     */
    rejoin?: (order: readonly NavKey[], cursor: WalkCursor, dir: 1 | -1) => WalkStep;
    /** 시선 보내기(goToPoint/goToDay) — 책갈피는 훅이 옮긴다. */
    go: (to: NavKey) => void;
    /** 목록 끝(또는 빈 목록) — 없으면 제자리. */
    onBoundary?: (dir: 1 | -1) => void;
}): WalkCursorApi {
    const [mark, setMark] = useState<WalkMark | null>(null);
    // jump 는 날짜 넘기기 착지(콜백 생성 뒤의 목록)에서도 불려 최신 값을 ref 로 읽는다.
    const latest = useRef({ order, scope, go });
    latest.current = { order, scope, go };

    // scope 가 바뀌면 책갈피를 **비운다**(가리기만 하면 그 scope 로 돌아왔을 때 낡은 책갈피가 되살아난다).
    // 렌더 중엔 가려서 읽고, 커밋 뒤 지운다. 업데이터가 다시 재므로 같은 커밋에 새 scope 로 선 책갈피(날짜 넘기기 착지)는 안 지운다.
    useEffect(() => { setMark((m) => (m !== null && m.scope !== scope ? null : m)); }, [scope]);
    const live = mark !== null && mark.scope === scope ? mark : null;
    const markKey = live?.key;
    const cursor = useMemo<WalkCursor | null>(
        () => (markKey ? { code: markKey.code, date: markKey.date, time: markKey.time ?? null } : focus),
        [markKey, focus],
    );
    const drifted = live !== null && (focus === null || !sameNavKey(live.key, focus));
    const pos = useMemo(() => {
        if (cursor === null) return null;
        const at = order.findIndex((k) => sameNavKey(k, cursor));
        return at < 0 ? null : at + 1;
    }, [order, cursor]);

    const jump = useCallback((to: NavKey): void => {
        const { order: o, scope: s, go: send } = latest.current;
        setMark({ key: to, idx: Math.max(0, o.findIndex((k) => sameNavKey(k, { ...to, time: to.time ?? null }))), scope: s });
        send(to);
    }, []);

    const step = (dir: 1 | -1): void => {
        const r = live === null ? fallback(order, focus, dir)
            : rejoin && !order.some((k) => sameNavKey(k, live.key))
                ? rejoin(order, { code: live.key.code, date: live.key.date, time: live.key.time ?? null }, dir)
                : stepFromMark(order, live, dir);
        if (r?.kind === "move") jump(r.to);
        else onBoundary?.(dir);
    };

    return { step, jump, cursor, drifted, pos };
}
