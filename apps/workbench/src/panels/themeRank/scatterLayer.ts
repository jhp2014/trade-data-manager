// 순위 평면 산점의 **표시목록 빌더**(순수) — x=거래대금 서수(1이 왼쪽), y=등락률 서수(1이 위).
//
// 캔버스로 그린다 — 점들이 스크럽 프레임마다 전부 움직이는 그림이라, 비용을 정하는 건 점 수가 아니라
// DOM 노드 수라는 이 레포의 실측 교훈([[skeleton-canvas-render]])이 그대로 적용된다.
//
// ## 그리는 것은 시선과 그 동료뿐이다(2026-09-07 확정 — 무관 종목 회색 층 폐지)
// 축이 **서수**라 점의 자리가 이미 "몇 위"를 절대적으로 말하고(좌표 감각은 눈금·격자가 진다), 존 안에
// 몇이 드는지는 정의상 N·M 이 정한다 — 회색 점 300~600개는 정보를 거의 안 주면서 노이즈와 프레임
// 비용만 냈다. 되살릴 일이 생기면 그룹 하나를 다시 얹으면 된다(토글 노브를 만들지 말 것).
//
// ## 점 3상태 — 존 안/밖은 **표시하지 않는다**
// 존 안/밖은 점의 **자리**(존 틴트 사각형 안이냐)와 칩의 숫자가 이미 말한다. 채움/링으로 한 번 더
// 말하던 옛 규칙은 중복 부호화였고, 그걸 걷어낸 덕에 **링이 비어** 겹침을 얹을 수 있게 됐다:
//   · 시선     — ACTIVE 채움 + 링(맨 위)
//   · 동료     — 그 종목이 시선과 공유하는 **첫 테마**의 색으로 채움
//   · 겹친 동료 — 채움(첫 테마) + **둘째 테마색 링**. 셋 이상이면 툴팁이 전부를 말한다
// 렌즈는 색을 바꾸지 않고 **강도만** 바꾼다(고른 테마는 진하게, 나머지 동료는 옅게) — 갈라 보기와
// 정체성이 서로를 덮지 않게. 결손(서수 null)은 안 그린다 — 지어내지 않는다.
import type { DrawGroup, DrawLayer, DrawOp } from "../canvas/drawList.js";
import { ACTIVE } from "../../styles/palette.js";

export interface ScatterScales {
    /** 서수(1..max) → 화면 px. */
    x(ord: number): number;
    y(ord: number): number;
}

export interface ScatterArgs {
    /** 참가 종목만(서수 non-null). 이 중 시선·동료만 그려진다. */
    points: readonly { code: string; rate: number; amount: number }[];
    subject: string | null;
    /** 동료 → 그 종목이 **시선과 공유하는** 테마들(칩 줄 순서). 여기 없으면 안 그린다. */
    peerThemes: ReadonlyMap<string, readonly string[]>;
    /** 테마 → 색(themeColorMap). 칩 스와치와 같은 출처여야 범례가 성립한다. */
    colorOf: ReadonlyMap<string, string>;
    /** 켜진 렌즈 — 그 테마를 공유하는 동료만 진하게. null = 전부 진하게. */
    lens: string | null;
    scales: ScatterScales;
    /** 꼬리가 켜져 있으면 점을 줄인다(2026-09-09) — 꼬리+원래 크기는 난잡하다(사용자 확정). */
    compact?: boolean;
}

/** 렌즈 밖 동료의 흐리기 — 색은 살리고 존재감만 낮춘다(회색으로 죽이면 정체성을 잃는다). */
const DIM = 0.3;

export function scatterLayer({ points, subject, peerThemes, colorOf, lens, scales, compact }: ScatterArgs): DrawLayer {
    const peerR = compact ? 2.8 : 4;
    const subjR = compact ? 3.5 : 5;
    const subjRing = compact ? 6 : 8.5;
    const dim: DrawOp[] = [];
    const strong: DrawOp[] = [];
    const subjectOps: DrawOp[] = [];
    for (const p of points) {
        const cx = scales.x(p.amount);
        const cy = scales.y(p.rate);
        if (p.code === subject) {
            subjectOps.push({ op: "circle", cx, cy, r: subjR, fill: ACTIVE });
            subjectOps.push({ op: "circle", cx, cy, r: subjRing, stroke: ACTIVE, width: 1.5 });
            continue;
        }
        const themes = peerThemes.get(p.code);
        if (!themes || themes.length === 0) continue; // 동료가 아니면 그리지 않는다
        const into = lens !== null && !themes.includes(lens) ? dim : strong;
        into.push({ op: "circle", cx, cy, r: peerR, fill: colorOf.get(themes[0]) ?? ACTIVE });
        // 겹침 = 둘째 테마색 링. 존 안/밖이 링을 놓아준 자리다(위 머리 주석).
        // 반지름을 키워 **채움 밖에** 두는 게 중요하다: 같은 자리에 겹치면 그룹 알파가 그 고리에서만
        // 누적돼(0.3 두 겹 ≈ 0.51) 옅은 무리의 겹침 점이 혼자 밝아진다([[skeleton-canvas-render]] 묶음 알파).
        if (themes.length >= 2) into.push({ op: "circle", cx, cy, r: peerR + 1.75, stroke: colorOf.get(themes[1]) ?? ACTIVE, width: 1.5 });
    }
    const groups: DrawGroup[] = [
        { opacity: DIM, ops: dim },
        { opacity: 0.95, ops: strong },
        { opacity: 1, ops: subjectOps },
    ];
    return { name: "rank-scatter", groups: groups.filter((g) => g.ops.length > 0) };
}
