// 순위 평면 산점의 **표시목록 빌더**(순수) — x=거래대금 서수(1이 왼쪽), y=등락률 서수(1이 위).
//
// 캔버스로 그린다 — 점 300~600개가 스크럽 프레임마다 전부 움직이는 그림이라, 비용을 정하는 건
// 점 수가 아니라 DOM 노드 수라는 이 레포의 실측 교훈([[skeleton-canvas-render]])이 그대로 적용된다.
// 점 4상태: 시선(ACTIVE, 크게+링) / 존 안 동료(teal 채움) / 존 밖 동료(teal 속 빈 점 — 이탈 방향이
// 좌표로 읽힌다) / 나머지(회색). 결손(서수 null)은 안 그린다 — 지어내지 않는다.
import type { DrawGroup, DrawLayer, DrawOp } from "../canvas/drawList.js";
import { ACTIVE, THEME_PEER } from "../../styles/palette.js";

export interface ScatterScales {
    /** 서수(1..max) → 화면 px. */
    x(ord: number): number;
    y(ord: number): number;
}

export interface ScatterArgs {
    /** 참가 종목만(서수 non-null). */
    points: readonly { code: string; rate: number; amount: number }[];
    subject: string | null;
    /** 시선 종목의 테마 동료(자신 제외). */
    peers: ReadonlySet<string>;
    /** 존 컷 — null 은 연동 행 없음(존 개념 자체가 없다): 동료 전부 채운 점으로 그린다. */
    zone: { rateN: number; amountN: number } | null;
    scales: ScatterScales;
}

export function scatterLayer({ points, subject, peers, zone, scales }: ScatterArgs): DrawLayer {
    const others: DrawOp[] = [];
    const peersIn: DrawOp[] = [];
    const peersOut: DrawOp[] = [];
    const subjectOps: DrawOp[] = [];
    for (const p of points) {
        const cx = scales.x(p.amount);
        const cy = scales.y(p.rate);
        if (p.code === subject) {
            subjectOps.push({ op: "circle", cx, cy, r: 5, fill: ACTIVE });
            subjectOps.push({ op: "circle", cx, cy, r: 8.5, stroke: ACTIVE, width: 1.5 });
            continue;
        }
        if (peers.has(p.code)) {
            const inZone = zone === null || (p.rate <= zone.rateN && p.amount <= zone.amountN);
            if (inZone) peersIn.push({ op: "circle", cx, cy, r: 4, fill: THEME_PEER });
            else peersOut.push({ op: "circle", cx, cy, r: 4, stroke: THEME_PEER, width: 1.5 });
            continue;
        }
        others.push({ op: "circle", cx, cy, r: 2.5, fill: "var(--neutral)" });
    }
    const groups: DrawGroup[] = [
        { opacity: 0.35, ops: others },
        { opacity: 0.95, ops: peersOut },
        { opacity: 0.95, ops: peersIn },
        { opacity: 1, ops: subjectOps },
    ];
    return { name: "rank-scatter", groups: groups.filter((g) => g.ops.length > 0) };
}
