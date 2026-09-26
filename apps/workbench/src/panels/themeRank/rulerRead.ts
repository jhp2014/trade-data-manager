// 테마 순위 판의 **자유 자(십자선) 읽기** — 조건판 테마 팝오버의 「자 값 가져오기」 재료(순수부).
// 연동이 아니라 **값 복사**다: 판을 지워도 조건은 안 흔들린다(decisions 「테마 조건의 편집면」).
//
// 자의 저장 자리(ThemePlaneView): panelUi[판id].guides = { "x:rank"|"x:value" → x값, "y:rank"|"y:value" → y값 },
// 축 설정: panelUi[판id].axes(parseThemeRankAxes — xMode·yMode·windowMin). 저장값이 **없으면**(자를 한 번도
// 안 옮김 — 화면의 자는 뷰 가운데 파생일 뿐) 그 축은 못 가져온다.
import type { ThemeRateAxis } from "@trade-data-manager/market/domain";
import { parseThemeRankAxes } from "./axisModel.js";

export interface RulerRead {
    /** 대금 창(분) — 판의 축 설정 그대로(null = 당일). */
    window: number | null;
    /** 존 대금 순위 N — x 자가 **순위 모드**이고 저장값이 있을 때만(값 모드 대금 자는 존 정의에 못 앉는다). */
    zoneAmountN: number | null;
    /** 등락 축 — y 자의 모드 그대로(순위 ≤ | 값 ≥). 저장값이 없으면 null. */
    rate: ThemeRateAxis | null;
}

/**
 * 판 하나의 자 읽기 — guides 저장값이 하나도 없으면 null(가져올 것이 없다).
 * 여러 판이 열려 있으면 호출자가 **최소 슬롯** 판 하나를 골라 넘긴다(카운트 단일 인스턴스의 선례).
 */
export function readThemeRuler(panelUiOfPanel: Record<string, unknown> | undefined): RulerRead | null {
    if (!panelUiOfPanel) return null;
    const axes = parseThemeRankAxes(panelUiOfPanel["axes"]);
    const guides = panelUiOfPanel["guides"];
    if (!guides || typeof guides !== "object") return null;
    const g = guides as Record<string, unknown>;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const gx = num(g[`x:${axes.xMode}`]);
    const gy = num(g[`y:${axes.yMode}`]);
    if (gx === null && gy === null) return null;
    return {
        window: axes.windowMin,
        zoneAmountN: axes.xMode === "rank" && gx !== null ? Math.max(1, Math.round(gx)) : null,
        rate: gy === null ? null
            : axes.yMode === "rank" ? { mode: "rank", max: Math.max(1, Math.round(gy)) }
            : { mode: "value", minPct: Math.round(gy * 10) / 10 },
    };
}
