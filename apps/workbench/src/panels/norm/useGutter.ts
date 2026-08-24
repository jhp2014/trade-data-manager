// 오른쪽 거터의 **재료 조립** — 선(내 항목)과 테마 멤버를 같은 규칙으로 후보로 만든다.
//
// 두 재료가 서로 다른 모양(OverlayLine / ThemeOverlay.lines)이라 여기서 한 어휘(GutterCandidate)로
// 접는다. 자리 계산은 순수 함수(gutterLayout)의 몫이고, 이 훅은 **무엇을 후보로 세울지**만 정한다.
//
// 앵커는 둘 다 **화면 우단에서 잘리는 자리**다: 내 항목은 labelAnchorAt(끝점이 창 안이면 끝점),
// 테마는 우단의 보간값. 하루 전체를 그리는 선이라 "마지막 점"을 쓰면 창 밖 값에 칩이 뭉친다 —
// 옛 왼쪽 거터가 좌단을 쓰던 것과 같은 이유, 방향만 뒤집혔다.
import { useMemo } from "react";
import { labelAnchorAt, yAtX, type OverlayBounds, type OverlayLine } from "./overlay.js";
import { gutterLayout, type GutterCandidate, type GutterLayout } from "./gutter.js";
import type { ThemeOverlay } from "./useThemeOverlay.js";
import { shortDate } from "../../lib/date.js";

interface Box { top: number; height: number }

export function useGutter(args: {
    /** 그릴 선들(내 항목). */
    lines: readonly OverlayLine[];
    /** 보이는 값 공간 — 앵커(잘리는 자리)의 재료. */
    view: OverlayBounds | null;
    viewX: { from: number; to: number } | null;
    scaleY: ((v: number) => number) | null;
    box: Box;
    nameOf: (code: string) => string;
    /** 시선 선들 — 상한 밖에서도 이름을 단다. */
    subjectKeys: ReadonlySet<string>;
    /** 지금 짚은 선 키. */
    hovered: string | null;
    /** 펼쳐진 테마(없으면 테마 후보 0개). */
    themeOverlay: ThemeOverlay | null;
    /** 지금 짚은 테마 종목들 — 이것도 상한 밖에서 남는다. */
    themeHovered: ReadonlySet<string> | null;
}): GutterLayout {
    const { lines, view, viewX, scaleY, box, nameOf, subjectKeys, hovered, themeOverlay, themeHovered } = args;
    return useMemo<GutterLayout>(() => {
        if (!view || !viewX || !scaleY) return { rows: [], hidden: { item: [], theme: [] } };
        const cands: GutterCandidate[] = [];
        for (const s of lines) {
            const at = labelAnchorAt(s.points, view);
            if (!at) continue; // 창에 없는 선은 이름도 없다(지어내지 않는다)
            cands.push({
                kind: "item", key: s.key, name: nameOf(s.stockCode),
                // 같은 종목이 여러 줄 설 때의 정체 — 일봉은 날짜, 분봉은 타점 시각.
                sub: s.kind === "point" ? s.time.slice(0, 5) : shortDate(s.date),
                x: at.x, y: at.y,
                keep: subjectKeys.has(s.key) || s.key === hovered,
            });
        }
        for (const l of themeOverlay?.lines ?? []) {
            // 우단에 선이 아직/이미 없으면 가까운 끝점으로 물러난다 — 목록에서 종목이 사라지지 않게.
            const edge = yAtX(l.points, viewX.to);
            const at = edge !== null ? { x: viewX.to, y: edge }
                : l.points[l.points.length - 1].x < viewX.to ? l.points[l.points.length - 1]
                    : l.points[0];
            cands.push({
                kind: "theme", key: l.code, name: l.name, sub: null,
                x: at.x, y: at.y,
                keep: themeHovered?.has(l.code) ?? false,
            });
        }
        return gutterLayout(cands, scaleY, { min: box.top + 6, max: box.top + box.height - 6 });
    }, [lines, view, viewX, scaleY, box.top, box.height, nameOf, subjectKeys, hovered, themeOverlay, themeHovered]);
}
