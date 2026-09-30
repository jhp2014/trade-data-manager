// 테마 존 조건의 **말**(잎 모듈) — 조건판 테마 줄·사슬 필터 테마 칩·시장 단면 존 목록이 같은 한 벌을 쓴다.
// 잎으로 둔 이유: label.ts 가 breakout/chainChecks 를 부르므로, chainChecks 가 label.ts 에서 테마 글자를
// 가져오면 순환이 생긴다.
import { anyThemeCondOn, themeCutActive, type ThemeCut, type ThemeZoneParams } from "@trade-data-manager/market/domain";

/** 한쪽·양쪽 경계 표기 — `≥3` · `≤5` · ` 2~5`(양끝 포함). */
export const boundText = (min: number | undefined, max: number | undefined, unit: string): string =>
    min !== undefined && max !== undefined ? ` ${min}~${max}${unit}` : min !== undefined ? `≥${min}${unit}` : max !== undefined ? `≤${max}${unit}` : "";

/** 존 정의(창·대금 N·등락 축) 한 토막. */
export function themeZoneText(p: ThemeZoneParams): string {
    const win = p.window === null ? "당일" : `${p.window}분`;
    const rate = p.rate.mode === "rank" ? `등락≤${p.rate.max}` : `등락${boundText(p.rate.minPct, p.rate.maxPct, "%")}`;
    return `${win} 대금≤${p.zoneAmountN}·${rate}`;
}

/** 켜진 컷(재적·존 순위·기본 순위) + 진입 — 없으면 "". */
export function themeCutsText(p: ThemeZoneParams): string {
    const cut = (name: string, c: ThemeCut): string | null => (themeCutActive(c) ? `${name}${boundText(c.min, c.max, "")}` : null);
    const cuts = [cut("재적", p.count), cut("존", p.zoneRank), cut("기본", p.baseRank)].filter(Boolean).join(" ");
    return `${cuts}${p.enter === true ? `${cuts ? " " : ""}· 진입` : ""}`;
}

/** 테마 존 술어 한 줄 — 존(창·대금 N·등락 축) + 켜진 컷만. 보드 행·막대·패널 칩이 같은 표기를 쓴다. */
export function themeZoneLabel(p: ThemeZoneParams): string {
    const cuts = themeCutsText(p);
    return `테마 ${themeZoneText(p)}${cuts ? ` ${cuts}` : ""}`;
}

/** 사슬 칩 본문(짧게) — 컷만. 존 정의는 hover(themeZoneLabel). 켜진 컷이 없으면 조건이 아니라고 말한다. */
export function themeChipText(p: ThemeZoneParams): string {
    // 켜진 컷이 없으면 판정은 늘 참이다 — 「진입」만 켠 칩도 조건이 아니다(판정 규칙과 같은 자: anyThemeCondOn).
    return anyThemeCondOn(p) ? `테마 ${themeCutsText(p)}` : "테마 (컷 없음)";
}
